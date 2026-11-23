#!/usr/bin/env node
// Writes sounds/derelict-run.json: "Station run theme", the room-to-room music of the sci-fi roguelite kit
// (bundles/specs/kit-roguelite-scifi.md, batch S21). Built on the music kit (kit.mjs).
//
//   E minor, 126 bpm, 8 bars: Em Em C D | Em Em G F (the F major chord of bar 8 is the dark, Phrygian turn home).
//   Synthwave: a saw bass in running 16ths whose filter opens on each note, a kick on every beat with an off-beat
//   hat and a clap on 2 and 4, a wide pad of detuned saws, a thin pulse arpeggio in 8ths with an echo, a sparse
//   tune with a dotted-8th echo, and a noise riser in the last bar of each section.
//
//   node tools/compose/derelict_run.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/derelict_run.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/derelict_run.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/derelict_run.mjs             when it is ready: write sounds/derelict-run.json
import {
  param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main,
  eightBars, chordTone, kickDrum, hatDrum, clap, acidBass, sawPad, riser, tempoEcho,
} from './kit.mjs';

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.795, 1.04, 0.981, 2.02, 2.39, 0.867, 1.3, 1.15, 1.37, 0.598, 0.842, 0.939, 1.3, 1.09, 1.76];

export const CHORDS = 'Em Em C D | Em Em G F';

// The tune, one token per 16th. Sparse: a three-note figure that falls a step and a third (E D B), each note a
// dotted quarter after the last, so the dotted-8th echo lands exactly between the notes; two bars later the same
// figure a third higher (G F# D, its last note becoming the root of the D chord); then both again, and one long
// F over the F chord of bar 8, a semitone above the E the loop starts on.
export const TUNE = [
  'E5 _ _ _ _ _ D5- _ _ _ _ _ B4 _ _ _',     // Em   the figure: down a step, down a third
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',          // Em   B rings; the echo answers
  'G5 _ _ _ _ _ F#5- _ _ _ _ _ D5 _ _ _',    // C    the figure, a third higher
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',          // D    D rings on as the chord's root
  'E5 _ _ _ _ _ D5- _ _ _ _ _ B4 _ _ _',     // Em   the figure returns
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',          // Em
  'G5 _ _ _ _ _ F#5- _ _ _ _ _ D5 _ _ _',    // G    a third higher again, now on the G chord
  'F5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',         // F    one long note that wants to fall to E
];

// What the pad holds in each bar, in semitones above E3: three voices that move by step from chord to chord.
//                 Em Em C  D  | Em Em G  F
const PAD_LOW = '0 0 0 2 | 0 0 -2 1';     // E3 E3 E3 F#3 | E3 E3 D3 F3
const PAD_MID = '3 3 3 5 | 3 3 3 5';      // G3 G3 G3 A3  | G3 G3 G3 A3
const PAD_HIGH = '7 7 8 10 | 7 7 7 8';    // B3 B3 C4 D4  | B3 B3 B3 C4

// Which layers play. `section` is for the Length control (the 32-bar version is pad and bass, then drums, then the
// arpeggio, then everything); `intensity` is the window in which the Intensity control brings the layer in.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },              // pad and bass: always there, a little fuller as it builds
  open: { intensity: [0.25, 0.5], floor: 0.1 },        // not a layer: how far the bass filter opens (nearly shut below 0.25)
  beat: { section: 2, intensity: [0.25, 0.35] },       // kick and off-beat hat
  clap: { section: 2, intensity: [0.5, 0.6] },
  arp: { section: 3, intensity: [0.55, 0.7] },
  // The melody. The specification adds it at 0.75, but whole-bundle looks set intensity as low as 0.5 (Night) and a
  // look must keep the tune (style guide, section 12), so it is in, held back, by 0.4 ...
  tune: { section: 4, intensity: [0.3, 0.4] },
  // ... and comes to the front from 0.75, with its echo and the riser, where the specification puts it
  lift: { intensity: [0.75, 0.95], floor: 0.66 },
  top: { section: 4, intensity: [0.75, 0.9] },         // the melody's echo
  rise: { intensity: [0.75, 0.9] },                    // the riser, in the last bar of every section
};

// The mix, part by part, so each can be measured by itself (`--measure`).
// `arpDip` and `padDip` pull the arpeggio and the pad back while the tune plays: they share 300 to 1200 Hz, and the
// tune must lead there by 5 dB on every instrument (the Bell has the least in that band: it sets these numbers).
const arpDip = '(1 - 0.67*gTune*lead)';
const padDip = '(1 - 0.4*gTune*lead)';
export const MIX = {
  kick: 'kD*0.82/(1.06 + 1.1*grit)*gBeat',              // Grit squares the kick off; the division keeps its level
  drums: 'dC',                                           // hat and clap, through the Grit crusher
  bass: 'bD*0.42*(1 - 0.44*smooth(0, 0.5, grit))*(0.7 + 0.3*gOpen)*gBed',   // the same for the bass's shaper
  padL: `pL*0.6*gBed*${padDip}`,
  padR: `pR*0.6*gBed*${padDip}`,
  arpL: `arL*0.34*gArp*${arpDip}`,
  arpR: `arL*0.18*gArp*${arpDip}`,
  arpEchoL: `aeO*0.11*gArp*${arpDip}`,
  arpEchoR: `aeO*0.26*gArp*${arpDip}`,
  tune: 'lF*lead*1.1*gTune*gLift',
  echoL: 'ecO*0.55*lead*gTop',
  echoR: 'ecO*0.25*lead*gTop',
  riser: 'rsO*0.45*gRise',
};
const LEVEL = 0.49;   // into the limiter: measured, the loudest moments (a clap on a melody note) reach it at about 1.2
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.padL} + ${MIX.arpL} + ${MIX.arpEchoL}`,
  drums: `${MIX.kick} + ${MIX.drums}`,
  bed: `${MIX.bass} + ${MIX.padL}`,
  under: `${MIX.padL} + ${MIX.arpL} + ${MIX.arpEchoL} + ${MIX.bass}`,      // everything pitched under the tune, bass too
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'derelict-run',
    name: 'Station run theme',
    tags: ['music', 'synthwave', 'electronic', 'adaptive', 'loop'],
    description: 'Dark, driving electronic music for moving through a dead space station, in short or long versions: Intensity opens up the bass, then brings in the drums, a fast run of notes and the tune with its echo, and you can change the speed, pitch, grit and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/exploration', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'],
      words: ['station', 'run', 'level', 'floor', 'explore', 'corridor', 'synthwave', 'electronic', 'synth', 'dark', 'driving', 'tense', 'retro', 'arpeggio'],
      license: 'draft',
    },
    tempo: [112, 140, 126],
    defaults: { intensity: 0.85, bars: 16, inst: 'Synth lead', bright: 0.6, space: 0.08 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('grit', 'Grit', 0, 1, 0.35),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'E' }),                    // bass roots: E E C D | E E G F, the C and D below the E
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: a kick on every beat (it lands on the chord root), a hat on the off-beats, a clap on 2 and 4
      drumRow('kT', 'X...X...X...X...'),
      kickDrum('k', 'kT', { low: 28, from: 4, fall: 0.05, decay: 0.2 }),
      { id: 'kD', type: 'shaper', in: 'kO', drive: '1 + grit*3' },          // Grit squares the kick off
      drumRow('hT', eightBars('..X...X...X...X.', { 4: '..X...X...X...Xo', 8: '..X...X...X..oX.' })),
      hatDrum('h', 'hT', { noise: 'nz', decay: 0.05 }),
      drumRow('cT', eightBars('....X.......X...', { 8: '....X.......X..x' })),
      clap('cl', 'cT', { noise: 'nz', freq: 1300 }),
      // Grit also crushes the hat and the clap: fewer bits and a lower sample rate
      { id: 'dC', type: 'crush', in: 'hO*(0.5 + 0.75*bright)*gBeat + clO*0.9*gClap', bits: '13 - grit*9.5', rate: '26000 - grit*21500' },

      // --- bass: one saw in running 16ths, its filter opening on every note; an octave pop on the off-beats of 2 and 4
      drumRow('bT', 'XoxoXoxoXoxoXoxo'),
      noteRow('bS', eightBars('0 0 0 0 0 0 12 0 0 0 0 0 0 0 12 0', { 8: '0 0 0 0 0 0 12 0 0 0 12 0 0 12 0 12' })),
      acidBass('b', 'bT', { pitch: 'midi(40 + tr + bS)', floor: '110 + 60*gOpen', open: 'gOpen*(500 + bright*2400)', q: 1.8, hold: 0.025, decay: 0.08 }),
      { id: 'bD', type: 'shaper', in: 'bO', drive: '1 + grit*5' },      // Grit drives the bass into a shaper

      // --- pad: three pairs of detuned saws holding the chord, swelling at the start of every bar
      noteRow('pLo', PAD_LOW, { every: 16 }),
      noteRow('pMi', PAD_MID, { every: 16 }),
      noteRow('pHi', PAD_HIGH, { every: 16 }),
      drumRow('pT', 'X...............'),
      sawPad('p', ['midi(52 + round(key) + pLo)', 'midi(52 + round(key) + pMi)', 'midi(52 + round(key) + pHi)'], { trig: 'pT', attack: 0.4, sustain: 0.55, cutoff: '350 + bright*3300' }),

      // --- arpeggio: a thin pulse climbing the chord tones in 8ths, with a dotted-8th echo on the other side
      drumRow('arT', 'X.x.x.x.X.x.x.x.'),
      noteRow('arD', '0 1 2 3 1 2 3 4 | 0 1 2 3 2 3 4 5', { every: 2 }),
      chordTone('arS', 'arD'),
      { id: 'arW', type: 'osc', wave: 'pulse', width: 0.2, freq: 'midi(52 + tr + arS)' },
      { id: 'arA', type: 'ad', trig: 'arT', attack: 0.003, hold: 0.04, decay: 0.14, curve: 1.4 },
      { id: 'arL', type: 'filter', mode: 'lp', in: 'arW*arA', freq: '700 + bright*3800', q: 1 },
      tempoEcho('ae', 'arL', { steps: 3, feedback: 0.35, tone: '1000 + bright*1500' }),

      // --- the tune, on whichever instrument the listener picks; long notes, and an echo a dotted 8th behind
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 2.4 }),
      tempoEcho('ec', 'lF', { steps: 3, feedback: 0.5, tone: '1800 + bright*2500' }),

      // --- riser: a hiss that climbs through the last bar of every section
      riser('rs', { noise: 'nz', low: 500, high: '3500 + bright*4500' }),

      // --- mix: kick, hat, clap and bass in the centre; the pad wide; the arpeggio left and its echo right; the
      // tune in the centre and its echo to the left
      bus({
        centre: `${MIX.kick} + ${MIX.drums} + ${MIX.bass}`,
        left: `${MIX.padL} + ${MIX.arpL} + ${MIX.arpEchoL} + ${MIX.tune} + ${MIX.echoL} + ${MIX.riser}`,
        right: `${MIX.padR} + ${MIX.arpR} + ${MIX.arpEchoR} + ${MIX.tune} + ${MIX.echoR} + ${MIX.riser}`,
        duck: 'kA*gBeat', duckAmount: 0.35,      // the pump: everything but the drums and bass dips under the kick
        send: 'dC*0.35', size: 0.85,              // the hat and clap ring in the room too; a long tail, so Room is heard
        level: LEVEL,
        drive: '1 + grit*0.25',                   // Grit also leans the whole mix on the limiter
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Deck one': { intensity: 0.45, bpm: 120, bright: 0.45, grit: 0.2 },
      'Deep station': { intensity: 0.7, bpm: 126, key: -2, bright: 0.5, space: 0.14 },
      'Overrun': { intensity: 1, bpm: 133, bright: 0.8, grit: 0.75, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { layers: PARTS });
