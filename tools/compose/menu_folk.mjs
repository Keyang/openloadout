#!/usr/bin/env node
// Writes sounds/menu-folk.json: "Market Lantern Jig", a tavern-door title loop on the folk band (docs/music-styles.md).
// Built on the music kit (kit.mjs) and band('folk') from sound/bands.js.
//
//   A major with a mixolydian G, 104 bpm, 8 bars: A G D A | F#m D E E, the G natural the flat seventh that gives the
//   jig its country lilt; the two E bars hang on the dominant so the loop rolls back into A.
//   Friendly and lilting, lanterns going up over the market square at dusk: strummed strings on the 8ths from the
//   first moment, a round bass on root and fifth, the tune, a frame drum with shaker and tambourine, and a
//   mandolin-like plucked answer with 16th tremolo in the gaps the tune leaves.
//
//   node tools/compose/menu_folk.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_folk.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/menu_folk.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_folk.mjs             when it is ready: write sounds/menu-folk.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars, band } from './kit.mjs';

const B = band('folk');

// Level of each melody instrument for this tune (`--match` on lF).
export const GAINS = [1, 0.807, 1.04, 0.99, 1.58, 1.64, 0.865, 1.31, 1.19, 1.36, 1.08, 1.06, 1.05, 1.56, 1.77, 2.22];

export const CHORDS = 'A G D A | F#m D E E';

// The tune, one token per 16th. Every bar opens on the same lilting figure (a dotted 8th, a 16th, then 8ths stepping
// down); bars 1 and 2 are the phrase, bar 5 says bar 1 again over F#m, and the E bars lean on D (the seventh) before
// the loop falls back to A. The even bars stop halfway so the answer has room.
export const TUNE = [
  'E5 _ _ F#5 E5 _ C#5 _ A4 _ B4 _ C#5 _ _ _',       // A    up a step, down the chord, back up
  'D5 _ _ E5 D5 _ B4 _ G4 _ _ _ _ _ _ _',            // G    the figure on G, the mixolydian G4 held
  'F#5 _ _ E5 D5 _ A4 _ F#4 _ A4 _ D5 _ _ _',        // D    the figure on D
  'C#5 _ _ B4 A4 _ _ _ _ _ _ _ _ _ _ _',             // A    home, ringing: room for the answer
  'C#5 _ _ D5 C#5 _ A4 _ F#4 _ A4 _ C#5 _ _ _',      // F#m  bar 1's shape on F#m
  'D5 _ _ E5 F#5 _ A5 _ F#5 _ _ _ _ _ _ _',          // D    the one climb, to the top A
  'E5 _ _ D5 B4 _ G#4 _ B4 _ E5 _ D5 _ _ _',         // E    D over E: the seventh pulling home
  'B4 _ _ _ G#4 _ _ _ _ _ _ _ _ _ _ _',              // E    hangs on the dominant
];

// The answer: the band's plucked string, mandolin-like, in the gaps of the even bars. A long note is a 16th tremolo
// (the same note picked four times).
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ B4 _ D5 D5 D5 D5',            // G
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ E5 E5 E5 E5 C#5 _ A4 _',          // A
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ A4 _ D5 D5 D5 D5',            // D
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ B4 _ D5 _ E5 E5 E5 E5',           // E    up to E, which bar 1 of the tune picks up
];

// Layers in the specification's intensity order: strum; bass; tune; drums; answer.
// The 32-bar version brings them in in the same order, a section at a time.
export const LAYERS = {
  strum: { intensity: [0, 0.3], floor: 0.6 },          // the strings: always there, at 60% at the bottom
  bass: { intensity: [0.1, 0.2] },                      // round bass, root then fifth
  tune: { section: 2, intensity: [0.25, 0.38] },        // all there by 0.4, so a look at 0.5 keeps it
  drums: { section: 3, intensity: [0.5, 0.6] },         // frame drum, shaker, tambourine
  answer: { section: 4, intensity: [0.75, 0.85] },      // the plucked tremolo answer
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: the tune and drums lean in as it climbs
};

const L = B.kitLevels;
// The strum is pulled back while the tune plays: they share 300 to 1200 Hz and the tune must lead there.
const DIP = '0.4*gTune*lead';
export const MIX = {
  hand: `hO*${L.hand}*0.8*gDrums*gLift`,
  shakerL: `kO*${L.shaker}*0.8*gDrums*gLift`,
  shakerR: `kO*${L.shaker}*0.5*gDrums*gLift`,
  tambL: `tO*${L.tambourine}*0.5*gDrums*gLift`,
  tambR: `tO*${L.tambourine}*0.8*gDrums*gLift`,
  bass: 'bO*0.24*gBass',
  strumL: 'pL*0.75*gStrum',
  strumR: 'pR*0.75*gStrum',
  tune: 'lF*0.7*lead*gTune*gLift',
  answerL: 'eO*0.52*lead*gAnswer',
  answerR: 'eO*0.32*lead*gAnswer',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.strumL} + ${MIX.answerL}`,
  drums: `${MIX.hand} + ${MIX.shakerL} + ${MIX.tambL}`,
  bed: `${MIX.bass} + ${MIX.strumL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const tempo = B.checkTempo([92, 116, 104]);
  return assemble({
    id: 'menu-folk',
    name: 'Market Lantern Jig',
    tags: ['music', 'menu', 'title', ...B.tags, 'loop', 'adaptive'],
    description: 'A friendly, lilting synthesised folk title loop for a market square at dusk, in short or long versions: Intensity brings in strummed strings, a round bass, the tune, a frame drum with shaker and tambourine, and a quick, shimmering, rapidly re-picked mandolin answer; you can change the speed, pitch, lilt and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['fantasy', 'farm'], gameTypes: ['top-down-rpg', 'turn-based-rpg', 'farming-sim'],
      words: ['menu', 'title', 'start screen', ...B.words, 'jig', 'dusk', 'lanterns', 'cheerful'],
      license: 'draft',
    },
    tempo,
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Plucked string' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Lilt', 0, 1, 0.3),
    ],
    nodes: [
      clock({ swing: 'swing' }),                        // the off-16ths lag behind: a lilt
      chords(CHORDS, { tonic: 'A' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- frame drum on the root (1 and 3, a push into 3), shaker on the off-beats, tambourine on 2 and 4
      drumRow('hT', eightBars('X.....x.X.......', { 8: 'X.....x.X...x.x.' })),
      drumRow('kT', '..x...x...x...x.'),
      drumRow('tT', '....X.......X...'),
      B.drums({ hand: 'hT', shaker: 'kT', tambourine: 'tT', noise: 'nz' }),

      // --- round bass, half notes: root, then fifth
      drumRow('bG', 'X.......x.......'),
      noteRow('bQ', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bQ' }),

      // --- strummed strings on the 8ths, down and up strokes (the voice alternates them)
      drumRow('pG', eightBars('X.x.x.x.X.x.x.x.', { 8: 'X.x.x.x.X.x.XxXx' })),
      B.chords('p', { trig: 'pG', dip: DIP }),

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),

      // --- the answer on the band's plucked string
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.hand} + ${MIX.bass}`,
        left: `${MIX.strumL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.shakerL} + ${MIX.tambL}`,
        right: `${MIX.strumR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.shakerR} + ${MIX.tambR}`,
        duck: 'hA*gDrums', duckAmount: 0.15,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      'Title screen': { intensity: 0.85, bpm: 104 },
      'Tavern door': { intensity: 0.45, bpm: 98, swing: 0.4, bright: 0.45, space: 0.18 },
      'Market day': { intensity: 1, bpm: 112, swing: 0.25, bright: 0.7 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
