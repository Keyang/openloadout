#!/usr/bin/env node
// Writes sounds/thornwood-rest.json: "Fireside theme", the music of the safe room between two areas of the Thornwood
// side-view roguelike kit (bundles/specs/kit-roguelike-thornwood.md, batch TM2). Built on the music kit (kit.mjs)
// and band('folk') from sound/bands.js.
//
//   D major, 100 bpm, 8 bars: D Em G D | Bm F#m G A (I ii IV I | vi iii IV V). Warm, unhurried, a little tired:
//   one slow strum on beat 1 and a soft up-stroke on the "and" of 3, a round bass in half notes (root, fifth), a tune
//   of long notes that never fills beat 4, a shaker on the off-beats, a hand drum on 1 and the "and" of 2, a
//   tambourine on beat 4 of bars 4 and 8, and the band's plucked string a sixth under the tune in bars 5 to 8.
//
//   node tools/compose/thornwood_rest.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/thornwood_rest.mjs --match     measure the ten melody instruments and the six that play along, print matching gains
//   node tools/compose/thornwood_rest.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/thornwood_rest.mjs             when it is ready: write sounds/thornwood-rest.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars, band } from './kit.mjs';

const B = band('folk');

// Level of each melody instrument for this tune (`--match` on lF).
export const GAINS = [1, 0.756, 1.02, 0.948, 1.59, 2.05, 0.803, 1.18, 1.14, 1.27, 0.684, 0.692, 0.64, 1.19, 1.13, 1.45];

export const CHORDS = 'D Em G D | Bm F#m G A';

// The tune, one token per 16th. Every phrase starts on beat 1 and no note starts on beat 4. Bars 1 to 3 are one
// figure (a note held two beats, then two short ones, the second on the "and" of 3) stepping down to a long A;
// bars 5 and 6 climb their chords in quarter notes to the same F#, bar 7 is the figure again from the top G, and
// bar 8 rests on E, a step above home, so the loop falls back to the F# that starts it. Range A4 to G5.
export const TUNE = [
  'F#5 _ _ _ _ _ _ _ E5- _ D5- _ _ _ _ _',           // D    held, then a step and a step down to home
  'E5 _ _ _ _ _ _ _ G5- _ E5- _ _ _ _ _',            // Em   the figure a step lower, with the one skip up
  'D5 _ _ _ _ _ _ _ B4- _ D5- _ _ _ _ _',            // G    lower again, dipping to B
  'A4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',                // D    A held three beats and left to ring
  'B4 _ _ _ D5 _ _ _ F#5 _ _ _ _ _ _ _',             // Bm   up the chord
  'A4 _ _ _ C#5 _ _ _ F#5 _ _ _ _ _ _ _',            // F#m  up the chord from a step lower, to the same top
  'G5 _ _ _ _ _ _ _ F#5- _ E5- _ _ _ _ _',           // G    the figure from the highest note, coming home
  'E5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',                // A    a step above home
];

// The lower voice: the band's plucked string a sixth below the tune in bars 5 to 8 (silent in bars 1 to 4).
export const LOWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  'D4 _ _ _ F#4 _ _ _ A4 _ _ _ _ _ _ _',             // Bm
  'C#4 _ _ _ E4 _ _ _ A4 _ _ _ _ _ _ _',             // F#m
  'B4 _ _ _ _ _ _ _ A4- _ G4- _ _ _ _ _',            // G
  'G4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',                // A
];

// Layers in the specification's intensity order: strum and bass; the tune and the shaker; the hand drum; the lower
// voice and the tambourine. The 32-bar version: strum and bass, then the tune, then the drums, then everything.
export const LAYERS = {
  strum: { intensity: [0, 0.25], floor: 0.7 },          // always there, a little fuller as it builds
  bass: { intensity: [0, 0.2], floor: 0.75 },           // always there
  tune: { section: 2, intensity: [0.25, 0.38] },        // all there by 0.4, so a look at 0.5 keeps it
  shaker: { section: 3, intensity: [0.25, 0.38] },
  hand: { section: 3, intensity: [0.5, 0.6] },
  low: { section: 4, intensity: [0.75, 0.85] },         // the lower voice and the tambourine
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: the tune and drums lean in as it climbs
};

const L = B.kitLevels;
// The strum is pulled back while the tune plays: they share 300 to 1200 Hz and the tune must lead there.
const DIP = '0.3*gTune*lead';
export const MIX = {
  hand: `hO*${L.hand}*0.85*gHand*gLift`,
  shakerL: `kO*${L.shaker}*2*gShaker*gLift`,
  shakerR: `kO*${L.shaker}*1.3*gShaker*gLift`,
  tambL: `tO*${L.tambourine}*0.5*gLow*gLift`,
  tambR: `tO*${L.tambourine}*0.8*gLow*gLift`,
  bass: 'bO*0.19*gBass',
  strumL: 'pL*0.8*gStrum',
  strumR: 'pR*0.8*gStrum',
  tune: 'lF*0.85*lead*gTune*gLift',
  lowerL: 'eO*0.5*lead*gLow',
  lowerR: 'eO*0.34*lead*gLow',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.strumL} + ${MIX.lowerL}`,
  drums: `${MIX.hand} + ${MIX.shakerL} + ${MIX.tambL}`,
  bed: `${MIX.bass} + ${MIX.strumL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const tempo = B.checkTempo([88, 112, 100]);
  return assemble({
    id: 'thornwood-rest',
    name: 'Fireside theme',
    tags: ['music', 'shop', 'rest', ...B.tags, 'loop', 'adaptive'],
    description: 'Warm, unhurried, slightly tired synthesised folk music for a safe room between two fights, in short or long versions: Intensity brings in slow strummed strings and a round bass, then the tune and a shaker, then a hand drum, then a second plucked string under the tune and a tambourine; you can change the speed, pitch, lilt and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/shop', themes: ['fantasy', 'forest'], gameTypes: ['roguelike-action', 'platformer', 'top-down-rpg'],
      words: ['shop', 'rest', 'safe room', 'campfire', 'fireside', 'calm', 'warm', 'gentle', 'merchant', ...B.words.slice(0, 4)],
      license: 'draft',
    },
    tempo,
    defaults: { ...B.defaults, intensity: 0.7, bars: 16, inst: 'Plucked string', space: 0.12 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Lilt', 0, 1, 0.2),
    ],
    nodes: [
      clock({ swing: 'swing', on: 8 }),                 // the tune is in 8ths: the 8th between two beats comes late
      chords(CHORDS, { tonic: 'D' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- hand drum on 1 and the "and" of 2, shaker on the off-beats, tambourine on beat 4 of bars 4 and 8
      drumRow('hT', 'X.....o.........'),
      drumRow('kT', '..x...x...x...x.'),
      drumRow('tT', eightBars('................', { 4: '............X...', 8: '............X...' })),
      B.drums({ hand: 'hT', shaker: 'kT', tambourine: 'tT', noise: 'nz' }),

      // --- round bass, half notes: root, then fifth
      drumRow('bG', 'X.......x.......'),
      noteRow('bQ', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bQ' }),

      // --- strummed strings: a down-stroke on beat 1, a soft up-stroke on the "and" of 3 (the voice alternates them)
      drumRow('pG', 'X.........o.....'),
      B.chords('p', { trig: 'pG', dip: DIP }),

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),

      // --- the lower voice on the band's plucked string
      melody('e', LOWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.hand} + ${MIX.bass}`,
        left: `${MIX.strumL} + ${MIX.tune} + ${MIX.lowerL} + ${MIX.shakerL} + ${MIX.tambL}`,
        right: `${MIX.strumR} + ${MIX.tune} + ${MIX.lowerR} + ${MIX.shakerR} + ${MIX.tambR}`,
        duck: 'hA*gHand', duckAmount: 0.12,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% and stop at the range: the fastest style leaves them room
      'By the fire': { intensity: 0.45, bpm: 94, bright: 0.45, space: 0.18, swing: 0.3 },
      "Keeper's wares": { intensity: 0.7, bpm: 100 },
      'Before the gate': { intensity: 1, bpm: 106, bright: 0.65, swing: 0.1 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
