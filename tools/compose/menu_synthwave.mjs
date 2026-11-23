#!/usr/bin/env node
// Writes sounds/menu-synthwave.json: "Neon Overpass", pause and menu music on the synthwave band (docs/music-styles.md).
// Built on the music kit (kit.mjs), after thornwood_overworld.mjs.
//
//   A minor with a dorian lift (the D major chord carries F sharp, the raised sixth), 96 bpm, straight, 8 bars:
//   Am C G D | F C Dm E. A night-drive pause screen under city lights, cool and wistful with a hopeful lift. In the
//   order Intensity brings them in: a wide saw pad through chorus holding whole-bar chords (there at 0), a saw bass
//   in straight 16ths (root, octave on the off-16ths), the tune through the band's dotted-8th echo, a long four-on-
//   the-floor kick with a gated snare on 2 and 4, a clap on 4 and off-beat hats, and at the top a saw-lead answer
//   through its own dotted-8th echo, echoing the tune's closing figure.
//
//   node tools/compose/menu_synthwave.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_synthwave.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/menu_synthwave.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_synthwave.mjs             when it is ready: write sounds/menu-synthwave.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, band } from './kit.mjs';

const B = band('synthwave');

// Level of each melody instrument for this tune, measured after the band's echo (lcO).
export const GAINS = [1, 0.793, 1.06, 1.01, 1.67, 1.83, 0.86, 1.26, 1.13, 1.33, 0.963, 0.994, 0.906, 1.59, 1.64];

export const CHORDS = 'Am C G D | F C Dm E';

// The tune, one token per 16th. A four-bar phrase: a step down from E to A and back up, a held E that turns, a
// held D that climbs back, and the dorian lift on F sharp (the only leap: D up to F sharp). Then it returns over
// F, C, Dm and E, the same rhythm, closing on B over the E chord to lead back to the top.
export const TUNE = [
  'E5 _ _ _ D5 _ C5 _ A4 _ _ _ C5 _ D5 _',      // Am   down the chord, back up by step
  'E5 _ _ _ _ _ _ _ G5 _ E5- _ D5 _ C5 _',      // C    held E, then G and down
  'D5 _ _ _ _ _ _ _ B4 _ C5- _ D5 _ _ _',       // G    held D, a turn below it
  'F#5 _ _ _ _ _ _ _ E5 _ D5- _ A4 _ _ _',      // D    the lift: F sharp, the raised sixth
  'F5 _ _ _ E5 _ C5 _ A4 _ _ _ C5 _ D5 _',      // F    bar 1's shape from F
  'E5 _ _ _ _ _ _ _ G5 _ E5- _ D5 _ C5 _',      // C    bar 2 again
  'D5 _ _ _ _ _ _ _ F5 _ E5- _ D5 _ _ _',       // Dm   bar 3's turn, minor
  'B4 _ _ _ _ _ _ _ G#4 _ A4- _ B4 _ _ _',      // E    the leading tone, B held into the top
];

// The answer, on the band's saw lead through its dotted-8th echo, an octave below in the tune's held notes: the
// tune's closing figure (a fall by step, as bar 7 ends: F E D) answered in each bar that holds.
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ G4 _ E4- _ D4 _ _ _ _ _ _ _',
  '_ _ _ _ D4 _ B3- _ G3 _ _ _ _ _ _ _',
  '_ _ _ _ A4 _ F#4- _ D4 _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ G4 _ E4- _ C4 _ _ _ _ _ _ _',
  '_ _ _ _ F4 _ E4- _ D4 _ _ _ _ _ _ _',
  '_ _ _ _ E4 _ D4- _ B3 _ _ _ _ _ _ _',
];

// Which layers play, in the brief's intensity order. `section` is for Length (32 bars: pad and bass, then the
// tune, then the drums, then the answer; 16 bars is sections 3 and 4).
export const LAYERS = {
  pad: { intensity: [0, 0.1], floor: 0.7 },             // there at 0, so it is still music
  bass: { intensity: [0.1, 0.2] },
  tune: { section: 2, intensity: [0.28, 0.38] },        // in by 0.4, so every look keeps the tune
  drums: { section: 3, intensity: [0.48, 0.58] },
  answer: { section: 4, intensity: [0.72, 0.82] },      // last in, and in by the default (0.85)
  lift: { intensity: [0.4, 1], floor: 0.8 },            // the tune and the drums lean in as intensity climbs
};

// The mix, part by part. The pad sits under the tune's register; padDip (how far the pad is pulled back, 0 to 1)
// makes room while the tune plays.
const padDip = '0.3*gTune*lead';
export const MIX = {
  kick: 'kO*0.5*gDrums*gLift',
  snare: 'sO*0.34*gDrums*gLift',
  clap: 'qO*0.2*gDrums*gLift',
  hat: 'hO*0.2*gDrums*gLift',
  bass: 'bO*0.2*gBass',
  padL: 'pL*0.34*gPad',
  padR: 'pR*0.34*gPad',
  tune: 'lcO*0.5*lead*gTune*gLift',
  answerL: 'eO*0.16*1.25*lead*gAnswer',
  answerR: 'eO*0.16*0.75*lead*gAnswer',
};
const LEVEL = 1.0;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.padL} + ${MIX.answerL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.clap} + ${MIX.hat}`,
  bed: `${MIX.bass} + ${MIX.padL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'menu-synthwave',
    name: 'Neon Overpass',
    tags: ['music', 'menu', ...B.tags, 'adaptive', 'loop'],
    description: 'Cool, wistful synthesised synthwave for a pause or title menu on a night drive under city lights: Intensity brings in a wide buzzy pad, a pulsing buzzy bass, the tune, a steady kick with a gated snare, and an echoing bright synth answer, and you can change the speed, pitch and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['city', 'sci-fi'], gameTypes: ['racing', 'arcade', 'shooter'],
      words: ['pause', 'menu', 'title', 'synthwave', 'retro', 'neon', 'night', 'drive', 'city', 'eighties', 'synth', 'wistful', 'cool'],
      license: 'draft',
    },
    tempo: B.checkTempo([84, 108, 96]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Synth lead' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock({}),
      chords(CHORDS, { tonic: 'A' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: four on the floor, gated snare on 2 and 4, clap on 4, hats on the off-beats
      drumRow('kT', 'X...X...X...X...'),
      drumRow('sT', '....X.......X...'),
      drumRow('qT', '............X...'),
      drumRow('hT', '..x...x...x...x.'),
      B.drums({ kick: 'kT', snare: 'sT', clap: 'qT', hat: 'hT', noise: 'nz' }),   // -> kO, sO, qO, hO

      // --- bass: straight 16ths, the root with the octave on the off-16ths
      drumRow('bG', 'XxxxXxxxXxxxXxxx'),
      noteRow('bS', '0 12 0 12 0 12 0 12 0 12 0 12 0 12 0 12'),
      B.bass('b', { trig: 'bG', semis: 'bS' }),

      // --- the pad: whole-bar chords, wide, through chorus
      drumRow('pG', 'X...............'),
      B.chords('p', { trig: 'pG', dip: padDip }),                                // -> pL, pR

      // --- the tune, on whichever instrument the listener picks, through the band's dotted-8th echo
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),
      B.colour('lc', { input: 'lF' }),

      // --- the answer, on the band's saw lead
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.padL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.clap}*1.1 + ${MIX.hat}*0.85`,
        right: `${MIX.padR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.clap}*0.9 + ${MIX.hat}*1.15`,
        duck: 'kA*gDrums', duckAmount: 0.3,
        ...B.room, level: LEVEL,
      }),
    ],
    presets: {
      'Paused': { intensity: 0.4, bpm: 92 },
      'Title screen': { intensity: 0.85, bpm: 96 },
      'Night drive': { intensity: 1, bpm: 101, bright: 0.65 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
