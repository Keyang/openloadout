#!/usr/bin/env node
// Writes sounds/thornwood-overworld.json: "Forest trail theme", the level music of the platformer kit
// (bundles/specs/kit-platformer-fantasy.md, batch P15). Built on the music kit (kit.mjs).
//
//   G major, 138 bpm, 8 bars: G G C D | Em C D D. Chiptune-leaning: a triangle bass bouncing in octaves,
//   a thin pulse arpeggio, a three-piece drum kit, two pulses holding thirds, the tune, and its echo.
//
//   node tools/compose/thornwood_overworld.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/thornwood_overworld.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/thornwood_overworld.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/thornwood_overworld.mjs             when it is ready: write sounds/thornwood-overworld.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.794, 1, 0.972, 1.5, 1.94, 0.859, 1.32, 1.14, 1.38, 0.962, 0.993, 1.21, 1.56, 1.66];

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
const HOLD_LOW = '4 4 9 11 | 9 9 7 11';      // B3 B3 E4 F#4 | E4 E4 D4 F#4
const HOLD_HIGH = '7 7 12 14 | 12 12 11 14'; // D4 D4 G4 A4  | G4 G4 F#4 A4

// Which layers play. `section` is for the Length control (the 32-bar version is bass and arpeggio, then drums,
// then the tune, then everything); `intensity` is the window in which the Intensity control brings the layer in.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },              // bass and arpeggio: always there, a little fuller as it builds
  beat: { section: 2, intensity: [0.25, 0.35] },       // kick and hat
  snare: { section: 2, intensity: [0.5, 0.6] },
  // the melody. The specification brings it in at 0.5, but looks set intensity as low as 0.4 (Night: 0.5 exactly),
  // which would mute the tune; so it is all there by 0.4
  tune: { section: 3, intensity: [0.3, 0.4] },
  full: { section: 4, intensity: [0.75, 0.85] },       // the harmony pulses and the echo line
  busy: { section: 4, intensity: [0.75, 0.76] },       // a switch: the hat goes to 16ths
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and the drums lean in as intensity climbs,
                                                       // so every step up is heard, not only the ones that add a layer
};

// The mix, part by part, so each can be measured by itself (`--measure`, and the tests).
// `arpDip` pulls the arpeggio back while the tune plays: they share 300 to 1200 Hz, and the tune must lead there.
const arpDip = '(1 - 0.3*gTune*lead)';
export const MIX = {
  kick: 'kO*kA*0.9*gBeat*gLift',
  snare: '(sN*1.85 + sB*1.7)*sA*gSnare*gLift',
  hat: 'hN*hA*hV*(0.55 + 0.5*bright)*gBeat*gLift',
  bass: 'bD*0.4*gBed',
  arpL: `aF*(0.3 + 0.18*c16p)*gBed*${arpDip}`,
  arpR: `aF*(0.48 - 0.18*c16p)*gBed*${arpDip}`,
  padL: 'pL*0.15*gFull',
  padR: 'pR*0.15*gFull',
  tune: 'lF*lead*gTune*gLift',
  echoL: 'eO*eA*0.06*lead*gFull',
  echoR: 'eO*eA*0.2*lead*gFull',
};
const LEVEL = 0.47;   // into the limiter: measured, the loudest moments (a snare on a melody note) reach it at 1.2 to 1.55
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.arpL} + ${MIX.padL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hat}`,
  bed: `${MIX.bass} + ${MIX.arpL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

const withLast = (bar, last) => [...Array(7).fill(bar), last];
const with4and8 = (bar, fourth, eighth) => [bar, bar, bar, fourth, bar, bar, bar, eighth];

export function build(gains = GAINS) {
  return assemble({
    id: 'thornwood-overworld',
    name: 'Forest trail theme',
    tags: ['music', 'overworld', 'chiptune', 'adaptive', 'loop'],
    description: 'Bright, bouncy, happy chiptune level music in short or long versions: Intensity brings in the drums, then the tune, then a second tune under it and an echo, and you can change the speed, pitch, bounce and the instrument that plays the tune.',
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
      // the kick is a sine that falls from the chord's fifth to its root, two octaves under the arpeggio: a drum that
      // rings on a note of its own shows up in every bar as a note outside the chord
      { id: 'kP', type: 'env', trig: 'kT', points: [[0, 3], [0.06, 1, 'exp']] },
      { id: 'kO', type: 'osc', freq: 'midi(31 + tr)*kP' },
      { id: 'kA', type: 'ad', trig: 'kT', attack: 0.001, hold: 0.02, decay: 0.2, curve: 2 },
      { id: 'nz', type: 'noise' },
      drumRow('sT', with4and8('....X.......X...', '....X.......X..x', '....X.....x.X.x.')),
      { id: 'sA', type: 'ad', trig: 'sT', attack: 0.001, hold: 0.01, decay: 0.14, curve: 2.2 },
      { id: 'sN', type: 'filter', mode: 'bp', in: 'nz', freq: 1900, q: 0.8 },
      { id: 'sB', type: 'filter', mode: 'bp', in: 'nz', freq: 420, q: 0.9 },   // the snare's body: low noise, with no pitch of its own
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
      { id: 'bD', type: 'shaper', in: 'bO*bA', drive: '1 + bright' },      // Brightness also gives the bass more edge

      // --- arpeggio: a thin pulse running the chord tones in 16ths (0 root, 1 third, 2 fifth, 3 octave, 4 third above)
      noteRow('aD', ['0 1 2 1 3 2 1 2 0 1 2 1 3 2 4 2', '0 1 2 1 3 2 1 2 3 1 4 2 3 2 1 2']),
      { id: 'aS', type: 'expr', expr: 'aD < 0.5 ? 0 : aD < 1.5 ? third : aD < 2.5 ? fifth : aD < 3.5 ? 12 : 12 + third' },
      // while the tune plays the arpeggio drops an octave, under the tune's register (300 to 1200 Hz), and comes back when it stops
      { id: 'aO', type: 'osc', wave: 'pulse', width: 0.25, freq: 'midi((gTune*lead > 0.5 ? 43 : 55) + tr + aS)' },
      { id: 'aA', type: 'ad', trig: 'c16', attack: 0.002, decay: 0.095, curve: 1.3 },
      { id: 'aF', type: 'filter', mode: 'lp', in: 'aO*aA*acc', freq: '1000 + bright*7000', q: 0.9 },

      // --- harmony: two detuned pulses holding thirds, pushed again on every half bar
      noteRow('hLo', HOLD_LOW, { every: 16 }),
      noteRow('hHi', HOLD_HIGH, { every: 16 }),
      drumRow('pT', 'X.......x.......'),
      { id: 'pA', type: 'ad', trig: 'pT', attack: 0.02, hold: '120/bpm*0.5', decay: '120/bpm*0.45', curve: 1.2 },
      { id: 'pO1', type: 'osc', wave: 'pulse', width: 0.4, freq: 'midi(55 + round(key) + hLo)*0.997' },
      { id: 'pO2', type: 'osc', wave: 'pulse', width: 0.4, freq: 'midi(55 + round(key) + hHi)*1.004' },
      { id: 'pL', type: 'filter', mode: 'lp', in: '(pO1*0.65 + pO2*0.35)*pA', freq: '500 + bright*2800', q: 0.8 },
      { id: 'pR', type: 'filter', mode: 'lp', in: '(pO1*0.35 + pO2*0.65)*pA', freq: '500 + bright*2800', q: 0.8 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),
      // --- echo: the tune an octave up and a beat late, on a small square wave
      melody('e', TUNE, { shift: 4, transpose: 12, vel: false, voice: [43, 108] }),   // a small square: it plays up to C8
      { id: 'eO', type: 'osc', wave: 'pulse', width: 0.125, freq: 'eP' },
      { id: 'eA', type: 'ad', trig: 'eG', attack: 0.002, hold: 0.05, decay: 0.14, curve: 1.3 },

      // --- mix: kick, snare, hat and bass in the centre; arpeggio bounces left and right; echo on the right
      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.bass}`,
        left: `${MIX.arpL} + ${MIX.padL} + ${MIX.tune} + ${MIX.echoL}`,
        right: `${MIX.arpR} + ${MIX.padR} + ${MIX.tune} + ${MIX.echoR}`,
        duck: 'kA*gBeat', duckAmount: 0.25,      // the music dips under the kick, only while the kick plays
        send: 'sN*sA*0.4*gSnare',
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Morning stroll': { intensity: 0.62, bpm: 128, bright: 0.4, swing: 0.6, lead: 0.7 },
      'Adventure': { intensity: 0.9, bpm: 138 },
      'Hurry up': { intensity: 1, bpm: 148, key: 2, bright: 0.85, swing: 0.1 },
    },
  });
}

main(build, import.meta.url, { layers: PARTS });
