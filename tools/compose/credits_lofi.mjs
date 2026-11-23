#!/usr/bin/env node
// Writes sounds/credits-lofi.json: "Save File Sunset", end-credits music on the lofi band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs) and band('lofi'), after menu_lofi.mjs.
//
//   D flat major, 70 bpm, swung, 32 bars by default: Dbmaj7 Fm7 Bbm7 Gbmaj7 | Ebm7 Ab7 Dbmaj7 Ab7. The controller
//   set down at golden hour: warm, hazy and content, replaying the good moments. In the order Intensity brings them
//   in: a crackle bed and electric-piano seventh chords (there at 0, so it is still music), a warm bass laid back on
//   1 and the and-of-2, the tune (Bell by default) through the band's wobble and crush, a dusty kick, snare and hat
//   with a strong swing, and at the top an electric-piano answer between the tune's phrases. A tape finish on the
//   whole mix. Slower and in a major key where menu-lofi (76 bpm, F minor) is a rainy-night minor.
//
//   node tools/compose/credits_lofi.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_lofi.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/credits_lofi.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_lofi.mjs             when it is ready: write sounds/credits-lofi.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, band, tape } from './kit.mjs';

const B = band('lofi');

// Level of each melody instrument for this tune, measured after the band's colour chain (`--match`).
export const GAINS = [1, 0.785, 1.06, 1.08, 1.5, 2.33, 0.831, 1.26, 1.2, 1.23, 0.733, 1, 0.784, 1.65, 1.5, 2.1];

export const CHORDS = 'Db Fm Bbm Gb | Ebm Ab Db Ab';
// The sevenths, in semitones above each bar's root: Dbmaj7 Fm7 Bbm7 Gbmaj7 | Ebm7 Ab7 Dbmaj7 Ab7.
const SEVENTHS = '11 | 10 | 10 | 11 | 10 | 10 | 11 | 10';

// The tune, one token per 16th, its long notes on chord tones. A two-bar phrase that rises from the tonic to A flat
// and drifts back down the F minor chord; then the one leap (B flat up to F) and a step down to B flat under G flat:
// a question. Bars 5 and 6 are bars 1 and 2 a step higher, on E flat minor and A flat seven; bars 7 and 8 step down
// to C, a half step under the D flat that starts the loop again.
export const TUNE = [
  'Db5 _ _ _ _ _ _ _ _ Eb5- F5 _ Ab5 _ _ _',    // Dbmaj7  up from the tonic, a swung Eb on the way
  'Ab5 _ _ _ _ _ _ _ F5 _ _ Eb5- C5 _ _ _',     // Fm7     back down the chord
  'Bb4 _ _ _ _ _ _ _ F5 _ _ _ Eb5- _ Db5 _',    // Bbm7    the leap, then steps down
  'Db5 _ _ _ _ _ _ _ Bb4 _ _ _ _ _ _ _',        // Gbmaj7  held Bb: the question
  'Eb5 _ _ _ _ _ _ _ _ F5- Gb5 _ Bb5 _ _ _',    // Ebm7    bar 1's rise, a step higher
  'Ab5 _ _ _ _ _ _ _ Gb5 _ _ Eb5- C5 _ _ _',    // Ab7     bar 2's fall, through the seventh
  'F5 _ _ _ _ _ _ _ _ Eb5- Db5 _ _ _ _ _',      // Dbmaj7  steps down to the tonic
  'C5 _ _ _ _ _ _ _ _ Bb4- C5 _ _ _ _ _',       // Ab7     C, leading up to the loop's first Db
];

// The answer, on the band's electric piano: low and short, in the holes the tune leaves between its phrases.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST,
  '_ _ _ _ F4 _ Ab4- _ _ _ _ _ _ _ _ _',          // Fm7     under the held C
  REST,
  '_ _ _ _ Bb3 _ Db4- _ _ _ _ _ Gb4 _ Db4- _',    // Gbmaj7  under the held Bb: the answer to the question
  REST,
  '_ _ _ _ C4 _ Eb4- _ _ _ _ _ _ _ _ _',          // Ab7     under the held Eb
  REST,
  '_ _ _ _ Gb4 _ Eb4- _ _ _ _ _ C4 _ Ab3- _',     // Ab7     down the chord, into the loop
];

// Which layers play, in the brief's intensity order. `section` is for Length (32 bars: crackle and keys, then the
// bass, then the tune, then the drums, then the answer; 8 bars is the full band).
export const LAYERS = {
  bed: {},                                              // the crackle: at every intensity
  keys: { intensity: [0, 0.12], floor: 0.8 },          // the seventh chords: there at 0, so it is still music
  bass: { intensity: [0.12, 0.22] },
  tune: { section: 2, intensity: [0.3, 0.4] },          // in by 0.4, so every look keeps the tune
  drums: { section: 3, intensity: [0.5, 0.6] },
  answer: { section: 4, intensity: [0.75, 0.85] },      // last in, and in by the default (0.85)
  lift: { intensity: [0.4, 1], floor: 0.8 },            // the tune and the drums lean in as intensity climbs
};

// The mix, part by part. The chords sit under the tune's register; keysDip pulls them back while the tune plays.
// The keys are spread: a little more left, the answer a little more right.
const keysDip = '(1 - 0.3*gTune*lead)';
export const MIX = {
  crackle: 'xO*0.12*gBed',
  kick: 'kO*0.45*gDrums*gLift',
  snare: 'sO*0.38*gDrums*gLift',
  hat: 'hO*0.3*gDrums*gLift',
  bass: '(bO*0.16 + bU*0.07)*gBass',
  keysL: `pH*0.55*gKeys*${keysDip}`,
  keysR: `pH*0.45*gKeys*${keysDip}`,
  tune: 'lcO*0.5*lead*gTune*gLift',
  answerL: 'eO*0.17*0.8*lead*gAnswer',
  answerR: 'eO*0.17*1.2*lead*gAnswer',
};
const LEVEL = 1.15;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.keysL} + ${MIX.answerL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.crackle}`,
  bed: `${MIX.bass} + ${MIX.keysL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const fin = tape('tp', { left: 'mL', right: 'mR', cutoff: '3500 + bright*3500' });
  return assemble({
    id: 'credits-lofi',
    name: 'Save File Sunset',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'Warm, hazy, swung synthesised lo-fi music for the end credits, the controller set down at golden hour: Intensity brings in the electric-piano-like chords over a crackle bed, a warm bass, the tune, dusty drums and an electric-piano answer, and you can change the length, speed, pitch, swing and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral', 'city'], gameTypes: ['arcade', 'turn-based-rpg', 'platformer'],
      words: ['credits', 'ending', 'sunset', 'golden hour', 'lofi', 'chill', 'warm', 'hazy', 'nostalgic', 'content', 'tape', 'dusty', 'mellow', 'electric piano'],
      license: 'draft',
    },
    tempo: B.checkTempo([64, 80, 70]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Bell' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Swing', 0, 1, 0.65),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'Db' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: a lazy boom-bap on the swung clock (the kick's push and the open hats fall on the swung 16ths, so
      // Swing moves them), and the crackle bed from the first step
      drumRow('kT', 'X......x..X.....'),
      drumRow('sT', '....X.......X...'),
      drumRow('hT', 'x.x.x.xox.x.x.xo'),
      drumRow('xT', 'X...............'),
      B.drums({ kick: 'kT', snare: 'sT', hat: 'hT', crackle: 'xT', noise: 'nz' }),   // -> kO, sO, hO, xO

      // --- bass: the root on 1, its octave on the and-of-2, laid back by the swung clock. Root and octave only, so
      // the bar's chord is named by its root and the keys (a fifth here outweighed every root in the pitch count)
      drumRow('bG', 'X.....x.........'),
      noteRow('bS', '0 _ _ _ _ _ 12 _ _ _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bS' }),
      // its body: the 2nd and 4th harmonics (octaves of the root), so a phone speaker still hears the line
      { id: 'bU2', type: 'osc', freq: 'bHz*2' },
      { id: 'bU3', type: 'osc', freq: 'bHz*4' },
      { id: 'bU', type: 'expr', expr: '(bU2*0.6 + bU3*0.5)*bA*bV' },

      // --- the seventh chords on the electric piano: on 1, the and-of-3, and a push on the 4
      drumRow('pG', 'X.......X...x...'),
      noteRow('pE', SEVENTHS, { every: 16 }),
      B.chords('p', { trig: 'pG', extra: 'pE' }),
      { id: 'pH', type: 'filter', mode: 'hp', in: 'pO', freq: 300, q: 0.6 },   // thinned below the tune, as lo-fi keys are

      // --- the tune, on whichever instrument the listener picks, through the band's wobble and crush
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.5 }),
      B.colour('lc', { input: 'lF' }),

      // --- the answer, on the band's electric piano
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.keysL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.hat}*0.9 + ${MIX.crackle}*1.2`,
        right: `${MIX.keysR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.hat}*1.1 + ${MIX.crackle}*0.8`,
        duck: 'kA*gDrums', duckAmount: 0.2,
        ...B.room, level: LEVEL,
      }),
      fin,
    ],
    out: ['tpL', 'tpR'],
    presets: {
      'Controller down': { intensity: 0.4, bpm: 67 },
      'Rolling credits': { intensity: 0.85, bpm: 70 },
      'Golden hour': { intensity: 1, bpm: 74, bright: 0.5, swing: 0.55 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
