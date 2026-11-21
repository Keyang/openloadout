#!/usr/bin/env node
// Writes sounds/hearthvale-overworld.json: "Overworld theme", the map music of the Hearthvale action-adventure kit
// (bundles/specs/kit-adventure-hearthvale.md, batch AM1). Built on the music kit (kit.mjs) and band('folk') from
// sound/bands.js, after menu_folk.mjs (the same band and row layout) and hearthvale_village.mjs (this world's tone).
//
//   D major, 112 bpm, 8 bars: D A Bm G | Em D F#m A. Striding, open-air, hopeful: a road with a long way to go.
//   Strummed strings on the 8ths (down on the beats, up between), a round bass on root and fifth, a tune that walks
//   up by steps and comes down again, a shaker, a hand drum and a tambourine, and at the top a plucked string that
//   answers with a 16th tremolo in bars 4 and 8 while the strum is doubled an octave up. "Lilt" swings the 8th notes.
//
//   node tools/compose/hearthvale_overworld.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/hearthvale_overworld.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/hearthvale_overworld.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/hearthvale_overworld.mjs             when it is ready: write sounds/hearthvale-overworld.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars, band, strum } from './kit.mjs';

const B = band('folk');

// Level of each melody instrument for this tune (`--match` on lF).
export const GAINS = [1, 0.827, 1.04, 1.02, 1.92];

export const CHORDS = 'D A Bm G | Em D F#m A';

// The tune, one token per 16th. A striding 2-bar phrase: a long F#4 (the third) with a soft turn through G4, up to
// A4, a soft B4 over the top and back to A4 (a note of the chord), then down by steps to D4. Bars 3 and 4 say it a third
// higher, on B4 and D5 over Bm, and rest on B4 over G. Bars 5 to 8 answer: the one leap (E4 up an octave to E5) and a long walk
// down by steps to E4 over A, which leads back to the F#. No bar opens on a repeated note, and every held note is
// a note of its bar's chord.
export const TUNE = [
  'F#4 _ _ _ G4- _ F#4 _ A4 _ B4- _ A4 _ _ _',     // D    a long F#, a soft turn on it, up to A, a soft look over the top and back
  'G4- _ F#4- _ E4 _ _ _ _ _ _ _ _ _ D4- _',       // A    on down by steps: E leans on the chord, D closes the phrase
  'A4 _ _ _ B4 _ D5 _ _ _ E5- _ D5 _ _ _',         // Bm   the same stride a third higher, on the notes of the chord
  'D5 _ C#5- _ B4 _ A4 _ B4 _ _ _ _ _ _ _',        // G    down and back to B, ringing: room for the answer
  'E4 _ _ _ E5 _ _ _ _ _ _ _ F#5 _ E5 _',          // Em   the one leap, an octave, and a turn at the top
  'D5 _ _ _ _ _ _ _ C#5- _ B4- _ A4 _ G4- _',      // D    the walk down begins
  'F#4 _ _ _ _ _ _ _ G4- _ F#4 _ _ _ _ _',         // F#m  on the root, with one soft look back later in the bar
  'E4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',              // A    the fifth of A: a step under the F# the loop starts on
];

// The answer: the band's plucked string in the holes of bars 4 and 8. A long note is a 16th tremolo (the same note
// picked four times).
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST, REST, REST,
  '_ _ _ _ _ _ _ _ _ _ G5 G5 G5 G5 D5 _',            // G    the top of the chord, shimmering, then its fifth
  REST, REST, REST,
  '_ _ _ _ _ _ A4 _ C#5 C#5 C#5 C#5 E5 E5 E5 E5',    // A    up the chord in two tremolos
];

// Layers in the specification's intensity order: strum and bass; the tune and the shaker; hand drum and tambourine;
// the answer and the strum an octave up. The 32-bar version opens with strum and bass, then the tune, then the
// drums, then everything.
export const LAYERS = {
  strum: { intensity: [0, 0.25], floor: 0.7 },          // the strings: always there, a little fuller as it builds
  bass: { intensity: [0, 0.2], floor: 0.8 },            // with the strum from the first moment
  tune: { section: 2, intensity: [0.25, 0.38] },        // all there by 0.4, so a look at 0.4 keeps it
  shake: { section: 3, intensity: [0.3, 0.45] },        // the shaker comes with the tune
  drums: { section: 3, intensity: [0.5, 0.62] },        // hand drum and tambourine
  top: { section: 4, intensity: [0.75, 0.85] },         // the answer line, and the strum an octave up
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: the tune and drums lean in as it climbs
};

const L = B.kitLevels;
// The strum is pulled back while the tune plays: they share 300 to 1200 Hz and the tune must lead there.
const DIP = '0.4*gTune*lead';
export const MIX = {
  hand: `hO*${L.hand}*0.8*gDrums*gLift`,
  shakerL: `kO*${L.shaker}*0.85*gShake*gLift`,
  shakerR: `kO*${L.shaker}*0.55*gShake*gLift`,
  tambL: `tO*${L.tambourine}*0.5*gDrums*gLift`,
  tambR: `tO*${L.tambourine}*0.8*gDrums*gLift`,
  bass: 'bO*0.24*gBass',
  strumL: '(pL + qR*0.4*gTop)*0.75*gStrum',
  strumR: '(pR + qL*0.4*gTop)*0.75*gStrum',
  tune: 'lF*0.7*lead*gTune*gLift',
  answerL: 'eO*0.34*lead*gTop',
  answerR: 'eO*0.52*lead*gTop',
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
  const tempo = B.checkTempo([100, 124, 112]);
  return assemble({
    id: 'hearthvale-overworld',
    name: 'Overworld theme',
    tags: ['music', 'overworld', ...B.tags, 'loop', 'adaptive'],
    description: 'Striding, open-air, hopeful synthesised folk music for walking the map, in short or long versions: strummed strings and a round bass, then Intensity brings in the tune and a shaker, a hand drum and tambourine, and a quick, shimmering plucked answer; you can change the speed, pitch, lilt and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/exploration', themes: ['fantasy', 'forest'], gameTypes: ['top-down-rpg', 'turn-based-rpg', 'farming-sim'],
      words: ['overworld', 'map', 'road', 'journey', 'adventure', 'explore', 'walk', 'travel', 'fields', 'hopeful', 'folk', 'strummed', 'plucked', 'countryside'],
      license: 'draft',
    },
    tempo,
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Lilt', 0, 1, 0.2),
    ],
    nodes: [
      clock({ swing: 'swing*0.6', on: 8 }),             // the 8th between two beats comes late: the up strokes lag
      chords(CHORDS, { tonic: 'D' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- hand drum on 1, the "and" of 2 and 3; shaker in 8ths; tambourine on 2 and 4
      drumRow('hT', eightBars('X.....x.X.......', { 8: 'X.....x.X.....x.' })),
      drumRow('kT', 'x.o.x.o.x.o.x.o.'),
      drumRow('tT', '....X.......X...'),
      B.drums({ hand: 'hT', shaker: 'kT', tambourine: 'tT', noise: 'nz' }),   // -> hO, kO, tO

      // --- round bass, half notes: root on 1, fifth on 3
      drumRow('bG', 'X.......x.......'),
      noteRow('bQ', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bQ' }),                               // -> bO

      // --- strummed strings on the 8ths: down strokes on the beats, up strokes between (the voice alternates them)
      drumRow('pG', 'X.x.x.x.X.x.x.x.'),
      B.chords('p', { trig: 'pG', dip: DIP }),                                // -> pL, pR
      // the same strum an octave up, for the top of the build (its sides swapped in the mix)
      strum('q', { trig: 'pG', note: '60 + tonic', decay: 0.7, dip: DIP }),   // -> qL, qR

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.4 }),

      // --- the answer on the band's plucked string
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),                               // -> eO

      // --- mix: bass and hand drum in the centre; strums wide, shaker a little left, tambourine and answer a little right
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
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Setting out': { intensity: 0.45, bpm: 106, bright: 0.5, swing: 0.3 },
      'Open fields': { intensity: 0.85, bpm: 112 },
      'Far from home': { intensity: 1, bpm: 118, bright: 0.7, swing: 0.1, space: 0.18 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
