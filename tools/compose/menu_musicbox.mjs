#!/usr/bin/env node
// Writes sounds/menu-musicbox.json: "Wind-up lullaby", a music-box title-screen track on the `musicbox` band
// (docs/music-styles.md). Built on the music kit (kit.mjs).
//
//   F major, 72 bpm, 8 bars: F Dm Bb C | Am Bb Gm C. A toy box opening on a sleepy title screen: the mechanism
//   clicking on every beat, a low tine ringing the root of each bar, tine broken chords on beats 2 to 4, the tune
//   on whichever melody instrument is chosen (Bell by default), and at the top of Intensity a high tine answering it.
//
//   node tools/compose/menu_musicbox.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_musicbox.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/menu_musicbox.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_musicbox.mjs             when it is ready: write sounds/menu-musicbox.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('musicbox');

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.774, 1.06, 1.01, 1.99];

export const CHORDS = 'F Dm Bb C | Am Bb Gm C';

// The tune, one token per 16th. A four-bar phrase (a quarter, two eighths, a long note) that climbs to C and
// steps back, asks a question on C; then the same rhythm returns on A minor, turns at G minor and leans on C.
// It sits high (F5 to F6), as a music box does. Measured: the Bell's bright overtone sits about an octave and a
// major third above each note, so a G5 or E5 put a B or a G# into the bar's notes (B against G minor); notes from
// A5 up push that overtone above the chord check's window, and the lower notes used here are roots or soft passing notes.
export const TUNE = [
  'F5 _ _ _ A5 _ Bb5- _ C6 _ _ _ _ _ _ _',         // F    up to C
  'D6 _ _ _ C6 _ Bb5- _ A5 _ _ _ _ _ _ _',         // Dm   and back down
  'Bb5 _ _ _ C6 _ D6- _ F6 _ _ _ D6- _ C6- _',     // Bb   up again, higher
  'C6 _ _ _ _ _ _ _ E6 _ _ _ _ _ C6-- _',          // C    the question
  'A5 _ _ _ C6 _ D6- _ E6 _ _ _ _ _ _ _',          // Am   bar 1's rhythm, wistful
  'F6 _ _ _ D6 _ C6- _ Bb5 _ _ _ F5- _ _ _',       // Bb
  'Bb5 _ _ _ D6 _ C6- _ Bb5 _ _ _ A5- _ _ _',      // Gm
  'E6 _ _ _ _ _ D6- _ C6 _ _ _ D6- _ _ _',         // C    leans back to the start
];

// The answer: a high tine in the holes the tune leaves (its long notes), top intensity only.
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ A6 _ F6- _',
  '_ _ _ _ _ _ _ _ _ _ _ _ F6 _ D6- _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ G6 _ E6- _ _ _ _ _ G6 _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ C7 _ A6- _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ D6- _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ G6- _',
  '_ _ _ _ G6 _ _ _ _ _ _ _ _ _ E6- _',
];

// Which layers play, in the brief's intensity order. Sections (the 32-bar version): mechanism and low tine, then the
// broken chords, then the tune, then everything (busier chords and, at the top, the answer).
export const LAYERS = {
  pulse: {},                                              // the mechanism: every beat, every intensity
  bed: { intensity: [0, 0.15], floor: 0.6 },              // the low tine
  arp: { section: 2, intensity: [0.15, 0.25] },           // tine broken chords
  tune: { section: 3, intensity: [0.3, 0.4] },            // the melody: all there by 0.4
  busy: { section: 4, intensity: [0.6, 0.61] },           // a switch: an extra 8th in the broken chords
  answer: { section: 4, intensity: [0.88, 0.98] },        // the high tine answer
  lift: { intensity: [0.4, 1], floor: 0.8 },              // the tune and chords lean in as intensity climbs
};

// The mix, part by part. The tines get a low-pass that opens with Brightness (their upper partials are the sparkle).
export const MIX = {
  mech: 'mO*0.55*gPulse',
  bass: 'bO*0.36*gBed',
  arpL: 'pBr*0.15*gArp*gLift',
  arpR: 'pBr*0.1*gArp*gLift',
  tune: 'lF*0.5*lead*gTune*gLift',
  ansL: 'eBr*0.08*lead*gAnswer',
  ansR: 'eBr*0.15*lead*gAnswer',
};
const LEVEL = 0.95;
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
    id: 'menu-musicbox',
    name: 'Wind-up lullaby',
    tags: ['music', ...B.tags, 'menu', 'title', 'loop'],
    description: 'A small, warm, sleepy synthesised music-box tune for a title screen, in short or long versions: Intensity brings in the low notes, the chords, the tune and a high answer, and you can change the speed, pitch, brightness, room and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['neutral', 'fantasy'], gameTypes: ['puzzle', 'arcade', 'platformer'],
      words: ['menu', 'title', 'start screen', 'music box', 'lullaby', 'toy', 'sleepy', 'gentle', 'tinkling', 'wind-up', 'calm', 'cozy'],
      license: 'draft',
    },
    tempo: B.checkTempo([64, 88, 72]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16 },
    extraParams: [param('lead', 'Melody', 0, 1, 0.8)],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'F' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the mechanism: a soft click on every beat, a little firmer on beat 1
      drumRow('mT', 'X...x...x...x...'),
      B.drums({ mechanism: 'mT', noise: 'nz' }),

      // --- the low tine: the chord root on beat 1, left to ring through the bar
      drumRow('bR', 'X...............'),
      B.bass('b', { trig: 'bR' }),

      // --- broken chords: tine quarter notes on beats 2 to 4 (an extra 8th when everything is in)
      drumRow('pG1', '....x...x...x...'),
      drumRow('pG2', '....x...x.o.x...'),
      { id: 'pTr', type: 'expr', expr: 'gBusy > 0.5 ? pG2 : pG1' },
      noteRow('pK', twoBars('0 _ _ _ 1 _ _ _ 2 _ 3 _ 1 _ _ _', '0 _ _ _ 2 _ _ _ 1 _ 2 _ 0 _ _ _')),
      B.chords('p', { trig: 'pTr', pick: 'pK' }),
      { id: 'pBr', type: 'filter', mode: 'lp', in: 'pO', freq: '1500 + bright*9000', q: 0.7 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.5 }),

      // --- the answer on the band's own tine
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),
      { id: 'eBr', type: 'filter', mode: 'lp', in: 'eO', freq: '2500 + bright*10000', q: 0.7 },

      // --- mix: mechanism and low tine in the centre; chords a little left, the answer a little right
      bus({
        centre: `${MIX.mech} + ${MIX.bass}`,
        left: `${MIX.arpL} + ${MIX.tune} + ${MIX.ansL}`,
        right: `${MIX.arpR} + ${MIX.tune} + ${MIX.ansR}`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      'Sleepy title': { intensity: 0.55, bpm: 68, bright: 0.5, space: 0.22 },
      'Main menu': { intensity: 0.85, bpm: 72 },
      'Fully wound': { intensity: 1, bpm: 80, bright: 0.85 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
