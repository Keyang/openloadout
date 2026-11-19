#!/usr/bin/env node
// Writes sounds/credits-folk.json: "Lanterns Out", end-credits music on the folk band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs) and band('folk').
//
//   D major, 96 bpm, 8 bars: D G A D | F#m Em Bm G. The fire burning low at the end of a village day: warm, lilting
//   and content. The second half stays on minor chords until its last bar and ends on G, so the loop turns home from
//   G to D, not from A. A round bass in half notes and a shaker in 8ths are there even at Intensity 0; then the
//   strummed strings (down on the beats, up on the "and" of 2 and 4); then the tune (Flute by default: blown over the
//   strums); then the hand drum and the tambourine; and at the top the bright plucked string answers in bars 4 and 8.
//   Slower than menu-folk (104), with a tune of long-short pairs that rests in the second half of most bars.
//
//   node tools/compose/credits_folk.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_folk.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/credits_folk.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_folk.mjs             when it is ready: write sounds/credits-folk.json
import { band, param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('folk');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.811, 0.995, 0.95, 1.51];

export const CHORDS = 'D G A D | F#m Em Bm G';

// The tune, one token per 16th: a lilt of long-short pairs (a dotted 8th, then a 16th), in two-bar phrases.
// Bars 1 and 2 climb the five-note scale (A B D E F#) from the fifth below home to the third and turn back down it.
// Bars 3 and 4 answer a step lower and rest on E, the second, over D. Bars 5 and 6 are bars 1 and 2 a third higher,
// over F#m and Em. Bar 7 makes the one leap (B up a fifth to F#, the fifth of Bm) and bar 8 falls by step (E, D, B)
// to B, the third of G: a step above the A the tune starts on.
export const TUNE = [
  'A4 _ _ B4 D5 _ _ E5 F#5 _ _ _ _ _ _ E5',      // D    up the five notes to the third
  'E5 _ _ D5 B4 _ _ A4 B4 _ _ _ _ _ _ _',        // G    turns back, settles on B
  'G4 _ _ A4 C#5 _ _ D5 E5 _ _ _ _ _ _ D5',      // A    the same climb a step lower
  'D5 _ _ C#5 A4 _ _ D5 E5 _ _ _ _ _ _ _',       // D    turns back, rests on the second
  'C#5 _ _ D5 F#5 _ _ G5 A5 _ _ _ _ _ _ G5',     // F#m  bar 1 a third higher, to the top A
  'G5 _ _ F#5 D5 _ _ C#5 D5 _ _ _ _ _ _ _',      // Em   bar 2 a third higher
  'B4 _ _ _ F#5 _ _ E5 F#5 _ _ _ _ _ _ _',       // Bm   the one leap, a fifth up
  'E5 _ _ D5 B4 _ _ _ _ _ _ _ _ _ _ _',          // G    falls by step to B, which leads back to A
];

// The bright plucked string's answers, at the top of the build: down the D chord in the hole of bar 4, up the G chord
// in bar 8, whose last note is a short tremolo (the same note picked four times).
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST,
  REST,
  REST,
  '_ _ _ _ _ _ _ _ _ _ A5- _ F#5 _ D5 _',         // D    down the chord
  REST,
  REST,
  REST,
  '_ _ _ _ _ _ _ _ G5- _ B5 _ D6 D6- D6 D6-',     // G    up the chord, the top note re-picked
];

// Which layers play, in the brief's order (the same plan as the other credits tracks). `section` is for the Length
// control (the 32-bar version: bed and strums, then the tune, then the drums, then the answers); `intensity` is the
// window in which the Intensity control brings the layer in.
export const LAYERS = {
  bass: { intensity: [0, 0.15], floor: 0.7 },          // at 0: the shaker and the round bass, still music
  strum: { intensity: [0.12, 0.22] },                  // the strummed strings
  tune: { section: 2, intensity: [0.3, 0.4] },         // all there by 0.4, where whole-bundle looks may set it
  drums: { section: 3, intensity: [0.5, 0.6] },        // hand drum and tambourine
  answer: { section: 4, intensity: [0.75, 0.85] },     // the plucked string answers
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and the drums lean in as it builds
};

const L = B.kitLevels;
// The strums are pulled back while the tune plays (`dip`): they share 300 to 1200 Hz and the tune must lead there.
const DIP = '0.3*gTune*lead';
export const MIX = {
  shakerL: `kO*${L.shaker}*1.1*(0.6 + 0.8*bright)`,
  shakerR: `kO*${L.shaker}*0.8*(0.6 + 0.8*bright)`,
  hand: `hO*${L.hand}*1*gDrums*gLift`,
  tambL: `tO*${L.tambourine}*0.65*gDrums*gLift`,
  tambR: `tO*${L.tambourine}*1*gDrums*gLift`,
  bass: 'bO*0.21*gBass',
  strumL: '(pL + qL*0.9)*0.95*gStrum',
  strumR: '(pR + qR*0.9)*0.95*gStrum',
  tune: 'lF*0.52*lead*gTune*gLift',
  answerL: 'eO*0.5*lead*gAnswer',
  answerR: 'eO*0.32*lead*gAnswer',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.strumL} + ${MIX.answerL}`,
  drums: `${MIX.shakerL} + ${MIX.hand} + ${MIX.tambL}`,
  bed: `${MIX.bass} + ${MIX.shakerL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'credits-folk',
    name: 'Lanterns Out',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'A warm, lilting synthesised folk piece for the end credits, as the fire burns low after a village day: a round bass and a shaker, then strummed strings, a tune you could whistle, a hand drum and tambourine, and at the top a bright plucked string answering. Intensity brings the layers in; you can change the length, speed, pitch, bounce and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['farming-sim', 'top-down-rpg', 'turn-based-rpg'],
      words: ['credits', 'ending', ...B.words, 'lanterns', 'campfire', 'cosy', 'whistle'],
      license: 'draft',
    },
    tempo: B.checkTempo([88, 108, 96]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.35),
    ],
    nodes: [
      clock({ swing: 'swing' }),                        // the off-16ths lag behind: the short note of each pair comes late
      chords(CHORDS, { tonic: 'D' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- shaker in 8ths (the bed's pulse); hand drum on 1 and the "and" of 2; tambourine on 2 and 4
      drumRow('kT', 'X.x.x.x.X.x.x.x.'),
      drumRow('hT', 'X.....x.........'),
      drumRow('tT', '....X.......X...'),
      B.drums({ shaker: 'kT', hand: 'hT', tambourine: 'tT', noise: 'nz' }),   // -> kO, hO, tO

      // --- round bass in half notes on 1 and 3: root, then fifth
      drumRow('bG', 'X.......x.......'),
      noteRow('bQ', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bQ' }),                               // -> bO

      // --- strummed strings: down on the beats, up on the "and" of 2 and 4. The band's strum turns its stroke over
      //     at every strum, so one voice plays 1, "and" of 2, 3, "and" of 4 (down, up, down, up) and a second plays
      //     beats 2 and 4, where its stroke is held down (qU).
      drumRow('pG', 'X.....x.X.....x.'),
      B.chords('p', { trig: 'pG', dip: DIP }),                                // -> pL, pR
      drumRow('qG', '....x.......x...'),
      [...B.chords('q', { trig: 'qG', dip: DIP })].map((n) => (n.id === 'qU' ? { id: 'qU', type: 'expr', expr: '0' } : n)),   // -> qL, qR

      // --- the tune, on whichever instrument the listener picks; its held notes ring a little longer
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.25 }),

      // --- the answers on the band's bright plucked string
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),                               // -> eO

      // --- mix: bass and hand drum in the centre; strums wide, the tambourine a little right, the answers a little left
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
      'Credits roll': { intensity: 0.85, bpm: 96 },
      'Last embers': { intensity: 0.4, bpm: 92, swing: 0.45, bright: 0.4 },
      'One more song': { intensity: 1, bpm: 102, swing: 0.25, bright: 0.7 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
