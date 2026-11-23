#!/usr/bin/env node
// Writes sounds/cloudreach-gale.json: "Gale theme", the tense-level music of the Cloudreach precision-platformer kit
// (bundles/specs/kit-platformer-cloudreach.md, batch CM2), on the organ band (docs/music-styles.md). Built on the
// music kit (kit.mjs) and band('organ'), after menu_organ.mjs, played half as fast again.
//
//   F sharp minor, 120 bpm, 8 bars: F#m A E Bm | F#m D E C#. Driven, cold, breathless: pipes with the wind in them.
//   A pedal bass in 8ths (the root, the fifth on the last 8th of each bar), the chords broken on one low organ voice
//   (three 16ths and a rest, four times a bar: root, third, fifth) through the rotary swirl, a ride on the 8ths, a
//   tune pushed off the beat (every phrase starts on the "and" of 1) that climbs in bars 5 to 8 and holds the
//   leading note over C sharp, a kick on 1 and 3, a brushed snare on 2 and 4, and at the top the band's organ under
//   the tune, a sixth below, in bars 5 to 8. The broken chords sit an octave above the specification's (from F
//   sharp 4, not F sharp 3) so that the quiet end of Intensity is not all below 300 Hz (review, 2026-11-22).
//
//   node tools/compose/cloudreach_gale.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/cloudreach_gale.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/cloudreach_gale.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/cloudreach_gale.mjs             when it is ready: write sounds/cloudreach-gale.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, chordTone, melody, instruments, bus, assemble, main } from './kit.mjs';
import { drawbarOrgan, pedalBass, rotary } from '../../sound/voices.js';

const B = band('organ');

// Level of each melody instrument for this tune, from `--match`. Run `--match` again after any change to the tune.
// Fifteen: the ten melody instruments, then the five that play along.
export const GAINS = [1, 0.795, 1.05, 0.989, 1.66, 2.1, 0.851, 1.26, 1.21, 1.34, 0.685, 0.776, 0.828, 1.21, 1.24];

export const CHORDS = 'F#m A E Bm | F#m D E C#';

// The tune, one token per 16th. A 2-bar phrase pushed off the beat: three 8th notes from the "and" of 1, C sharp, A,
// C sharp, then F sharp held (F#m); then down by steps from E to C sharp over A, and a rest. Bars 3 and 4 say it a
// step lower over E and settle on D, then B, over Bm. Bars 5 to 8 climb: F sharp, G sharp, A in quarter notes; A held
// over D with a turn down to F sharp; G sharp and E over E; and the leading note, E sharp, held over C sharp, so the
// loop is pulled back to F sharp. Every phrase starts on the "and" of 1 and no run is longer than four notes.
export const TUNE = [
  '_ _ C#5 _ A4 _ C#5 _ F#5 _ _ _ _ _ _ _',       // F#m  C sharp, A, C sharp, up to F sharp, held
  '_ _ E5 _ _ _ D5- _ C#5 _ _ _ _ _ _ _',         // A    down by steps, E, D, C sharp, and a rest
  '_ _ B4 _ G#4 _ B4 _ E5 _ _ _ _ _ _ _',         // E    bar 1 a step lower
  '_ _ D5 _ _ _ _ _ B4 _ _ _ _ _ _ _',            // Bm   settles: D, then B
  '_ _ F#5 _ _ _ G#5 _ _ _ A5 _ _ _ _ _',         // F#m  the climb, in quarter notes off the beat
  '_ _ A5 _ _ _ _ _ _ _ _ _ F#5- _ _ _',          // D    A held, a turn down to F sharp
  '_ _ G#5 _ _ _ _ _ E5 _ _ _ _ _ _ _',           // E    G sharp, then E
  '_ _ E#5 _ _ _ _ _ _ _ _ _ _ _ _ _',            // C#   the leading note, held
];

// The lower voice at the top of Intensity: the tune of bars 5 to 8 a sixth below, on the band's organ. A key stays
// down for a beat and a half (UNDER_HOLD) or until the next note, so every note that sounds longer than an 8th is a
// note of its bar's chord: the two passing notes (B over F sharp minor, C sharp over D) are one 8th each and step
// up to a chord note, which arrives an 8th before the tune does.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const UNDER = [
  REST, REST, REST, REST,
  '_ _ A4 _ _ _ B4- _ C#5 _ _ _ _ _ _ _',         // F#m  A under F sharp, B passing (an 8th), C sharp under A
  '_ _ C#5- _ D5 _ _ _ _ _ A4 _ _ _ _ _',         // D    C sharp passing (an 8th), D under the held A, A under the turn
  '_ _ B4 _ _ _ _ _ G#4 _ _ _ _ _ _ _',           // E    under G sharp, then E
  '_ _ G#4 _ _ _ _ _ C#5- _ _ _ _ _ _ _',         // C#   under the leading note, then up to the chord's root
];
const UNDER_HOLD = '90/bpm';                       // six 16ths: no note rings into the next bar

// The pedal bass in 8ths: the root, and the fifth on the last 8th of each bar.
export const BASS_GATE = 'X.x.x.x.X.x.x.x.';
export const BASS_SEMIS = '0 _ 0 _ 0 _ 0 _ 0 _ 0 _ 0 _ 7 _';
// The broken chords: three 16ths and a rest, four times a bar, root, third, fifth (chord-tone numbers).
export const ARP_GATE = 'Xxx.Xxx.Xxx.Xxx.';
export const ARP_TONES = '0 1 2 _ 0 1 2 _ 0 1 2 _ 0 1 2 _';

// Which layers play, in the specification's intensity order: the broken organ, the bass and the ride always; the
// tune and the kick from 0.25 (the tune all there by 0.4: whole-bundle looks go as low as 0.4); the brushed snare
// from 0.5; the lower voice from 0.75. Length: the 32-bar version is organ and bass, then the tune, then the kit,
// then everything (the lower voice, and the tune and the kit a little louder).
export const LAYERS = {
  tune: { section: 2, intensity: [0.25, 0.4] },
  ride: { section: 3 },                                // at every intensity; with the kit in the long versions
  kick: { section: 3, intensity: [0.25, 0.35] },
  snare: { section: 3, intensity: [0.5, 0.6] },
  under: { section: 4, intensity: [0.75, 0.85] },      // the organ a sixth below the tune, bars 5 to 8
  lift: { intensity: [0.25, 1], floor: 0.5 },         // not a layer: the tune and the kit lean in as intensity climbs
  full: { section: 4 },                                // not a layer: the tune and the kit lean in for the last section
};

// The broken organ dips while the tune plays, as the band's chord voice does.
const DIP = '0.4*gTune*lead';
// Brightness opens a low-pass over the organ (the broken chords and the lower voice): covered at 0, open at 1.
const ORGAN_LP = '700 + bright*6500';
// Grit drives the organ and the bass into a shaper; each division keeps the level about where it was.
const ORGAN_DRIVE = '1 + grit*7';
const BASS_DRIVE = '1 + grit*4';
// The last section of a long version is a step up: the lower voice, and the tune and the kit a little louder.
const LEAN = '(0.92 + 0.08*gFull)';
export const MIX = {
  kick: `kO*0.6*gKick*gLift*${LEAN}`,
  snare: `sO*0.3*gSnare*gLift*${LEAN}`,
  rideL: `rO*0.15*gRide*(0.45 + 1.1*bright)*${LEAN}`,   // the ride's shimmer grows with Brightness
  rideR: `rO*0.2*gRide*(0.45 + 1.1*bright)*${LEAN}`,
  bass: 'bX*0.24*(0.8 + 0.2*gTune)',                 // a little lower while the tune is away: the quiet end is not all bass
  organL: 'oL*0.25',
  organR: 'oR*0.25',
  tune: `lF*0.55*lead*gTune*gLift*${LEAN}`,
  underL: 'uLf*0.62*gUnder',                         // loud enough that the top of Intensity and section 4 are a step up
  underR: 'uRf*0.5*gUnder',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: MIX.organL,
  under: MIX.underL,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.rideL}`,
  bass: MIX.bass,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const kit = B.drums({ kick: 'kT', snare: 'sT', ride: 'rT', noise: 'nz' });   // -> kO, sO, rO; kit.duck = 'kA'
  return assemble({
    id: 'cloudreach-gale',
    name: 'Gale theme',
    tags: ['music', 'level', 'storm', ...B.tags, 'adaptive', 'loop'],
    description: 'Driven, cold, breathless synthesised organ music for a storm level or a wind temple, in short or long versions: fast broken chords and a pulsing deep bass under a tune that climbs, Intensity brings in the tune and a thump on the beat, then a brushed beat, then a second organ under the tune, and you can change the speed, pitch, grit, room and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/battle', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer', 'arcade'],
      words: ['storm', 'gale', 'wind', 'temple', 'tense', 'level', 'organ', 'pipes', 'driven', 'cold', 'breathless', 'danger', 'chase', 'climb'],
      license: 'draft',
    },
    tempo: B.checkTempo([108, 132, 120]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Synth lead', space: 0.2 },
    extraParams: [param('lead', 'Melody', 0, 1, 0.8), param('grit', 'Grit', 0, 1, 0.15)],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'F#' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the light kit: a ride on the 8ths, a short kick on 1 and 3, a brushed snare on 2 and 4
      drumRow('kT', 'X.......x.......'),
      drumRow('sT', '....x.......x...'),
      drumRow('rT', 'x.o.x.o.x.o.x.o.'),
      kit,

      // --- the pedal bass in 8ths: the root, the fifth on the last 8th
      drumRow('bG', BASS_GATE),
      noteRow('bS', BASS_SEMIS),
      pedalBass('b', { trig: 'bG', note: '36 + tonic', semis: 'bS', hold: '30/bpm*0.8', noise: 'nz' }),
      { id: 'bSh', type: 'shaper', in: 'bO', drive: BASS_DRIVE },
      { id: 'bX', type: 'expr', expr: 'bSh/(1 + 0.45*grit)' },

      // --- the broken chords: one low organ voice, a note at a time, through the rotary swirl (not B.chords, which
      //     holds the whole triad): the band's chord drawbars (1x, 2x, 4x), the band's dip under the tune
      drumRow('aG', ARP_GATE),
      noteRow('aN', ARP_TONES),
      chordTone('aJ', 'aN'),
      drawbarOrgan('ao', { trig: 'aG', pitch: 'midi(60 + tonic + tr + aJ)', partials: [1, 2, 4], hold: '15/bpm*0.8', noise: 'nz' }),
      { id: 'aSh', type: 'shaper', in: 'aoO', drive: ORGAN_DRIVE },
      { id: 'aD', type: 'expr', expr: `aSh/(1 + 0.6*grit)*(1 - (${DIP}))` },
      rotary('a', { input: 'aD' }),
      { id: 'oL', type: 'filter', mode: 'lp', in: 'aL', freq: ORGAN_LP, q: 0.7 },
      { id: 'oR', type: 'filter', mode: 'lp', in: 'aR', freq: ORGAN_LP, q: 0.7 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.1 }),

      // --- the lower voice: the band's organ lead through the rotary swirl, a sixth under the tune in bars 5 to 8
      melody('e', UNDER, { voice: B.range }),
      //     (B.lead is drawbarOrgan with all six drawbars and a key held for one beat; called here itself, so the key
      //     can stay down for UNDER_HOLD)
      drawbarOrgan('ex', { trig: 'eG', pitch: 'eP', hold: UNDER_HOLD, noise: 'nz' }),
      rotary('u', { input: 'exO' }),
      { id: 'uLf', type: 'filter', mode: 'lp', in: 'uL', freq: ORGAN_LP, q: 0.7 },
      { id: 'uRf', type: 'filter', mode: 'lp', in: 'uR', freq: ORGAN_LP, q: 0.7 },

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.organL} + ${MIX.tune} + ${MIX.underL} + ${MIX.rideL}`,
        right: `${MIX.organR} + ${MIX.tune} + ${MIX.underR} + ${MIX.rideR}`,
        duck: `${kit.duck}*gKick`, duckAmount: 0.15,
        send: 'sO*0.2*gSnare',
        ...B.room,
        level: LEVEL,
        drive: '1 + grit*0.4',                    // Grit also leans the whole mix on the limiter
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% and stop at the range: the slow style sits 5% over 108, the fast one 5% under 132
      'Headwind': { intensity: 0.7, bpm: 120 },
      'Temple heights': { intensity: 0.45, bpm: 114, bright: 0.4, space: 0.32, grit: 0.05 },
      'Storm front': { intensity: 1, bpm: 125, bright: 0.7, grit: 0.6, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
