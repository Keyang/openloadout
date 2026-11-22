#!/usr/bin/env node
// Writes sounds/gridline-calm.json: "Calm play", the main loop of the Gridline puzzle kit, on the synthwave band
// (docs/music-styles.md). Built on the music kit (kit.mjs), after thornwood_overworld.mjs.
//
//   D minor, 100 bpm, 8 bars: Dm Bb Gm C | Dm Bb F A. Unhurried, glowing and focused: play at the early levels,
//   while the stack is low. In the order Intensity brings them in: a held, wide pad and a bass in straight 16ths on
//   root and octave whose tone opens as intensity climbs; the tune (long two-note sighs) and off-beat hats; a kick on
//   every beat and a gated snare; and at the top the band's own lead with its echo, answering in bars 4 and 8, and a clap.
//
//   node tools/compose/gridline_calm.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/gridline_calm.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/gridline_calm.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/gridline_calm.mjs             when it is ready: write sounds/gridline-calm.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, band } from './kit.mjs';

const B = band('synthwave');

// Level of each melody instrument for this tune, measured after the band's echo (lcO).
export const GAINS = [1, 0.794, 1.06, 1, 1.97, 1.47, 0.832, 1.21, 1.18, 1.49, 0.642, 0.76, 0.728, 1.33, 1.13];

export const CHORDS = 'Dm Bb Gm C | Dm Bb F A';

// The tune, one token per 16th: long two-note sighs, each falling a step. A four-bar phrase that climbs sigh by
// sigh, with the one leap (a fourth, A up to D) into bar 3; bars 5 and 6 bring it back, then it settles low: down
// to F over the F chord, and to C sharp, the leading note, over A, so the loop wants to start again.
export const TUNE = [
  'A4 _ _ _ _ _ _ _ _ _ G4- _ _ _ _ _',     // Dm   the fifth, sighing down
  'Bb4 _ _ _ _ _ _ _ _ _ A4- _ _ _ _ _',    // Bb   a step higher
  'D5 _ _ _ _ _ _ _ _ _ C5- _ _ _ _ _',     // Gm   the leap of a fourth
  'E5 _ _ _ _ _ _ _ _ _ D5- _ _ _ _ _',     // C    the top of the phrase
  'A4 _ _ _ _ _ _ _ _ _ G4- _ _ _ _ _',     // Dm   again
  'Bb4 _ _ _ _ _ _ _ _ _ A4- _ _ _ _ _',    // Bb
  'G4 _ _ _ _ _ _ _ F4 _ _ _ _ _ _ _',      // F    down to F
  'D4 _ _ _ C#4 _ _ _ _ _ _ _ _ _ _ _',     // A    the leading note
];

// The answer, on the band's own lead with its dotted-8th echo: up the chord in the gaps of bars 4 and 8.
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ G4 _ C5 _ G5 _ _ _ _ _ E5- _ _ _',   // C
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ E4 _ A4 _ E5 _ _ _ _ _ A4- _ _ _',   // A
];

// Which layers play, in the specification's intensity order. `section` is for Length (32 bars: pad and bass, then
// the tune, then the drums, then everything; 16 bars is sections 3 and 4).
export const LAYERS = {
  pad: {},                                               // at every intensity: at 0 it is still music
  open: { intensity: [0, 0.75] },                        // the bass's tone: nearly shut at 0, open by 0.75
  tune: { section: 2, intensity: [0.3, 0.4] },           // in by 0.4, so every look keeps the tune
  hats: { section: 3, intensity: [0.3, 0.5] },
  beat: { section: 3, intensity: [0.5, 0.62] },          // the kick on every beat
  snare: { section: 3, intensity: [0.55, 0.75] },
  top: { section: 4, intensity: [0.75, 0.85] },          // the answer line and the clap; in by the default (0.85)
  lift: { intensity: [0.4, 1], floor: 0.8 },             // the tune and the drums lean in as intensity climbs
};

// The mix, part by part. padDip pulls the pad back while the tune plays (given to the band's chord voice).
const padDip = '0.3*gTune*lead';
export const MIX = {
  kick: 'kO*0.38*gBeat*gLift',
  snare: 'sO*0.36*gSnare*gLift',
  clap: 'qO*0.24*gTop',
  hat: 'hO*0.28*gHats*gLift',
  bass: 'bF*0.26',
  padL: 'pL*0.38*gPad',
  padR: 'pR*0.38*gPad',
  tune: 'lcO*0.5*lead*gTune*gLift',
  answerL: 'eO*0.2*0.75*lead*gTop',
  answerR: 'eO*0.2*1.25*lead*gTop',
};
const LEVEL = 1;
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
    id: 'gridline-calm',
    name: 'Calm play',
    tags: ['music', 'puzzle', ...B.tags, 'adaptive', 'loop'],
    description: 'Unhurried, glowing synthesised music for the calm early levels of a falling-block puzzle: Intensity opens up the bass under a wide held pad, then brings in the tune and hats, the kick and snare, and an echoing answer line with a clap, and you can change the speed, pitch, length and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/exploration', themes: ['neutral'], gameTypes: ['puzzle', 'arcade'],
      words: ['calm', 'play', 'chill', 'blocks', 'focus', 'relaxed', 'glowing', ...B.words.slice(0, 5), 'mellow', 'think'],
      license: 'draft',
    },
    tempo: B.checkTempo([88, 112, 100]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Bell' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'D', low: -4 }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: a kick on every beat, hats on the off-beats, the gated snare on 2 and 4, a clap on beat 4 of every second bar
      drumRow('kT', 'X...X...X...X...'),
      drumRow('hT', '..x...x...x...x.'),
      drumRow('sT', '....X.......X...'),
      drumRow('qT', ['................', '............X...']),
      B.drums({ kick: 'kT', hat: 'hT', snare: 'sT', clap: 'qT', noise: 'nz' }),   // -> kO (kA), hO, sO, qO

      // --- bass: straight 16ths, the root with the octave on the off-16ths; its tone opens with intensity
      drumRow('bG', 'XxxxXxxxXxxxXxxx'),
      noteRow('bS', '0 12 0 12 0 12 0 12 0 12 0 12 0 12 0 12'),
      B.bass('b', { trig: 'bG', semis: 'bS' }),
      { id: 'bF', type: 'filter', mode: 'lp', in: 'bO', freq: '240 + gOpen*(1300 + bright*2400)', q: 0.8 },

      // --- the pad: one held chord a bar, wide, pulled back a little while the tune plays
      drumRow('pG', 'X...............'),
      B.chords('p', { trig: 'pG', dip: padDip }),

      // --- the tune, on whichever instrument the listener picks, through the band's echo
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.6 }),
      B.colour('lc', { input: 'lF' }),

      // --- the answer, on the band's saw lead with its own echo
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.padL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.hat}*0.9 + ${MIX.clap}*1.1`,
        right: `${MIX.padR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.hat}*1.1 + ${MIX.clap}*0.9`,
        duck: 'kA*gBeat', duckAmount: 0.2,
        ...B.room, level: LEVEL,
      }),
    ],
    presets: {
      'Low stack': { intensity: 0.45, bpm: 96 },
      'Deep focus': { intensity: 0.85, bpm: 100 },
      'Late night': { intensity: 1, bpm: 104, bright: 0.4, space: 0.35 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
