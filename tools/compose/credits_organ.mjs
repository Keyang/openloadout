#!/usr/bin/env node
// Writes sounds/credits-organ.json: "Evensong for the Fallen Torch", end-credits music on the organ band
// (docs/music-styles.md). Built on the music kit (kit.mjs) and band('organ').
//
//   D major, 72 bpm, 8 bars: D Bm G D | Em G Asus4 A. A warm candlelit hymn after the quest: held drawbar-organ chords
//   through the rotary swirl (there even at Intensity 0), a pedal bass (a dotted half and a passing quarter per bar),
//   a slow tune whose first two-bar shape returns in bars 5 and 6, an organ counter-line on a brighter drawbar mix in
//   the tune's held notes, and, only at the top, a brushed snare, a soft ride and a short kick on 1. The suspension in
//   bar 7 (D over A) resolves to C# in bar 8, and the A chord carries each pass back to D.
//
//   node tools/compose/credits_organ.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_organ.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/credits_organ.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_organ.mjs             when it is ready: write sounds/credits-organ.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';
import { drawbarOrgan, rotary } from '../../sound/voices.js';

const B = band('organ');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.773, 1.03, 0.962, 1.71];

export const CHORDS = 'D Bm G D | Em G Asus4 A';

// The tune, one token per 16th, as a hymn moves: a dotted quarter that steps down an eighth, then quarters and halves.
// Bars 1 and 2 fall from F# and settle down the Bm chord; bar 3 climbs to the top G; bar 4 rests on D. Bars 5 and 6
// are bars 1 and 2 again a step higher (G F# E over Em, then down the G chord); bar 7 leans on D over Asus4 and bar 8
// resolves it to C#, then climbs to E, a step below the F# that starts the loop again.
export const TUNE = [
  'F#5 _ _ _ _ _ E5- _ D5 _ _ _ E5- _ _ _',     // D      F#, E, D, E
  'F#5 _ _ _ _ _ _ _ D5- _ _ _ B4 _ _ _',       // Bm     F# held, then down the chord
  'D5 _ _ _ _ _ E5- _ G5 _ _ _ F#5- _ _ _',     // G      up to the top G (the one leap: a fourth)
  'E5- _ _ _ D5 _ _ _ _ _ _ _ _ _ _ _',         // D      home for a moment
  'G5 _ _ _ _ _ F#5- _ E5 _ _ _ F#5- _ _ _',    // Em     bar 1 again, a step higher
  'G5 _ _ _ _ _ _ _ D5- _ _ _ B4 _ _ _',        // G      bar 2 again, down the G chord
  'A4 _ _ _ _ _ D5- _ E5 _ _ _ D5- _ _ _',      // Asus4  the suspension: A, D, E
  'C#5 _ _ _ _ _ _ _ A4- _ _ _ E5 _ _ _',       // A      D falls to C#, then up to E, back to F#
];

// The counter-line on the brighter organ: one note under each held tune note, a short climb where the tune rests.
export const ANSWER = [
  '_ _ _ _ A4- _ _ _ _ _ _ _ F#4- _ _ _',       // D
  '_ _ _ _ B4- _ _ _ _ _ _ _ D4- _ _ _',        // Bm
  '_ _ _ _ B4- _ _ _ _ _ _ _ D5- _ _ _',        // G
  '_ _ _ _ D4- _ _ _ F#4- _ _ _ A4- _ _ _',     // D      climbs the D chord while the tune holds
  '_ _ _ _ B4- _ _ _ _ _ _ _ G4- _ _ _',        // Em
  '_ _ _ _ B4- _ _ _ _ _ _ _ D5- _ _ _',        // G
  '_ _ _ _ E4- _ _ _ _ _ _ _ A4- _ _ _',        // Asus4
  '_ _ _ _ E4- _ _ _ A4- _ _ _ C#5- _ _ _',     // A      climbs the A chord back to the top
];

// The pedal bass: the root for a dotted half, then a passing quarter (semitones above this bar's root) that leads on.
// D C# | B A | G A | D F# | E F# | G E | A E | A C# (back to D).
const PASSING = [-1, -2, 2, 4, 2, -3, 7, 4];
const BASS_SEMIS = PASSING.map((p) => `0 _ _ _ _ _ _ _ _ _ _ _ ${p} _ _ _`);

// Which layers play, in the brief's intensity order: the organ chords always (no gate); the pedal bass; the tune;
// the bright organ answer; the kit only at the top. Length: the 32-bar version is organ and bass, then the tune,
// then the answer, then the kit.
export const LAYERS = {
  bass: { intensity: [0.1, 0.2] },
  tune: { section: 2, intensity: [0.25, 0.35] },      // all there by 0.35: whole-bundle looks go as low as 0.5
  answer: { section: 3, intensity: [0.45, 0.55] },
  kit: { section: 4, intensity: [0.72, 0.82] },       // only at the top, above the band's own window
  lift: { intensity: [0.25, 1], floor: 0.75 },        // the tune and the kit lean in as intensity climbs
};

// The organ chords dip while the tune plays: they share 300 to 1200 Hz, and the tune must lead there.
const DIP = '0.45*gTune*lead';
export const MIX = {
  kick: 'kO*0.5*gKit*gLift',
  snare: 'sO*0.26*gKit*gLift',
  rideL: 'rO*0.1*gKit*gLift*(0.45 + 1.1*bright)',      // a soft ride whose shimmer grows with Brightness
  rideR: 'rO*0.15*gKit*gLift*(0.45 + 1.1*bright)',
  bass: 'bO*0.22*gBass',
  organL: 'oL*0.42',
  organR: 'oR*0.42',
  tune: 'lF*0.55*lead*gTune*gLift',
  answerL: 'eB*0.28*gAnswer',
  answerR: 'eB*0.16*gAnswer',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.organL} + ${MIX.answerL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.rideL}`,
  bass: MIX.bass,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

// The held chords on the whole drawbar set: the foundation (1x, 2x, 3x) always sounds, the upper drawbars (4x, 6x, 8x)
// are pulled out by Brightness. Through the band's rotary swirl, dipped while the tune plays.
const CHORD_NOTES = ['midi(48 + tonic + tr)', 'midi(48 + tonic + tr + third)', 'midi(48 + tonic + tr + fifth)'];
const UPPER = '(0.1 + 1.5*bright)';
const ORGAN_LP = '600 + bright*7000';
function heldOrgan(id, { trig, dip, noise }) {
  const hold = '240/bpm*0.9';
  return [
    ...drawbarOrgan(`${id}o`, { trig, pitches: CHORD_NOTES, partials: [1, 2, 3], hold, noise }),
    ...drawbarOrgan(`${id}u`, { trig, pitches: CHORD_NOTES, partials: [4, 6, 8], hold, noise }),
    { id: `${id}D`, type: 'expr', expr: `(${id}oO*0.72 + ${id}uO*0.3*${UPPER})*(1 - (${dip}))` },
    ...rotary(id, { input: `${id}D` }),
  ];
}

// The answer's brighter drawbar mix: a thin foundation (1x, 2x) under a strong upper set (4x, 6x, 8x), so it sings
// above the held chords instead of blending into them; its low-pass opens further than the chords'.
const ANSWER_LP = '1500 + bright*8000';
function brightOrgan(id, { trig, pitch, noise }) {
  const hold = '60/bpm*0.85';
  return [
    ...drawbarOrgan(`${id}f`, { trig, pitch, partials: [1, 2], hold, noise }),
    ...drawbarOrgan(`${id}h`, { trig, pitch, partials: [4, 6, 8], hold, noise }),
    { id: `${id}O`, type: 'expr', expr: `${id}fO*0.55 + ${id}hO*(0.5 + 0.6*bright)` },
  ];
}

export function build(gains = GAINS) {
  const kit = B.drums({ kick: 'kT', snare: 'sT', ride: 'rT', noise: 'nz' });   // -> kO, sO, rO; kit.duck = 'kA'
  const organ = heldOrgan('p', { trig: 'hG', dip: DIP, noise: 'nz' });          // -> pL, pR
  return assemble({
    id: 'credits-organ',
    name: 'Evensong for the Fallen Torch',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'A warm, slow synthesised organ hymn for the end credits after the quest, in short or long versions: Intensity brings in the pedal bass, then the tune, a brighter answering organ line and, at the top, a soft brushed beat, and you can change the speed, pitch, room and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg'],
      words: ['credits', 'ending', 'epilogue', 'finale', 'organ', 'hymn', 'chapel', 'candlelit', 'warm', 'farewell', 'evensong', 'proud'],
      license: 'draft',
    },
    tempo: B.checkTempo([64, 84, 72]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Synth lead' },
    extraParams: [param('lead', 'Melody', 0, 1, 0.8)],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'D' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the kit, only at the top: a short kick on 1, a brushed snare on 2 and 4, a soft ride on quarters
      drumRow('kT', 'X...............'),
      drumRow('sT', ['....x.......x...', '....x.......x...', '....x.......x...', '....x.......x.o.']),
      drumRow('rT', 'x...o...x...o..o'),
      kit,

      // --- the pedal bass: a dotted half on the root, a passing quarter on beat 4
      drumRow('bG', 'X...........x...'),
      noteRow('bS', BASS_SEMIS),
      B.bass('b', { trig: 'bG', semis: 'bS', noise: 'nz' }),

      // --- the organ: the chord held all bar, through the rotary swirl
      drumRow('hG', 'X...............'),
      organ,
      // Brightness also opens a low-pass over the organ: covered at 0, open and ringing at 1
      { id: 'oL', type: 'filter', mode: 'lp', in: 'pL', freq: ORGAN_LP, q: 0.7 },
      { id: 'oR', type: 'filter', mode: 'lp', in: 'pR', freq: ORGAN_LP, q: 0.7 },

      // --- the tune, on whichever instrument the listener picks; slow notes ring longer
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.5 }),

      // --- the answer, on the brighter drawbar mix
      melody('e', ANSWER, { voice: B.range }),
      brightOrgan('e', { trig: 'eG', pitch: 'eP', noise: 'nz' }),
      { id: 'eB', type: 'filter', mode: 'lp', in: 'eO', freq: ANSWER_LP, q: 0.7 },

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.organL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.rideL}`,
        right: `${MIX.organR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.rideR}`,
        duck: `${kit.duck}*gKit`, duckAmount: 0.12,
        send: 'sO*0.2*gKit',
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% and stop at the range: the slow style sits over 64, the full one under 84
      'Credits roll': { intensity: 0.85, bpm: 72 },
      'Chapel empties': { intensity: 0.4, bpm: 68, bright: 0.35, space: 0.45 },
      'Torch raised high': { intensity: 1, bpm: 78, bright: 0.7, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
