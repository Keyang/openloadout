// voices.js: the voices of the twelve music styles (docs/music-styles.md, section 9). Each style, a "band" in code
// (sound/bands.js), is a signature melody voice, a chord voice, a bass and a drum kit; these are the voices the kit
// in sound/compose.js did not have. Pure JavaScript with no Node or page APIs (Contract 11), built only from the
// node types the engine already has (`node tools/sfx.mjs nodes`): no new node type.
//
// THE CONVENTION is the one in the header of sound/compose.js, unchanged: every voice is name(id, { options }); the
// options keep their one name (trig, pitch, note, semis, pick, input, noise, attack, decay, cutoff, open, q, freq); the
// finished sound is <id>O, or <id>L and <id>R when it is wide; <id>A is its envelope and <id>V the strength of the
// last hit; a finished voice peaks at about 1, so the gain written in the mix is its level. Three kinds of pitch:
//   pitch          a melody voice plays any line: the note in Hz, an expression ('eP', the line of melody('e', ...))
//   note, semis    a bass or chord voice follows the chords by itself: midi(note + tr + semis), so needs chords().
//                  semis is always a count of semitones above the root (a number, an expression or a noteRow's id)
//   pick           a chord tone by its number, not in semitones: 0 root, 1 third, 2 fifth, 3 octave, 4 third above,
//                  5 fifth above (compose.js's chordTone(id, pick)); only chipArp takes it here
//                  As in compose.js, note is the MIDI number of the home note (the chords' tonic) in the octave wanted;
//                  it may also be an expression: '36 + tonic' is the home note in the octave from C2, in any key
//   low            a pitched drum lands on the bar's chord root (or the note `semis` semitones above it), folded into the
//                  octave from `low` up, like kickDrum: a drum that rings on a note of its own is a wrong note in every bar
// A voice for a bed (crackle, wind, drone, subDrone) starts at its row's first hit and then plays on.
//
// THE VOICES, by the style they were written for (any track may use any of them; sound/bands.js wires them up):
//   chip          chipLead · chipArp · triBass · chipKick · chipSnare · chipHat
//   synthwave     sawLead · gatedSnare                  (with compose.js's sawPad, sawBass, kickDrum, clap, hatDrum)
//   orchestra     brassSection · stringSection · lowStrings · timpani · cymbalSwell
//   folk          strum · tambourine                    (with pluckedString, roundBass, handDrum, shaker)
//   musicbox      tine · lowTine · mechanism
//   organ         drawbarOrgan · rotary · pedalBass · brushSnare · ride
//   twang         twangGuitar · spring · mutedStrum · uprightBass · rimClick
//   steelpan      steelPan · bassPan · clave · cowbell
//   lofi          electricPiano · warmBass · dustyKick · dustySnare · dustyHat · crackle · tape
//   darkambient   glass · drone · wind · subDrone · heartbeat · metalHit
//   rock          driveLead · powerChord · rockBass · crash
//   marimba       marimba · bassBar · woodblock · guiro · logDrum
//
// No name here is exported by sound/compose.js, tools/compose/kit.mjs or sound/analyze.js (tests/unit/compose-bands.test.mjs).
// Every one of these is a synthesiser's sketch, not a recording of the instrument it is named after.

import { KitError } from './compose.js';

// ---- the small helpers (copies of compose.js's private ones: exporting those would be an edit to compose.js) ----------
const fail = (msg) => { throw new KitError(msg); };
const num = (x) => String(Math.round(x * 1e6) / 1e6);
const inParens = (x) => (typeof x === 'number' ? num(x) : `(${x})`);
const voiceId = (id, what) => { if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(id)) fail(`${what}: the id must be letters and digits, got ${JSON.stringify(id)}`); return id; };
const need = (what, value, name, hint) => { if (value === undefined || value === null || value === '') fail(`${what}: give ${name} (${hint})`); };
/** The white-noise node a voice needs: none when the piece gave one, else its own. */
const ownNoise = (id, noise) => (noise ? [] : [{ id: `${id}Nz`, type: 'noise' }]);
/** The pitch of a chord tone folded into the octave from `low` up (MIDI), whatever the chord and the Key control. */
const foldedRoot = (low, semis = 0) => `midi(${num(low)} + (tonic + tr + (${semis}) + ${num(120 - low)}) % 12)`;
/** A note that follows the chords: the root at `note` (MIDI, a number or an expression, before the chord and the Key move it), plus semis. */
const chordNote = (note, semis = 0) => `midi(${inParens(note)} + tr + (${semis}))`;
/** A strength node: the mark of the row (X 1, x 0.7, o 0.4) at its last hit, or the expression the caller gave. */
const strength = (id, trig, vel) => (vel === undefined ? [{ id: `${id}V`, type: 'sah', in: trig, trig }] : vel === null ? [{ id: `${id}V`, type: 'expr', expr: '1' }] : [{ id: `${id}V`, type: 'expr', expr: String(vel) }]);
/** A short tap for a resonator (the modal node): one rise and fall `s` seconds long, and the factor that makes a low partial answer it at about 1. */
const tap = (id, trig, s) => [{ id: `${id}X`, type: 'env', trig, points: [[0, 0], [Number(num(s / 2)), 1], [Number(num(s)), 0]] }, `${num(2 / s)}/sr`];
/** A pick for a string (the pluck node): one swing up and one down, so it adds no DC. */
const pick = (id, trig, s) => ({ id: `${id}X`, type: 'env', trig, points: [[0, 0], [`${inParens(s)}*0.25`, 1], [`${inParens(s)}*0.75`, -1], [s, 0]] });
const toneOf = (p) => `(${p}) < 0.5 ? 0 : (${p}) < 1.5 ? third : (${p}) < 2.5 ? fifth : (${p}) < 3.5 ? 12 : (${p}) < 4.5 ? 12 + third : 12 + fifth`;

// ---- chip ------------------------------------------------------------------------------------------------------------

/**
 * A chip-like lead: a thin pulse whose width switches from note to note (12.5% then 25%), no vibrato, short notes.
 * Arguments: id; { trig: the gate row (a melody's <id>G); pitch: the note in Hz ('eP'); vel: the loudness of the note
 * (default: the mark of the row; null for none); duty: the widths it switches between, a row of numbers ('0.125 0.25');
 * hold, decay: seconds (0.06, 0.08) }.
 * Returns <id>V, <id>D (the width), <id>W (the pulse), <id>A and <id>O, the lead.
 */
export function chipLead(id, { trig, pitch, vel, duty = '0.125 0.25', hold = 0.06, decay = 0.08 } = {}) {
  const what = `chipLead "${voiceId(id, 'chipLead')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  return [
    ...strength(id, trig, vel),
    { id: `${id}D`, type: 'seq', trig, loop: true, steps: duty },
    { id: `${id}W`, type: 'osc', wave: 'pulse', width: `${id}D`, freq: pitch },
    { id: `${id}A`, type: 'ad', trig, attack: 0.001, hold, decay, curve: 1 },
    // a narrow pulse with its DC taken out swings further up than down: 0.55 keeps the peak near 1
    { id: `${id}O`, type: 'expr', expr: `${id}W*${id}A*${id}V*0.55` },
  ];
}

/**
 * A chip-like arpeggio: a 25% pulse running the bar's chord tones, one short note per step of its row.
 * Arguments: id; { trig: what starts each note ('c16': every 16th); note: the MIDI number of the root before the
 * chord and the Key move it (48); pick: the id of a noteRow of chord-tone numbers (0 root, 1 third, 2 fifth, 3 octave,
 * 4 third above, 5 fifth above), as compose.js's chordTone(id, pick) takes; decay: seconds (0.09) }. It takes no
 * semis: a semitone row given as semis is refused rather than read as chord-tone numbers.
 * Needs chords(). Returns <id>S (semitones above the root), <id>W, <id>A and <id>O, the arpeggio.
 */
export function chipArp(id, { trig = 'c16', note = 48, pick, semis, decay = 0.09 } = {}) {
  const what = `chipArp "${voiceId(id, 'chipArp')}"`;
  if (semis !== undefined) fail(`${what}: it takes no semis; give pick, the id of a noteRow of chord-tone numbers (0 root, 1 third, 2 fifth, 3 octave)`);
  need(what, pick, 'pick', "the id of a noteRow of chord-tone numbers: noteRow('aD', '0 1 2 1'), then { pick: 'aD' }");
  return [
    { id: `${id}S`, type: 'expr', expr: toneOf(pick) },
    { id: `${id}W`, type: 'osc', wave: 'pulse', width: 0.25, freq: chordNote(note, `${id}S`) },
    { id: `${id}A`, type: 'ad', trig, attack: 0.002, decay, curve: 1.3 },
    { id: `${id}O`, type: 'expr', expr: `${id}W*${id}A*0.65` },
  ];
}

/**
 * A stepped triangle bass: a triangle on the chord root cut into sixteen levels (a crush of 4 bits), on and off at once.
 * Arguments: id; { trig: the row that plays it; note: the MIDI number of the root before the chord and the Key move it
 * (36, C2); semis: semitones above the root, a number or a noteRow's id (0); hold: seconds a note lasts ('30/bpm');
 * decay: seconds (0.01) }.
 * Needs chords(). Returns <id>Hz, <id>W, <id>C (the steps), <id>V, <id>A and <id>O, the bass.
 */
export function triBass(id, { trig, note = 36, semis = 0, hold = '30/bpm', decay = 0.01 } = {}) {
  need(`triBass "${voiceId(id, 'triBass')}"`, trig, 'trig', "the row that plays it: { trig: 'bG' }");
  return [
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    { id: `${id}W`, type: 'osc', wave: 'tri', freq: `${id}Hz` },
    { id: `${id}C`, type: 'crush', in: `${id}W`, bits: 4, rate: 'sr' },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.001, hold, decay, curve: 1 },
    { id: `${id}O`, type: 'expr', expr: `${id}C*${id}A*${id}V` },
  ];
}

/**
 * A chip-like kick: a sine that falls from the chord's fifth onto its root, in the octave from `low` up.
 * Arguments: id; { trig: the row that plays it; low: the lowest note it may land on, a MIDI number (33); fall: seconds
 * the fall takes (0.05); decay: seconds (0.16) }.
 * Needs chords(). Returns <id>P (the fall), <id>W, <id>A (give it to bus() as `duck`) and <id>O, the drum.
 */
export function chipKick(id, { trig, low = 33, fall = 0.05, decay = 0.16 } = {}) {
  need(`chipKick "${voiceId(id, 'chipKick')}"`, trig, 'trig', "the row that plays it: { trig: 'kT' }");
  return [
    { id: `${id}P`, type: 'env', trig, points: [[0, 1.5], [fall, 1, 'exp']] },
    { id: `${id}W`, type: 'osc', freq: `${foldedRoot(low)}*${id}P` },
    { id: `${id}A`, type: 'ad', trig, attack: 0.001, hold: 0.01, decay, curve: 2 },
    { id: `${id}O`, type: 'expr', expr: `${id}W*${id}A` },
  ];
}

/**
 * A chip-like snare: a short burst of white noise, as loud as each mark of its row; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added); decay: seconds (0.09) }.
 * Returns <id>V, <id>A and <id>O, the drum.
 */
export function chipSnare(id, { trig, noise, decay = 0.09 } = {}) {
  need(`chipSnare "${voiceId(id, 'chipSnare')}"`, trig, 'trig', "the row that plays it: { trig: 'sT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.0005, hold: 0.005, decay, curve: 1.5 },
    { id: `${id}O`, type: 'expr', expr: `${nz}*${id}A*${id}V*0.9` },
  ];
}

/**
 * A chip-like hat: noise cut to a few levels at a low rate (a crush), which gives it a metallic grain, then high-passed.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added); freq:
 * the crush's rate in Hz, a number or an expression ('5000 + bright*3000'); decay: seconds (0.035) }.
 * Returns <id>C (the grain), <id>H, <id>V, <id>A and <id>O, the hat.
 */
export function chipHat(id, { trig, noise, freq = '5000 + bright*3000', decay = 0.035 } = {}) {
  need(`chipHat "${voiceId(id, 'chipHat')}"`, trig, 'trig', "the row that plays it: { trig: 'hT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    { id: `${id}C`, type: 'crush', in: nz, bits: 3, rate: freq },
    { id: `${id}H`, type: 'filter', mode: 'hp', in: `${id}C`, freq: 3000, q: 0.7 },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.0005, decay, curve: 2 },
    { id: `${id}O`, type: 'expr', expr: `${id}H*${id}A*${id}V*0.8` },
  ];
}

// ---- synthwave ---------------------------------------------------------------------------------------------------------

/**
 * A wide synth lead: two saws tuned slightly apart with a slow vibrato, through a low-pass that opens with Brightness.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz ('eP'); vel: its loudness (default: the mark of the row);
 * attack, hold, decay: seconds (0.012, 0.12, 0.4); cutoff: the low-pass in Hz ('1400 + bright*3600') }.
 * Returns <id>V, <id>Vb (the vibrato), <id>W1, <id>W2, <id>A and <id>O, the lead.
 */
export function sawLead(id, { trig, pitch, vel, attack = 0.012, hold = 0.12, decay = 0.4, cutoff = '1400 + bright*3600' } = {}) {
  const what = `sawLead "${voiceId(id, 'sawLead')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  const p = `${inParens(pitch)}*(1 + ${id}Vb*0.004)`;
  return [
    ...strength(id, trig, vel),
    { id: `${id}Vb`, type: 'osc', freq: 5.2 },
    { id: `${id}W1`, type: 'osc', wave: 'saw', freq: `${p}*0.996`, phase: 0.13 },
    { id: `${id}W2`, type: 'osc', wave: 'saw', freq: `${p}*1.004`, phase: 0.61 },
    { id: `${id}A`, type: 'ad', trig, attack, hold, decay, curve: 1.4 },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `(${id}W1 + ${id}W2)*0.6*${id}A*${id}V`, freq: cutoff, q: 0.9 },
  ];
}

/**
 * A gated snare: a noise snare into a short reverb of its own that is cut off dead after a moment; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * decay: seconds of the snare itself (0.12); hold: seconds the reverb rings before the gate shuts (0.11) }.
 * Returns <id>V, <id>A, <id>N, <id>B, <id>S (the dry snare), <id>Rv (its reverb), <id>G (the gate) and <id>O, the drum.
 * Its reverb is a node of its own: count it in the node budget.
 */
export function gatedSnare(id, { trig, noise, decay = 0.12, hold = 0.11 } = {}) {
  need(`gatedSnare "${voiceId(id, 'gatedSnare')}"`, trig, 'trig', "the row that plays it: { trig: 'sT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.001, hold: 0.01, decay, curve: 2.2 },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq: 1900, q: 0.8 },
    { id: `${id}B`, type: 'filter', mode: 'bp', in: nz, freq: 420, q: 0.9 },
    { id: `${id}S`, type: 'expr', expr: `(${id}N*1.85 + ${id}B*1.7)*${id}A*${id}V` },
    { id: `${id}Rv`, type: 'reverb', in: `${id}S`, size: 0.55, damp: 0.25, mix: 1 },
    { id: `${id}G`, type: 'ad', trig, attack: 0.001, hold, decay: 0.015, curve: 1 },
    { id: `${id}O`, type: 'expr', expr: `${id}S*0.5 + ${id}Rv*${id}G*1.6` },
  ];
}

// ---- orchestra (a synthesiser's sketch of strings and brass) --------------------------------------------------------

/**
 * A brass-like section: two saws a few cents apart, swelling in and held, through a low-pass that opens on the attack.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz; vel: its loudness (default: the mark of the row); attack,
 * hold, decay: seconds (0.06, 0.25, 0.35); cutoff: Hz when shut (350); open: Hz the attack opens it by ('1400 + bright*2600') }.
 * Returns <id>V, <id>W1, <id>W2, <id>A, <id>E (the filter's envelope) and <id>O, the section.
 */
export function brassSection(id, { trig, pitch, vel, attack = 0.06, hold = 0.25, decay = 0.35, cutoff = 350, open = '1400 + bright*2600' } = {}) {
  const what = `brassSection "${voiceId(id, 'brassSection')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  return [
    ...strength(id, trig, vel),
    { id: `${id}W1`, type: 'osc', wave: 'saw', freq: `${inParens(pitch)}*0.998`, phase: 0.2 },
    { id: `${id}W2`, type: 'osc', wave: 'saw', freq: `${inParens(pitch)}*1.004`, phase: 0.7 },
    { id: `${id}A`, type: 'ad', trig, attack, hold, decay, curve: 1.2 },
    { id: `${id}E`, type: 'ad', trig, attack: 0.09, hold: 0.05, decay: 0.35, curve: 1.5 },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `(${id}W1 + ${id}W2)*0.45*${id}A*${id}V`, freq: `${inParens(cutoff)} + ${inParens(open)}*${id}E`, q: 1.1 },
  ];
}

/**
 * A string-section chord: four detuned saws on the bar's root, third, fifth and octave, bowed in, with vibrato, spread left and right.
 * Arguments: id; { trig: what bows it again (once a bar); note: the MIDI number of the root before the chord and the
 * Key move it (48); attack: seconds (0.08: short enough that the bar's chord is clear early); cutoff: the low-pass in Hz
 * ('1200 + bright*2400'); dip: an expression 0 to 1 that pulls it back (while the tune plays, say) (0) }.
 * Needs chords(). Returns <id>Vb, <id>A, <id>W1 to <id>W4, and <id>L, <id>R: the section on the left and on the right.
 */
export function stringSection(id, { trig, note = 48, attack = 0.08, cutoff = '1200 + bright*2400', dip = 0 } = {}) {
  need(`stringSection "${voiceId(id, 'stringSection')}"`, trig, 'trig', "the row that bows it again: { trig: 'pT' }");
  const v = `(1 + ${id}Vb*0.003)`, d = `(1 - ${inParens(dip)})`;
  return [
    { id: `${id}Vb`, type: 'osc', freq: 5.5 },
    { id: `${id}A`, type: 'ad', trig, attack, hold: '240/bpm*0.75', decay: '240/bpm*0.35', curve: 1 },
    { id: `${id}W1`, type: 'osc', wave: 'saw', freq: `${chordNote(note)}*${v}*0.997`, phase: 0.1 },
    { id: `${id}W2`, type: 'osc', wave: 'saw', freq: `${chordNote(note, 'third')}*${v}*1.003`, phase: 0.4 },
    { id: `${id}W3`, type: 'osc', wave: 'saw', freq: `${chordNote(note, 'fifth')}*${v}*0.998`, phase: 0.7 },
    { id: `${id}W4`, type: 'osc', wave: 'saw', freq: `${chordNote(note, 12)}*${v}*1.005`, phase: 0.9 },
    { id: `${id}L`, type: 'filter', mode: 'lp', in: `(${id}W1*0.4 + ${id}W2*0.35 + ${id}W3*0.15 + ${id}W4*0.2)*${id}A*${d}`, freq: cutoff, q: 0.8 },
    { id: `${id}R`, type: 'filter', mode: 'lp', in: `(${id}W1*0.3 + ${id}W2*0.15 + ${id}W3*0.4 + ${id}W4*0.25)*${id}A*${d}`, freq: cutoff, q: 0.8 },
  ];
}

/**
 * A bowed low-string bass: two saws a few cents apart on the chord root, a slow swell and a fixed low-pass, no pluck.
 * Arguments: id; { trig: the row that bows it; note: the MIDI number of the root before the chord and the Key move it (36);
 * semis: semitones above the root, a number or a noteRow's id (0); attack: seconds of the swell (0.18); cutoff: Hz ('260 + bright*200') }.
 * Needs chords(). Returns <id>Hz, <id>W1, <id>W2, <id>V, <id>A and <id>O, the bass.
 */
export function lowStrings(id, { trig, note = 36, semis = 0, attack = 0.18, cutoff = '260 + bright*200' } = {}) {
  need(`lowStrings "${voiceId(id, 'lowStrings')}"`, trig, 'trig', "the row that bows it: { trig: 'bG' }");
  return [
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    { id: `${id}W1`, type: 'osc', wave: 'saw', freq: `${id}Hz*0.997`, phase: 0.3 },
    { id: `${id}W2`, type: 'osc', wave: 'saw', freq: `${id}Hz*1.003`, phase: 0.8 },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack, hold: '240/bpm*0.7', decay: '240/bpm*0.3', curve: 1 },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `(${id}W1 + ${id}W2)*0.5*${id}A*${id}V`, freq: cutoff, q: 0.8 },
  ];
}

/**
 * A timpani-like drum: a sine that settles onto a chord tone (the root, or the note `semis` semitones above it) with a little skin noise.
 * Arguments: id; { trig: the row that plays it; low: the lowest note it may land on, a MIDI number (36); semis:
 * semitones above the root, a number, a noteRow's id or 'fifth' (0); decay: seconds (0.7); noise: the id of a
 * white-noise node (without it one is added) }.
 * Needs chords(). Returns <id>P, <id>W, <id>N, <id>V, <id>A and <id>O, the drum.
 */
export function timpani(id, { trig, low = 36, semis = 0, decay = 0.7, noise } = {}) {
  need(`timpani "${voiceId(id, 'timpani')}"`, trig, 'trig', "the row that plays it: { trig: 'tT' }");
  const nz = noise || `${id}Nz`, f = foldedRoot(low, semis);
  return [
    ...ownNoise(id, noise),
    { id: `${id}P`, type: 'env', trig, points: [[0, 1.25], [0.08, 1, 'exp']] },
    { id: `${id}W`, type: 'osc', freq: `${f}*${id}P` },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq: `${f}*3`, q: 1 },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.002, hold: 0.02, decay, curve: 2.5 },
    { id: `${id}O`, type: 'expr', expr: `(${id}W + ${id}N*0.25)*${id}A*${id}V` },
  ];
}

/**
 * A cymbal swell: high hiss that rises through a bar and stops on the next bar line; it has no pitch.
 * Arguments: id; { trig: the row that starts it; noise: the id of a white-noise node (without it one is added);
 * freq: the high-pass in Hz ('5000 + bright*3000'); length: seconds it rises for ('240/bpm': a bar) }.
 * Returns <id>V, <id>E (the rise), <id>N and <id>O, the swell.
 */
export function cymbalSwell(id, { trig, noise, freq = '5000 + bright*3000', length = '240/bpm' } = {}) {
  need(`cymbalSwell "${voiceId(id, 'cymbalSwell')}"`, trig, 'trig', "the row that starts it: { trig: 'cT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}E`, type: 'env', trig, points: [[0, 0], [length, 1, 2], [`${inParens(length)} + 0.02`, 0]] },
    { id: `${id}N`, type: 'filter', mode: 'hp', in: nz, freq, q: 0.7 },
    { id: `${id}O`, type: 'expr', expr: `${id}N*${id}E*${id}E*${id}V*1.1` },
  ];
}

// ---- folk ------------------------------------------------------------------------------------------------------------

/**
 * A strum: four strings on the bar's chord (root, fifth, octave, third above) plucked a moment apart, down then up.
 * Arguments: id; { trig: the row that strums it; note: the MIDI number of the lowest string's root before the chord
 * and the Key move it (48); gap: seconds between two strings, 0.01 to 0.025 (0.015); decay: seconds the strings ring
 * (0.9); dip: an expression 0 to 1 that pulls it back (while the tune plays, say) (0) }.
 * Every other strum is an up stroke (top string first). Needs chords(). Returns <id>V, <id>U (1 on an up stroke),
 * <id>X (the pick), <id>D1 to <id>D4 (each string's moment), <id>W1 to <id>W4 (the strings) and <id>L, <id>R.
 */
export function strum(id, { trig, note = 48, gap = 0.015, decay = 0.9, dip = 0 } = {}) {
  const what = `strum "${voiceId(id, 'strum')}"`;
  need(what, trig, 'trig', "the row that strums it: { trig: 'sG' }");
  if (!(gap >= 0.01 && gap <= 0.025)) fail(`${what}: gap is seconds between two strings, from 0.01 to 0.025, got ${gap}`);
  const tones = [0, 'fifth', 12, '12 + third'], d = `(1 - ${inParens(dip)})`;
  const nodes = [...strength(id, trig), { id: `${id}U`, type: 'seq', trig, loop: true, steps: '0 1' }, pick(id, trig, '0.0018 - bright*0.0008')];
  tones.forEach((t, i) => {
    nodes.push({ id: `${id}D${i + 1}`, type: 'delay', in: `${id}X*${id}V`, time: `${num(gap * i)} + ${id}U*${num(gap * (3 - 2 * i))}`, feedback: 0, mix: 1, max: Number(num(gap * 3 + 0.005)) });
    nodes.push({ id: `${id}W${i + 1}`, type: 'pluck', trig: 0, in: `${id}D${i + 1}`, freq: chordNote(note, t), decay, damp: '0.35 - bright*0.15' });
  });
  nodes.push({ id: `${id}L`, type: 'expr', expr: `(${id}W1*0.6 + ${id}W2*0.45 + ${id}W3*0.35 + ${id}W4*0.2)*1.6*${d}` });
  nodes.push({ id: `${id}R`, type: 'expr', expr: `(${id}W1*0.3 + ${id}W2*0.3 + ${id}W3*0.5 + ${id}W4*0.5)*1.6*${d}` });
  return nodes;
}

/**
 * A tambourine: two quick hits of band-passed noise jingling around 7 kHz; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * freq: the centre of the jingle in Hz ('7000 + bright*1500'); q: how narrow (2) }.
 * Returns <id>V, <id>A (the two hits and the tail), <id>N and <id>O, the tambourine.
 */
export function tambourine(id, { trig, noise, freq = '7000 + bright*1500', q = 2 } = {}) {
  need(`tambourine "${voiceId(id, 'tambourine')}"`, trig, 'trig', "the row that plays it: { trig: 'tT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'env', trig, points: [[0, 0], [0.001, 1], [0.012, 0.25], [0.02, 0.9], [0.11, 0, 'exp']] },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq, q },
    { id: `${id}O`, type: 'expr', expr: `${id}N*${id}A*${id}V*0.85` },
  ];
}

// ---- musicbox ----------------------------------------------------------------------------------------------------------

/**
 * A music-box tine: a struck resonator with the partials of a clamped metal tine (1, 6.27, 17.55), with a long ring.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz; vel: its loudness (default: the mark of the row);
 * decay: seconds the lowest partial rings (2.4) }.
 * Returns <id>V, <id>X (the 1 ms click) and <id>O, the tine. Give each tine that must ring over the next its own voice.
 */
export function tine(id, { trig, pitch, vel, decay = 2.4 } = {}) {
  const what = `tine "${voiceId(id, 'tine')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  const [x, k] = tap(id, trig, 0.001);
  return [
    ...strength(id, trig, vel), x,
    { id: `${id}O`, type: 'modal', in: `${id}X*${id}V*${k}*1.7`, freq: pitch, ratios: [1, 6.27, 17.55], gains: [1, 0.25, 0.08], decay },
  ];
}

/**
 * A low tine for a music box's bass: the tine two octaves down, on the chord root, left to ring.
 * Arguments: id; { trig: the row that plays it; note: the MIDI number of the root before the chord and the Key move it
 * (36); semis: semitones above the root, a number or a noteRow's id (0); decay: seconds it rings (3) }.
 * Needs chords(). Returns <id>Hz, <id>V, <id>X and <id>O, the low tine.
 */
export function lowTine(id, { trig, note = 36, semis = 0, decay = 3 } = {}) {
  need(`lowTine "${voiceId(id, 'lowTine')}"`, trig, 'trig', "the row that plays it: { trig: 'bG' }");
  const [x, k] = tap(id, trig, 0.0015);
  return [
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    ...strength(id, trig), x,
    { id: `${id}O`, type: 'modal', in: `${id}X*${id}V*${k}`, freq: `${id}Hz`, ratios: [1, 6.27, 17.55], gains: [1, 0.3, 0.1], decay },
  ];
}

/**
 * A music box's mechanism: a soft click of band-passed noise, a texture on every beat; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * freq: the centre of the click in Hz (2400); q: how narrow, low (0.8); decay: seconds (0.012) }.
 * Returns <id>V, <id>A, <id>N and <id>O, the click.
 */
export function mechanism(id, { trig, noise, freq = 2400, q = 0.8, decay = 0.012 } = {}) {
  need(`mechanism "${voiceId(id, 'mechanism')}"`, trig, 'trig', "the row that plays it: { trig: 'mT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.0003, decay, curve: 2 },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq, q },
    { id: `${id}O`, type: 'expr', expr: `${id}N*${id}A*${id}V*2.8` },
  ];
}

// ---- organ -----------------------------------------------------------------------------------------------------------

/**
 * A drawbar organ: sines at whole multiples of each note (1, 2, 3, 4, 6, 8), the upper ones brought in by Brightness, with a short key click.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz, or pitches: one to four notes in Hz for a chord; vel:
 * its loudness (default: the mark of the row); partials: the multiples ([1, 2, 3, 4, 6, 8]; fewer for a chord costs
 * fewer nodes); hold: seconds a key stays down ('60/bpm'); noise: the id of a white-noise node for the click (without it one is added) }.
 * Returns <id>V, <id>W1, <id>W2 ... (one sine per note and multiple), <id>A, <id>K (the click) and <id>O, the organ.
 */
export function drawbarOrgan(id, { trig, pitch, pitches, vel, partials = [1, 2, 3, 4, 6, 8], hold = '60/bpm', noise } = {}) {
  const what = `drawbarOrgan "${voiceId(id, 'drawbarOrgan')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  const notes = pitches ?? (pitch === undefined ? undefined : [pitch]);
  if (!Array.isArray(notes) || notes.length < 1 || notes.length > 4) fail(`${what}: give pitch (the note in Hz) or pitches (one to four notes in Hz)`);
  if (!Array.isArray(partials) || !partials.length || partials.some((m) => !(m > 0))) fail(`${what}: partials must be positive multiples of the note, for example [1, 2, 3, 4, 6, 8]`);
  const nz = noise || `${id}Nz`, nodes = [...ownNoise(id, noise), ...strength(id, trig, vel)], terms = [];
  let w = 0, total = 0;
  const level = (m) => (m <= 1 ? 1 : m <= 2 ? 0.7 : m <= 3 ? 0.45 : 0.3);
  notes.forEach((p) => partials.forEach((m) => {
    w++;
    nodes.push({ id: `${id}W${w}`, type: 'osc', freq: `${inParens(p)}*${num(m)}`, phase: Number(num((0.17 * w) % 1)) });
    terms.push(`${id}W${w}*${num(level(m))}${m > 3 ? '*(0.3 + 0.7*bright)' : ''}`);
    total += level(m);
  }));
  nodes.push({ id: `${id}A`, type: 'ad', trig, attack: 0.004, hold, decay: 0.06, curve: 1 });
  nodes.push({ id: `${id}K`, type: 'ad', trig, attack: 0.0003, decay: 0.006, curve: 2 });
  nodes.push({ id: `${id}O`, type: 'expr', expr: `((${terms.join(' + ')})*${id}A*${num(1.6 / total)} + ${nz}*${id}K*0.15)*${id}V` });
  return nodes;
}

/**
 * A rotary effect: a tremolo and a chorus on any sound, which make it swirl and spread to both sides (not a rotating speaker).
 * Arguments: id; { input: the sound, an expression ('oO'); rate: the swirl in Hz (5.8); depth: how much the level
 * swings, 0 to 0.5 (0.25) }.
 * Returns <id>T (the swirl), <id>M (the sound with its tremolo), the chorus <id>CD, <id>CL, <id>CR and <id>L, <id>R.
 */
export function rotary(id, { input, rate = 5.8, depth = 0.25 } = {}) {
  const what = `rotary "${voiceId(id, 'rotary')}"`;
  need(what, input, 'the input', "the sound, an expression: { input: 'oO' }");
  if (!(depth >= 0 && depth <= 0.5)) fail(`${what}: depth is how much the level swings, from 0 to 0.5, got ${depth}`);
  const c = `${id}C`;
  return [
    { id: `${id}T`, type: 'osc', freq: rate },
    { id: `${id}M`, type: 'expr', expr: `${inParens(input)}*(${num(1 - depth)} + ${id}T*${num(depth)})` },
    // a chorus like compose.js's chorus(), written here because at a rotary's speed its delay must swing far less
    { id: `${c}D`, type: 'osc', freq: Number(num(rate * 0.9)) },
    // at the swirl's speed the copies' delay moves only 0.2 ms each way: about 0.7% of pitch, a wobble, not a vibrato
    { id: `${c}L`, type: 'delay', in: `${id}M`, time: `0.004 + 0.0002*${c}D`, feedback: 0, mix: 1, max: 0.006 },
    { id: `${c}R`, type: 'delay', in: `${id}M`, time: `0.004 - 0.0002*${c}D`, feedback: 0, mix: 1, max: 0.006 },
    { id: `${id}L`, type: 'expr', expr: `${id}M*0.55 + ${c}L*0.5` },
    { id: `${id}R`, type: 'expr', expr: `${id}M*0.55 + ${c}R*0.5` },
  ];
}

/**
 * An organ's pedal bass: sines at 1, 2 and 3 times the chord root, on and off with the key (a click, no swell).
 * Arguments: id; { trig: the row that plays it; note: the MIDI number of the root before the chord and the Key move it
 * (36); semis: semitones above the root, a number or a noteRow's id (0); hold: seconds a key stays down ('180/bpm');
 * noise: the id of a white-noise node for the click (without it one is added) }.
 * Needs chords(). Returns <id>Hz, <id>W1 to <id>W3, <id>V, <id>A, <id>K and <id>O, the bass.
 */
export function pedalBass(id, { trig, note = 36, semis = 0, hold = '180/bpm', noise } = {}) {
  need(`pedalBass "${voiceId(id, 'pedalBass')}"`, trig, 'trig', "the row that plays it: { trig: 'bG' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    { id: `${id}W1`, type: 'osc', freq: `${id}Hz` },
    { id: `${id}W2`, type: 'osc', freq: `${id}Hz*2`, phase: 0.25 },
    { id: `${id}W3`, type: 'osc', freq: `${id}Hz*3`, phase: 0.5 },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.004, hold, decay: 0.05, curve: 1 },
    { id: `${id}K`, type: 'ad', trig, attack: 0.0003, decay: 0.005, curve: 2 },
    { id: `${id}O`, type: 'expr', expr: `((${id}W1 + ${id}W2*0.5 + ${id}W3*0.3)*${id}A*0.62 + ${nz}*${id}K*0.12)*${id}V` },
  ];
}

/**
 * A brushed snare: a soft swish of band-passed noise with a slow start; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * freq: the centre of the swish in Hz (3500); q: how narrow (0.6); attack, decay: seconds (0.012, 0.16) }.
 * Returns <id>V, <id>A, <id>N and <id>O, the drum.
 */
export function brushSnare(id, { trig, noise, freq = 3500, q = 0.6, attack = 0.012, decay = 0.16 } = {}) {
  need(`brushSnare "${voiceId(id, 'brushSnare')}"`, trig, 'trig', "the row that plays it: { trig: 'sT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack, decay, curve: 1.8 },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq, q },
    { id: `${id}O`, type: 'expr', expr: `${id}N*${id}A*${id}V*1.5` },
  ];
}

/**
 * A ride: band-passed high noise with a long decay, as loud as each mark of its row; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * freq: the centre in Hz ('6500 + bright*2000'); q: how narrow (1.4); decay: seconds (0.7) }.
 * Returns <id>V, <id>A, <id>N and <id>O, the ride.
 */
export function ride(id, { trig, noise, freq = '6500 + bright*2000', q = 1.4, decay = 0.7 } = {}) {
  need(`ride "${voiceId(id, 'ride')}"`, trig, 'trig', "the row that plays it: { trig: 'rT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.001, hold: 0.005, decay, curve: 3 },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq, q },
    { id: `${id}O`, type: 'expr', expr: `${id}N*${id}A*${id}V*0.95` },
  ];
}

// ---- twang (western and surf) --------------------------------------------------------------------------------------------

/**
 * A twangy guitar-like lead: a bright plucked string, driven a little, with a tremolo on its level.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz; vel: its loudness (default: the mark of the row);
 * decay: seconds the string rings (1.4); drive: how hard it is pushed (2.2); rate: the tremolo in Hz (5.5) }.
 * Returns <id>V, <id>X (the pick), <id>W (the string), <id>S (the drive), <id>D (its DC block), <id>T and <id>O, the voice.
 */
export function twangGuitar(id, { trig, pitch, vel, decay = 1.4, drive = 2.2, rate = 5.5 } = {}) {
  const what = `twangGuitar "${voiceId(id, 'twangGuitar')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  return [
    ...strength(id, trig, vel),
    pick(id, trig, '0.0012 - bright*0.0005'),
    { id: `${id}W`, type: 'pluck', trig: 0, in: `${id}X*${id}V`, freq: pitch, decay, damp: '0.15 - bright*0.1' },
    { id: `${id}S`, type: 'shaper', in: `${id}W`, drive },
    { id: `${id}D`, type: 'filter', mode: 'hp', in: `${id}S`, freq: `${inParens(pitch)}*0.5`, q: 0.7 },
    { id: `${id}T`, type: 'osc', freq: rate },
    { id: `${id}O`, type: 'expr', expr: `${id}D*(0.86 + ${id}T*0.12)` },
  ];
}

/**
 * A spring: a short echo that feeds back on itself many times, darkened, for the twang of a spring before the room.
 * Arguments: id; { input: the sound, an expression; time: seconds between repeats (0.031); feedback: 0 to 0.8 (0.62);
 * cutoff: a low-pass on the repeats in Hz (2800) }.
 * Returns <id>D (the repeats) and <id>O: the repeats alone, darkened; put them beside the dry sound in the mix.
 */
export function spring(id, { input, time = 0.031, feedback = 0.62, cutoff = 2800 } = {}) {
  const what = `spring "${voiceId(id, 'spring')}"`;
  need(what, input, 'the input', "the sound, an expression: { input: 'eO' }");
  if (!(feedback >= 0 && feedback <= 0.8)) fail(`${what}: feedback is from 0 to 0.8, got ${feedback}`);
  if (!(time >= 0.005 && time <= 0.08)) fail(`${what}: time is seconds between repeats, from 0.005 to 0.08, got ${time}`);
  return [
    { id: `${id}D`, type: 'delay', in: input, time, feedback, mix: 1, max: Number(num(time + 0.01)) },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}D`, freq: cutoff, q: 0.8 },
  ];
}

/**
 * A muted strum: three strings on the bar's chord (root, fifth, octave), plucked together and damped at once.
 * Arguments: id; { trig: the row that plays it (the off-beats); note: the MIDI number of the root before the chord and
 * the Key move it (48); decay: seconds the strings ring (0.14) }.
 * Needs chords(). Returns <id>V, <id>X, <id>W1 to <id>W3 and <id>L, <id>R.
 */
export function mutedStrum(id, { trig, note = 48, decay = 0.14 } = {}) {
  need(`mutedStrum "${voiceId(id, 'mutedStrum')}"`, trig, 'trig', "the row that plays it: { trig: 'mG' }");
  const strings = [0, 'fifth', 12].map((t, i) => ({ id: `${id}W${i + 1}`, type: 'pluck', trig: 0, in: `${id}X*${id}V`, freq: chordNote(note, t), decay, damp: 0.6 }));
  return [
    ...strength(id, trig), pick(id, trig, 0.003), ...strings,
    { id: `${id}L`, type: 'expr', expr: `(${id}W1*0.6 + ${id}W2*0.45 + ${id}W3*0.25)*0.9` },
    { id: `${id}R`, type: 'expr', expr: `(${id}W1*0.35 + ${id}W2*0.45 + ${id}W3*0.5)*0.9` },
  ];
}

/**
 * An upright-bass-like voice: a low, heavily damped plucked string on the chord root, with a low thump on each attack.
 * Arguments: id; { trig: the row that plays it; note: the MIDI number of the root before the chord and the Key move it
 * (36); semis: semitones above the root, a number or a noteRow's id (0); decay: seconds the string rings (0.9) }.
 * Needs chords(). Returns <id>Hz, <id>V, <id>X, <id>W (the string), <id>T, <id>S (the thump) and <id>O, the bass.
 */
export function uprightBass(id, { trig, note = 36, semis = 0, decay = 0.9 } = {}) {
  need(`uprightBass "${voiceId(id, 'uprightBass')}"`, trig, 'trig', "the row that plays it: { trig: 'bG' }");
  return [
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    ...strength(id, trig), pick(id, trig, 0.004),
    { id: `${id}W`, type: 'pluck', trig: 0, in: `${id}X*${id}V`, freq: `${id}Hz`, decay, damp: 0.55 },
    { id: `${id}T`, type: 'ad', trig, attack: 0.002, decay: 0.07, curve: 2 },
    { id: `${id}S`, type: 'osc', freq: `${id}Hz` },
    { id: `${id}O`, type: 'expr', expr: `${id}W*0.9 + ${id}S*${id}T*${id}V*0.45` },
  ];
}

/**
 * A rim click: a 15 ms burst of noise through a wide band-pass; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * freq: the centre in Hz (1700); q: how narrow, under 1.5 (1.2); decay: seconds (0.015) }.
 * Returns <id>V, <id>A, <id>N and <id>O, the click.
 */
export function rimClick(id, { trig, noise, freq = 1700, q = 1.2, decay = 0.015 } = {}) {
  const what = `rimClick "${voiceId(id, 'rimClick')}"`;
  need(what, trig, 'trig', "the row that plays it: { trig: 'rT' }");
  if (!(q > 0 && q < 1.5)) fail(`${what}: q is under 1.5 (narrower and the click rings on a note of its own), got ${q}`);
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.0005, decay, curve: 1.5 },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq, q },
    { id: `${id}O`, type: 'expr', expr: `${id}N*${id}A*${id}V*2` },
  ];
}

// ---- steelpan (island) ---------------------------------------------------------------------------------------------------

/** A soft strike for a resonator: a quick rise and a slower fall (no noise), and the factor that levels a low partial's answer. */
const softStrike = (id, trig, attack, decay) => [{ id: `${id}X`, type: 'ad', trig, attack, decay, curve: 2 }, `${num(1 / (attack / 2 + decay / 3))}/sr`];

/**
 * A steel-pan-like note: a resonator with harmonic partials (1, 2, 3) struck smoothly for 3 ms, with no noise, ringing about a second.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz; vel: its loudness (default: the mark of the row); decay: seconds it rings (1.2) }.
 * Returns <id>V, <id>X (the strike) and <id>O, the note.
 */
export function steelPan(id, { trig, pitch, vel, decay = 1.2 } = {}) {
  const what = `steelPan "${voiceId(id, 'steelPan')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  const [x, k] = softStrike(id, trig, 0.0005, 0.0025);
  return [
    ...strength(id, trig, vel), x,
    { id: `${id}O`, type: 'modal', in: `${id}X*${id}V*${k}*1.7`, freq: pitch, ratios: [1, 2, 3], gains: [1, 0.45, 0.2], decay },
  ];
}

/**
 * A bass pan: the steel-pan-like note two octaves down, on the chord root.
 * Arguments: id; { trig: the row that plays it; note: the MIDI number of the root before the chord and the Key move it
 * (36); semis: semitones above the root, a number or a noteRow's id (0); decay: seconds it rings (1.6) }.
 * Needs chords(). Returns <id>Hz, <id>V, <id>X and <id>O, the bass.
 */
export function bassPan(id, { trig, note = 36, semis = 0, decay = 1.6 } = {}) {
  need(`bassPan "${voiceId(id, 'bassPan')}"`, trig, 'trig', "the row that plays it: { trig: 'bG' }");
  const [x, k] = softStrike(id, trig, 0.0008, 0.004);
  return [
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    ...strength(id, trig), x,
    { id: `${id}O`, type: 'modal', in: `${id}X*${id}V*${k}`, freq: `${id}Hz`, ratios: [1, 2, 3], gains: [1, 0.5, 0.25], decay },
  ];
}

/**
 * A clave-like click: one resonating partial on the chord root, two octaves above middle C, struck short.
 * Arguments: id; { trig: the row that plays it; low: the lowest note it may sound, a MIDI number (84); decay: seconds (0.16) }.
 * Needs chords(). Returns <id>V, <id>X and <id>O, the clave.
 */
export function clave(id, { trig, low = 84, decay = 0.16 } = {}) {
  need(`clave "${voiceId(id, 'clave')}"`, trig, 'trig', "the row that plays it: { trig: 'cT' }");
  const [x, k] = softStrike(id, trig, 0.0002, 0.0006);
  return [
    ...strength(id, trig), x,
    { id: `${id}O`, type: 'modal', in: `${id}X*${id}V*${k}*2`, freq: foldedRoot(low), ratios: [1], gains: [1], decay },
  ];
}

/**
 * A cowbell: two square waves on the chord's root and fifth (around 520 and 780 Hz) through a band-pass, short.
 * Arguments: id; { trig: the row that plays it; low: the lowest note its root may sound, a MIDI number (72); decay: seconds (0.25) }.
 * Needs chords(). Returns <id>Hz, <id>W1, <id>W2, <id>V, <id>A, <id>B and <id>O, the cowbell.
 */
export function cowbell(id, { trig, low = 72, decay = 0.25 } = {}) {
  need(`cowbell "${voiceId(id, 'cowbell')}"`, trig, 'trig', "the row that plays it: { trig: 'wT' }");
  return [
    { id: `${id}Hz`, type: 'expr', expr: foldedRoot(low) },
    { id: `${id}W1`, type: 'osc', wave: 'square', freq: `${id}Hz` },
    { id: `${id}W2`, type: 'osc', wave: 'square', freq: `${id}Hz*semi(fifth)` },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.001, hold: 0.005, decay, curve: 2.5 },
    { id: `${id}B`, type: 'filter', mode: 'bp', in: `(${id}W1 + ${id}W2)*0.5*${id}A*${id}V`, freq: `${id}Hz*1.6`, q: 1.4 },
    { id: `${id}O`, type: 'expr', expr: `${id}B*0.7` },
  ];
}

// ---- lofi (lo-fi keys) ----------------------------------------------------------------------------------------------------

/**
 * An electric-piano-like voice: a sine pushed by another at the same pitch (FM) with a push that fades fast, a brief high tine and a slow wobble of a few cents.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz, or pitches: one to four notes in Hz for a chord; vel:
 * its loudness (default: the mark of the row); decay: seconds (1.4); wobble: how far the pitch drifts, as a share (0.002) }.
 * Returns <id>V, <id>Wb (the wobble), <id>A, <id>I (the push), <id>T (the tine's envelope), <id>M1, <id>C1 ... (each
 * note's pair), <id>Tn (the tine) and <id>O, the piano.
 */
export function electricPiano(id, { trig, pitch, pitches, vel, decay = 1.4, wobble = 0.002 } = {}) {
  const what = `electricPiano "${voiceId(id, 'electricPiano')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  const notes = pitches ?? (pitch === undefined ? undefined : [pitch]);
  if (!Array.isArray(notes) || notes.length < 1 || notes.length > 4) fail(`${what}: give pitch (the note in Hz) or pitches (one to four notes in Hz)`);
  const nodes = [
    ...strength(id, trig, vel),
    { id: `${id}Wb`, type: 'osc', freq: 0.7 },
    { id: `${id}A`, type: 'ad', trig, attack: 0.002, hold: 0.01, decay, curve: 2.2 },
    { id: `${id}I`, type: 'ad', trig, attack: 0.001, decay: 0.22, curve: 2 },
    { id: `${id}T`, type: 'ad', trig, attack: 0.0005, decay: 0.025, curve: 1.5 },
  ];
  const terms = [];
  notes.forEach((p, i) => {
    const f = `${inParens(p)}*(1 + ${id}Wb*${num(wobble)})`;
    nodes.push({ id: `${id}M${i + 1}`, type: 'osc', freq: f });
    nodes.push({ id: `${id}C${i + 1}`, type: 'osc', freq: f, pm: `${id}M${i + 1}*${id}I*0.35` });
    terms.push(`${id}C${i + 1}`);
  });
  nodes.push({ id: `${id}Tn`, type: 'osc', freq: `${inParens(notes[0])}*7.1` });
  nodes.push({ id: `${id}O`, type: 'expr', expr: `((${terms.join(' + ')})*${id}A*${num(0.95 / notes.length)} + ${id}Tn*${id}T*0.18)*${id}V` });
  return nodes;
}

/**
 * A warm bass: a triangle on the chord root rounded by a low-pass near 400 Hz, a slow start and a pitch wobble of a few cents.
 * Arguments: id; { trig: the row that plays it; note: the MIDI number of the root before the chord and the Key move it
 * (36); semis: semitones above the root, a number or a noteRow's id (0); attack: seconds (0.05); cutoff: Hz (420); wobble: a share (0.002) }.
 * Needs chords(). Returns <id>Wb, <id>Hz, <id>W, <id>V, <id>A and <id>O, the bass.
 */
export function warmBass(id, { trig, note = 36, semis = 0, attack = 0.05, cutoff = 420, wobble = 0.002 } = {}) {
  need(`warmBass "${voiceId(id, 'warmBass')}"`, trig, 'trig', "the row that plays it: { trig: 'bG' }");
  return [
    { id: `${id}Wb`, type: 'osc', freq: 0.45 },
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    { id: `${id}W`, type: 'osc', wave: 'tri', freq: `${id}Hz*(1 + ${id}Wb*${num(wobble)})` },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack, hold: '60/bpm*0.6', decay: '60/bpm*0.8', curve: 1.4 },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}W*${id}A*${id}V*1.1`, freq: cutoff, q: 0.7 },
  ];
}

/**
 * A dusty kick: a short sine falling onto the chord root, low-passed so it thumps rather than clicks.
 * Arguments: id; { trig: the row that plays it; low: the lowest note it may land on, a MIDI number (28); decay: seconds (0.22); cutoff: Hz (900) }.
 * Needs chords(). Returns <id>P, <id>W, <id>A (give it to bus() as `duck`) and <id>O, the drum.
 */
export function dustyKick(id, { trig, low = 28, decay = 0.22, cutoff = 900 } = {}) {
  need(`dustyKick "${voiceId(id, 'dustyKick')}"`, trig, 'trig', "the row that plays it: { trig: 'kT' }");
  return [
    { id: `${id}P`, type: 'env', trig, points: [[0, 2.5], [0.05, 1, 'exp']] },
    { id: `${id}W`, type: 'osc', freq: `${foldedRoot(low)}*${id}P` },
    { id: `${id}A`, type: 'ad', trig, attack: 0.002, hold: 0.02, decay, curve: 2 },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}W*${id}A`, freq: cutoff, q: 0.7 },
  ];
}

/**
 * A dusty snare: a noise snare through a low-pass and a light crush, so it sounds worn; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * cutoff: Hz (3500); decay: seconds (0.13) }.
 * Returns <id>V, <id>A, <id>N, <id>B, <id>F and <id>O, the drum.
 */
export function dustySnare(id, { trig, noise, cutoff = 3500, decay = 0.13 } = {}) {
  need(`dustySnare "${voiceId(id, 'dustySnare')}"`, trig, 'trig', "the row that plays it: { trig: 'sT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.002, hold: 0.01, decay, curve: 2 },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq: 1800, q: 0.8 },
    { id: `${id}B`, type: 'filter', mode: 'bp', in: nz, freq: 380, q: 0.9 },
    { id: `${id}F`, type: 'filter', mode: 'lp', in: `(${id}N*1.85 + ${id}B*1.7)*${id}A*${id}V`, freq: cutoff, q: 0.7 },
    { id: `${id}O`, type: 'crush', in: `${id}F*1.15`, bits: 7, rate: 12000 },
  ];
}

/**
 * A dusty hat: a closed hat, low-passed so it is soft and dull; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * cutoff: Hz ('5000 + bright*2000'); decay: seconds (0.035) }.
 * Returns <id>V, <id>A, <id>N and <id>O, the hat.
 */
export function dustyHat(id, { trig, noise, cutoff = '5000 + bright*2000', decay = 0.035 } = {}) {
  need(`dustyHat "${voiceId(id, 'dustyHat')}"`, trig, 'trig', "the row that plays it: { trig: 'hT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.001, decay, curve: 2 },
    { id: `${id}N`, type: 'filter', mode: 'hp', in: nz, freq: 3000, q: 0.7 },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}N*${id}A*${id}V*1.6`, freq: cutoff, q: 0.7 },
  ];
}

/**
 * A crackle bed: random clicks through a band-pass, like a worn record, from its row's first hit on; it has no pitch.
 * Arguments: id; { trig: the row whose first hit starts it; freq: the centre in Hz (2600); q (0.7); density: clicks a second (7) }.
 * Returns <id>G (on from the first hit), <id>D (the clicks) and <id>O, the crackle.
 */
export function crackle(id, { trig, freq = 2600, q = 0.7, density = 7 } = {}) {
  need(`crackle "${voiceId(id, 'crackle')}"`, trig, 'trig', "the row whose first hit starts it: { trig: 'xT' }");
  return [
    { id: `${id}G`, type: 'sah', in: 1, trig },
    { id: `${id}D`, type: 'dust', density, spread: 0.7 },
    { id: `${id}O`, type: 'filter', mode: 'bp', in: `${id}D*${id}G*3`, freq, q },
  ];
}

/**
 * A tape finish for a whole mix: each channel through a light crush and a low-pass, so the track sounds worn.
 * Arguments: id; { left, right: the two channels, expressions ('mL', 'mR': the bus's limiter); bits (11); rate: Hz (18000); cutoff: Hz (5000) }.
 * Returns <id>XL, <id>L, <id>XR, <id>R: give [<id>L, <id>R] to assemble() as `out`.
 */
export function tape(id, { left, right, bits = 11, rate = 18000, cutoff = 5000 } = {}) {
  const what = `tape "${voiceId(id, 'tape')}"`;
  need(what, left, 'left', "the left channel: { left: 'mL', right: 'mR' }");
  need(what, right, 'right', "the right channel: { left: 'mL', right: 'mR' }");
  return [
    { id: `${id}XL`, type: 'crush', in: left, bits, rate },
    { id: `${id}L`, type: 'filter', mode: 'lp', in: `${id}XL`, freq: cutoff, q: 0.7 },
    { id: `${id}XR`, type: 'crush', in: right, bits, rate },
    { id: `${id}R`, type: 'filter', mode: 'lp', in: `${id}XR`, freq: cutoff, q: 0.7 },
  ];
}

// ---- darkambient ---------------------------------------------------------------------------------------------------------

/**
 * A glassy tone: a sine pushed by another at an inharmonic ratio (FM), slow to start and slow to fade.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz; vel: its loudness (default: the mark of the row); attack,
 * decay: seconds (0.04, 2.6); ratio: the push's pitch over the note's (2.76) }.
 * Returns <id>V, <id>A, <id>I (the push), <id>M, <id>C and <id>O, the tone.
 */
export function glass(id, { trig, pitch, vel, attack = 0.04, decay = 2.6, ratio = 2.76 } = {}) {
  const what = `glass "${voiceId(id, 'glass')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  return [
    ...strength(id, trig, vel),
    { id: `${id}A`, type: 'ad', trig, attack, decay, curve: 2 },
    { id: `${id}I`, type: 'ad', trig, attack: 0.01, decay: Number(num(decay * 0.4)), curve: 1.5 },
    { id: `${id}M`, type: 'osc', freq: `${inParens(pitch)}*${num(ratio)}` },
    { id: `${id}C`, type: 'osc', freq: pitch, pm: `${id}M*${id}I*0.3` },
    { id: `${id}O`, type: 'expr', expr: `${id}C*${id}A*${id}V` },
  ];
}

/**
 * A drone: two saws a few cents apart on the chord root, through band-passes that sweep slowly, one per side, from its row's first hit on.
 * Arguments: id; { trig: the row whose first hit starts it; note: the MIDI number of the root before the chord and the
 * Key move it (48); attack: seconds it takes to swell in (1.5); freq: the centre of the sweep in Hz ('500 + bright*900'); q (2.5) }.
 * Needs chords(). Returns <id>W1, <id>W2, <id>S (the sweep), <id>G, <id>A (the swell) and <id>L, <id>R.
 */
export function drone(id, { trig, note = 48, attack = 1.5, freq = '500 + bright*900', q = 2.5 } = {}) {
  need(`drone "${voiceId(id, 'drone')}"`, trig, 'trig', "the row whose first hit starts it: { trig: 'pT' }");
  const f = inParens(freq), x = `(${id}W1 + ${id}W2)*${id}A*0.55`;
  return [
    { id: `${id}W1`, type: 'osc', wave: 'saw', freq: `${chordNote(note)}*0.997`, phase: 0.15 },
    { id: `${id}W2`, type: 'osc', wave: 'saw', freq: `${chordNote(note)}*1.004`, phase: 0.55 },
    { id: `${id}S`, type: 'osc', freq: 0.07 },
    { id: `${id}G`, type: 'sah', in: 1, trig },
    { id: `${id}A`, type: 'lag', in: `${id}G`, time: attack },
    { id: `${id}L`, type: 'filter', mode: 'bp', in: x, freq: `${f}*(1 + ${id}S*0.5)`, q },
    { id: `${id}R`, type: 'filter', mode: 'bp', in: x, freq: `${f}*(1 - ${id}S*0.5)`, q },
  ];
}

/**
 * Wind: pink noise through a band-pass that sweeps slowly, from its row's first hit on; it has no pitch.
 * Arguments: id; { trig: the row whose first hit starts it; freq: the centre in Hz ('700 + bright*900'); q (1.6); attack: seconds to swell in (2) }.
 * Returns <id>Nz (its own pink noise), <id>S, <id>G, <id>A and <id>O, the wind.
 */
export function wind(id, { trig, freq = '700 + bright*900', q = 1.6, attack = 2 } = {}) {
  need(`wind "${voiceId(id, 'wind')}"`, trig, 'trig', "the row whose first hit starts it: { trig: 'pT' }");
  return [
    { id: `${id}Nz`, type: 'noise', color: 'pink' },
    { id: `${id}S`, type: 'osc', freq: 0.05, phase: 0.3 },
    { id: `${id}G`, type: 'sah', in: 1, trig },
    { id: `${id}A`, type: 'lag', in: `${id}G`, time: attack },
    { id: `${id}O`, type: 'filter', mode: 'bp', in: `${id}Nz*${id}A*2`, freq: `${inParens(freq)}*(1 + ${id}S*0.5)`, q },
  ];
}

/**
 * A sub drone: a pure sine on the chord root that swells in over seconds and then holds, tied across bar lines.
 * Arguments: id; { trig: the row whose first hit starts it; note: the MIDI number of the root before the chord and the
 * Key move it (36); semis: semitones above the root, a number or a noteRow's id (0); attack: seconds of the swell (2.5) }.
 * Needs chords(). Returns <id>Hz, <id>W, <id>G, <id>A and <id>O, the drone.
 */
export function subDrone(id, { trig, note = 36, semis = 0, attack = 2.5 } = {}) {
  need(`subDrone "${voiceId(id, 'subDrone')}"`, trig, 'trig', "the row whose first hit starts it: { trig: 'bG' }");
  return [
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    { id: `${id}W`, type: 'osc', freq: `${id}Hz` },
    { id: `${id}G`, type: 'sah', in: 1, trig },
    { id: `${id}A`, type: 'lag', in: `${id}G`, time: attack },
    { id: `${id}O`, type: 'expr', expr: `${id}W*${id}A` },
  ];
}

/**
 * A heartbeat: a soft, low kick on the chord root, quiet enough to read as a pulse rather than a drum. darkambient plays
 * it on every beat ('X...X...X...X...'), so the tempo checker finds the written tempo.
 * Arguments: id; { trig: the row that plays it; low: the lowest note it may land on, a MIDI number (33); decay: seconds (0.18) }.
 * Needs chords(). Returns <id>P, <id>W, <id>A (give it to bus() as `duck`) and <id>O, the beat.
 */
export function heartbeat(id, { trig, low = 33, decay = 0.18 } = {}) {
  need(`heartbeat "${voiceId(id, 'heartbeat')}"`, trig, 'trig', "the row that plays it: { trig: 'kT' }");
  return [
    { id: `${id}P`, type: 'env', trig, points: [[0, 1.6], [0.04, 1, 'exp']] },
    { id: `${id}W`, type: 'osc', freq: `${foldedRoot(low)}*${id}P` },
    { id: `${id}A`, type: 'ad', trig, attack: 0.006, hold: 0.01, decay, curve: 2 },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}W*${id}A*1.05`, freq: 500, q: 0.7 },
  ];
}

/**
 * A metal hit: a resonator with inharmonic partials, its lowest on the chord root, struck by a click.
 * Arguments: id; { trig: the row that plays it; low: the lowest note its root may sound, a MIDI number (36); decay: seconds the lowest partial rings (1.4) }.
 * Needs chords(). Returns <id>V, <id>X and <id>O, the hit.
 */
export function metalHit(id, { trig, low = 36, decay = 1.4 } = {}) {
  need(`metalHit "${voiceId(id, 'metalHit')}"`, trig, 'trig', "the row that plays it: { trig: 'mT' }");
  const [x, k] = softStrike(id, trig, 0.0003, 0.0015);
  return [
    ...strength(id, trig), x,
    { id: `${id}O`, type: 'modal', in: `${id}X*${id}V*${k}*0.55`, freq: foldedRoot(low), ratios: [1, 2.32, 4.25, 6.63], gains: [1, 0.7, 0.5, 0.35], decay },
  ];
}

// ---- rock (arcade rock) --------------------------------------------------------------------------------------------------

/**
 * A driven lead: a saw and a square pushed into distortion, then a low-pass near 3 kHz like a small speaker cabinet.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz (its glide comes from the line, melody()'s glide); vel:
 * its loudness (default: the mark of the row); drive: how hard it is pushed, 4 to 8 ('4 + bright*4'); cutoff: Hz (3000);
 * attack, hold, decay: seconds (0.006, 0.15, 0.35) }.
 * Returns <id>V, <id>W1, <id>W2, <id>A, <id>S (the drive), <id>D (its DC block) and <id>O, the lead.
 */
export function driveLead(id, { trig, pitch, vel, drive = '4 + bright*4', cutoff = 3000, attack = 0.006, hold = 0.15, decay = 0.35 } = {}) {
  const what = `driveLead "${voiceId(id, 'driveLead')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  return [
    ...strength(id, trig, vel),
    { id: `${id}W1`, type: 'osc', wave: 'saw', freq: pitch },
    { id: `${id}W2`, type: 'osc', wave: 'square', freq: `${inParens(pitch)}*1.003` },
    { id: `${id}A`, type: 'ad', trig, attack, hold, decay, curve: 1.3 },
    { id: `${id}S`, type: 'shaper', in: `(${id}W1*0.6 + ${id}W2*0.4)*${id}A*${id}V`, drive },
    { id: `${id}D`, type: 'filter', mode: 'hp', in: `${id}S`, freq: `${inParens(pitch)}*0.5`, q: 0.7 },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}D*0.6`, freq: cutoff, q: 0.9 },
  ];
}

/**
 * A power chord: saws on the chord's root, fifth and octave (no third), palm-muted, then driven through a cabinet low-pass.
 * Arguments: id; { trig: the row that plays it; note: the MIDI number of the root before the chord and the Key move it
 * (36); drive (5); cutoff: the cabinet in Hz (2800); decay: seconds (0.12) }.
 * Needs chords(). Returns <id>W1 to <id>W3, <id>V, <id>A, <id>F (the mute), <id>S (the drive) and <id>O, the chord.
 */
export function powerChord(id, { trig, note = 36, drive = 5, cutoff = 2800, decay = 0.12 } = {}) {
  need(`powerChord "${voiceId(id, 'powerChord')}"`, trig, 'trig', "the row that plays it: { trig: 'pG' }");
  return [
    { id: `${id}W1`, type: 'osc', wave: 'saw', freq: chordNote(note) },
    { id: `${id}W2`, type: 'osc', wave: 'saw', freq: `${chordNote(note, 'fifth')}*1.002`, phase: 0.3 },
    { id: `${id}W3`, type: 'osc', wave: 'saw', freq: `${chordNote(note, 12)}*1.003`, phase: 0.6 },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.002, hold: 0.03, decay, curve: 1.5 },
    { id: `${id}F`, type: 'filter', mode: 'lp', in: `(${id}W1 + ${id}W2 + ${id}W3)*0.33*${id}A*${id}V`, freq: '600 + bright*600', q: 0.8 },
    { id: `${id}S`, type: 'shaper', in: `${id}F`, drive },
    { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}S`, freq: cutoff, q: 0.8 },
  ];
}

/**
 * A rock bass: a square and a saw on the chord root pushed into a shaper, a fixed cabinet low-pass near 800 Hz and a pick click on each note.
 * Arguments: id; { trig: the row that plays it; note: the MIDI number of the root before the chord and the Key move it
 * (36); semis: semitones above the root, a number or a noteRow's id (0); drive (2.5); cutoff: Hz (800); noise: the id
 * of a white-noise node for the click (without it one is added) }.
 * Needs chords(). Returns <id>Hz, <id>W1, <id>W2, <id>V, <id>A, <id>S, <id>L, <id>D (its DC block), <id>K (the click) and <id>O, the bass.
 */
export function rockBass(id, { trig, note = 36, semis = 0, drive = 2.5, cutoff = 800, noise } = {}) {
  need(`rockBass "${voiceId(id, 'rockBass')}"`, trig, 'trig', "the row that plays it: { trig: 'bG' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    { id: `${id}W1`, type: 'osc', wave: 'square', freq: `${id}Hz` },
    { id: `${id}W2`, type: 'osc', wave: 'saw', freq: `${id}Hz*1.004` },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.002, hold: 0.05, decay: 0.12, curve: 1.5 },
    { id: `${id}S`, type: 'shaper', in: `(${id}W1 + ${id}W2)*0.5*${id}A*${id}V`, drive },
    { id: `${id}L`, type: 'filter', mode: 'lp', in: `${id}S`, freq: cutoff, q: 0.9 },
    { id: `${id}D`, type: 'filter', mode: 'hp', in: `${id}L`, freq: `${id}Hz*0.5`, q: 0.7 },
    { id: `${id}K`, type: 'ad', trig, attack: 0.0003, decay: 0.004, curve: 2 },
    { id: `${id}O`, type: 'expr', expr: `${id}D*0.75 + ${nz}*${id}K*${id}V*0.12` },
  ];
}

/**
 * A crash: high-passed noise with a long fall, as loud as each mark of its row; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * freq: the high-pass in Hz ('4500 + bright*2000'); decay: seconds (1.2) }.
 * Returns <id>V, <id>A, <id>N and <id>O, the crash.
 */
export function crash(id, { trig, noise, freq = '4500 + bright*2000', decay = 1.2 } = {}) {
  need(`crash "${voiceId(id, 'crash')}"`, trig, 'trig', "the row that plays it: { trig: 'cT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig, attack: 0.001, decay, curve: 3 },
    { id: `${id}N`, type: 'filter', mode: 'hp', in: nz, freq, q: 0.6 },
    { id: `${id}O`, type: 'expr', expr: `${id}N*${id}A*${id}V*0.9` },
  ];
}

// ---- marimba (wooden bars) -----------------------------------------------------------------------------------------------

/**
 * A marimba-like bar: a resonator with the partials of a tuned wooden bar (1, 3.9, 9.2) struck by a 1.6 ms mallet roughened with band-passed noise.
 * Arguments: id; { trig: the gate row; pitch: the note in Hz; vel: its loudness (default: the mark of the row); decay:
 * seconds the bar rings at A4, shorter higher up (0.35); noise: the id of a white-noise node (without it one is added) }.
 * Returns <id>V, <id>X (the mallet), <id>N (its noise) and <id>O, the bar.
 */
export function marimba(id, { trig, pitch, vel, decay = 0.35, noise } = {}) {
  const what = `marimba "${voiceId(id, 'marimba')}"`;
  need(what, trig, 'trig', "the gate row: { trig: 'eG' }");
  need(what, pitch, 'pitch', "the note in Hz: { pitch: 'eP' }");
  const nz = noise || `${id}Nz`, [x, k] = softStrike(id, trig, 0.0004, 0.0012);
  return [
    ...ownNoise(id, noise),
    ...strength(id, trig, vel), x,
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq: `${inParens(pitch)}*1.5`, q: 0.7 },
    // the strike is roughened by the noise: every hit is a little different, but none is lost
    { id: `${id}O`, type: 'modal', in: `${id}X*(1 + ${id}N*0.8)*${id}V*${k}*1.6`, freq: pitch, ratios: [1, 3.9, 9.2], gains: [1, 0.35, 0.12], decay: `${num(decay)}*pow(440/${inParens(pitch)}, 0.5)` },
  ];
}

/**
 * A bass bar: a low wooden-bar resonator (partials 1, 3.9) on the chord root, struck by the same roughened mallet.
 * Arguments: id; { trig: the row that plays it (16th-note rolls hold a long note); note: the MIDI number of the root
 * before the chord and the Key move it (36); semis: semitones above the root, a number or a noteRow's id (0); decay:
 * seconds it rings (0.8); noise: the id of a white-noise node (without it one is added) }.
 * Needs chords(). Returns <id>Hz, <id>V, <id>X, <id>N and <id>O, the bar.
 */
export function bassBar(id, { trig, note = 36, semis = 0, decay = 0.8, noise } = {}) {
  need(`bassBar "${voiceId(id, 'bassBar')}"`, trig, 'trig', "the row that plays it: { trig: 'bG' }");
  const nz = noise || `${id}Nz`, [x, k] = softStrike(id, trig, 0.001, 0.004);
  return [
    ...ownNoise(id, noise),
    { id: `${id}Hz`, type: 'expr', expr: chordNote(note, semis) },
    ...strength(id, trig), x,
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq: `${id}Hz*1.5`, q: 0.7 },
    { id: `${id}O`, type: 'modal', in: `${id}X*(1 + ${id}N*0.8)*${id}V*${k}`, freq: `${id}Hz`, ratios: [1, 3.9], gains: [1, 0.3], decay },
  ];
}

/**
 * A woodblock: a short resonator (partials 1, 2.8) on the chord root, around 1 to 2 kHz, struck by a click.
 * Arguments: id; { trig: the row that plays it; low: the lowest note it may sound, a MIDI number (84); decay: seconds (0.04) }.
 * Needs chords(). Returns <id>V, <id>X and <id>O, the block.
 */
export function woodblock(id, { trig, low = 84, decay = 0.04 } = {}) {
  need(`woodblock "${voiceId(id, 'woodblock')}"`, trig, 'trig', "the row that plays it: { trig: 'wT' }");
  const [x, k] = softStrike(id, trig, 0.0002, 0.0005);
  return [
    ...strength(id, trig), x,
    { id: `${id}O`, type: 'modal', in: `${id}X*${id}V*${k}*1.8`, freq: foldedRoot(low), ratios: [1, 2.8], gains: [1, 0.4], decay },
  ];
}

/**
 * A scraped gourd: a quick run of noise ticks, one per cycle of a fast square wave, through a band-pass, about eight in 0.12 s; it has no pitch.
 * Arguments: id; { trig: the row that plays it; noise: the id of a white-noise node (without it one is added);
 * freq: the centre in Hz (3200); q (1.2); hold: seconds the scrape lasts (0.12) }.
 * Returns <id>C (the ticks), <id>G (the scrape), <id>V, <id>A, <id>N and <id>O, the scrape.
 */
export function guiro(id, { trig, noise, freq = 3200, q = 1.2, hold = 0.12 } = {}) {
  need(`guiro "${voiceId(id, 'guiro')}"`, trig, 'trig', "the row that plays it: { trig: 'gT' }");
  const nz = noise || `${id}Nz`;
  return [
    ...ownNoise(id, noise),
    // the ticks come from a fast square wave, not a clock node: a piece has exactly one clock (c16)
    { id: `${id}C`, type: 'osc', wave: 'square', freq: 68 },
    { id: `${id}G`, type: 'env', trig, points: [[0, 1], [hold, 1], [Number(num(hold + 0.001)), 0]] },
    ...strength(id, trig),
    { id: `${id}A`, type: 'ad', trig: `${id}C*${id}G`, attack: 0.0005, decay: 0.007, curve: 1.5 },
    { id: `${id}N`, type: 'filter', mode: 'bp', in: nz, freq, q },
    { id: `${id}O`, type: 'expr', expr: `${id}N*${id}A*${id}G*${id}V*1.4` },
  ];
}

/**
 * A log drum: a low two-partial resonator on the chord's root and fifth (partials 1, 1.5), struck softly.
 * Arguments: id; { trig: the row that plays it; low: the lowest note it may sound, a MIDI number (40); decay: seconds (0.5) }.
 * Needs chords(). Returns <id>V, <id>X and <id>O, the drum.
 */
export function logDrum(id, { trig, low = 40, decay = 0.5 } = {}) {
  need(`logDrum "${voiceId(id, 'logDrum')}"`, trig, 'trig', "the row that plays it: { trig: 'lT' }");
  const [x, k] = softStrike(id, trig, 0.001, 0.003);
  return [
    ...strength(id, trig), x,
    { id: `${id}O`, type: 'modal', in: `${id}X*${id}V*${k}`, freq: foldedRoot(low), ratios: [1, 1.5], gains: [1, 0.5], decay },
  ];
}
