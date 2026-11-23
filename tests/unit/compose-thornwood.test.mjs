// thornwood-overworld ("Forest trail theme") against its specification row
// (bundles/specs/kit-platformer-fantasy.md, Music) and the style guide, section 12.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoice, renderPatch, validatePatch } from '../../sound/sfx-engine.js';
import { validateMeta } from '../../catalog/schema.js';
import { THEME_PRESETS } from '../../engine/theme.js';
import { INSTRUMENTS, LENGTHS, lint, tuneFit, sectionAt, layerPlays, measureLayers, measureSections } from '../../tools/compose/kit.mjs';
import { build, LAYERS, TUNE, CHORDS, PARTS } from '../../tools/compose/thornwood_overworld.mjs';

const SOUNDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sounds');
const read = (id) => JSON.parse(fs.readFileSync(path.join(SOUNDS, `${id}.json`), 'utf8'));
const patch = build();
const node = (p, id) => p.nodes.find((n) => n.id === id);
const flat = (s) => s.replace(/[|\s]/g, '');
const nums = (s) => { let prev = 0; return s.replace(/\|/g, ' ').trim().split(/\s+/).map((x) => (prev = x === '_' ? prev : Number(x))); };   // "_" holds
const barsOf = (s) => s.split('|').map((b) => b.trim());

test('the file in sounds/ is what the generator writes, with valid metadata', () => {
  const onDisk = read('thornwood-overworld');
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(patch)), 'run: node tools/compose/thornwood_overworld.mjs');
  const m = validateMeta(onDisk.meta, 'music');
  assert.equal(m.ok, true, m.errors.join('; '));
  assert.deepEqual(validatePatch(onDisk).errors, []);
  assert.deepEqual(lint(onDisk), []);
});

test('identity and metadata are the specification row', () => {
  assert.equal(patch.id, 'thornwood-overworld');
  assert.equal(patch.name, 'Forest trail theme');
  assert.equal(patch.category, 'music');
  assert.deepEqual([patch.loop, patch.wrap, patch.normalize], [true, true, false]);
  assert.equal(patch.meta.type, 'music');
  assert.equal(patch.meta.role, 'music/exploration');
  assert.equal(patch.meta.themes[0], 'fantasy');
  assert.equal(patch.meta.gameTypes[0], 'platformer');
  assert.equal(patch.meta.license, 'draft');
  for (const w of ['thornwood', 'music', 'fantasy', 'forest']) assert.ok(!patch.meta.words.includes(w), `"${w}" repeats the bundle, type or theme`);
});

test('eleven controls: the standard nine, then Melody and Bounce', () => {
  assert.deepEqual(patch.params.map((p) => p.id), ['intensity', 'bpm', 'key', 'bars', 'inst', 'along', 'bright', 'space', 'lead', 'alongLevel', 'swing']);
  const by = Object.fromEntries(patch.params.map((p) => [p.id, p]));
  assert.deepEqual([by.bpm.min, by.bpm.max, by.bpm.default], [120, 156, 138]);
  assert.deepEqual([by.key.min, by.key.max, by.key.default], [-5, 6, 0]);
  assert.deepEqual([by.bars.min, by.bars.max, by.bars.step, by.bars.default], [8, 32, 8, 16]);
  assert.deepEqual(by.inst.options, INSTRUMENTS);
  assert.equal(by.inst.options[by.inst.default], 'Chiptune');
  assert.deepEqual([by.intensity.min, by.intensity.max], [0, 1]);
  assert.deepEqual([by.space.min, by.space.max], [0, 0.5]);
  assert.equal(by.lead.label, 'Melody');
  assert.equal(by.swing.label, 'Bounce');
});

test('three styles with the names the specification fixes', () => {
  assert.deepEqual(Object.keys(patch.presets), ['Morning stroll', 'Adventure', 'Hurry up']);
  assert.ok(patch.presets['Hurry up'].bpm > patch.presets['Adventure'].bpm && patch.presets['Adventure'].bpm > patch.presets['Morning stroll'].bpm);
  // a look may speed the music up or slow it down by 5% (Candy, Vivid, Sunset, Faded): no style sits where that is cut off
  const bpm = patch.params.find((p) => p.id === 'bpm');
  for (const [name, set] of Object.entries(patch.presets)) {
    assert.ok((set.bpm ?? bpm.default) * 1.05 <= bpm.max, `"${name}" has no room to speed up by 5%`);
    assert.ok((set.bpm ?? bpm.default) * 0.95 >= bpm.min, `"${name}" has no room to slow down by 5%`);
  }
});

test('the chords are G G C D | Em C D D, one per bar', () => {
  assert.equal(CHORDS, 'G G C D | Em C D D');
  const root = nums(node(patch, 'root').steps), third = nums(node(patch, 'third').steps), fifth = nums(node(patch, 'fifth').steps);
  assert.deepEqual(root.map((r) => ((r % 12) + 12) % 12), [0, 0, 5, 7, 9, 5, 7, 7], 'semitones above G: G G C D E C D D');
  assert.deepEqual(third, [4, 4, 4, 4, 3, 4, 4, 4], 'only the fifth bar is minor');
  assert.deepEqual(fifth, [7, 7, 7, 7, 7, 7, 7, 7]);
  assert.equal(node(patch, 'root').every, 16);
  // the two held harmony notes are a third apart and belong to the bar's chord
  const lo = nums(node(patch, 'hLo').steps), hi = nums(node(patch, 'hHi').steps);
  for (let b = 0; b < 8; b++) {
    const tones = [0, third[b], fifth[b]].map((t) => (root[b] + t) % 12);
    assert.ok([3, 4].includes(hi[b] - lo[b]), `bar ${b + 1}: the held notes are a third apart`);
    assert.ok(tones.includes(lo[b] % 12) && tones.includes(hi[b] % 12), `bar ${b + 1}: the held notes are chord tones`);
  }
});

test('the rhythm section is what the specification says', () => {
  for (const bar of barsOf(node(patch, 'kT').steps)) assert.equal(bar, 'X.......X.......', 'kick on beats 1 and 3');
  const snare = barsOf(node(patch, 'sT').steps);
  assert.equal(snare.length, 8);
  for (const bar of snare) { assert.equal(bar[4], 'X'); assert.equal(bar[12], 'X'); assert.equal(bar[0], '.'); assert.equal(bar[8], '.'); }
  assert.equal(flat(node(patch, 'h8').steps), 'x.x.x.x.x.x.x.x.', 'closed hat on 8ths');
  assert.ok(![...flat(node(patch, 'h16').steps)].includes('.'), 'the busy hat plays every 16th');
  assert.match(node(patch, 'hT').expr, /gBusy > 0\.5 \? h16 : h8/);
  // bass: a triangle on every 8th, bouncing root and octave
  assert.equal(node(patch, 'bO').wave, 'tri');
  assert.equal(flat(node(patch, 'bG').steps).toLowerCase(), 'x.x.x.x.x.x.x.x.');
  assert.deepEqual(nums(node(patch, 'bS').steps).slice(0, 16), [0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12, 0, 0, 12, 12]);
  // arpeggio: a thin pulse (width 0.25) on every 16th
  assert.deepEqual([node(patch, 'aO').wave, node(patch, 'aO').width], ['pulse', 0.25]);
  assert.equal(node(patch, 'aA').trig, 'c16');
  // harmony: two pulses, detuned
  assert.equal(node(patch, 'pO1').wave, 'pulse');
  assert.equal(node(patch, 'pO2').wave, 'pulse');
});

test('the tune hops up the G major chord, steps back down, and ends on D', () => {
  assert.equal(TUNE.length, 8);
  const notes = TUNE.map((b) => b.split(/\s+/).filter((x) => x !== '_').map((x) => x.replace(/-+$/, '')));
  assert.deepEqual(notes[0], ['G4', 'B4', 'D5', 'G5', 'F#5', 'E5', 'D5']);
  const last = notes[7];
  assert.match(last[last.length - 1], /^D\d$/, 'the last note of the loop is D');
  assert.match(last[0], /^D\d$/, 'the answering phrase lands on D');
  // the echo is the same tune, an octave up and a beat (4 steps) late
  const s = nums(node(patch, 'lS').steps), e = nums(node(patch, 'eS').steps), g = flat(node(patch, 'lG').steps), eg = flat(node(patch, 'eG').steps);
  assert.equal(s.length, 128);
  for (let i = 0; i < 128; i++) { assert.equal(e[(i + 4) % 128], s[i] + 12); assert.equal(eg[(i + 4) % 128], g[i]); }
  // only notes of G major
  const scale = [0, 2, 4, 6, 7, 9, 11];   // C D E F# G A B as semitones above C
  for (const x of s) assert.ok(scale.includes(((x % 12) + 12) % 12), `semitone ${x} is not in G major`);
});

// (The check that no other track has this one's chords, tune or rhythms is library-wide now: it runs over every
// track found in sounds/, in tests/unit/compose-library.test.mjs.)

// ---- how intensity and length bring the layers in -------------------------------------------------------

const GATES = { beat: 'gBeat', snare: 'gSnare', tune: 'gTune', full: 'gFull', busy: 'gBusy' };
function gatesAt(params, seconds = 0.2, sr = 8000) {
  const v = createVoice(patch, { sampleRate: sr, params });
  for (let i = 0; i < seconds * sr; i++) v.tick();
  return Object.fromEntries(Object.entries({ bed: 'gBed', ...GATES }).map(([k, id]) => [k, v.nodeValues[v.nodeIds.indexOf(id)]]));
}

test('intensity brings the layers in, in the order the specification gives', () => {
  const on = (g) => Object.keys(GATES).filter((k) => g[k] > 0.99).join(' ');
  const off = (g) => Object.keys(GATES).filter((k) => g[k] < 0.01).join(' ');
  for (const i of [0, 0.1, 0.25]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(off(g), 'beat snare tune full busy', `intensity ${i}: bass and arpeggio only`); assert.ok(g.bed >= 0.8, 'still music at 0'); }
  // the melody comes in from 0.3 and is all there by 0.4 (the specification says 0.5; looks set intensity from 0.4 up and must keep the tune)
  { const g = gatesAt({ intensity: 0.3, bars: 8 }); assert.equal(off(g), 'snare tune full busy', 'intensity 0.3: kick and hat coming in, no melody yet'); assert.ok(g.beat > 0 && g.beat < 1); }
  for (const i of [0.4, 0.5]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'beat tune', `intensity ${i}: kick, hat and melody`); assert.equal(off(g), 'snare full busy'); }
  for (const i of [0.61, 0.75]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'beat snare tune', `intensity ${i}: snare added`); assert.equal(off(g), 'full busy'); }
  for (const i of [0.86, 1]) assert.equal(on(gatesAt({ intensity: i, bars: 8 })), 'beat snare tune full busy', `intensity ${i}: harmony and echo added, the hat goes to 16ths`);
});

test('every look keeps the melody', () => {
  const set = THEME_PRESETS.map((p) => [p.name, p.theme?.music?.intensity]).filter(([, i]) => i !== null && i !== undefined);
  assert.ok(set.length >= 2, 'some looks set the intensity');
  for (const [name, intensity] of [...set, ['the lowest a random look draws', 0.4]]) {
    const g = gatesAt({ intensity, bars: 8 });
    assert.ok(g.tune > 0.99, `"${name}" sets intensity ${intensity}, where the melody is at ${g.tune}`);
  }
});

test('the tune fits its chords, and stands clear of the accompaniment where they overlap', () => {
  const fit = tuneFit(patch).lines.find((l) => l.id === 'l');
  assert.equal(tuneFit(patch).tonic, 7, 'G');
  assert.ok(fit.chordShare >= 0.8, `chord share ${fit.chordShare}`);
  assert.equal(fit.scaleShare, 1);
  // 300 to 1200 Hz is where the tune, the arpeggio and the harmony all sit: the tune leads by 6 dB or more
  const m = measureLayers(patch, { tune: PARTS.tune, backing: PARTS.backing }, { band: [300, 1200], sampleRate: 22050 });
  assert.ok(m.tune.db - m.backing.db >= 6, `tune ${m.tune.db.toFixed(1)} dB against arpeggio and harmony ${m.backing.db.toFixed(1)} dB`);
});

test('the drums are heard when they come in: the second section of the 32-bar version is clearly louder', () => {
  const s = measureSections(patch, { sampleRate: 11025, params: { bpm: 156 } })[32];
  assert.ok(s[1] - s[0] >= 1.5, `section 2 is ${(s[1] - s[0]).toFixed(1)} dB above section 1`);
  assert.ok(s[2] > s[1] && s[3] > s[2], `sections keep climbing: ${s.map((d) => d.toFixed(1)).join(' ')}`);
});

test('a longer version builds up from the front: bass and arpeggio, then drums, then melody, then everything', () => {
  const sr = 8000, bpm = 138, barLen = (sr * 240) / bpm;
  const want = { 1: '', 2: 'beat snare', 3: 'beat snare tune', 4: 'beat snare tune full busy' };
  for (const bars of LENGTHS) {
    const v = createVoice(patch, { sampleRate: sr, params: { bars, bpm, intensity: 1, swing: 0 } });
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
  assert.deepEqual([8, 16, 24, 32].map((b) => sectionAt(0, b).section), [4, 3, 2, 1]);
});

test('a quick render: stereo, never silent, under the limiter, at both ends of intensity', () => {
  for (const intensity of [0, 1]) {
    const r = renderPatch(patch, { sampleRate: 11025, params: { intensity, bars: 8, bpm: 156 } });
    assert.equal(r.channels.length, 2);
    assert.equal(r.badSamples, 0);
    let sq = 0, diff = 0;
    for (let i = 0; i < r.samples.length; i++) { sq += r.samples[i] ** 2; diff += Math.abs(r.channels[0][i] - r.channels[1][i]); }
    assert.ok(Math.sqrt(sq / r.samples.length) > 0.02, `intensity ${intensity} is still music`);
    assert.ok(diff / r.samples.length > 1e-4, 'left and right differ');
    assert.ok(r.rawPeak <= patch.gain + 1e-6);
  }
});
