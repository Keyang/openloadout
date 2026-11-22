#!/usr/bin/env node
// Writes sounds/credits-musicbox.json: "Goodnight, Little Hero", a music-box credits track on the `musicbox` band
// (docs/music-styles.md). Built on the music kit (kit.mjs).
//
//   Eb major, 68 bpm, 32 bars by default: Eb Ab Eb Bb | Cm Ab Bb Eb, so every 8 bars settles at home like a bedtime.
//   The toy box winding down after the last level while the names scroll: the mechanism clicking on every beat, a
//   low tine ringing the root of each bar, sparse tine broken chords, the tune (Bell by default) and, at the top of
//   Intensity, a high tine echoing the tune's phrase-ends an octave up.
//
//   node tools/compose/credits_musicbox.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_musicbox.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/credits_musicbox.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_musicbox.mjs             when it is ready: write sounds/credits-musicbox.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('musicbox');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.767, 1.06, 1.02, 2.02, 7.94, 0.827, 1.2, 1.15, 1.36, 0.983, 1.08, 0.818, 1.62, 1.63];

export const CHORDS = 'Eb Ab Eb Bb | Cm Ab Bb Eb';

// The tune, one token per 16th. Most bars are the same lullaby step (a dotted quarter, a quarter, then a note that
// lands just after beat 3 and rings to the bar's end; the rhythm is this track's own in the library): it climbs
// to Eb, sways over Ab, steps down to a question on Bb, climbs again a step higher over C minor, and comes home.
// It sits between Bb5 and F6: the Bell's bright overtone sits about an octave and a major third above each note, so
// notes below A5 would put foreign notes into the bar (a G5 adds a B against Eb); from A5 up it is out of the way.
export const TUNE = [
  'Bb5 _ _ _ _ _ C6 _ _ _ Eb6 _ _ _ _ _',          // Eb   up to the tonic
  'Eb6 _ _ _ _ _ F6 _ Eb6 _ _ _ C6 _ _ _',         // Ab   a sway
  'Eb6 _ _ _ _ _ D6- _ _ _ Bb5 _ _ _ _ _',         // Eb   stepping down
  'D6 _ _ _ _ _ C6- _ _ _ Bb5 _ _ _ _ _',          // Bb   the question
  'C6 _ _ _ _ _ D6 _ _ _ Eb6 _ _ _ _ _',           // Cm   bar 1's climb, a step higher
  'Eb6 _ _ _ _ _ D6- _ _ _ C6 _ _ _ _ _',          // Ab
  'D6 _ _ _ _ _ Eb6 _ F6 _ _ _ D6 _ _ _',          // Bb   reaching up
  'Eb6 _ _ _ _ _ _ _ _ _ Bb5 _ _ _ _ _',           // Eb   home, and a breath
];

// The answer: a high tine echoing the tune's phrase-ends an octave up, in the holes its long notes leave.
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ C7 _ Bb6- _',           // echoes "C6 Bb5"
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ C7 _ _ _',              // echoes "C6"
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ Bb6 _',             // echoes "Bb5"
];

// Which layers play, in the brief's intensity order. Sections (the 32-bar version): mechanism, low tine and sparse
// broken chords; then the tune; then fuller chords and a second low tine; then everything, with the answer.
export const LAYERS = {
  pulse: {},                                              // the mechanism: every beat, every intensity
  bed: { intensity: [0, 0.1], floor: 0.6 },               // the low tine: there at 0
  arp: { intensity: [0.1, 0.2] },                         // tine broken chords, sparse
  tune: { section: 2, intensity: [0.25, 0.35] },          // the melody: all there by 0.35
  busy: { section: 3, intensity: [0.45, 0.46] },          // a switch: a third chord tone and a second low tine
  answer: { section: 4, intensity: [0.55, 0.65] },        // the high tine echo
  lift: { intensity: [0.35, 1], floor: 0.8 },             // the tune and chords lean in as intensity climbs
};

// The mix, part by part. The tines get a low-pass that opens with Brightness.
export const MIX = {
  mech: 'mO*0.5*gPulse',
  bass: 'bO*0.36*gBed',
  arpL: 'pBr*0.15*gArp*gLift',
  arpR: 'pBr*0.1*gArp*gLift',
  tune: 'lF*0.5*lead*gTune*gLift',
  ansL: 'eBr*0.08*lead*gAnswer',
  ansR: 'eBr*0.16*lead*gAnswer',
};
const LEVEL = 1.1;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.arpL} + ${MIX.ansL}`,
  mechanism: MIX.mech,
  bed: MIX.bass,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

const twoBars = (a, b) => [a, b, a, b, a, b, a, b];

export function build(gains = GAINS) {
  return assemble({
    id: 'credits-musicbox',
    name: 'Goodnight, Little Hero',
    tags: ['music', ...B.tags, 'credits', 'ending', 'loop'],
    description: 'A tender, grateful synthesised music-box lullaby for the end credits, in short or long versions: Intensity brings in the low notes, the chords, the tune and a high echo, and you can change the speed, pitch, brightness, room and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral', 'fantasy'], gameTypes: ['platformer', 'puzzle', 'top-down-rpg'],
      words: ['credits', 'ending', 'end credits', 'music box', 'lullaby', 'goodnight', 'thank you', 'tender', 'gentle', 'sleepy', 'toy', 'tinkling', 'calm'],
      license: 'draft',
    },
    tempo: B.checkTempo([64, 76, 68]),
    defaults: { ...B.defaults, intensity: 0.7, bars: 32, space: 0.25 },
    extraParams: [param('lead', 'Melody', 0, 1, 0.8)],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'Eb' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the mechanism: a soft click on every beat, a little firmer on beat 1
      drumRow('mT', 'X...x...x...x...'),
      B.drums({ mechanism: 'mT', noise: 'nz' }),

      // --- the low tine: the chord root on beat 1, left to ring (and softly again on beat 3 once fuller)
      drumRow('bG1', 'X...............'),
      drumRow('bG2', 'X.......o.......'),
      { id: 'bR', type: 'expr', expr: 'gBusy > 0.5 ? bG2 : bG1' },
      B.bass('b', { trig: 'bR' }),

      // --- broken chords: tine quarters on beats 2 and 4, beat 3 too once fuller
      drumRow('pG1', '....x.......x...'),
      drumRow('pG2', '....x...x...x...'),
      { id: 'pTr', type: 'expr', expr: 'gBusy > 0.5 ? pG2 : pG1' },
      noteRow('pK', twoBars('0 _ _ _ 1 _ _ _ 3 _ _ _ 2 _ _ _', '0 _ _ _ 2 _ _ _ 1 _ _ _ 3 _ _ _')),
      B.chords('p', { trig: 'pTr', pick: 'pK' }),
      { id: 'pBr', type: 'filter', mode: 'lp', in: 'pO', freq: '1500 + bright*9000', q: 0.7 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.5 }),

      // --- the answer on the band's own tine
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),
      { id: 'eBr', type: 'filter', mode: 'lp', in: 'eO', freq: '2500 + bright*10000', q: 0.7 },

      // --- mix: mechanism and low tine in the centre; chords a little left, the echo a little right
      bus({
        centre: `${MIX.mech} + ${MIX.bass}`,
        left: `${MIX.arpL} + ${MIX.tune} + ${MIX.ansL}`,
        right: `${MIX.arpR} + ${MIX.tune} + ${MIX.ansR}`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      'Names scroll': { intensity: 0.7, bpm: 68 },
      'Last page': { intensity: 0.4, bpm: 64, bright: 0.5, space: 0.35 },
      'Thank you for playing': { intensity: 1, bpm: 72, bright: 0.8 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
