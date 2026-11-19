#!/usr/bin/env node
// Writes sounds/menu-marimba.json: "Tidepool Clockwork", a title-screen loop on the marimba band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs).
//
//   C major, 88 bpm, 8 bars: C Am Dm G | Em Am F G. A curious, gently bouncing puzzle-game title screen, wooden and
//   sunlit, like pieces clicking into place: marimba broken chords in 8ths with long notes rolled, then a bass bar
//   playing half notes as 16th-note rolls, the tune (Flute by default, so it stays apart from the bars), a log drum on
//   the beats with a woodblock on the off-beats and a guiro scraping into bars 4 and 8, and at the top a high marimba
//   counter-line in the gaps the tune leaves.
//
//   node tools/compose/menu_marimba.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_marimba.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/menu_marimba.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_marimba.mjs             when it is ready: write sounds/menu-marimba.json
import { band, param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('marimba');

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.785, 1.03, 0.977, 1.54];

// The commas drop a root an octave, so the broken chords stay from E3 to D5 and leave C5 to A5 to the tune.
export const CHORDS = 'C | Am, | Dm | G, | Em, | Am, | F, | G,';

// The tune, one token per 16th. Pieces clicking into place: each bar opens with a pick-up and a repeated note on
// 16ths 2 and 3 (click-click), then turns. A four-bar phrase that asks (bar 4 stops on B over G), then returns:
// bar 5 is bar 1 a third lower over Em, bar 6 is bar 2, bar 7 is bar 3 a third higher over F, and bar 8 walks down
// the G chord to B, a step from the C the loop starts on. Mostly steps and chord thirds; the one leap is the fourth
// up at the start of bars 1 and 2.
export const TUNE = [
  'G4 _ C5 C5 _ _ E5 _ D5 _ _ C5 D5 _ _ _',      // C    pick-up, click-click, up to E, rocks on D
  'E5 _ A5 A5 _ _ G5 _ E5 _ _ C5 E5 _ _ _',      // Am   the same leap a fourth, from E to A
  'F5 _ F5 E5 _ _ D5 _ A4 _ _ _ D5 _ F5 _',      // Dm   steps down to A, climbs the chord
  'G5 _ _ F5 _ _ D5 _ B4 _ _ _ _ _ _ _',         // G    down to B and waits: a question
  'G4 _ B4 B4 _ _ E5 _ D5 _ _ B4 D5 _ _ _',      // Em   bar 1, over Em
  'E5 _ A5 A5 _ _ G5 _ E5 _ _ C5 E5 _ _ _',      // Am   bar 2 again
  'A5 _ A5 G5 _ _ F5 _ C5 _ _ _ F5 _ A5 _',      // F    bar 3 a third higher
  'B5 _ _ A5 _ _ G5 _ D5 _ _ _ B4 _ _ _',        // G    down the chord to B, home to the C of bar 1
];

// The marimba's counter-line, high, only in the gaps the tune leaves.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ G6- _',           // C
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ E6- _',           // Am
  REST,                                          // Dm   the tune is busy
  '_ _ _ _ _ _ _ _ _ _ B5- _ D6- _ G6 _',        // G    up the chord into the gap
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ E6- _',           // Em
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ C6- _',           // Am
  REST,                                          // F
  '_ _ _ _ _ _ _ _ _ _ G6- _ _ _ D6- _',         // G    into the loop
];

// Which layers play, in the brief's order: bars (always: still music at 0), bass, tune, drums, answer.
// `section` is for the Length control (32 bars: bars and bass, then the tune, then the drums, then everything);
// `intensity` is the window in which the Intensity control brings the layer in.
export const LAYERS = {
  bass: { intensity: [0.08, 0.18] },                   // bass bar rolls
  tune: { section: 2, intensity: [0.26, 0.36] },       // all there by 0.4, where whole-bundle looks may set it
  drums: { section: 3, intensity: [0.48, 0.58] },      // log drum, woodblock, guiro
  top: { section: 4, intensity: [0.72, 0.82] },        // the high marimba answers
  lift: { intensity: [0.3, 1], floor: 0.8 },           // not a layer: the tune and the drums lean in as it builds
};

// The mix, part by part, so each can be measured by itself (`--measure`).
// The broken chords are pulled back while the tune plays (`dip`): they share 300 to 1200 Hz and the tune must lead.
const DIP = '0.45*gTune*lead';
export const MIX = {
  log: 'gO*0.7*gDrums*gLift',
  woodblock: 'wO*0.22*gDrums*gLift',
  guiro: 'uO*0.3*gDrums',
  bass: 'bO*0.4*gBass',
  barsL: 'pB*0.5',
  barsR: 'pB*0.4',
  tune: 'lF*0.5*lead*gTune*gLift',
  answerL: 'eB*0.26*gTop',
  answerR: 'eB*0.4*gTop',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.barsL} + ${MIX.answerL}`,
  drums: `${MIX.log} + ${MIX.woodblock} + ${MIX.guiro}`,
  bed: `${MIX.bass} + ${MIX.barsL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'menu-marimba',
    name: 'Tidepool Clockwork',
    tags: ['music', 'menu', 'title', ...B.tags, 'adaptive', 'loop'],
    description: 'A curious, gently bouncing synthesised marimba loop for a puzzle game\'s title screen: broken chords on wooden bars, then a rolled bass bar, the tune, a log drum, woodblock and guiro, and at the top a high marimba answering the tune. Intensity brings the layers in; you can change the speed, pitch, bounce and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['puzzle', 'arcade'],
      words: ['menu', 'title', 'title screen', 'puzzle', 'marimba', 'wooden', 'mallet', 'sunny', 'curious', 'bouncy', 'playful', 'clockwork'],
      license: 'draft',
    },
    tempo: B.checkTempo([76, 100, 88]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.3),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'C' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the bars: broken chords in 8ths (root, fifth, third, fifth, octave ...); the last beat of the first bar
      // rolls the third in 16ths, the second bar rolls the root for its whole second half
      drumRow('pG', ['x.x.x.x.x.x.xxxx', 'x.x.x.x.xxxxxxxx']),
      noteRow('pK', ['0 _ 2 _ 1 _ 2 _ 3 _ 2 _ 1 1 1 1', '3 _ 2 _ 1 _ 2 _ 0 0 0 0 0 0 0 0']),
      B.chords('p', { trig: 'pG', pick: 'pK', dip: DIP, noise: 'nz' }),   // -> pO
      // Brightness opens the bars: shut, little but their fundamentals; open, their upper partials ring too
      { id: 'pB', type: 'filter', mode: 'lp', in: 'pO', freq: '350 + bright*8000', q: 0.7 },

      // --- bass bar: half notes, root then fifth, each held as a 16th-note roll (accent on the first stroke)
      drumRow('bR', 'XxxxxxxxXxxxxxxx'),
      noteRow('bQ', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bR', semis: 'bQ', note: '48 + tonic', noise: 'nz' }),   // -> bO

      // --- drums: log drum on the beats (root, with its fifth partial), woodblock on the off-beats, guiro scraping
      // into bars 4 and 8 (the last beat of bars 3 and 7)
      drumRow('gT', 'X.......x..x....'),
      drumRow('wT', '..x...x...x...x.'),
      drumRow('uT', ['................', '................', '............X...', '................',
        '................', '................', '............X...', '................']),
      B.drums({ log: 'gT', woodblock: 'wT', guiro: 'uT', noise: 'nz' }),   // -> gO, wO, uO

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),
      // --- the marimba's answers, high in the gaps
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
      'Title screen': { intensity: 0.85, bpm: 88 },
      'Level select': { intensity: 0.5, bpm: 84, bright: 0.4, lead: 0.65, swing: 0.4 },
      'Puzzle solved': { intensity: 1, bpm: 94, bright: 0.7, swing: 0.2 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
