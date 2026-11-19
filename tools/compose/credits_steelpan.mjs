#!/usr/bin/env node
// Writes sounds/credits-steelpan.json: "Last Ferry Home", end-credits music on the steelpan band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs) and band('steelpan').
//
//   C major, 100 bpm, 8 bars: C Em F G | Am F Dm G. The sun setting on the island as the boat pulls away: easy,
//   glowing and a little nostalgic. A shaker in 16ths and the bass pan's tresillo are there even at Intensity 0;
//   then the pan comping on the off-beats, a little lower; then the tune (Bell by default); then conga on the root and
//   a 2-3 clave on the chord root, with a cowbell only at the bar turns; and at the top the high pan answers.
//   Slower than menu-steelpan (108), with longer tune notes: the tune holds where the menu loop skips.
//
//   node tools/compose/credits_steelpan.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_steelpan.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/credits_steelpan.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_steelpan.mjs             when it is ready: write sounds/credits-steelpan.json
import { band, param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('steelpan');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.802, 1.06, 0.996, 1.81];

// The commas drop G and A an octave, so every root lies from G3 to F4: the comping, which plays from middle C plus
// the root, stays below the tune instead of climbing into it on the G and Am bars.
export const CHORDS = 'C Em F G, | Am, F Dm G,';

// The tune, one token per 16th, on the beats so it walks with the shaker while the bass pan pushes its tresillo
// underneath: three quarters on beats 1, 2 and 3, then eighths that lead on, or a note held to the bar line. Bars 1 to 4
// rise up the C chord, lean on G over Em, fall through F and stop on B over G: a question. Bars 5 to 8 answer: bar 5
// is bar 1's shape on Am, bar 6 bar 2's a step higher, climbing to the top A (the one leap, F up to A), and bars 7
// and 8 walk down from there to B, a third under the G that starts the loop.
export const TUNE = [
  'G4 _ _ _ C5 _ _ _ E5 _ _ _ D5 _ C5 _',        // C    up the chord, settles back
  'D5 _ _ _ E5 _ _ _ G5 _ _ _ _ _ E5 _',         // Em   steps up to G, leans on it
  'F5 _ _ _ E5 _ _ _ C5 _ _ _ A4 _ C5 _',        // F    down through the chord
  'D5 _ _ _ B4 _ _ _ _ _ _ _ _ _ _ _',           // G    stops on B: the question
  'A4 _ _ _ C5 _ _ _ E5 _ _ _ D5 _ C5 _',        // Am   bar 1's shape on Am
  'D5 _ _ _ E5 _ _ _ F5 _ _ _ _ _ A5 _',         // F    bar 2's a step higher, the leap to A
  'A5 _ _ _ G5 _ _ _ F5 _ _ _ D5 _ F5 _',        // Dm   walks down from the top
  'G5 _ _ _ F5 _ _ _ D5 _ _ _ B4 _ _ _',         // G    down to B, a third under the G that starts again
];

// The high pan's answers, at the top of the build: a falling G chord in the hole after the question (bar 4), a
// rising one into the loop (bar 8), and one light ringing note where the tune holds at the end of bars 2 and 6.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST,
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ B5- _',           // Em
  REST,
  '_ _ _ _ _ _ _ _ _ _ D6- _ B5 _ G5 _',         // G    down the chord
  REST,
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ C6- _',           // F
  REST,
  '_ _ _ _ _ _ _ _ _ _ _ _ G5- _ B5 _',          // G    up the chord, into the loop
];

// Which layers play, in the brief's order. `section` is for the Length control (the 32-bar version: shaker, bass pan
// and comping, then the tune, then the drums, then the answers); `intensity` is the window in which the Intensity
// control brings the layer in.
export const LAYERS = {
  bass: { intensity: [0, 0.15], floor: 0.7 },          // at 0: the shaker and the bass pan's tresillo, still music
  comp: { intensity: [0.12, 0.22] },                   // the pan on the off-beats, lower
  tune: { section: 2, intensity: [0.3, 0.4] },         // all there by 0.4, where whole-bundle looks may set it
  drums: { section: 3, intensity: [0.5, 0.6] },        // conga on the root, clave on the chord root, cowbell at bar turns
  answer: { section: 4, intensity: [0.75, 0.85] },     // the high pan answers
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and the drums lean in as it builds
};

// The comping is pulled back while the tune plays (`dip`): they share 300 to 1200 Hz and the tune must lead there.
const DIP = '0.45*gTune*lead';
export const MIX = {
  shaker: 'sO*0.28*acc*(0.55 + 0.9*bright)',
  conga: 'dO*0.48*gDrums*gLift',
  clave: 'vO*0.2*gDrums*gLift',
  cowbell: 'wO*0.09*gDrums',
  bass: 'bO*0.36*gBass',
  compL: 'pB*0.4*gComp',
  compR: 'pB*0.3*gComp',
  tune: 'lF*0.5*lead*gTune*gLift',
  answerL: 'eB*0.36*gAnswer',
  answerR: 'eB*0.24*gAnswer',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.compL} + ${MIX.answerL}`,
  drums: `${MIX.shaker} + ${MIX.conga} + ${MIX.clave} + ${MIX.cowbell}`,
  bed: `${MIX.bass} + ${MIX.shaker}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'credits-steelpan',
    name: 'Last Ferry Home',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'An easy, glowing synthesised steel pan piece for the end credits, as the boat leaves the island at sunset: a shaker and a bass pan, then off-beat pan chords, the tune, conga, clave and cowbell, and at the top high pan answers. Intensity brings the layers in; you can change the length, speed, pitch, bounce and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['puzzle', 'farming-sim', 'arcade'],
      words: ['credits', 'ending', 'farewell', 'sunset', 'ferry', 'boat', 'island', 'steel pan', 'tropical', 'calypso', 'nostalgic', 'glowing'],
      license: 'draft',
    },
    tempo: B.checkTempo([96, 108, 100]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Bell' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.3),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'C' }),
      arrangement(LAYERS),
      // "Bounce" also leans on the beat: the shaker's 16ths between the 8th notes get softer as it rises
      { id: 'acc', type: 'expr', expr: '1 - swing*0.5*(1 - c16p)' },
      { id: 'nz', type: 'noise' },

      // --- drums: shaker in 16ths, leaning on every beat (the bed and the pulse); conga on the chord root, on the beats; a 2-3 clave on the chord root;
      //     the cowbell only at the bar turns (into bar 1 and bar 5 of each 8, and at the end of each 4)
      drumRow('sT', 'XoxoXoxoXoxoXoxo'),
      drumRow('dT', ['X...o.x.X...o...', 'X...o.x.X...x.o.']),
      drumRow('vT', ['....X...X.......', 'X.....X.....X...']),
      drumRow('wT', ['X...............', '................', '................', '............x.x.']),
      B.drums({ shaker: 'sT', conga: 'dT', clave: 'vT', cowbell: 'wT', noise: 'nz' }),   // -> sO, dO, vO, wO

      // --- bass pan: the root in a 3+3+2 tresillo, the last push on the fifth
      drumRow('bR', 'X.....x.....x...'),
      noteRow('bQ', '0 _ _ _ _ _ 0 _ _ _ _ _ 7 _ _ _'),
      B.bass('b', { trig: 'bR', semis: 'bQ' }),                     // -> bO

      // --- pan comping on the off-beats: third, fifth, root, fifth (chord-tone numbers), pulled back under the tune
      drumRow('pG', '..x...x...x...x.'),
      noteRow('pK', '1 _ _ _ 2 _ _ _ 0 _ _ _ 2 _ _ _'),
      B.chords('p', { trig: 'pG', pick: 'pK', dip: DIP }),          // -> pO
      // Brightness opens the pans: shut, only their fundamentals; open, their 2nd and 3rd partials ring too
      { id: 'pB', type: 'filter', mode: 'lp', in: 'pO', freq: '500 + bright*4500', q: 0.7 },

      // --- the tune, on whichever instrument the listener picks; its held notes ring a little longer
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.25 }),
      // --- the high pan's answers
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),                    // -> eO
      { id: 'eB', type: 'filter', mode: 'lp', in: 'eO', freq: '900 + bright*6000', q: 0.7 },

      // --- mix: bass and conga in the centre; comping a little left, answers a little left too (the cowbell and
      //     clave lean right), shaker and tune both
      bus({
        centre: `${MIX.bass} + ${MIX.conga}`,
        left: `${MIX.shaker}*1.1 + ${MIX.clave}*0.8 + ${MIX.cowbell}*0.8 + ${MIX.compL} + ${MIX.tune} + ${MIX.answerL}`,
        right: `${MIX.shaker}*0.9 + ${MIX.clave}*1.2 + ${MIX.cowbell}*1.2 + ${MIX.compR} + ${MIX.tune} + ${MIX.answerR}`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Credits roll': { intensity: 0.85, bpm: 100 },
      'Harbour lights fade': { intensity: 0.45, bpm: 98, bright: 0.4, lead: 0.7, swing: 0.35 },
      'Last wave goodbye': { intensity: 1, bpm: 103, bright: 0.7, swing: 0.2 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
