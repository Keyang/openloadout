// The sound quality bar, A-words (2026-11-18, final review): the words a visitor reads on a sound or music page
// (name, description, control labels, choices, style names) are everyday words, not units or synthesizer terms.
// The library test reads every patch in sounds/: a new sound is checked with no change here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSound, technicalWords, TECHNICAL_WORDS } from '../../quality/sound.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOUNDS = path.join(ROOT, 'sounds');
const library = fs.readdirSync(SOUNDS).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => JSON.parse(fs.readFileSync(path.join(SOUNDS, f), 'utf8')));

const base = {
  format: 'sfxpatch/0.1', id: 'q-words', name: 'Blip', category: 'ui', description: 'A short soft blip.',
  duration: 'length + 0.02',
  params: [{ id: 'pitch', label: 'Pitch', min: 300, max: 1200, default: 600, scale: 'log', unit: 'Hz' }, { id: 'length', label: 'Length', min: 0.05, max: 0.3, default: 0.12, unit: 's' }],
  nodes: [{ id: 'amp', type: 'ad', attack: 0.001, decay: 'length', curve: 3 }, { id: 'tone', type: 'osc', wave: 'sine', freq: 'pitch' }],
  out: 'tone*amp',
  presets: { Soft: { pitch: 400 } },
};
const words = (patch) => technicalWords(patch).map((x) => x.word.toLowerCase());

test('everyday text passes, whatever the patch does inside (node types and units are not read)', () => {
  assert.deepEqual(technicalWords(base), []);
  const fine = { ...base, description: 'A sawed-off shotgun blast with ringing metal, a noisy crowd, a deep thump and an attack-up chime; tune it lower or higher, faster or slower.',
    params: [{ ...base.params[0], label: 'Pitch' }, { ...base.params[1], label: 'Brightness' }, { id: 'inst', label: 'Melody instrument', min: 0, max: 2, default: 0, options: ['Synth lead', 'Flute', 'Chiptune'] }],
    presets: { 'Sawed-off': {}, 'Attack up': {}, 'Boss fight': {} } };
  assert.deepEqual(technicalWords(fine), [], JSON.stringify(technicalWords(fine)));
});

test('the words the review found are caught, each with where it is and what to say instead', () => {
  const p = { ...base,
    description: 'Modal resonator struck by a noise burst: a short sine with a little FM, 2200 Hz, dropping 3 oct over 30 ms.',
    params: [{ ...base.params[0], label: 'Cutoff' }, { ...base.params[1], label: 'Interval', options: undefined }, { id: 'inst', label: 'Wave', min: 0, max: 1, default: 0, options: ['Saw', 'Pulse width'] }],
    presets: { 'Sine pad': {} } };
  const found = technicalWords(p);
  const got = new Set(found.map((x) => x.word.toLowerCase()));
  for (const w of ['modal', 'resonator', 'noise', 'sine', 'fm', 'hz', 'oct', 'ms', 'cutoff', 'interval', 'saw', 'pulse width']) assert.ok(got.has(w), `${w} not caught: ${[...got]}`);
  for (const x of found) { assert.ok(x.where && x.instead, JSON.stringify(x)); }
  assert.ok(found.some((x) => x.where === 'the description'));
  assert.ok(found.some((x) => x.where === 'control "Cutoff"'));
  assert.ok(found.some((x) => x.where === 'a choice of "Wave"'));
  assert.ok(found.some((x) => x.where === 'style "Sine pad"'));
});

test('units and music theory in prose are caught too', () => {
  for (const [text, word] of [['Fast D-minor battle music', 'd-minor'], ['in A minor with a Dorian lift', 'dorian'], ['8 to 32 bars long', '8 to 32 bars'], ['a kick on every 8th note', '8th note'],
    ['a leap of a major sixth', 'major sixth'], ['two notes a fifth apart', 'a fifth apart'], ['126 bpm', 'bpm'], ['a 30 Hz growl', 'hz'], ['up 12 semitones', 'semitones'],
    ['an arpeggio', 'arpeggio'], ['detuned saws', 'detuned'], ['a sub thump', 'sub'], ['band-passed hiss', 'band-passed'], ['a reverb tail', 'reverb'], ['inharmonic clank', 'inharmonic'],
    ['dissonant buzzes', 'dissonant'], ['a fast vibrato', 'vibrato'], ['a triangle note', 'triangle note'], ['open fifths and a close triad', 'triad'], ['saturated hiss', 'saturated'], ['harmonic sparkles', 'harmonic'], ['a 4 kHz edge', 'khz']]) {
    assert.ok(words({ ...base, description: text }).includes(word), `"${text}" should flag "${word}": ${JSON.stringify(words({ ...base, description: text }))}`);
  }
});

test('checkSound reports technical words as an error that quotes the word, where it is and the everyday word to use', () => {
  const r = checkSound({ ...base, description: 'A short sine with a little FM.' });
  const e = r.errors.find((m) => /^words: /.test(m));
  assert.ok(e, r.errors.join('\n'));
  assert.match(e, /"sine"/);
  assert.match(e, /"FM"/);
  assert.match(e, /the description/);
  assert.deepEqual(checkSound(base).errors.filter((m) => /^words: /.test(m)), []);
});

test('the word list says why each word is there: every entry has a pattern and an everyday alternative', () => {
  assert.ok(TECHNICAL_WORDS.length >= 10);
  for (const w of TECHNICAL_WORDS) { assert.ok(w.re instanceof RegExp && w.re.flags.includes('i'), String(w.re)); assert.ok(typeof w.instead === 'string' && w.instead.length > 5, String(w.re)); }
});

test(`every sound and track in sounds/ (${library.length}) reads in everyday words`, () => {
  assert.ok(library.length > 0);
  const bad = library.flatMap((p) => technicalWords(p).map((x) => `${p.id}: "${x.word}" in ${x.where}`));
  assert.deepEqual(bad, []);
});

// The task's own examples: "Speed: slower to faster", "Pitch: lower to higher". The music kit (sound/compose.js)
// names a track's speed and pitch controls; "Tempo" and "Key" are the musician's words for the same things.
// Read from every track in sounds/ that has them, so a new track is covered with no change here.
test('a track\'s speed control says Speed, and its description says neither tempo nor key', () => {
  const tracks = library.filter((p) => p.category === 'music');
  assert.ok(tracks.length > 0);
  for (const p of tracks) for (const d of p.params ?? []) {
    if (d.id === 'bpm') assert.equal(d.label, 'Speed', `${p.id}: the speed control says "${d.label}"`);
  }
  for (const p of tracks) assert.ok(!/\b(tempo|key)\b/i.test(p.description ?? ''), `${p.id}: the description says tempo or key: ${p.description}`);
});

// Final review, round 2: the victory jingle's pitch control still said "Key" and its description "change the key".
// The tracks-only test above let a jingle through. This reads every patch in sounds/ (any category) that has a pitch
// control (unit Hz, or id "pitch" or "key"). A pitch control never says key or tempo; one named pitch or key says
// "pitch" ("Pitch", "Start pitch", "Engine pitch"). Its description never uses key in the musical sense ("change
// the key", "a key change", "in the key of"); "a two-note key jingle" (keys jingling) is everyday and allowed.
const isPitchControl = (d) => d.unit === 'Hz' || d.id === 'pitch' || d.id === 'key';
const MUSICAL_KEY = /\b(?:the|its) key\b|\bkey (?:change|of)\b|\btempo\b/i;
test('every sound with a pitch control says Pitch, never Key, on the control and in its description', () => {
  const withPitch = library.filter((p) => (p.params ?? []).some(isPitchControl));
  assert.ok(withPitch.length > library.filter((p) => p.category === 'music').length, 'more than the tracks have a pitch control');
  const bad = [];
  for (const p of withPitch) {
    for (const d of p.params.filter(isPitchControl)) {
      if (/\b(?:key|tempo)\b/i.test(d.label ?? '')) bad.push(`${p.id}: control "${d.id}" says "${d.label}"`);
      if ((d.id === 'pitch' || d.id === 'key') && !/\bpitch\b/i.test(d.label ?? '')) bad.push(`${p.id}: control "${d.id}" says "${d.label}", not pitch`);
    }
    const m = (p.description ?? '').match(MUSICAL_KEY);
    if (m) bad.push(`${p.id}: the description says "${m[0]}"`);
  }
  assert.deepEqual(bad, []);
});

// The same fault, caught by the quality bar itself so a future sound cannot bring it back: "Key" or "Tempo" as a
// control's name, and key in the musical sense or tempo anywhere a visitor reads. A key as a thing (a style called
// "Key", "a key jingle", "the key turns in the lock") is not caught.
test('the quality bar flags key and tempo in the musical sense, not a key you hold', () => {
  const pitch = base.params[0];
  for (const [p, word] of [
    [{ ...base, params: [{ ...pitch, label: 'Key' }] }, 'key'],
    [{ ...base, params: [{ ...pitch, label: 'Musical key' }] }, 'musical key'],
    [{ ...base, params: [{ ...pitch, label: 'Tempo' }] }, 'tempo'],
    [{ ...base, description: 'A little tune; change the key, speed and room.' }, 'change the key'],
    [{ ...base, description: 'A key change halfway through.' }, 'key change'],
    [{ ...base, description: 'A march in the key of the old kingdom.' }, 'in the key of'],
    [{ ...base, description: 'A slow tempo.' }, 'tempo'],
  ]) assert.ok(words(p).includes(word), `should flag "${word}": ${JSON.stringify(technicalWords(p))}`);
  for (const p of [
    { ...base, description: 'At its far end it becomes a two-note key jingle.', presets: { Key: {} } },
    { ...base, name: 'Key', description: 'The key turns in the lock with a click; the keys rattle.' },
    { ...base, params: [{ ...pitch, label: 'Key click' }] },
  ]) assert.deepEqual(technicalWords(p), [], JSON.stringify(technicalWords(p)));
  const e = checkSound({ ...base, params: [{ ...pitch, label: 'Key' }, base.params[1]] }).errors.find((m) => /^words: /.test(m));
  assert.ok(e && /control "Key"/.test(e) && /pitch/i.test(e), e);
});
