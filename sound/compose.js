// compose.js: the music-writing kit. The machinery every Loadout track repeats, written once
// (docs/style-guide.md, sections 12 and 14). Pure JavaScript with no Node or page APIs: it runs in the build, in
// tests and in the browser (docs/architecture.md, Contract 11). tools/compose/kit.mjs adds the command line.
//
// A composer writes the music: the chords, the melody, the drum rows, the voices of each layer and the mix.
// The kit supplies:
//
//   param(id, label, min, max, default, extra)   one control; standardParams({ tempo, defaults }) the seven every track has
//   clock({ swing })               the one 16th-note clock from `bpm`: node c16 (and c16p, 1 on the 8ths, 0 on the 16ths between)
//   chords(text, { tonic, low })   a chord progression, one name per bar: nodes tonic, root, third, fifth, tr (= round(key) + root)
//   arrangement(layers)            the bar counter and the gates: for each layer `name`, a node g<Name> (0..1) that follows
//                                  the `bars` length control (section by section) and the `intensity` control
//   sectionAt(bar, bars), layerPlays(layer, bar, bars)     the same arrangement as plain functions, for tests and reports
//   drumRow(id, bars)              a rhythm row, one character per 16th: X accent, x hit, o ghost, . rest
//   noteRow(id, steps, { every })  a row of numbers (semitones, chord-tone numbers), "_" holds
//   melody(id, bars, { shift, transpose, voice })   a tune in note names -> nodes <id>G gate, <id>S semitones, <id>V loudness,
//                                  <id>P pitch in Hz; refuses notes the instruments cannot play
//   instruments(id, { gains })     the five melody instruments behind `inst`, level-matched by `gains` -> node <id>F
//   bus({ centre, left, right, duck })       ducking, one shared reverb on `space`, a soft limiter per channel -> nodes mL, mR
//   assemble({...})                a checked patch with the standard controls and `meta`; refuses rows that do not divide the loop
//   lint(patch), tuneFit(patch)    what the style guide asks for and the patch lacks; whether the tune fits its chords
//   measureInstruments, matchGains, measureSections, measureIntensity, measureLayers, report     you cannot listen, so measure
//
// Every row is checked against the loop: its length in steps must divide the shortest length (8 bars, 128 steps),
// so the piece repeats exactly at 8, 16, 24 and 32 bars. `key` is added wherever a pitch is made (tr, <id>P): use
// `tr` for anything that follows the chords and `round(key)` for anything else.
//
// A whole (tiny) piece, in tools/compose/tiny_tune.mjs:
//
//   import { clock, chords, arrangement, drumRow, melody, instruments, bus, assemble, main } from './kit.mjs';
//   export const build = (gains) => assemble({
//     id: 'tiny-tune', name: 'Tiny tune', description: 'A four-chord tune.', meta: { ... },
//     tempo: [100, 140, 120], defaults: { intensity: 0.8, bars: 16, inst: 'Flute' },
//     nodes: [
//       clock(), chords('C F | G C', { tonic: 'C' }),
//       arrangement({ drums: { section: 2, intensity: [0.2, 0.3] }, tune: { section: 3, intensity: [0.3, 0.4] } }),
//       drumRow('kT', ['X...x...X...x...']),                                   // kick: one bar, repeated
//       { id: 'kA', type: 'ad', trig: 'kT', attack: 0.001, decay: 0.15 }, { id: 'kO', type: 'osc', freq: '45 + kA*120' },
//       { id: 'bO', type: 'osc', wave: 'tri', freq: 'midi(36 + tr)' },          // bass: the chord root
//       melody('l', ['C5 _ E5 _ G5 _ _ _ E5 _ _ _ C5 _ _ _', 'F5 _ _ _ A5 _ F5 _ C5 _ _ _ _ _ D5- E5-']),
//       instruments('l', { gains }),
//       bus({ centre: 'kO*kA*0.6*gDrums + bO*0.3', left: 'lF*0.7*gTune', right: 'lF*0.7*gTune', duck: 'kA*gDrums' }),
//     ],
//     presets: { Calm: { intensity: 0.2 }, Walk: { intensity: 0.6 }, Run: { intensity: 1, bpm: 132 } },
//   });
//   main(build, import.meta.url);
//
// Then (see kit.mjs): `--out <scratch file>` to try it, `--match` for the instrument gains, `--measure` for levels,
// and no option at all only when it is ready, to write sounds/tiny-tune.json.

import { validatePatch, createVoice, renderPatch, defaultParams } from './sfx-engine.js';
import { validateMeta } from '../catalog/schema.js';

/** The error every kit function throws when a piece breaks a rule; its message says what to fix. */
export class KitError extends Error {}
const fail = (msg) => { throw new KitError(msg); };

/** Steps (16th notes) in a bar. */
export const STEPS_PER_BAR = 16;
/** Bars in a section: a longer version adds one section at a time. */
export const SECTION_BARS = 8;
/** The four lengths every track offers, in bars. */
export const LENGTHS = [8, 16, 24, 32];
/** Steps in the shortest loop (128). The length of every row must divide this. */
export const LOOP_STEPS = SECTION_BARS * STEPS_PER_BAR;
/** Steps after which every length has come round a whole number of times (96 bars): the bar counter's length. */
const COUNTER_STEPS = 96 * STEPS_PER_BAR;
/** The longest a track may last, in seconds (32 bars at its slowest tempo). */
export const MAX_SECONDS = 120;
/** The five melody instruments, in the order every track offers them. The index is the value of `inst`. */
export const INSTRUMENTS = ['Synth lead', 'Flute', 'Chiptune', 'Bell', 'Plucked string'];
/** Starting gains for the five instruments; each track measures its own with matchGains, because level depends on the tune. */
export const DEFAULT_GAINS = [1, 0.8, 1, 1, 1.5];
/** How far the Key control moves a tune, in semitones: [down, up]. */
export const KEY_RANGE = [-5, 6];
/**
 * The notes each melody instrument plays well, as sounded: MIDI numbers [lowest, highest] (60 is middle C).
 * Top, C7 for all: higher and the tune is above the melody's own low-pass (1.2 kHz at Brightness 0) and thin on any
 * of them. Bottom: G2 for the voices rich in harmonics (lower is the bass's own register), G3 for the flute and
 * the bell, which are close to sine waves and are lost inside the bass and arpeggio below that.
 */
export const INSTRUMENT_RANGES = { 'Synth lead': [43, 96], Flute: [55, 96], Chiptune: [43, 96], Bell: [55, 96], 'Plucked string': [43, 96] };
/**
 * lint warns when fewer than this share of a tune's notes on the beat belong to the bar's chord.
 * Why a half: a triad moved a semitone shares no note with itself, so a tune written a semitone off scores near 0
 * and one in the wrong mode about a third; tunes written to their chords score 0.8 to 1 (passing notes fall between
 * beats). A half sits between the two with room for suspensions on the beat.
 */
export const CHORD_SHARE_MIN = 0.5;
/**
 * lint warns when fewer than this share of all a tune's notes belong to the scale (every note the chords use).
 * Why three quarters: a scale moved a semitone keeps 2 of its 7 notes (0.29); a tune in key with chromatic passing
 * notes keeps more than 0.85.
 */
export const SCALE_SHARE_MIN = 0.75;

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const num = (x) => String(Math.round(x * 1e6) / 1e6);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

// ---- controls -------------------------------------------------------------------------------------

/** One control of a patch. Arguments: id, label, min, max, dflt (the default), extra ({ unit, step, options, scale }). */
export function param(id, label, min, max, dflt, extra = {}) {
  return { id, label, min, max, default: dflt, ...extra };
}

/**
 * The seven controls every track has, with the fixed ids, in the fixed order (style guide, section 12).
 * Arguments: { tempo: [slowest, fastest, written], defaults: { intensity, key, bars, inst (a name), bright, space } }.
 */
export function standardParams({ tempo, defaults = {} }) {
  if (!Array.isArray(tempo) || tempo.length !== 3 || !(tempo[0] < tempo[1]) || tempo[2] < tempo[0] || tempo[2] > tempo[1]) fail('tempo: give [slowest, fastest, written], for example [120, 156, 138]');
  const d = { intensity: 0.8, key: 0, bars: 8, inst: INSTRUMENTS[0], bright: 0.6, space: 0.2, ...defaults };
  const inst = typeof d.inst === 'number' ? d.inst : INSTRUMENTS.indexOf(d.inst);
  if (!(inst >= 0 && inst < INSTRUMENTS.length)) fail(`defaults.inst: "${d.inst}" is not one of the five melody instruments (${INSTRUMENTS.join(', ')})`);
  if (!LENGTHS.includes(d.bars)) fail(`defaults.bars: ${d.bars} is not one of the lengths (${LENGTHS.join(', ')} bars)`);
  return [
    param('intensity', 'Intensity', 0, 1, d.intensity),
    param('bpm', 'Tempo', tempo[0], tempo[1], tempo[2], { unit: 'bpm' }),
    param('key', 'Key', KEY_RANGE[0], KEY_RANGE[1], d.key, { unit: 'semitones' }),
    param('bars', 'Length', LENGTHS[0], LENGTHS[LENGTHS.length - 1], d.bars, { unit: 'bars', step: SECTION_BARS }),
    param('inst', 'Melody instrument', 0, INSTRUMENTS.length - 1, inst, { options: [...INSTRUMENTS] }),
    param('bright', 'Brightness', 0, 1, d.bright),
    param('space', 'Room', 0, 0.5, d.space),
  ];
}

// ---- the clock --------------------------------------------------------------------------------------

/**
 * The one clock of a track: node c16 ticks on every 16th note, and c16p is 1 during the 16ths on an 8th note, 0 between.
 * Arguments: { swing }: an expression 0..1 (usually a control). 0 is straight; 1 is a full shuffle, where the 16ths
 * between come a third of a step late. 8th notes never move, so the bar and the tempo stay exact.
 */
export function clock({ swing } = {}) {
  const base = 'bpm/60*4';
  return [
    // the clock reads c16p from the sample before its tick: 0 when the 16th now starting falls on an 8th (a long step when swung)
    { id: 'c16', type: 'clock', rate: swing ? `${base} / (1 + (${swing})/3*(1 - 2*c16p))` : base },
    { id: 'c16p', type: 'seq', trig: 'c16', loop: true, steps: '1 0' },
  ];
}

// ---- rows ---------------------------------------------------------------------------------------------

const divides = (steps) => LOOP_STEPS % steps === 0;
function mustDivide(what, count, every, bars) {
  const steps = count * every;
  if (Number.isInteger(steps) && steps > 0 && divides(steps)) return;
  const said = bars ? `${bars} bars (${steps} steps)` : every > 1 ? `${count} steps of ${every} (${steps} steps)` : `${count} steps`;
  fail(`${what}: ${said} do not divide the ${SECTION_BARS}-bar loop; a row's length in steps must divide ${LOOP_STEPS}, so it is 1, 2, 4, 8, 16, 32, 64 or ${LOOP_STEPS} steps (16 steps is one bar: 1, 2, 4 or 8 bars), and every length repeats exactly`);
}
/** Splits a row given as one string, or as a list of bars, into tokens; a list is checked bar by bar. */
function rowTokens(what, input, split, every = 1) {
  if (Array.isArray(input)) {
    const bars = input.map((b) => split(String(b)));
    if (every === 1) bars.forEach((b, i) => { if (b.length !== STEPS_PER_BAR) fail(`${what}: bar ${i + 1} has ${b.length} steps, not ${STEPS_PER_BAR}`); });
    const all = bars.flat();
    mustDivide(what, all.length, every, every === 1 ? bars.length : 0);
    return all;
  }
  if (typeof input !== 'string') fail(`${what}: give a string, or a list with one string per bar`);
  const all = split(input);
  if (!all.length) fail(`${what}: empty`);
  mustDivide(what, all.length, every, 0);
  return all;
}
const group = (tokens, size, sep, joinWith) => {
  const out = [];
  for (let i = 0; i < tokens.length; i += size) out.push(tokens.slice(i, i + size).join(joinWith));
  return out.join(sep);
};
const chars = (s) => [...s.replace(/[\s|]/g, '')];
const words = (s) => s.replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);

/**
 * A rhythm row on the clock, one character per 16th: X accent (1), x hit (0.7), o ghost (0.4), . rest.
 * Arguments: id; bars: a list with one 16-character string per bar (1, 2, 4 or 8 bars), or one short string that
 * repeats ("X..."); { every }: move one step every N ticks. Returns a pattern node: use it as the `trig` of an
 * envelope, and sample it (`sah`) for the hit strength.
 */
export function drumRow(id, bars, { every = 1 } = {}) {
  const what = `drum row "${id}"`;
  const t = rowTokens(what, bars, chars, every);
  for (const c of t) if (!'Xxo.-'.includes(c)) fail(`${what}: "${c}" is not a mark (X accent, x hit, o ghost, . rest)`);
  return { id, type: 'pattern', trig: 'c16', steps: group(t, STEPS_PER_BAR, '|', ''), ...(every > 1 ? { every } : {}) };
}

/**
 * A row of numbers on the clock (semitones for a bass line, chord-tone numbers for an arpeggio); "_" holds.
 * Arguments: id; steps: one string, or a list with one string per bar; { every }: 16 moves one step per bar.
 * Returns a looping seq node.
 */
export function noteRow(id, steps, { every = 1 } = {}) {
  const what = `note row "${id}"`;
  const t = rowTokens(what, steps, words, every);
  for (const x of t) if (x !== '_' && !Number.isFinite(Number(x))) fail(`${what}: "${x}" is not a number or "_"`);
  return { id, type: 'seq', trig: 'c16', loop: true, ...(every > 1 ? { every } : {}), steps: group(t, every === 1 ? STEPS_PER_BAR : 4, ' | ', ' ') };
}

// ---- harmony ----------------------------------------------------------------------------------------------

const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORD_KINDS = { '': [4, 7], m: [3, 7], dim: [3, 6], aug: [4, 8], sus2: [2, 7], sus4: [5, 7] };
function pitchClass(letter, accidental, what) {
  const p = PITCH[letter.toUpperCase()];
  if (p === undefined) fail(`${what}: "${letter}" is not a note name (A to G)`);
  return p + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
}

/**
 * A chord progression, one chord name per bar: "G G C D | Em C D D". Kinds: major (G), minor (Em), dim, aug, sus2, sus4.
 * Arguments: text; { tonic: the home note ('G'); low: the lowest root allowed, in semitones from the tonic (default
 * -5: roots sit within a fourth below and a fifth above); every: steps per chord (16) }. A comma after a name
 * drops that root an octave, an apostrophe raises it (D, or D').
 * Returns the nodes tonic (the home note as semitones above C), root, third, fifth (semitones; root is counted from
 * the tonic) and tr = round(key) + root, so midi(43 + tr) is the bass note and midi(55 + tr + third) the third,
 * in whatever key the listener chose. The returned list also has .bars: [{ name, root, third, fifth }].
 */
export function chords(text, { tonic, low = -5, every = STEPS_PER_BAR } = {}) {
  const m0 = /^([A-G])([#b]?)$/.exec(tonic || '');
  if (!m0) fail(`chords: give the tonic as a note name, for example { tonic: 'G' }`);
  const home = pitchClass(m0[1], m0[2], 'chords');
  const names = words(String(text));
  mustDivide('chords', names.length, every, every === STEPS_PER_BAR ? names.length : 0);
  const bars = names.map((name) => {
    const m = /^([A-G])([#b]?)(m|dim|aug|sus2|sus4)?([,']*)$/.exec(name);
    if (!m) fail(`chords: "${name}" is not a chord this kit knows (a note name, then nothing, m, dim, aug, sus2 or sus4; then , or ' for the octave)`);
    let root = (((pitchClass(m[1], m[2], 'chords') - home - low) % 12) + 12) % 12 + low;
    for (const c of m[4]) root += c === ',' ? -12 : 12;
    const [third, fifth] = CHORD_KINDS[m[3] || ''];
    return { name: name.replace(/[,']/g, ''), root, third, fifth };
  });
  const row = (id, key) => ({ id, type: 'seq', trig: 'c16', every, loop: true, steps: group(bars.map((b) => b[key]), 4, ' | ', ' ') });
  const nodes = [
    { id: 'tonic', type: 'expr', expr: String(((home % 12) + 12) % 12) },
    row('root', 'root'), row('third', 'third'), row('fifth', 'fifth'),
    { id: 'tr', type: 'expr', expr: 'round(key) + root' },
  ];
  nodes.bars = bars;
  return nodes;
}

// ---- the arrangement: sections for `bars`, layers for `intensity` ----------------------------------------------

/**
 * Where a bar falls in a piece of a given length. Arguments: bar (counted from 0, running on for ever), bars (8, 16, 24 or 32).
 * Returns { index, rev, section }. section is 1 to 4, numbered as in the 32-bar version (1 the opening, 4 the full
 * band). A shorter piece keeps the last sections: 8 bars is section 4 only; 16 bars is sections 3 and 4.
 * rev: sections still to come (4 - section).
 */
export function sectionAt(bar, bars) {
  if (!LENGTHS.includes(bars)) fail(`sectionAt: ${bars} is not one of the lengths (${LENGTHS.join(', ')} bars)`);
  const count = bars / SECTION_BARS, index = Math.floor((((bar % bars) + bars) % bars) / SECTION_BARS);
  const rev = count - 1 - index;
  return { index, rev, section: LENGTHS.length - rev };
}
/** Whether a layer is let through at a bar of a piece of a given length (intensity is not counted). Arguments: layer ({ section }), bar, bars. */
export function layerPlays(layer, bar, bars) {
  return sectionAt(bar, bars).section >= (layer?.section ?? 1);
}

/**
 * The bar counter and the gate of every layer, following the `bars` and `intensity` controls.
 * Arguments: layers: { name: { section, intensity, floor } }; { lag }: seconds a gate takes to open (0.02).
 *   section    1 to 4: the section of the 32-bar version in which the layer first plays (default 1: from the start).
 *              Section 4 is the full band, and is the only section of the 8-bar version.
 *   intensity  [from, to]: the layer fades in as the `intensity` control crosses this window (default: always in).
 *              Looks set intensity anywhere from 0.4 up: finish the melody's window at or below 0.4.
 *   floor      with intensity: the level at the bottom of the window instead of silence (0.6 = starts at 60%)
 * For each layer: g<Name>, 0..1, to multiply the layer by (or to switch a row with: gBusy > 0.5 ? busyRow : plainRow).
 * Also barN (the bar number, 0 to 95), rev (sections still to come) and a<Name> (the section gate alone, smoothed
 * so a layer does not click in).
 */
export function arrangement(layers, { lag = 0.02 } = {}) {
  const sections = 'round(bars/8)';
  const nodes = [
    { id: 'barN', type: 'seq', trig: 'c16', every: STEPS_PER_BAR, loop: true, steps: Array.from({ length: COUNTER_STEPS / STEPS_PER_BAR }, (_, i) => i).join(' ') },
    { id: 'rev', type: 'expr', expr: `${sections} - 1 - floor((barN % (${sections}*8)) / 8)` },
  ];
  for (const [name, l] of Object.entries(layers || {})) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) fail(`arrangement: layer name "${name}" must be letters and digits`);
    const section = l.section ?? 1;
    if (!Number.isInteger(section) || section < 1 || section > LENGTHS.length) fail(`arrangement: layer "${name}": section must be 1, 2, 3 or 4 (the section of the 32-bar version where it first plays), got ${section}`);
    let level = '';
    if (l.intensity !== undefined) {
      const [lo, hi] = Array.isArray(l.intensity) ? l.intensity : [];
      if (!(lo >= 0 && hi <= 1 && lo < hi)) fail(`arrangement: layer "${name}": intensity must be [from, to] with 0 <= from < to <= 1`);
      const f = l.floor ?? 0;
      if (!(f >= 0 && f < 1)) fail(`arrangement: layer "${name}": floor must be from 0 to below 1`);
      level = `smooth(${num(lo)}, ${num(hi)}, intensity)`;
      if (f > 0) level = `(${num(f)} + ${num(1 - f)}*${level})`;
    } else if (l.floor !== undefined) fail(`arrangement: layer "${name}": floor needs an intensity window`);
    const N = cap(name);
    if (section > 1) nodes.push({ id: `a${N}`, type: 'lag', in: `rev < ${LENGTHS.length - section + 0.5} ? 1 : 0`, time: lag });
    nodes.push({ id: `g${N}`, type: 'expr', expr: [level, section > 1 ? `a${N}` : ''].filter(Boolean).join(' * ') || '1' });
  }
  return nodes;
}

// ---- melody -----------------------------------------------------------------------------------------------

function noteToken(tok, what) {
  const m = /^([A-Ga-g])([#b]?)(\d)(-{0,2})$/.exec(tok);
  if (!m) fail(`${what}: "${tok}" is not a note (write G4, F#5 or Bb3; add - for a softer note, -- for a ghost note; _ holds)`);
  return { midi: 12 * (Number(m[3]) + 1) + pitchClass(m[1], m[2], what), mark: ['X', 'x', 'o'][m[4].length] };
}
/** The voices a line must be playable on: [{ name, low, high }] from the `voice` option of melody(). */
function voiceRanges(voice, what) {
  if (Array.isArray(voice)) {
    if (voice.length !== 2 || !(voice[0] < voice[1])) fail(`${what}: voice as a range is [lowest, highest] in MIDI numbers, as sounded`);
    return [{ name: 'this voice', low: voice[0], high: voice[1] }];
  }
  if (voice === 'all') return INSTRUMENTS.map((name) => ({ name: `the ${name}`, low: INSTRUMENT_RANGES[name][0], high: INSTRUMENT_RANGES[name][1] }));
  if (!INSTRUMENT_RANGES[voice]) fail(`${what}: voice "${voice}" is not an instrument (${INSTRUMENTS.join(', ')}); use 'all', one of those names, or [lowest, highest] for a voice of your own`);
  return [{ name: `the ${voice}`, low: INSTRUMENT_RANGES[voice][0], high: INSTRUMENT_RANGES[voice][1] }];
}

/**
 * A tune, bar by bar, one token per 16th: a note name starts a note (C4 is middle C), "_" lets it ring.
 *   melody('l', ['G4 _ B4 _ D5 _ G5 _ _ _ F#5 _ E5- _ D5 _', ...])        1, 2, 4 or 8 bars
 * A note marked - is softer (0.7), -- softer still (0.4).
 * Arguments: id; bars: a list with one string per bar; { shift: play the line this many 16ths later; transpose:
 * semitones up; glide: seconds (0.012); vel: false for no loudness node; voice: who must be able to play it }.
 * voice is 'all' (default: every one of the five melody instruments, so C4 to F#6 as written), one instrument's
 * name, or [lowest, highest] in MIDI numbers for a voice of your own. The Key control moves the tune 5 down and 6
 * up, and every key must stay in range: a note outside is refused, with its name and its bar.
 * Returns <id>G (the gate row), <id>S (semitones above middle C), <id>V (the loudness of the current note) and
 * <id>P (the pitch in Hz, moved by `key`, with a glide). shift and transpose together make an echo line:
 *   melody('e', TUNE, { shift: 4, transpose: 12, vel: false, voice: [43, 108] })      a beat late, an octave up
 */
export function melody(id, bars, { shift = 0, transpose = 0, glide = 0.012, vel = true, voice = 'all' } = {}) {
  const what = `melody "${id}"`;
  if (!Array.isArray(bars)) fail(`${what}: give a list with one string per bar`);
  const toks = rowTokens(what, bars, words);
  const ranges = voiceRanges(voice, what);
  const gate = [], notes = [];
  let cur = 0;
  if (!toks.some((x) => x !== '_')) fail(`${what}: no notes`);
  // a hold before the first note of the loop rings on from the last note of the loop
  for (let i = toks.length - 1; i >= 0; i--) if (toks[i] !== '_') { cur = noteToken(toks[i], what).midi; break; }
  toks.forEach((x, i) => {
    if (x === '_') { gate.push('.'); notes.push(cur); return; }
    const n = noteToken(x, what), sounds = n.midi + transpose, bar = Math.floor(i / STEPS_PER_BAR) + 1;
    const said = transpose ? `${noteName(sounds)} (${x.replace(/-+$/, '')} moved ${transpose > 0 ? 'up' : 'down'} ${Math.abs(transpose)})` : noteName(sounds);
    for (const r of ranges) {
      const plays = `${r.name} plays ${noteName(r.low)} to ${noteName(r.high)}`;
      if (sounds + KEY_RANGE[1] > r.high) fail(`${what}: bar ${bar}: ${said} is too high for ${r.name} (${plays}, and the Key control raises the tune up to ${KEY_RANGE[1]} semitones): write ${noteName(r.high - KEY_RANGE[1] - transpose)} or lower`);
      if (sounds + KEY_RANGE[0] < r.low) fail(`${what}: bar ${bar}: ${said} is too low for ${r.name} (${plays}, and the Key control lowers the tune up to ${-KEY_RANGE[0]} semitones): write ${noteName(r.low - KEY_RANGE[0] - transpose)} or higher`);
    }
    cur = n.midi; gate.push(n.mark); notes.push(cur);
  });
  const n = toks.length, k = ((Math.round(shift) % n) + n) % n;
  const rot = (a) => a.map((_, i) => a[(i - k + n) % n]);
  const nodes = [
    { id: `${id}G`, type: 'pattern', trig: 'c16', steps: group(rot(gate), STEPS_PER_BAR, '|', '') },
    { id: `${id}S`, type: 'seq', trig: 'c16', loop: true, steps: group(rot(notes).map((m) => m - 60 + transpose), STEPS_PER_BAR, ' | ', ' ') },
  ];
  if (vel) nodes.push({ id: `${id}V`, type: 'sah', in: `${id}G`, trig: `${id}G` });
  nodes.push({ id: `${id}P`, type: 'lag', in: `midi(60 + round(key) + ${id}S)`, time: glide });
  return nodes;
}

// ---- the melody instruments ------------------------------------------------------------------------------------

/**
 * The five melody instruments behind the `inst` control: all play the pitch <id>P on the gate <id>G, and `inst` picks one.
 * Arguments: id ('l'); { gains, noise, length, pitch, gate, vel, vibrato }.
 *   gains    five numbers that level the instruments: get them from matchGains (or `--match` on your generator)
 *   noise    the id of a white-noise node the piece already has (for the flute's breath); without it one is added
 *   length   makes every note longer or shorter (1 = as in battle-theme; slow tunes want 1.3 to 1.6)
 *   pitch, gate, vel   other node ids, when the tune was not made by melody(id, ...); vel: null for none
 * Returns nodes ending in <id>F: the chosen instrument through a low-pass that opens with `bright`. (<id>In is the
 * same before the filter.)
 */
export function instruments(id = 'l', { gains = DEFAULT_GAINS, noise, length = 1, pitch = `${id}P`, gate = `${id}G`, vel = `${id}V`, vibrato = 5.8 } = {}) {
  if (!Array.isArray(gains) || gains.length !== INSTRUMENTS.length || gains.some((g) => !(g > 0))) fail(`instruments "${id}": gains must be five positive numbers, one per instrument (${INSTRUMENTS.join(', ')})`);
  const nz = noise || `${id}Nz`, vib = `${id}Vib`, L = (s) => num(s * length), g = gains.map(num);
  const v = vel ? `*${vel}` : '';
  const pick = '(0.0016 - bright*0.0008)';   // length of the pick pulse in seconds: shorter is brighter
  return [
    ...(noise ? [] : [{ id: nz, type: 'noise' }]),
    { id: vib, type: 'osc', freq: vibrato },
    // 0 synth lead: saw + pulse, slightly detuned, with vibrato
    { id: `${id}A`, type: 'ad', trig: gate, attack: 0.006, hold: L(0.12), decay: L(0.35), curve: 1.4 },
    { id: `${id}O1`, type: 'osc', wave: 'saw', freq: `${pitch}*(1 + ${vib}*0.006)` },
    { id: `${id}O2`, type: 'osc', wave: 'pulse', width: 0.3, freq: `${pitch}*1.004*(1 + ${vib}*0.006)` },
    // 1 flute: sine with a little octave and a breath of noise, slow attack, more vibrato
    { id: `${id}FlA`, type: 'ad', trig: gate, attack: 0.035, hold: L(0.12), decay: L(0.3), curve: 1.3 },
    { id: `${id}FlO1`, type: 'osc', freq: `${pitch}*(1 + ${vib}*0.009)` },
    { id: `${id}FlO2`, type: 'osc', wave: 'tri', freq: `${pitch}*2*(1 + ${vib}*0.009)` },
    { id: `${id}FlN`, type: 'filter', mode: 'bp', in: nz, freq: `${pitch}*2`, q: 3 },
    // 2 chiptune: thin pulse with an octave square, no vibrato, short notes
    { id: `${id}ChA`, type: 'ad', trig: gate, attack: 0.002, hold: L(0.09), decay: L(0.16), curve: 1.2 },
    { id: `${id}ChO1`, type: 'osc', wave: 'pulse', width: 0.25, freq: pitch },
    { id: `${id}ChO2`, type: 'osc', wave: 'square', freq: `${pitch}*2` },
    // 3 bell: a sine whose phase is pushed by a faster sine (FM); the push fades faster than the note
    { id: `${id}BeA`, type: 'ad', trig: gate, attack: 0.001, decay: L(0.75), curve: 2.6 },
    { id: `${id}BeI`, type: 'ad', trig: gate, attack: 0.001, decay: L(0.3), curve: 2 },
    { id: `${id}BeM`, type: 'osc', freq: `${pitch}*3.5` },
    { id: `${id}BeC`, type: 'osc', freq: pitch, pm: `${id}BeM*${id}BeI*0.45` },
    // 4 plucked string. The string is not set off by the burst of full-scale noise built into the pluck node
    // (its "trig" is held at 0): that burst is 15 dB above the ringing string, differs from note to note and leaves a
    // DC offset in the string. The kit plucks it with its own pulse, the same for every note: one swing up and one
    // down (so it adds no DC), about a millisecond long, shorter as Brightness rises. A high-pass under the note
    // (half its pitch) is the DC block.
    { id: `${id}PlX`, type: 'env', trig: gate, points: [[0, 0], [`${pick}*0.25`, 1], [`${pick}*0.75`, -1], [pick, 0]] },
    { id: `${id}Pl`, type: 'pluck', trig: 0, in: `${id}PlX`, freq: pitch, decay: L(2.2), damp: '0.22 - bright*0.15' },
    { id: `${id}PlD`, type: 'filter', mode: 'hp', in: `${id}Pl`, freq: `${pitch}*0.5`, q: 0.7 },
    {
      id: `${id}In`, type: 'expr',
      expr: `(inst < 0.5 ? (${id}O1*0.6 + ${id}O2*0.5)*${id}A*${g[0]} : inst < 1.5 ? (${id}FlO1 + ${id}FlO2*0.18 + ${id}FlN*0.5)*${id}FlA*${g[1]} : inst < 2.5 ? (${id}ChO1*0.6 + ${id}ChO2*0.22)*${id}ChA*${g[2]} : inst < 3.5 ? ${id}BeC*${id}BeA*${g[3]} : ${id}PlD*${g[4]})${v}`,
    },
    { id: `${id}F`, type: 'filter', mode: 'lp', in: `${id}In`, freq: `1200 + bright*4500 + ${id}A*1500`, q: 1.3 },
  ];
}

// ---- the bus -----------------------------------------------------------------------------------------------------

/**
 * The mix: ducking, one shared reverb on the `space` control and a soft limiter per channel; the patch's out is ["mL", "mR"].
 * Arguments: { centre, left, right, duck, duckAmount, send, size, damp, level, drive }.
 *   centre   kick, snare, bass: the same in both channels, not ducked
 *   left, right   everything else: spread detuned copies, chord tones and echoes between the two
 *   duck     the kick's envelope: the music dips under each kick (duckAmount, default 0.35). Multiply it by the
 *            kick's gate ('kA*gBeat') so the music only dips while the kick plays
 *   send     extra signal into the reverb (a little snare, say); the music goes in by itself
 *   level    how hard the mix leans on the limiter (default 0.7). Each channel ends in tanh, so the output never
 *            passes the patch gain; aim for about 1.2 into it at the loudest moment (measureLayers on
 *            '(ctr + muL + rv*space*2)*<level>').
 * Returns the nodes (duck,) ctr, muL, muR, rv, mL, mR.
 */
export function bus({ centre = '0', left, right, duck, duckAmount = 0.35, send, size = 0.75, damp = 0.35, level = 0.7, drive = 1 } = {}) {
  if (!left || !right) fail('bus: give left and right (the same expression in both for a mono layer)');
  const d = duck ? '*duck' : '';
  return [
    ...(duck ? [{ id: 'duck', type: 'expr', expr: `1 - ${duck}*${num(duckAmount)}` }] : []),
    { id: 'ctr', type: 'expr', expr: centre },
    { id: 'muL', type: 'expr', expr: `(${left})${d}` },
    { id: 'muR', type: 'expr', expr: `(${right})${d}` },
    { id: 'rv', type: 'reverb', in: `(muL + muR)*0.5${send ? ` + (${send})` : ''}`, size, damp, mix: 1 },
    { id: 'mL', type: 'shaper', in: `(ctr + muL + rv*space*2)*${num(level)}`, drive },
    { id: 'mR', type: 'shaper', in: `(ctr + muR + rv*space*2)*${num(level)}`, drive },
  ];
}

// ---- assembling a patch --------------------------------------------------------------------------------------------

function rowLength(n) {
  const s = n.steps;
  if (typeof s === 'string') return n.type === 'pattern' ? chars(s).length : words(s).length;
  return Array.isArray(s) ? s.length : 0;
}
function checkRows(nodes) {
  const clocks = nodes.filter((n) => n.type === 'clock');
  if (clocks.length !== 1 || clocks[0].id !== 'c16') fail(`one 16th-note clock drives everything: the piece needs exactly one clock, "c16" from clock() (found ${clocks.map((c) => `"${c.id}"`).join(', ') || 'none'})`);
  for (const n of nodes) {
    if (n.type !== 'pattern' && n.type !== 'seq') continue;
    const what = `row "${n.id}"`;
    if (n.trig === undefined) fail(`${what}: a row must be stepped by the clock ("trig": "c16"), not by a rate of its own`);
    if (n.trig !== 'c16') continue;   // stepped by another row: its length cannot be judged here
    const every = typeof n.every === 'number' ? n.every : 1, count = rowLength(n), steps = count * every;
    if (n.type === 'seq' && !n.loop) fail(`${what}: a sequence on the clock must have "loop": true, or it stops at its last step`);
    if (steps > 0 && steps % COUNTER_STEPS === 0) continue;   // a counter that spans whole loops of every length
    mustDivide(what, count, every, 0);
  }
}

/**
 * Builds a checked music patch with the standard controls and its metadata; throws a KitError that says what to fix.
 * Arguments: { id, name, description, tags, meta, tempo, defaults, extraParams, nodes, presets, gain, out }.
 *   meta         the asset's metadata (Contract 1), checked against catalog/schema.js: the patch always carries it
 *   tempo        [slowest, fastest, written]
 *   defaults     { intensity, bars, inst (a name), bright, space, key }
 *   extraParams  the track's own one to three controls (param(...)), placed after the standard seven
 *   nodes        the helpers' results and your own nodes, in order; lists inside the list are flattened
 *   presets      three styles, named for game moments. Looks change tempo by up to 10% and clamp at the range, so
 *                keep a fast style 5% under the fastest tempo and a slow one 5% over the slowest
 */
export function assemble({ id, name, description, tags, meta, tempo, defaults, extraParams = [], nodes, presets = {}, gain = 0.85, out = ['mL', 'mR'] } = {}) {
  const params = [...standardParams({ tempo, defaults }), ...extraParams];
  if (params.length > 10) fail(`${params.length} controls: a track has at most 10 (the standard seven and up to three of its own)`);
  const flat = (Array.isArray(nodes) ? nodes : []).flat(Infinity);
  if (!flat.length) fail('nodes: give the piece its nodes');
  for (const n of flat) if (!n || typeof n !== 'object' || typeof n.id !== 'string' || typeof n.type !== 'string') fail(`nodes: every entry needs an id and a type; got ${JSON.stringify(n)}`);
  checkRows(flat);
  const longest = (LENGTHS[LENGTHS.length - 1] * 4 * 60) / tempo[0];
  if (longest > MAX_SECONDS) fail(`${LENGTHS[LENGTHS.length - 1]} bars at the slowest tempo (${tempo[0]} bpm) last ${longest.toFixed(0)} s; music may run up to ${MAX_SECONDS} s, so the slowest tempo must be at least ${Math.ceil((LENGTHS[LENGTHS.length - 1] * 240) / MAX_SECONDS)} bpm`);
  const m = validateMeta(meta, 'music');
  if (!m.ok) fail(`meta: ${m.errors.join('; ')}`);
  const patch = {
    format: 'sfxpatch/0.1', id, name, category: 'music',
    ...(tags ? { tags } : {}),
    description, meta,
    loop: true, wrap: true, normalize: false, gain,
    duration: 'round(bars/8)*8*4*60/bpm',
    params, nodes: flat.map((n) => ({ ...n })), out, presets,
  };
  const v = validatePatch(patch);
  if (!v.ok) fail(`the patch does not validate:\n  ${v.errors.join('\n  ')}`);
  return patch;
}

// ---- does the tune fit its chords ---------------------------------------------------------------------------------------

const rowNumbers = (steps) => { let prev = 0; return words(String(steps)).map((x) => (prev = x === '_' ? prev : Number(x))); };

/**
 * How well each tune of a patch fits the chords under it, read from the patch alone. Arguments: patch.
 * Returns { tonic, lines: [{ id, onBeat, inChord, chordShare, notes, inScale, scaleShare }] }: of the notes that
 * start on a beat, the share that belong to the bar's chord; of all notes, the share in the scale (every note the
 * chords use). A tune is any line made by melody(). With no chords() in the patch: { lines: [], reason }.
 */
export function tuneFit(patch) {
  const by = Object.fromEntries((patch.nodes || []).map((n) => [n.id, n]));
  if (!by.tonic || !by.root || !by.third || !by.fifth) return { tonic: null, lines: [], reason: 'the patch has no tonic, root, third and fifth nodes (they come from chords()), so its key is not known' };
  const tonic = Number(by.tonic.expr), every = by.root.every || 1;
  const roots = rowNumbers(by.root.steps), thirds = rowNumbers(by.third.steps), fifths = rowNumbers(by.fifth.steps);
  const pc = (x) => ((Math.round(x) % 12) + 12) % 12;
  const chordAt = (step) => { const i = Math.floor(step / every) % roots.length; return [roots[i], roots[i] + thirds[i], roots[i] + fifths[i]].map((t) => pc(tonic + t)); };
  const scale = new Set(roots.flatMap((_, i) => chordAt(i * every)));
  const lines = [];
  for (const n of patch.nodes) {
    const m = /^midi\(60 \+ round\(key\) \+ ([A-Za-z_]\w*)S\)$/.exec(typeof n.in === 'string' ? n.in : '');
    if (!m || n.id !== `${m[1]}P` || !by[`${m[1]}S`] || !by[`${m[1]}G`]) continue;
    const semis = rowNumbers(by[`${m[1]}S`].steps), gate = chars(String(by[`${m[1]}G`].steps));
    let onBeat = 0, inChord = 0, notes = 0, inScale = 0;
    gate.forEach((g, i) => {
      if (g === '.' || g === '-') return;
      const p = pc(semis[i]);   // semitones above middle C: the pitch class is the same number
      notes++; if (scale.has(p)) inScale++;
      if (i % 4 === 0) { onBeat++; if (chordAt(i).includes(p)) inChord++; }
    });
    lines.push({ id: m[1], onBeat, inChord, chordShare: onBeat ? inChord / onBeat : 1, notes, inScale, scaleShare: notes ? inScale / notes : 1 });
  }
  return { tonic, lines };
}

/** What the style guide (section 12) asks of a track and a patch lacks, as a list of sentences; empty is good. Arguments: patch. */
export function lint(patch) {
  const out = [], ids = (patch.params || []).map((p) => p.id);
  const want = ['intensity', 'bpm', 'key', 'bars', 'inst', 'bright', 'space'];
  for (const id of want) if (!ids.includes(id)) out.push(`no "${id}" control: every track has ${want.join(', ')}`);
  const inst = (patch.params || []).find((p) => p.id === 'inst');
  if (inst && JSON.stringify(inst.options) !== JSON.stringify(INSTRUMENTS)) out.push(`the melody instruments must be these five, in this order: ${INSTRUMENTS.join(', ')}`);
  if (ids.length > 10) out.push(`${ids.length} controls: at most 10`);
  const styles = Object.keys(patch.presets || {});
  if (styles.length !== 3) out.push(`${styles.length} style${styles.length === 1 ? '' : 's'}: a track has three styles, named for game moments`);
  if (!Array.isArray(patch.out)) out.push('mono: a track is stereo (out: [left, right])');
  if (!(patch.loop && patch.wrap)) out.push('a track loops with "wrap": true');
  const pct = (x) => `${Math.round(x * 100)}%`;
  for (const l of tuneFit(patch).lines) {
    if (l.onBeat >= 4 && l.chordShare < CHORD_SHARE_MIN) out.push(`melody "${l.id}": only ${pct(l.chordShare)} of its notes on the beat (${l.inChord} of ${l.onBeat}) belong to the bar's chord; at least ${pct(CHORD_SHARE_MIN)} is expected. Is the tune written in the key of the chords, and in the right bars?`);
    if (l.notes >= 4 && l.scaleShare < SCALE_SHARE_MIN) out.push(`melody "${l.id}": only ${pct(l.scaleShare)} of its notes (${l.inScale} of ${l.notes}) are notes the chords use; at least ${pct(SCALE_SHARE_MIN)} is expected. The tune may be a semitone off its chords`);
  }
  return out;
}

// ---- measuring (nobody here can listen) ------------------------------------------------------------------------------

const dB = (meanSquare) => (meanSquare > 1e-18 ? 10 * Math.log10(meanSquare) : -180);
/** A 12 dB per octave filter as a function of one sample: mode 'lp' or 'hp', corner in Hz. */
function twoPole(mode, hz, sr) {
  const g = Math.tan((Math.PI * Math.min(hz, sr * 0.49)) / sr), k = Math.SQRT2, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  let ic1 = 0, ic2 = 0;
  return (x) => {
    const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    return mode === 'lp' ? v2 : x - k * v1 - v2;
  };
}

/**
 * The level of each melody instrument: the melody bus (before any layer gain) over the 8-bar version, once per instrument.
 * Arguments: patch; { node: the melody bus ('lF': <id>F of instruments(id)), sampleRate, params }.
 * Returns [{ name, db, peak, crestDb, dc, sub80 }]: RMS in dB, peak, peak over RMS in dB, mean as a share of the
 * RMS (a DC offset), and the share of the energy below 80 Hz. Level-matched means the db values are within 1 dB.
 */
export function measureInstruments(patch, { node = 'lF', sampleRate = 44100, params = {} } = {}) {
  const inst = (patch.params || []).find((p) => p.id === 'inst');
  if (!inst?.options) fail('measureInstruments: the patch has no "inst" control with named options');
  return inst.options.map((name, i) => {
    const voice = createVoice(patch, { sampleRate, params: { ...params, bars: LENGTHS[0], inst: i } });
    const k = voice.nodeIds.indexOf(node);
    if (k < 0) fail(`measureInstruments: no node "${node}" (the melody bus is <id>F for instruments(id); nodes: ${voice.nodeIds.join(' ')})`);
    const n = Math.round(voice.duration * sampleRate), low = twoPole('lp', 80, sampleRate);
    let sq = 0, sum = 0, peak = 0, lowSq = 0;
    for (let s = 0; s < n; s++) {
      voice.tick();
      const x = voice.nodeValues[k], a = Math.abs(x), l = low(x);
      sq += x * x; sum += x; lowSq += l * l; if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sq / n);
    return { name, db: dB(sq / n), peak, crestDb: rms > 0 ? 20 * Math.log10(peak / rms) : 0, dc: rms > 0 ? sum / n / rms : 0, sub80: sq > 0 ? lowSq / sq : 0 };
  });
}

/**
 * Finds the five gains that level the melody instruments. Arguments: build(gains), which must return the patch made
 * with those gains; { node, sampleRate, params, start } as for measureInstruments (start: the gains to begin from).
 * The first instrument (Synth lead) keeps gain 1 and the others are matched to it.
 * Returns { gains, before, after }: before and after are measureInstruments results.
 */
export function matchGains(build, opts = {}) {
  const start = [...(opts.start || DEFAULT_GAINS)];
  const before = measureInstruments(build(start), opts);
  const gains = start.map((g, i) => Number(((g / start[0]) * 10 ** ((before[0].db - before[i].db) / 20)).toPrecision(3)));
  return { gains, before, after: measureInstruments(build(gains), opts) };
}

const channelPower = (r, a, b) => { let sq = 0; for (const c of r.channels) for (let i = a; i < b; i++) sq += c[i] * c[i]; return sq / (Math.max(1, b - a) * r.channels.length); };

/**
 * The level of every 8-bar section at every length. Arguments: patch; { sampleRate, params }.
 * Returns { 8: [dB], 16: [dB, dB], 24: [...], 32: [...] } (RMS, dBFS, both channels). A longer version must climb
 * section by section and end on the same full band as the 8-bar one.
 */
export function measureSections(patch, { sampleRate = 44100, params = {} } = {}) {
  const out = {};
  for (const bars of LENGTHS) {
    const r = renderPatch(patch, { sampleRate, params: { ...defaultParams(patch), ...params, bars } });
    const n = r.samples.length, count = bars / SECTION_BARS;
    out[bars] = Array.from({ length: count }, (_, s) => dB(channelPower(r, Math.floor((s * n) / count), Math.floor(((s + 1) * n) / count))));
  }
  return out;
}

/**
 * Level and peak of the 8-bar version at several intensities; loudness must rise. Arguments: patch;
 * { sampleRate, params, values: the intensities ([0, 0.25, 0.5, 0.75, 1]) }. Returns [{ intensity, db, peak }].
 */
export function measureIntensity(patch, { sampleRate = 44100, params = {}, values = [0, 0.25, 0.5, 0.75, 1] } = {}) {
  return values.map((intensity) => {
    const r = renderPatch(patch, { sampleRate, params: { ...defaultParams(patch), ...params, bars: LENGTHS[0], intensity } });
    return { intensity, db: dB(channelPower(r, 0, r.samples.length)), peak: r.rawPeak };
  });
}

/**
 * The level of any parts of the mix, each given as an expression over the patch's nodes, over the 8-bar version at full intensity.
 * Arguments: patch; layers: { name: expression }, for example { tune: 'lF*0.8*lead*gTune', backing: 'aF*0.4*gBed + pL*0.3*gFull' };
 * { band: [low, high] in Hz to measure only that band (12 dB per octave edges); sampleRate; params }.
 * Returns { name: { db, peak } } (RMS in dB, and the largest sample). Use it to set a tune against its
 * accompaniment where they overlap (band [300, 1200]), a drum against the bed, or what reaches the limiter.
 */
export function measureLayers(patch, layers, { band, sampleRate = 44100, params = {} } = {}) {
  const names = Object.keys(layers || {});
  if (!names.length) fail('measureLayers: give { name: expression }');
  const probe = { ...patch, nodes: [...patch.nodes, ...names.map((name, i) => ({ id: `zzLayer${i}`, type: 'expr', expr: String(layers[name]) }))] };
  let voice;
  try { voice = createVoice(probe, { sampleRate, params: { intensity: 1, ...params, bars: LENGTHS[0] } }); } catch (e) { fail(`measureLayers: ${e.message}`); }
  const idx = names.map((_, i) => voice.nodeIds.indexOf(`zzLayer${i}`));
  const filters = names.map(() => (band ? [twoPole('hp', band[0], sampleRate), twoPole('lp', band[1], sampleRate)] : null));
  const n = Math.round(voice.duration * sampleRate), sq = names.map(() => 0), peak = names.map(() => 0);
  for (let s = 0; s < n; s++) {
    voice.tick();
    for (let j = 0; j < idx.length; j++) {
      let x = voice.nodeValues[idx[j]];
      if (filters[j]) x = filters[j][1](filters[j][0](x));
      sq[j] += x * x; const a = Math.abs(x); if (a > peak[j]) peak[j] = a;
    }
  }
  return Object.fromEntries(names.map((name, j) => [name, { db: dB(sq[j] / n), peak: peak[j] }]));
}

/**
 * Everything a composer reports, as text: instrument levels, section levels, intensity levels, the tune against its chords, render time.
 * Arguments: patch; { node: the melody bus ('lF'); layers: { name: expression } to print each layer's level, whole
 * band and 300 to 1200 Hz, for every melody instrument }.
 */
export function report(patch, { node = 'lF', layers } = {}) {
  const lines = [`${patch.id}  "${patch.name}"  ${patch.nodes.length} nodes`];
  const f = (x) => x.toFixed(1);
  const inst = measureInstruments(patch, { node });
  const dbs = inst.map((l) => l.db), spread = Math.max(...dbs) - Math.min(...dbs);
  lines.push(`melody instruments (RMS of ${node}, 8 bars): ${inst.map((l) => `${l.name} ${f(l.db)} dB`).join(' · ')}`);
  lines.push(`  spread ${spread.toFixed(2)} dB ${spread <= 1 ? '(matched within 1 dB)' : '(NOT matched: run your generator with --match and paste the gains in)'}`);
  lines.push(`  peak over RMS: ${inst.map((l) => `${l.name} ${f(l.crestDb)} dB`).join(' · ')}`);
  lines.push(`  DC offset (share of RMS) and energy below 80 Hz: ${inst.map((l) => `${l.name} ${l.dc.toFixed(3)}, ${(l.sub80 * 100).toFixed(1)}%`).join(' · ')}`);
  const t0 = performance.now();
  const r8 = renderPatch(patch, { params: { ...defaultParams(patch), bars: LENGTHS[0] } });
  const ms = performance.now() - t0;
  lines.push(`8 bars at the defaults: ${r8.duration.toFixed(2)} s, rendered in ${(ms / 1000).toFixed(1)} s (${(r8.duration / (ms / 1000)).toFixed(1)}x real time), raw peak ${r8.rawPeak.toFixed(2)}`);
  const sec = measureSections(patch);
  lines.push('section levels (RMS dBFS, at the defaults), first section to last:');
  for (const bars of LENGTHS) lines.push(`  ${String(bars).padStart(2)} bars: ${sec[bars].map(f).join('  ')}`);
  lines.push('intensity (8 bars): ' + measureIntensity(patch).map((x) => `${x.intensity} → ${f(x.db)} dB, peak ${x.peak.toFixed(2)}`).join(' · '));
  if (layers) {
    const names = Object.keys(layers);
    lines.push(`layers (RMS dB, 8 bars, intensity 1): whole band / 300 to 1200 Hz`);
    inst.forEach((l, i) => {
      const all = measureLayers(patch, layers, { params: { inst: i } }), mid = measureLayers(patch, layers, { params: { inst: i }, band: [300, 1200] });
      lines.push(`  ${l.name.padEnd(15)} ${names.map((k) => `${k} ${f(all[k].db)} / ${f(mid[k].db)}`).join(' · ')}`);
    });
  }
  const fit = tuneFit(patch);
  for (const l of fit.lines) lines.push(`tune "${l.id}": ${l.inChord} of ${l.onBeat} notes on the beat are in the bar's chord (${Math.round(l.chordShare * 100)}%), ${l.inScale} of ${l.notes} notes are in the scale (${Math.round(l.scaleShare * 100)}%)`);
  if (fit.reason) lines.push(`tune against chords: not judged: ${fit.reason}`);
  for (const n of lint(patch)) lines.push(`style guide: ${n}`);
  return lines.join('\n');
}
