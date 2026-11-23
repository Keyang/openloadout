#!/usr/bin/env node
// Writes sounds/credits-marimba.json: "Sun Behind the Palms", end-credits music on the marimba band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs) and band('marimba').
//
//   G major, 84 bpm, 8 bars: G C Bm Em | Am C D D. The day cooling off after a puzzle, jungle or party game: gentle,
//   swaying, sunny and settled. The bass bar on beats 1 and 3 (a short roll on 3) and the guiro's scrape on 2 and 4
//   are there even at Intensity 0; then the bars in broken chords grouped 3 + 3 + 2 in 8ths; then the tune (Bell by
//   default); then a log drum on 1 and the "and" of 2 with a woodblock on the off-beats; and at the top high bars
//   answer in bars 4 and 8, the last one a rolled long note. The 8ths sway (Bounce): the off-beat 8th comes late.
//   menu-marimba (C, 88 bpm) plays its bars in even 8ths and a busy clicking tune; this one skips and holds.
//
//   node tools/compose/credits_marimba.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_marimba.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/credits_marimba.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_marimba.mjs             when it is ready: write sounds/credits-marimba.json
import { band, param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('marimba');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.796, 1.07, 1.01, 1.78, 2.76, 0.846, 1.23, 1.17, 1.38, 0.71, 0.79, 0.663, 1.24, 1.2];

// The commas drop the roots an octave (D sits a fourth below the home note by itself), so the broken chords, which
// play from the G above middle C plus the root, lie from D3 to D5 and leave the notes above to the tune.
export const CHORDS = 'G, C, Bm, Em, | Am, C, D D';

// The tune, one token per 16th. Short notes on the off-beats, answered by long ones. The call is five notes over two
// bars, starting on the "and" of 1: third, fifth, third of G, then third and fifth of C (skips of a third). Bars 3
// and 4 answer with one long note each, stepping down (F# over Bm, E over Em). Bars 5 and 6 are the call a step
// higher (C E C over Am; over C the step-higher F# gives way to G, so G then A). Bar 7 makes the one leap, a fourth
// up from A onto the top D, and comes down through B; bar 8 holds A, the fifth of D, for the whole bar.
export const TUNE = [
  '_ _ B4 _ _ _ D5 _ _ _ B4 _ _ _ _ _',          // G    the call: third, fifth, third, all on the "ands"
  '_ _ E5 _ _ _ G5 _ _ _ _ _ _ _ _ _',           // C    ... third, fifth, and it hangs
  'F#5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',           // Bm   the answer: one long note
  'E5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',            // Em   a step down
  '_ _ C5 _ _ _ E5 _ _ _ C5 _ _ _ _ _',          // Am   the call a step higher
  '_ _ G5 _ _ _ A5 _ _ _ _ _ _ _ _ _',           // C    ... up to A
  '_ _ A5 _ _ _ D6 _ _ _ _ _ _ _ B5- _',         // D    the one leap: a fourth up onto the top note
  'A5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',            // D    the fifth of D, held for the whole bar
];

// The high bars answer in the long notes of bars 4 and 8: up the Em chord, and at the end a step up the D chord into
// a long F# rolled in 16ths (a roll is how a bar holds a note), growing into the top of the loop.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST, REST, REST,
  '_ _ _ _ _ _ B5- _ E6- _ G6 _ _ _ E6-- _',                        // Em   up the chord, and back
  REST, REST, REST,
  '_ _ _ _ D6- _ _ _ F#6-- F#6-- F#6-- F#6-- F#6- F#6- F#6- F#6',   // D    the rolled long note
];

// Which layers play, in the brief's order. `section` is for the Length control (the 32-bar version: bed and broken
// chords, then the tune, then the drums, then the answers); `intensity` is the window in which the Intensity control
// brings the layer in.
export const LAYERS = {
  bass: { intensity: [0, 0.15], floor: 0.85 },          // at 0: the bass bar and the guiro, still music
  comp: { intensity: [0.12, 0.22] },                   // the bars in broken chords, 3 + 3 + 2
  tune: { section: 2, intensity: [0.3, 0.4] },         // all there by 0.4, where whole-bundle looks may set it
  drums: { section: 3, intensity: [0.5, 0.6] },        // log drum on the root, woodblock on the off-beats
  answer: { section: 4, intensity: [0.75, 0.85] },     // the high bars answer
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and the drums lean in as it builds
};

// The broken chords are pulled back while the tune plays (`dip`): they share 300 to 1200 Hz and the tune must lead.
const DIP = '0.3*gTune*lead';
export const MIX = {
  guiro: 'uO*0.32*(0.6 + 0.8*bright)',
  log: 'gO*0.6*gDrums*gLift',
  woodblock: 'wO*0.2*gDrums*gLift',
  bass: 'bO*0.42*gBass',
  barsL: 'pB*0.5*gComp',
  barsR: 'pB*0.4*gComp',
  tune: 'lF*0.56*lead*gTune*gLift',
  answerL: 'eB*0.26*gAnswer',
  answerR: 'eB*0.4*gAnswer',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.barsL} + ${MIX.answerL}`,
  drums: `${MIX.log} + ${MIX.woodblock} + ${MIX.guiro}`,
  bed: `${MIX.bass} + ${MIX.guiro}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'credits-marimba',
    name: 'Sun Behind the Palms',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'A gentle, swaying synthesised marimba piece for the end credits, as the day cools off: a low wooden bar and a scraped gourd, then rippling chords on wooden bars, the tune, a log drum and woodblock, and at the top high bars answering the tune. Intensity brings the layers in; you can change the length, speed, pitch, bounce and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['puzzle', 'farming-sim', 'arcade'],
      words: ['credits', 'ending', 'farewell', 'sunset', 'palms', 'marimba', 'wooden', 'mallet', 'jungle', 'party', 'warm', 'gentle', 'swaying'],
      license: 'draft',
    },
    tempo: B.checkTempo([76, 92, 84]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Bell' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.25),
    ],
    nodes: [
      clock({ swing: 'swing', on: 8 }),                 // the piece is in 8ths: the off-beat 8th comes late, a sway
      chords(CHORDS, { tonic: 'G' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the bed: the bass bar on beats 1 and 3 (root, then the fifth as a short roll), the guiro on 2 and 4
      drumRow('bR', 'X.......Xxx.....'),
      noteRow('bQ', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bR', semis: 'bQ', note: '48 + tonic', noise: 'nz' }),   // -> bO
      drumRow('uT', '....X.......x...'),
      // --- drums: the log drum on the root on 1 and the "and" of 2, the woodblock on the off-beats
      drumRow('gT', 'X.....x.........'),
      drumRow('wT', '..x...x...x...x.'),
      B.drums({ log: 'gT', woodblock: 'wT', guiro: 'uT', noise: 'nz' }),   // -> gO, wO, uO

      // --- the bars: broken chords in 8ths grouped 3 + 3 + 2 (root, fifth, third; root, fifth, third; fifth, octave)
      drumRow('pG', 'X.x.x.X.x.x.X.x.'),
      noteRow('pK', '0 _ 2 _ 1 _ 0 _ 2 _ 1 _ 2 _ 3 _'),
      B.chords('p', { trig: 'pG', pick: 'pK', dip: DIP, noise: 'nz' }),   // -> pO
      // Brightness opens the bars: shut, little but their fundamentals; open, their upper partials ring too
      { id: 'pB', type: 'filter', mode: 'lp', in: 'pO', freq: '350 + bright*8000', q: 0.7 },

      // --- the tune, on whichever instrument the listener picks; its long notes ring on
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.4 }),
      // --- the high bars' answers
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP', noise: 'nz' }),            // -> eO
      { id: 'eB', type: 'filter', mode: 'lp', in: 'eO', freq: '800 + bright*9000', q: 0.7 },

      // --- mix: bass and log drum in the centre; bars a little left, answers a little right, tune in both
      bus({
        centre: `${MIX.bass} + ${MIX.log}`,
        left: `${MIX.woodblock}*1.2 + ${MIX.guiro}*0.8 + ${MIX.barsL} + ${MIX.tune} + ${MIX.answerL}`,
        right: `${MIX.woodblock}*0.8 + ${MIX.guiro}*1.2 + ${MIX.barsR} + ${MIX.tune} + ${MIX.answerR}`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Credits roll': { intensity: 0.85, bpm: 84 },
      'Hammock': { intensity: 0.4, bpm: 80, swing: 0.45, bright: 0.35 },
      'Last dance': { intensity: 1, bpm: 88, bright: 0.7 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
