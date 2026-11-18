#!/usr/bin/env node
// Writes sounds/thornwood-overworld.json: "Forest trail theme", the level music of the platformer kit
// (bundles/specs/kit-platformer-fantasy.md, batch P15). Built on the music kit (kit.mjs).
//
//   G major, 138 bpm, 8 bars: G G C D | Em C D D. Chiptune-leaning: a triangle bass bouncing in octaves,
//   a thin pulse arpeggio, a three-piece drum kit, two pulses holding thirds, the tune, and its echo.
//
//   node tools/compose/thornwood_overworld.mjs             write the patch
//   node tools/compose/thornwood_overworld.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/thornwood_overworld.mjs --measure   print instrument, section and intensity levels
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.795, 1, 0.972, 4.19];

export const CHORDS = 'G G C D | Em C D D';

// The tune, one token per 16th. A four-bar phrase that hops up the G major chord and steps back down
// (and does the same a fourth higher on C), answered by four bars that fall from B and end on D.
export const TUNE = [
  'G4 _ B4 _ D5 _ G5 _ _ _ F#5- _ E5- _ D5 _',      // G    hop up G B D G, step down F# E D
  'B4 _ _ _ D5 _ B4- _ G4 _ _ _ _ _ A4- B4-',       // G    a skip and a rest on G, two quick notes up
  'C5 _ E5 _ G5 _ C6 _ _ _ B5- _ A5- _ G5 _',       // C    the same hop, on C
  'F#5 _ _ _ D5 _ F#5- _ A5 _ _ _ _ _ _ _',         // D    climbs to A: a question
  'B5 _ G5 _ E5 _ G5 _ _ _ A5- _ G5- _ E5 _',       // Em   the answer starts at the top and hops down
  'E5 _ _ _ G5 _ E5- _ C5 _ _ _ _ _ D5- E5-',       // C    bar 2 again, on C
  'F#5 _ A5 _ F#5 _ D5 _ _ _ E5- _ F#5- _ E5 _',    // D
  'D5 _ _ _ _ _ _ _ A4 _ F#4- _ D4 _ _ _',          // D    ends on D, then hops down the chord to the D below
];

// What the two harmony pulses hold in each bar, in semitones above G3: always a third apart, always chord tones.
//           G  G  C  D  | Em C  D  D
const HOLD_LOW = '4 4 5 7 | 9 9 7 11';      // B3 B3 C4 D4 | E4 E4 D4 F#4
const HOLD_HIGH = '7 7 9 11 | 12 12 11 14'; // D4 D4 E4 F#4 | G4 G4 F#4 A4

// Which layers play. `section` is for the Length control (the 32-bar version is bass and arpeggio, then drums,
// then the tune, then everything); `intensity` is the window in which the Intensity control brings the layer in.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },              // bass and arpeggio: always there, a little fuller as it builds
  beat: { section: 2, intensity: [0.25, 0.35] },       // kick and hat
  snare: { section: 2, intensity: [0.5, 0.6] },
  tune: { section: 3, intensity: [0.5, 0.6] },         // the melody
  full: { section: 4, intensity: [0.75, 0.85] },       // the harmony pulses and the echo line
  busy: { section: 4, intensity: [0.75, 0.76] },       // a switch: the hat goes to 16ths
};

const one = (bar) => Array(8).fill(bar);
const withLast = (bar, last) => [...Array(7).fill(bar), last];
const with4and8 = (bar, fourth, eighth) => [bar, bar, bar, fourth, bar, bar, bar, eighth];

export function build(gains = GAINS) {
  return assemble({
    id: 'thornwood-overworld',
    name: 'Forest trail theme',
    tags: ['music', 'overworld', 'chiptune', 'adaptive', 'loop'],
    description: 'Bright, bouncy chiptune level music in G major, 8 to 32 bars long: Intensity brings in the drums, then the tune, then the harmony and an echo, and you can change the tempo, key, bounce and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/exploration', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'arcade'],
      words: ['overworld', 'level', 'stage', 'trail', 'explore', 'walk', 'adventure', 'journey', 'happy', 'cheerful', 'bouncy', 'chiptune', '8-bit', 'retro'],
      license: 'draft',
    },
    tempo: [120, 156, 138],
    defaults: { intensity: 0.85, bars: 16, inst: 'Chiptune', bright: 0.6, space: 0.08 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.35),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'G', low: 0 }),            // roots climb: G G C D | E C D D
      arrangement(LAYERS),
      // "Bounce" also leans on the beat: the 16ths between the 8th notes get softer as it rises
      { id: 'acc', type: 'expr', expr: '1 - swing*0.5*(1 - c16p)' },

      // --- drums: kick on 1 and 3, noise snare on 2 and 4, closed hat on 8ths (16ths when everything is in)
      drumRow('kT', 'X.......X.......'),
      { id: 'kP', type: 'env', trig: 'kT', points: [[0, 150], [0.06, 52, 'exp']] },
      { id: 'kO', type: 'osc', wave: 'tri', freq: 'kP' },
      { id: 'kA', type: 'ad', trig: 'kT', attack: 0.001, decay: 0.15, curve: 2 },
      { id: 'nz', type: 'noise' },
      drumRow('sT', with4and8('....X.......X...', '....X.......X..x', '....X.....x.X.x.')),
      { id: 'sA', type: 'ad', trig: 'sT', attack: 0.001, decay: 0.1, curve: 2.4 },
      { id: 'sN', type: 'filter', mode: 'bp', in: 'nz', freq: 1900, q: 0.8 },
      drumRow('h8', 'x.x.x.x.x.x.x.x.'),
      drumRow('h16', 'XoxoXoxoXoxoXoxo'),
      { id: 'hT', type: 'expr', expr: 'gBusy > 0.5 ? h16 : h8' },
      { id: 'hV', type: 'sah', in: 'hT', trig: 'hT' },
      { id: 'hA', type: 'ad', trig: 'hT', attack: 0.0005, decay: 0.03, curve: 2 },
      { id: 'hN', type: 'filter', mode: 'hp', in: 'nz', freq: '7000 + bright*2500', q: 0.8 },

      // --- bass: a triangle bouncing between the root and its octave on 8th notes; bar 8 walks up the D chord
      drumRow('bG', 'X.x.X.x.X.x.X.x.'),
      noteRow('bS', withLast('0 _ 12 _ 0 _ 12 _ 0 _ 12 _ 0 _ 12 _', '0 _ 12 _ 0 _ 12 _ 0 _ 12 _ 4 _ 7 _')),
      { id: 'bO', type: 'osc', wave: 'tri', freq: 'midi(43 + tr + bS)' },
      { id: 'bA', type: 'ad', trig: 'bG', attack: 0.002, hold: 0.07, decay: 0.12, curve: 1.4 },
      { id: 'bD', type: 'shaper', in: 'bO*bA', drive: 1.6 },

      // --- arpeggio: a thin pulse running the chord tones in 16ths (0 root, 1 third, 2 fifth, 3 octave, 4 third above)
      noteRow('aD', ['0 2 1 2 3 2 1 2 0 2 1 2 3 2 1 2', '0 2 1 2 3 2 1 2 3 2 4 2 3 2 1 2']),
      { id: 'aS', type: 'expr', expr: 'aD < 0.5 ? 0 : aD < 1.5 ? third : aD < 2.5 ? fifth : aD < 3.5 ? 12 : 12 + third' },
      { id: 'aO', type: 'osc', wave: 'pulse', width: 0.25, freq: 'midi(55 + tr + aS)' },
      { id: 'aA', type: 'ad', trig: 'c16', attack: 0.002, decay: 0.095, curve: 1.3 },
      { id: 'aF', type: 'filter', mode: 'lp', in: 'aO*aA*acc', freq: '1800 + bright*6000', q: 0.9 },

      // --- harmony: two detuned pulses holding thirds, pushed again on every half bar
      noteRow('hLo', HOLD_LOW, { every: 16 }),
      noteRow('hHi', HOLD_HIGH, { every: 16 }),
      drumRow('pT', 'X.......x.......'),
      { id: 'pA', type: 'ad', trig: 'pT', attack: 0.02, hold: '120/bpm*0.5', decay: '120/bpm*0.45', curve: 1.2 },
      { id: 'pO1', type: 'osc', wave: 'pulse', width: 0.4, freq: 'midi(55 + round(key) + hLo)*0.997' },
      { id: 'pO2', type: 'osc', wave: 'pulse', width: 0.4, freq: 'midi(55 + round(key) + hHi)*1.004' },
      { id: 'pL', type: 'filter', mode: 'lp', in: '(pO1*0.65 + pO2*0.35)*pA', freq: '700 + bright*2200', q: 0.8 },
      { id: 'pR', type: 'filter', mode: 'lp', in: '(pO1*0.35 + pO2*0.65)*pA', freq: '700 + bright*2200', q: 0.8 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),
      // --- echo: the tune an octave up and a beat late, on a small square wave
      melody('e', TUNE, { shift: 4, transpose: 12, vel: false }),
      { id: 'eO', type: 'osc', wave: 'pulse', width: 0.125, freq: 'eP' },
      { id: 'eA', type: 'ad', trig: 'eG', attack: 0.002, hold: 0.05, decay: 0.14, curve: 1.3 },

      // --- mix: kick, snare, hat and bass in the centre; arpeggio bounces left and right; echo on the right
      bus({
        centre: 'kO*kA*0.7*gBeat + sN*sA*1.5*gSnare + hN*hA*hV*0.6*gBeat + bD*0.4*gBed',
        left: 'aF*(0.3 + 0.18*c16p)*gBed + pL*0.27*gFull + lF*0.8*lead*gTune + eO*eA*0.06*lead*gFull',
        right: 'aF*(0.48 - 0.18*c16p)*gBed + pR*0.27*gFull + lF*0.8*lead*gTune + eO*eA*0.2*lead*gFull',
        duck: 'kA*gBeat', duckAmount: 0.25,      // the music dips under the kick, only while the kick plays
        send: 'sN*sA*0.4*gSnare',
        level: 0.55,                             // measured: the loudest moments reach the limiter at about 1.2
      }),
    ],
    presets: {
      'Morning stroll': { intensity: 0.62, bpm: 124, bright: 0.4, swing: 0.6, lead: 0.7 },
      'Adventure': { intensity: 0.9, bpm: 138 },
      'Hurry up': { intensity: 1, bpm: 156, key: 2, bright: 0.85, swing: 0.1 },
    },
  });
}

main(build, import.meta.url);
