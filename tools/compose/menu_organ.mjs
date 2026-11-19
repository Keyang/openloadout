#!/usr/bin/env node
// Writes sounds/menu-organ.json: "Cathedral Ledger", a title-screen theme for a gothic RPG on the organ band
// (docs/music-styles.md). Built on the music kit (kit.mjs) and band('organ').
//
//   A minor, 84 bpm, 8 bars: Am F C G | Dm Am E E. A candlelit chapel: held drawbar-organ chords through the rotary
//   swirl, a pedal bass (a dotted half and a passing quarter per bar), a slow hymn-like tune that lifts in the F and
//   C bars, an organ answer line in the tune's gaps, and a light brushed kit at higher intensity. The two bars of E
//   close on a half cadence that leads back to Am.
//
//   node tools/compose/menu_organ.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_organ.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/menu_organ.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_organ.mjs             when it is ready: write sounds/menu-organ.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';
import { drawbarOrgan, rotary } from '../../sound/voices.js';

const B = band('organ');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.783, 1.04, 0.973, 1.79];

export const CHORDS = 'Am F C G | Dm Am E E';

// The tune, one token per 16th: mostly quarter and half notes, as a hymn moves. Bars 1 to 4 fall from E, rise through the
// F chord to the top G (the turn of hope in F and C) and stop on D over G: a question. Bars 5 to 8 return to the same
// rhythm and shape a step higher (F E D over Dm, then C E A over Am, as A C F over F), fall to G# and rest on B over
// E: the half cadence that leads back to Am.
export const TUNE = [
  'E5 _ _ _ D5- _ _ _ C5 _ _ _ _ _ _ _',        // Am   E, D, C held
  'A4 _ _ _ _ _ _ _ C5- _ _ _ F5 _ _ _',        // F    A held, C, up to F
  'G5 _ _ _ _ _ _ _ E5- _ _ _ C5 _ _ _',        // C    the top G, then down the C chord
  'D5 _ _ _ _ _ _ _ _ _ C5- _ B4 _ _ _',         // G    D held, C, B: a question
  'F5 _ _ _ E5- _ _ _ D5 _ _ _ _ _ _ _',        // Dm   bar 1 again, a step higher
  'C5 _ _ _ _ _ _ _ E5- _ _ _ A5 _ _ _',        // Am   bar 2 again, on A
  'G#5 _ _ _ _ _ _ _ E5- _ _ _ D5- _ _ _',      // E    down from the leading note
  'B4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',           // E    rests on B: the half cadence
];

// The organ's answer: one note on beat 2 while the tune holds, a little walk where the tune rests (bars 4 and 8).
export const ANSWER = [
  '_ _ _ _ C5- _ _ _ _ _ _ _ _ _ _ _',          // Am
  '_ _ _ _ A4- _ _ _ _ _ _ _ _ _ _ _',          // F
  '_ _ _ _ G4- _ _ _ _ _ _ _ _ _ _ _',          // C
  '_ _ _ _ G4- _ _ _ A4- _ _ _ _ _ _ _',        // G
  '_ _ _ _ A4- _ _ _ _ _ _ _ _ _ _ _',          // Dm
  '_ _ _ _ E4- _ _ _ _ _ _ _ _ _ _ _',          // Am
  '_ _ _ _ B4- _ _ _ _ _ _ _ _ _ _ _',          // E
  '_ _ _ _ E4- _ _ _ G#4- _ _ _ B4- _ _ _',     // E    climbs the E chord back to the top
];

// The pedal bass: the root for a dotted half, then a passing quarter that leads to the next bar's root (semitones
// above this bar's root). A2 G2 | F2 A2 | C3 A2 | G2 C3 | D3 B2 | A2 F2 | E2 B2 | E2 G#2 (back to A2).
const PASSING = [-2, 4, -3, 5, -3, -4, 7, 4];
const BASS_SEMIS = PASSING.map((p) => `0 _ _ _ _ _ _ _ _ _ _ _ ${p} _ _ _`);

// Which layers play, in the brief's intensity order: the organ chords always; the pedal bass; the tune; the answer;
// the kit from 0.6. Length: the 32-bar version is organ and bass, then the tune, then the kit, then the answer.
export const LAYERS = {
  bass: { intensity: [0.1, 0.2] },
  tune: { section: 2, intensity: [0.3, 0.4] },        // all there by 0.4: whole-bundle looks go as low as 0.4
  answer: { section: 4, intensity: [0.45, 0.55] },
  kit: { section: 3, intensity: B.drumWindow },        // [0.6, 0.7], the band's window and the brief's
  lift: { intensity: [0.3, 1], floor: 0.75 },          // the tune and the kit lean in as intensity climbs
};

// The organ chords dip while the tune plays: they share 300 to 1200 Hz, and the tune must lead there.
const DIP = '0.45*gTune*lead';
export const MIX = {
  kick: 'kO*0.6*gKit*gLift',
  snare: 'sO*0.3*gKit*gLift',
  rideL: 'rO*0.15*gKit*gLift*(0.45 + 1.1*bright)',      // the ride's shimmer grows with Brightness
  rideR: 'rO*0.22*gKit*gLift*(0.45 + 1.1*bright)',
  bass: 'bO*0.22*gBass',
  organL: 'oL*0.42',
  organR: 'oR*0.42',
  tune: 'lF*0.55*lead*gTune*gLift',
  answerL: 'eB*0.17*gAnswer',
  answerR: 'eB*0.3*gAnswer',
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

// The held chords on the band's whole drawbar set (1x to 8x, docs/music-styles.md 'organ'), not the band's lighter
// chord voice (1x, 2x, 4x): the foundation drawbars (1x, 2x, 3x) always sound, the upper ones (4x, 6x, 8x) are pulled
// out by Brightness, from a faint edge at 0 to a ringing top at 1. The same rotary swirl and tune dip as the band's.
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

export function build(gains = GAINS) {
  const kit = B.drums({ kick: 'kT', snare: 'sT', ride: 'rT', noise: 'nz' });   // -> kO, sO, rO; kit.duck = 'kA'
  const organ = heldOrgan('p', { trig: 'hG', dip: DIP, noise: 'nz' });          // -> pL, pR
  return assemble({
    id: 'menu-organ',
    name: 'Cathedral Ledger',
    tags: ['music', 'menu', 'title', ...B.tags, 'adaptive', 'loop'],
    description: 'Solemn, stately synthesised organ music for a gothic RPG title screen, in short or long versions: Intensity brings in the pedal bass, then the tune, an answering organ line and a light brushed beat, and you can change the speed, pitch, room and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['fantasy', 'dungeon'], gameTypes: ['turn-based-rpg', 'top-down-rpg'],
      words: ['title', 'menu', 'start screen', 'main theme', 'organ', 'chapel', 'cathedral', 'hymn', 'gothic', 'solemn', 'stately', 'candlelit'],
      license: 'draft',
    },
    tempo: B.checkTempo([72, 96, 84]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Synth lead' },
    extraParams: [param('lead', 'Melody', 0, 1, 0.8)],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'A' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the light kit: a short kick on 1 and 3, a brushed snare on 2 and 4, a ride on 8ths
      drumRow('kT', 'X.......x.......'),
      drumRow('sT', ['....x.......x...', '....x.......x...', '....x.......x...', '....x.......x..o']),
      drumRow('rT', 'x.o.x.o.x.o.x.o.'),
      kit,

      // --- the pedal bass: a dotted half on the root, a passing quarter on beat 4
      drumRow('bG', 'X...........x...'),
      noteRow('bS', BASS_SEMIS),
      B.bass('b', { trig: 'bG', semis: 'bS', noise: 'nz' }),

      // --- the organ: the chord held all bar, through the rotary swirl
      drumRow('hG', 'X...............'),
      organ,
      // Brightness also opens a low-pass over the organ: dark and covered at 0, open and ringing at 1
      { id: 'oL', type: 'filter', mode: 'lp', in: 'pL', freq: ORGAN_LP, q: 0.7 },
      { id: 'oR', type: 'filter', mode: 'lp', in: 'pR', freq: ORGAN_LP, q: 0.7 },

      // --- the tune, on whichever instrument the listener picks; slow notes ring longer
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.5 }),

      // --- the answer, on the band's drawbar organ
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP', noise: 'nz' }),
      { id: 'eB', type: 'filter', mode: 'lp', in: 'eO', freq: ORGAN_LP, q: 0.7 },   // the same Brightness low-pass

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.organL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.rideL}`,
        right: `${MIX.organR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.rideR}`,
        duck: `${kit.duck}*gKit`, duckAmount: 0.15,
        send: 'sO*0.2*gKit',
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 10% and stop at the range: the slow style sits 5% over 72, the fast one 5% under 96
      'Candlelit title': { intensity: 0.85, bpm: 84 },
      'Load a save': { intensity: 0.5, bpm: 78, bright: 0.35, space: 0.42 },
      'A new oath': { intensity: 1, bpm: 90, key: 2, bright: 0.7, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
