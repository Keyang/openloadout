#!/usr/bin/env node
// Writes sounds/menu-steelpan.json: "Harbour Lights", a title-screen loop on the steelpan band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs).
//
//   G major, 108 bpm, 8 bars: G C Am D | G Em C D. A sunny dockside at golden hour: a shaker in 16ths, a bass pan
//   on the root in a 3+3+2 tresillo, a pan comping on the off-beats, the tune (Flute by default, so it stays apart
//   from the pans), conga on the chord root with a son clave, then pan answers and a cowbell on the beats.
//
//   node tools/compose/menu_steelpan.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_steelpan.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/menu_steelpan.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_steelpan.mjs             when it is ready: write sounds/menu-steelpan.json
import { band, param, clock, chords, arrangement, drumRow, noteRow, chordTone, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('steelpan');

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.79, 1.06, 0.99, 1.78, 1.87, 0.853, 1.26, 1.15, 1.34, 1.16, 1.07, 1.05, 1.62, 1.7];

// The commas drop C an octave (D already sits below G), so every root lies from C to A: the pan comping, which plays
// from middle C plus the root, stays at G4 to E5 at most instead of climbing into the tune's register on C.
export const CHORDS = 'G | C, | Am | D | G | Em | C, | D';

// The tune, one token per 16th. Each bar opens with pushes on 16ths 0, 3 and 6, the bass's 3+3+2 at twice the
// speed, so the tune and the bass lean the same way. A four-bar phrase that steps up from B and asks a question on A, then returns: bar 5 is
// bar 1, bar 6 makes the one leap (B4 up to G5) and steps back down, bar 7 is bar 2, bar 8 rocks on the D chord
// and settles on F#, a fourth above the B that starts the loop again.
export const TUNE = [
  'B4 _ _ C5 _ _ D5 _ _ _ E5 _ D5 _ B4 _',       // G    steps up B C D, turns on E, back to B
  'C5 _ _ D5 _ _ E5 _ _ _ G5 _ E5 _ _ _',        // C    the same steps a tone higher, up to G
  'C5 _ _ B4 _ _ A4 _ _ _ C5 _ E5 _ _ _',        // Am   steps down to A, climbs the chord
  'F#5 _ _ E5 _ _ D5 _ A4 _ _ _ _ _ _ _',        // D    steps down and stops on A: a question
  'B4 _ _ C5 _ _ D5 _ _ _ E5 _ D5 _ B4 _',       // G    bar 1 again
  'G5 _ _ F#5 _ _ E5 _ _ _ D5 _ B4 _ _ _',       // Em   the leap up to G, then down the scale
  'C5 _ _ D5 _ _ E5 _ _ _ G5 _ E5 _ _ _',        // C    bar 2 again
  'F#5 _ _ E5 _ _ F#5 _ _ _ A5 _ F#5 _ _ _',     // D    rocks on F# and A, the chord's own notes, and settles on F#
];

// The pan's answers, at the top of the build: a rising or falling D chord in the hole the tune leaves at the end of
// bars 4 and 8, and one light note at the end of bars 2 and 6. A struck pan sounds only where a note starts.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST,
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ C6- _',           // C
  REST,
  '_ _ _ _ _ _ _ _ _ _ F#5- _ A5 _ D6 _',        // D    up the chord
  REST,
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ B5- _',           // Em
  REST,
  '_ _ _ _ _ _ _ _ _ _ D6- _ A5 _ F#5 _',        // D    and down it, into the loop
];

// Which layers play, in the brief's order. `section` is for the Length control (the 32-bar version: shaker, bass
// and comping, then the tune, then conga and clave, then everything); `intensity` is the window in which the
// Intensity control brings the layer in.
export const LAYERS = {
  bass: { intensity: [0, 0.15], floor: 0.7 },          // at 0: the shaker and the bass pan on the roots, still music
  comp: { intensity: [0.12, 0.22] },                   // the pan on the off-beats
  tune: { section: 2, intensity: [0.3, 0.4] },         // all there by 0.4, where whole-bundle looks may set it
  perc: { section: 3, intensity: [0.5, 0.6] },         // conga on the root, son clave
  top: { section: 4, intensity: [0.75, 0.85] },        // pan answers, cowbell on the beats
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and the drums lean in as it builds
};

// The mix, part by part, so each can be measured by itself (`--measure`).
// The comping is pulled back while the tune plays (`dip`): they share 300 to 1200 Hz and the tune must lead there.
const DIP = '0.45*gTune*lead';
export const MIX = {
  shaker: 'sO*0.3*acc*(0.55 + 0.9*bright)',
  conga: 'dO*0.5*gPerc*gLift',
  clave: 'vO*0.22*gPerc*gLift',
  cowbell: 'wO*0.1*gTop',
  bass: 'bO*0.42*gBass',
  compL: 'pB*0.5*gComp',
  compR: 'pB*0.38*gComp',
  tune: 'lF*0.5*lead*gTune*gLift',
  answerL: 'eB*0.24*gTop',
  answerR: 'eB*0.38*gTop',
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
    id: 'menu-steelpan',
    name: 'Harbour Lights',
    tags: ['music', 'menu', 'title', ...B.tags, 'adaptive', 'loop'],
    description: 'An easy, sunny synthesised steel pan loop for a title screen or save menu: a shaker, a bass pan and off-beat pan chords, then the tune, conga and clave, and at the top pan answers and a cowbell. Intensity brings the layers in; you can change the speed, pitch, bounce and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['puzzle', 'farming-sim', 'arcade'],
      words: ['menu', 'title', 'title screen', 'save', 'harbour', 'dock', 'sunset', 'sunny', 'relaxed', 'steel pan', 'island', 'tropical', 'calypso', 'beach'],
      license: 'draft',
    },
    tempo: B.checkTempo([96, 120, 108]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.25),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'G' }),
      arrangement(LAYERS),
      // "Bounce" also leans on the beat: the shaker's 16ths between the 8th notes get softer as it rises
      { id: 'acc', type: 'expr', expr: '1 - swing*0.5*(1 - c16p)' },
      { id: 'nz', type: 'noise' },

      // --- drums: shaker in 16ths (the bed), conga on the chord root, son clave (3-2), cowbell on the beats
      drumRow('sT', 'XoxoXoxoXoxoXoxo'),
      drumRow('dT', ['o..xX.x.o..xX.xx', 'o..xX.x.o..xX.x.']),
      drumRow('vT', ['X.....X.....X...', '....X...X.......']),
      drumRow('wT', 'x...X...x...X...'),
      B.drums({ shaker: 'sT', conga: 'dT', clave: 'vT', cowbell: 'wT', noise: 'nz' }),   // -> sO, dO, vO, wO

      // --- bass pan: the root in a 3+3+2 tresillo, the last push up the octave
      drumRow('bR', 'X.....x.....x...'),
      noteRow('bQ', '0 _ _ _ _ _ 0 _ _ _ _ _ 12 _ _ _'),
      B.bass('b', { trig: 'bR', semis: 'bQ' }),                     // -> bO

      // --- pan comping on the off-beats: third, fifth, root, fifth (chord-tone numbers), pulled back under the tune
      drumRow('pG', '..x...x...X...x.'),
      noteRow('pK', '1 _ _ _ 2 _ _ _ 0 _ _ _ 2 _ _ _'),
      B.chords('p', { trig: 'pG', pick: 'pK', dip: DIP }),          // -> pO
      // Brightness opens the pans: shut, only their fundamentals; open, their 2nd and 3rd partials ring too
      { id: 'pB', type: 'filter', mode: 'lp', in: 'pO', freq: '600 + bright*5000', q: 0.7 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),
      // --- the pan's answers
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),                    // -> eO
      { id: 'eB', type: 'filter', mode: 'lp', in: 'eO', freq: '900 + bright*6000', q: 0.7 },

      // --- mix: bass and conga in the centre; comping a little left, answers a little right, shaker and tune both
      bus({
        centre: `${MIX.bass} + ${MIX.conga}`,
        left: `${MIX.shaker}*1.1 + ${MIX.clave}*1.2 + ${MIX.cowbell}*0.8 + ${MIX.compL} + ${MIX.tune} + ${MIX.answerL}`,
        right: `${MIX.shaker}*0.9 + ${MIX.clave}*0.8 + ${MIX.cowbell}*1.2 + ${MIX.compR} + ${MIX.tune} + ${MIX.answerR}`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Title screen': { intensity: 0.85, bpm: 108 },
      'Save select': { intensity: 0.5, bpm: 102, bright: 0.45, lead: 0.65, swing: 0.35 },
      'Press start': { intensity: 1, bpm: 114, bright: 0.75, swing: 0.15 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
