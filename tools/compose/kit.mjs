// kit.mjs: the music kit. The machinery every Loadout track repeats, written once
// (docs/style-guide.md, sections 12 and 14). A composer writes the music: the chords, the
// melody, the drum rows, the voices of each layer and the mix. The kit supplies:
//
//   clock({ swing })               the one 16th-note clock from `bpm`: node c16 (and c16p, 1 on the 8ths, 0 on the 16ths between)
//   chords(text, { tonic, low })   a chord progression, one name per bar: nodes root, third, fifth, tr (= round(key) + root)
//   arrangement(layers)            the bar counter and the gates: for each layer `name`, a node g<Name> (0..1) that follows
//                                  the `bars` length control (section by section) and the `intensity` control
//   sectionAt(bar, bars), layerPlays(layer, bar, bars)     the same arrangement as plain functions, for tests and reports
//   drumRow(id, bars)              a rhythm row, one character per 16th: X accent, x hit, o ghost, . rest
//   noteRow(id, steps, { every })  a row of numbers (semitones, chord-tone numbers), "_" holds
//   melody(id, bars, { shift, transpose })   a tune in note names -> nodes <id>G gate, <id>S semitones, <id>V loudness, <id>P pitch in Hz
//   instruments(id, { gains })     the five melody instruments behind `inst`, level-matched by `gains` -> node <id>F
//   bus({ centre, left, right, duck })       ducking, one shared reverb on `space`, a soft limiter per channel -> nodes mL, mR
//   assemble({...})                a checked patch with the standard controls and `meta`; refuses rows that do not divide the loop
//   lint(patch)                    what the style guide asks for and the patch lacks
//   measureInstruments, matchGains, measureSections, measureIntensity, report     measurement: you cannot listen, so measure
//   main(build, import.meta.url)   the command line of a track's generator (write, --match, --measure)
//
// Written in JavaScript, not Python like battle_theme.py, because the sound engine is JavaScript: the kit validates,
// renders and measures a piece in the same process, and its tests run with `node --test`.
//
// Every row is checked against the loop: a row must divide the shortest length (8 bars, 128 steps), so the piece
// repeats exactly at 8, 16, 24 and 32 bars. `key` is added wherever a pitch is made (tr, <id>P): use `tr` for
// anything that follows the chords and `round(key)` for anything else.
//
// A whole (tiny) piece:
//
//   import { clock, chords, arrangement, drumRow, melody, instruments, bus, assemble, main } from './kit.mjs';
//   export const build = (gains) => assemble({
//     id: 'tiny-tune', name: 'Tiny tune', description: 'A four-chord tune.', meta: { ... },
//     tempo: [100, 140, 120], defaults: { intensity: 0.8, bars: 16, inst: 'Flute' },
//     nodes: [
//       clock(), chords('C F | G C', { tonic: 'C' }),
//       arrangement({ drums: { section: 2, intensity: [0.25, 0.35] }, tune: { section: 3, intensity: [0.5, 0.6] } }),
//       drumRow('kT', ['X...x...X...x...']),                                   // kick: one bar, repeated
//       { id: 'kA', type: 'ad', trig: 'kT', attack: 0.001, decay: 0.15 }, { id: 'kO', type: 'osc', freq: '45 + kA*120' },
//       { id: 'bO', type: 'osc', wave: 'tri', freq: 'midi(36 + tr)' },          // bass: the chord root
//       melody('l', ['C5 _ E5 _ G5 _ _ _ E5 _ _ _ C5 _ _ _', 'F5 _ _ _ A5 _ F5 _ C5 _ _ _ _ _ D5- E5-']),
//       instruments('l', { gains }),
//       bus({ centre: 'kO*kA*0.6*gDrums + bO*0.3', left: 'lF*0.7*gTune', right: 'lF*0.7*gTune', duck: 'kA' }),
//     ],
//     presets: { Calm: { intensity: 0.2 }, Walk: { intensity: 0.6 }, Run: { intensity: 1, bpm: 136 } },
//   });
//   main(build, import.meta.url);
//
// Then: `node tools/compose/tiny_tune.mjs --match` prints the gains that level the five instruments (paste them in as
// the default of `gains`), `node tools/compose/tiny_tune.mjs` writes sounds/tiny-tune.json, and
// `node tools/compose/kit.mjs measure sounds/tiny-tune.json` prints instrument, section and intensity levels.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validatePatch, createVoice, renderPatch, defaultParams } from '../../sound/sfx-engine.js';
import { validateMeta } from '../../catalog/schema.js';

export class KitError extends Error {}
const fail = (msg) => { throw new KitError(msg); };

export const STEPS_PER_BAR = 16;
export const SECTION_BARS = 8;
/** The four lengths every track offers, in bars. */
export const LENGTHS = [8, 16, 24, 32];
/** Steps in the shortest loop. Every row must divide this. */
export const LOOP_STEPS = SECTION_BARS * STEPS_PER_BAR;
/** Steps after which every length has come round a whole number of times (96 bars): the bar counter's length. */
const COUNTER_STEPS = 96 * STEPS_PER_BAR;
export const MAX_SECONDS = 120;
/** The five melody instruments, in the order every track offers them. The index is the value of `inst`. */
export const INSTRUMENTS = ['Synth lead', 'Flute', 'Chiptune', 'Bell', 'Plucked string'];
/** Starting gains. Each track measures its own (matchGains, or --match on its generator): level depends on the tune. */
export const DEFAULT_GAINS = [1, 0.8, 1, 1, 4];

const SOUNDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sounds');
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const num = (x) => String(Math.round(x * 1e6) / 1e6);

// ---- controls -------------------------------------------------------------------------------------

export function param(id, label, min, max, dflt, extra = {}) {
  return { id, label, min, max, default: dflt, ...extra };
}

/** The controls every track has, with the fixed ids, in the fixed order (style guide, section 12). */
export function standardParams({ tempo, defaults = {} }) {
  if (!Array.isArray(tempo) || tempo.length !== 3 || !(tempo[0] < tempo[1]) || tempo[2] < tempo[0] || tempo[2] > tempo[1]) fail('tempo: give [slowest, fastest, written], for example [120, 156, 138]');
  const d = { intensity: 0.8, key: 0, bars: 8, inst: INSTRUMENTS[0], bright: 0.6, space: 0.2, ...defaults };
  const inst = typeof d.inst === 'number' ? d.inst : INSTRUMENTS.indexOf(d.inst);
  if (!(inst >= 0 && inst < INSTRUMENTS.length)) fail(`defaults.inst: "${d.inst}" is not one of the five melody instruments (${INSTRUMENTS.join(', ')})`);
  if (!LENGTHS.includes(d.bars)) fail(`defaults.bars: ${d.bars} is not one of the lengths (${LENGTHS.join(', ')} bars)`);
  return [
    param('intensity', 'Intensity', 0, 1, d.intensity),
    param('bpm', 'Tempo', tempo[0], tempo[1], tempo[2], { unit: 'bpm' }),
    param('key', 'Key', -5, 6, d.key, { unit: 'semitones' }),
    param('bars', 'Length', LENGTHS[0], LENGTHS[LENGTHS.length - 1], d.bars, { unit: 'bars', step: SECTION_BARS }),
    param('inst', 'Melody instrument', 0, INSTRUMENTS.length - 1, inst, { options: [...INSTRUMENTS] }),
    param('bright', 'Brightness', 0, 1, d.bright),
    param('space', 'Room', 0, 0.5, d.space),
  ];
}

// ---- the clock --------------------------------------------------------------------------------------

/**
 * The one clock. c16 ticks on every 16th note; c16p is 1 during the 16ths that fall on an 8th note and 0 during
 * the ones between (use it to accent or pan alternate 16ths).
 * swing: an expression 0..1 (usually a control). 0 is straight; 1 is a full shuffle, where the 16ths between come a
 * third of a step late. 8th notes never move, so the bar and the tempo stay exact.
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
  fail(`${what}: ${said} do not divide the ${SECTION_BARS}-bar loop (${LOOP_STEPS} steps); a row is 1, 2, 4 or 8 bars long (or 2, 4 or 8 steps), so that every length repeats exactly`);
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
 * bars: a list with one 16-character string per bar (1, 2, 4 or 8 bars), or one short string that repeats ("X...").
 * Returns a pattern node: use it as the `trig` of an envelope, and sample it (`sah`) for the hit strength.
 */
export function drumRow(id, bars, { every = 1 } = {}) {
  const what = `drum row "${id}"`;
  const t = rowTokens(what, bars, chars, every);
  for (const c of t) if (!'Xxo.-'.includes(c)) fail(`${what}: "${c}" is not a mark (X accent, x hit, o ghost, . rest)`);
  return { id, type: 'pattern', trig: 'c16', steps: group(t, STEPS_PER_BAR, '|', ''), ...(every > 1 ? { every } : {}) };
}

/**
 * A row of numbers on the clock (semitones for a bass line, chord-tone numbers for an arpeggio, ...); "_" holds.
 * every: 16 moves one step per bar. Returns a looping seq node.
 */
export function noteRow(id, steps, { every = 1 } = {}) {
  const what = `note row "${id}"`;
  const t = rowTokens(what, steps, words, every);
  for (const x of t) if (x !== '_' && !Number.isFinite(Number(x))) fail(`${what}: "${x}" is not a number or "_"`);
  return { id, type: 'seq', trig: 'c16', loop: true, ...(every > 1 ? { every } : {}), steps: group(t, every === 1 ? STEPS_PER_BAR : 4, ' | ', ' ') };
}

// ---- harmony ----------------------------------------------------------------------------------------------

const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KINDS = { '': [4, 7], m: [3, 7], dim: [3, 6], aug: [4, 8], sus2: [2, 7], sus4: [5, 7] };
function pitchClass(letter, accidental, what) {
  const p = PITCH[letter.toUpperCase()];
  if (p === undefined) fail(`${what}: "${letter}" is not a note name (A to G)`);
  return p + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
}

/**
 * A chord progression, one chord name per bar: "G G C D | Em C D D". Kinds: major (G), minor (Em), dim, aug, sus2, sus4.
 * Returns the nodes root, third, fifth (semitones; root is counted from the tonic) and tr = round(key) + root, so
 * midi(43 + tr) is the bass note, midi(55 + tr + third) the third, in whatever key the listener chose.
 * low: the lowest root allowed, in semitones from the tonic (default -5: roots sit within a fourth below and a
 * fifth above the tonic). A comma after a name drops that root an octave, an apostrophe raises it (D, or D').
 * The returned list also has .bars: [{ name, root, third, fifth }].
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
    const [third, fifth] = KINDS[m[3] || ''];
    return { name: name.replace(/[,']/g, ''), root, third, fifth };
  });
  const row = (id, key) => ({ id, type: 'seq', trig: 'c16', every, loop: true, steps: group(bars.map((b) => b[key]), 4, ' | ', ' ') });
  const nodes = [row('root', 'root'), row('third', 'third'), row('fifth', 'fifth'), { id: 'tr', type: 'expr', expr: 'round(key) + root' }];
  nodes.bars = bars;
  return nodes;
}

// ---- the arrangement: sections for `bars`, layers for `intensity` ----------------------------------------------

/**
 * Where bar `bar` (counted from 0, running on for ever) falls in a piece `bars` long.
 * section: 1 to 4, numbered as in the 32-bar version (1 the opening, 4 the full band). A shorter piece keeps the
 * last sections: 8 bars is section 4 only; 16 bars is sections 3 and 4. rev: sections still to come (4 - section).
 */
export function sectionAt(bar, bars) {
  if (!LENGTHS.includes(bars)) fail(`sectionAt: ${bars} is not one of the lengths (${LENGTHS.join(', ')} bars)`);
  const count = bars / SECTION_BARS, index = Math.floor((((bar % bars) + bars) % bars) / SECTION_BARS);
  const rev = count - 1 - index;
  return { index, rev, section: LENGTHS.length - rev };
}
/** Whether a layer ({ section }) is let through at this bar of a piece this long. Intensity is not counted. */
export function layerPlays(layer, bar, bars) {
  return sectionAt(bar, bars).section >= (layer?.section ?? 1);
}

/**
 * The bar counter and the gates of every layer.
 * layers: { name: { section, intensity, floor } }
 *   section    1 to 4: the section of the 32-bar version in which the layer first plays (default 1: from the start).
 *              Section 4 is the full band, and is the only section of the 8-bar version.
 *   intensity  [from, to]: the layer fades in as the `intensity` control crosses this window (default: always in)
 *   floor      with intensity: the level at the bottom of the window instead of silence (0.6 = starts at 60%)
 * For each layer: g<Name>, 0..1, to multiply the layer by (or to switch a row with: gBusy > 0.5 ? busyRow : plainRow).
 * Also barN (the bar number, 0 to 95), rev (sections still to come) and a<Name> (the section gate alone, smoothed
 * over 20 ms so a layer does not click in).
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

/**
 * A tune, bar by bar, one token per 16th: a note name starts a note (C4 is middle C), "_" lets it ring.
 *   melody('l', ['G4 _ B4 _ D5 _ G5 _ _ _ F#5 _ E5- _ D5 _', ...])        1, 2, 4 or 8 bars
 * A note marked - is softer (0.7), -- softer still (0.4).
 * Returns <id>G (the gate row), <id>S (semitones above middle C), <id>V (the loudness of the current note) and
 * <id>P (the pitch in Hz, moved by `key`, with a 12 ms glide).
 * shift: play the whole line this many 16ths later; transpose: semitones up. Together they make an echo line:
 *   melody('e', TUNE, { shift: 4, transpose: 12, vel: false })              a beat late, an octave up
 */
export function melody(id, bars, { shift = 0, transpose = 0, glide = 0.012, vel = true } = {}) {
  const what = `melody "${id}"`;
  if (!Array.isArray(bars)) fail(`${what}: give a list with one string per bar`);
  const toks = rowTokens(what, bars, words);
  const gate = [], notes = [];
  let first = toks.findIndex((x) => x !== '_'), cur = 0;
  if (first < 0) fail(`${what}: no notes`);
  // a hold before the first note of the loop rings on from the last note of the loop
  for (let i = toks.length - 1; i >= 0; i--) if (toks[i] !== '_') { cur = noteToken(toks[i], what).midi; break; }
  for (const x of toks) {
    if (x === '_') { gate.push('.'); notes.push(cur); continue; }
    const n = noteToken(x, what);
    cur = n.midi; gate.push(n.mark); notes.push(cur);
  }
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
 * The five melody instruments behind the `inst` control. All play the pitch <id>P on the gate <id>G; `inst` picks one.
 * Returns the node <id>F: the chosen instrument through a low-pass that opens with `bright`. (<id>In is the same
 * before the filter.)
 *   gains    five numbers that level the instruments: get them from matchGains (or `--match` on your generator)
 *   noise    the id of a white-noise node the piece already has (for the flute's breath); without it one is added
 *   length   makes every note longer or shorter (1 = as in battle-theme; slow tunes want 1.3 to 1.6)
 *   pitch, gate, vel   other node ids, when the tune was not made by melody(id, ...); vel: null for none
 */
export function instruments(id = 'l', { gains = DEFAULT_GAINS, noise, length = 1, pitch = `${id}P`, gate = `${id}G`, vel = `${id}V`, vibrato = 5.8 } = {}) {
  if (!Array.isArray(gains) || gains.length !== INSTRUMENTS.length || gains.some((g) => !(g > 0))) fail(`instruments "${id}": gains must be five positive numbers, one per instrument (${INSTRUMENTS.join(', ')})`);
  const nz = noise || `${id}Nz`, vib = `${id}Vib`, L = (s) => num(s * length), g = gains.map(num);
  const v = vel ? `*${vel}` : '';
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
    // 4 plucked string. Its first millisecond is a burst of noise 15 dB above the ringing string; left alone it
    // makes the pluck 7 dB peakier than the other four at the same RMS and slams the limiter, so the burst is clipped.
    { id: `${id}Pl`, type: 'pluck', trig: gate, freq: pitch, decay: L(2.2), damp: '0.22 - bright*0.15' },
    {
      id: `${id}In`, type: 'expr',
      expr: `(inst < 0.5 ? (${id}O1*0.6 + ${id}O2*0.5)*${id}A*${g[0]} : inst < 1.5 ? (${id}FlO1 + ${id}FlO2*0.18 + ${id}FlN*0.5)*${id}FlA*${g[1]} : inst < 2.5 ? (${id}ChO1*0.6 + ${id}ChO2*0.22)*${id}ChA*${g[2]} : inst < 3.5 ? ${id}BeC*${id}BeA*${g[3]} : clamp(${id}Pl, -0.3, 0.3)*${g[4]})${v}`,
    },
    { id: `${id}F`, type: 'filter', mode: 'lp', in: `${id}In`, freq: `1200 + bright*4500 + ${id}A*1500`, q: 1.3 },
  ];
}

// ---- the bus -----------------------------------------------------------------------------------------------------

/**
 * The mix. Returns ctr, muL, muR, rv, mL, mR (and duck); the patch's out is ["mL", "mR"].
 *   centre   kick, snare, bass: the same in both channels, not ducked
 *   left, right   everything else: spread detuned copies, chord tones and echoes between the two
 *   duck     the kick's envelope node: the music dips under each kick (duckAmount, default 0.35)
 *   send     extra signal into the reverb (a little snare, say); the music goes in by itself
 * One reverb is shared and its level is the `space` control. Each channel ends in a soft limiter (tanh), so the
 * output never passes the patch gain; `level` (default 0.7) sets how hard the mix leans on it.
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
 * Builds the patch. Throws a KitError that says what to fix when the piece breaks a rule.
 *   id, name, description, tags, meta     as in any patch; meta is checked against catalog/schema.js
 *   tempo        [slowest, fastest, written]
 *   defaults     { intensity, bars, inst (a name), bright, space, key }
 *   extraParams  the track's own one to three controls (param(...)), placed after the standard seven
 *   nodes        the helpers' results and your own nodes, in order; lists inside the list are flattened
 *   presets      three styles, named for game moments
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

/** What the style guide (section 12) asks of a track and this patch lacks. An empty list is good. */
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
  return out;
}

/** Writes the patch to sounds/<id>.json (or to `file`). Returns the path. */
export function writePatch(patch, file = path.join(SOUNDS_DIR, `${patch.id}.json`)) {
  fs.writeFileSync(file, JSON.stringify(patch, null, 1) + '\n');
  return file;
}

// ---- measuring (nobody here can listen) ------------------------------------------------------------------------------

const dB = (meanSquare) => (meanSquare > 1e-18 ? 10 * Math.log10(meanSquare) : -180);

/**
 * The level of each melody instrument: the RMS, in dB, of the melody bus (node <id>F, before any layer gain) over
 * the 8-bar version, once per instrument. Level-matched means these are within 1 dB of each other.
 */
export function measureInstruments(patch, { node = 'lF', sampleRate = 44100, params = {} } = {}) {
  const inst = (patch.params || []).find((p) => p.id === 'inst');
  if (!inst?.options) fail('measureInstruments: the patch has no "inst" control with named options');
  return inst.options.map((name, i) => {
    const voice = createVoice(patch, { sampleRate, params: { ...params, bars: LENGTHS[0], inst: i } });
    const k = voice.nodeIds.indexOf(node);
    if (k < 0) fail(`measureInstruments: no node "${node}" (the melody bus is <id>F for instruments(id); nodes: ${voice.nodeIds.join(' ')})`);
    const n = Math.round(voice.duration * sampleRate);
    let sq = 0;
    for (let s = 0; s < n; s++) { voice.tick(); const x = voice.nodeValues[k]; sq += x * x; }
    return { name, db: dB(sq / n) };
  });
}

/**
 * Finds the five gains that level the instruments. build(gains) must return the patch made with those gains.
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
 * The level of every 8-bar section at every length: { 8: [dB], 16: [dB, dB], 24: [...], 32: [...] } (RMS, dBFS,
 * both channels). A longer version must climb section by section and end on the same full band as the 8-bar one.
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

/** Level and peak of the 8-bar version at five intensities: [{ intensity, db, peak }]. Loudness must rise. */
export function measureIntensity(patch, { sampleRate = 44100, params = {}, values = [0, 0.25, 0.5, 0.75, 1] } = {}) {
  return values.map((intensity) => {
    const r = renderPatch(patch, { sampleRate, params: { ...defaultParams(patch), ...params, bars: LENGTHS[0], intensity } });
    return { intensity, db: dB(channelPower(r, 0, r.samples.length)), peak: r.rawPeak };
  });
}

/** Everything a composer reports, as text: instrument levels, section levels, intensity levels, render time. */
export function report(patch, { node = 'lF' } = {}) {
  const lines = [`${patch.id}  "${patch.name}"  ${patch.nodes.length} nodes`];
  const f = (x) => x.toFixed(1);
  const inst = measureInstruments(patch, { node });
  const dbs = inst.map((l) => l.db), spread = Math.max(...dbs) - Math.min(...dbs);
  lines.push(`melody instruments (RMS of ${node}, 8 bars): ${inst.map((l) => `${l.name} ${f(l.db)} dB`).join(' · ')}`);
  lines.push(`  spread ${spread.toFixed(2)} dB ${spread <= 1 ? '(matched within 1 dB)' : '(NOT matched: run your generator with --match and paste the gains in)'}`);
  const t0 = performance.now();
  const r8 = renderPatch(patch, { params: { ...defaultParams(patch), bars: LENGTHS[0] } });
  const ms = performance.now() - t0;
  lines.push(`8 bars at the defaults: ${r8.duration.toFixed(2)} s, rendered in ${(ms / 1000).toFixed(1)} s (${(r8.duration / (ms / 1000)).toFixed(1)}x real time), raw peak ${r8.rawPeak.toFixed(2)}`);
  const sec = measureSections(patch);
  lines.push('section levels (RMS dBFS, at the defaults), first section to last:');
  for (const bars of LENGTHS) lines.push(`  ${String(bars).padStart(2)} bars: ${sec[bars].map(f).join('  ')}`);
  lines.push('intensity (8 bars): ' + measureIntensity(patch).map((x) => `${x.intensity} → ${f(x.db)} dB, peak ${x.peak.toFixed(2)}`).join(' · '));
  const notes = lint(patch);
  for (const n of notes) lines.push(`style guide: ${n}`);
  return lines.join('\n');
}

// ---- command lines -------------------------------------------------------------------------------------------------

const isMain = (url) => !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === url;

/**
 * The command line of a track's generator. Call it last: main(build, import.meta.url), where build(gains) returns the
 * assembled patch and uses the track's own gains when called with none.
 *   node tools/compose/<track>.mjs             writes sounds/<id>.json
 *   node tools/compose/<track>.mjs --match     measures the five instruments and prints the gains that level them
 *   node tools/compose/<track>.mjs --measure   prints the report (instrument, section and intensity levels, render time)
 * Does nothing when the file is imported (by a test, say).
 */
export function main(build, url, { node = 'lF' } = {}) {
  if (!isMain(url)) return;
  const args = process.argv.slice(2);
  if (args.includes('--match')) {
    const m = matchGains(build, { node });
    console.log(`before: ${m.before.map((l) => `${l.name} ${l.db.toFixed(1)}`).join(' · ')} dB`);
    console.log(`after:  ${m.after.map((l) => `${l.name} ${l.db.toFixed(1)}`).join(' · ')} dB`);
    console.log(`gains:  [${m.gains.join(', ')}]   <- write these in as the track's gains`);
    return;
  }
  const patch = build();
  if (args.includes('--measure')) { console.log(report(patch, { node })); return; }
  const file = writePatch(patch);
  console.log(`wrote ${path.relative(process.cwd(), file)}: ${patch.nodes.length} nodes, ${patch.params.length} controls, ${JSON.stringify(patch).length} bytes`);
  for (const n of lint(patch)) console.log(`style guide: ${n}`);
}

// node tools/compose/kit.mjs measure sounds/<id>.json [--node lF]
if (isMain(import.meta.url)) {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (cmd !== 'measure' || !file) { console.log('usage: node tools/compose/kit.mjs measure sounds/<id>.json [--node <melody bus, default lF>]'); process.exit(cmd ? 1 : 0); }
  const i = rest.indexOf('--node');
  console.log(report(JSON.parse(fs.readFileSync(file, 'utf8')), i >= 0 ? { node: rest[i + 1] } : {}));
}
