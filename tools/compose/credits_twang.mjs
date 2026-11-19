#!/usr/bin/env node
// Writes sounds/credits-twang.json: "Ride Out Slow", end-credits music on the twang band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs) and band('twang').
//
//   A major, 104 bpm, 8 bars: A D A F#m | D E A E. Riding into the sunset after the showdown: unhurried and warm, a
//   tip of the hat to the crew. A walking upright bass is there even at Intensity 0; then muted strums on the
//   off-beats; then the tune (Plucked string by default) through the spring; then a soft train beat (kick on 1 and 3,
//   brushes in 8ths, a rim click on 4); and at the top twang guitar licks answer the tune in bars 2, 4 and 8.
//   Slower than menu-twang (112) and with longer notes: every tune bar ends on a held note, no dotted skip.
//
//   node tools/compose/credits_twang.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_twang.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/credits_twang.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_twang.mjs             when it is ready: write sounds/credits-twang.json
import { band, param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars } from './kit.mjs';

const B = band('twang');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.819, 1.05, 0.977, 1.74];

// Roots within a fourth below and a fifth above A: D up a fourth, F# and E below, so the walking bass stays low.
export const CHORDS = 'A D A F#m | D E A E';

// The tune, one token per 16th, at a horse's walk: every bar ends on a long held note and the bars take turns.
// Bars 1 and 7 climb in two steps to a held note, bar 3 rocks with a pickup into bar 4, bars 5 and 6 walk down in
// four notes; bars 2, 4 and 8 say less (a quarter, a quick two, then rest) and leave beats 3 and 4 to the twang licks. Bar 1 climbs the A chord from E,
// bar 3 rocks between C# and E, bar 4 climbs to a held F#, bars 5 and 6 come down the D and E chords, bar 7
// climbs A again from A, and bar 8 lands on G#, which leans into the A of bar 1.
export const TUNE = [
  'E4 _ _ _ A4 _ _ _ _ _ C#5 _ _ _ _ _',         // A    up the chord from the fifth below
  'D5 _ _ _ C#5 _ A4 _ _ _ _ _ _ _ _ _',         // D    falls to A, room for a lick
  'C#5 _ _ _ _ _ E5 _ _ _ C#5 _ _ _ E5 _',       // A    rocks, then a pickup into bar 4
  'C#5 _ _ _ E5 _ F#5 _ _ _ _ _ _ _ _ _',        // F#m  up to the F# and holds it, room for a lick
  'A5 _ _ _ _ _ F#5 _ D5 _ A4 _ _ _ _ _',        // D    the top, then the way back down the D chord
  'E5 _ _ _ B4 _ _ _ G#4 _ B4 _ _ _ _ _',        // E    down the E chord and back to its fifth
  'A4 _ _ _ C#5 _ _ _ _ _ E5 _ _ _ _ _',         // A    bar 1's climb, from the root
  'E5 _ _ _ B4 _ G#4 _ _ _ _ _ _ _ _ _',         // E    settles on G#, a lick carries it home
];

// The answer: low twang licks through the spring in the holes the tune leaves (bars 2, 4 and 8, beats 3 and 4).
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const LICKS = [
  REST,
  '_ _ _ _ _ _ _ _ A3 _ _ F#3 _ E3- D3 _',           // D    an easy fall down the D chord to its root
  REST,
  '_ _ _ _ _ _ _ _ _ C#4 A3- _ F#3 _ _ A3',         // F#m  off the beat, down the chord, A picks up into D
  REST,
  REST,
  REST,
  '_ _ _ _ _ _ _ _ D4 _ B3- _ G#3 _ E3 _',           // E    down the E seventh, E rings into A
];

// The walking bass: quarter notes in semitones above the bar's root (A2 = 0). Beats 1 and 3 sit on chord tones
// (root, then fifth or root), beats 2 and 4 pass, and beat 4 steps into the next bar's root.
//                       A -> D              D -> A                A -> F#             F#m -> D
const WALK = ['0 _ _ _ 4 _ _ _ 7 _ _ _ 4 _ _ _', '0 _ _ _ -1 _ _ _ -5 _ _ _ -3 _ _ _', '0 _ _ _ 4 _ _ _ 0 _ _ _ -1 _ _ _', '0 _ _ _ 3 _ _ _ 7 _ _ _ 5 _ _ _',
  //                     D -> E              E -> A                A -> E              E -> A
  '0 _ _ _ 4 _ _ _ -5 _ _ _ -8 _ _ _', '0 _ _ _ 4 _ _ _ 7 _ _ _ 4 _ _ _', '0 _ _ _ -1 _ _ _ -5 _ _ _ -3 _ _ _', '0 _ _ _ 4 _ _ _ 7 _ _ _ 4 _ _ _'];

// Layers in the brief's order: walking bass; muted strums; the tune; the train beat; the licks. The 32-bar version
// brings them in in the same order, a section at a time.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.85 },              // the walking bass: always there
  strum: { intensity: [0.12, 0.22] },                   // the muted off-beat strums
  tune: { section: 2, intensity: [0.3, 0.4] },          // all there by 0.4
  beat: { section: 3, intensity: [0.5, 0.6] },          // kick, brushes and rim
  licks: { section: 4, intensity: [0.75, 0.85] },       // twang guitar answering the tune
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: the tune and drums lean in as it climbs
};

const L = B.kitLevels;
export const MIX = {
  kick: `kO*${L.kick}*0.6*gBeat*gLift`,
  snare: `sO*${L.snare}*0.85*gBeat*gLift`,
  rim: `rO*${L.rim}*gBeat*gLift`,
  bass: 'bO*0.5*gBed',
  strumL: 'uL*0.7*gStrum',
  strumR: 'uR*0.7*gStrum',
  tune: 'lcO*0.5*lead*gTune*gLift',
  licksL: 'eO*0.56*lead*gLicks',
  licksR: 'eO*0.36*lead*gLicks',
};
const LEVEL = 0.92;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.strumL} + ${MIX.licksL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.rim}`,
  bed: `${MIX.bass} + ${MIX.strumL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'credits-twang',
    name: 'Ride Out Slow',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'An unhurried, warm synthesised western piece for the end credits, riding into the sunset after the showdown: a walking upright bass, then muted off-beat strums, the tune through a spring echo, a soft brushed train beat, and at the top twangy guitar licks answering the tune. Intensity brings the layers in; you can change the length, speed, pitch, shuffle and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['shooter', 'arcade', 'platformer'],
      words: ['credits', 'ending', 'farewell', 'sunset', 'ride', ...B.words.filter((w) => w !== 'spring' && w !== 'surf'), 'warm', 'unhurried'],
      license: 'draft',
    },
    tempo: B.checkTempo([100, 116, 104]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Plucked string', bright: 0.6, space: 0.18 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Shuffle', 0, 1, 0.3),
    ],
    nodes: [
      clock({ swing: 'swing', on: 8 }),                 // the off-beat 8ths lag behind: a lazy shuffle
      chords(CHORDS, { tonic: 'A' }),                   // roots A, D up a fourth, F# and E below
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- soft train beat: kick on 1 and 3, brushes on every 8th (bar 8 rolls into the top), rim on 4
      drumRow('kT', 'X.......X.......'),
      drumRow('sT', eightBars('o.x.o.x.o.x.o.x.', { 8: 'o.x.o.x.o.x.oxxX' })),
      drumRow('rT', '............X...'),
      B.drums({ kick: 'kT', snare: 'sT', rim: 'rT', noise: 'nz' }),

      // --- walking upright bass, quarter notes
      drumRow('bG', 'X...x...X...x...'),
      noteRow('bQ', WALK),
      B.bass('b', { trig: 'bG', semis: 'bQ' }),

      // --- muted strums on the off-beats; bar 8 pushes into the top
      drumRow('uG', eightBars('..x...x...x...x.', { 8: '..x...x...x.x.X.' })),
      B.chords('u', { trig: 'uG' }),

      // --- the tune, on whichever instrument the listener picks, through the band's spring
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.2 }),
      B.colour('lc', { input: 'lF' }),

      // --- answering licks on the twang guitar (with its own spring)
      melody('e', LICKS, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.rim} + ${MIX.bass}`,
        left: `${MIX.strumL} + ${MIX.tune} + ${MIX.licksL}`,
        right: `${MIX.strumR} + ${MIX.tune} + ${MIX.licksR}`,
        duck: 'kA*gBeat', duckAmount: 0.15,
        send: `sO*${L.snare}*0.3*gBeat`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Credits roll': { intensity: 0.85, bpm: 104 },
      'Campfire embers': { intensity: 0.45, bpm: 102, swing: 0.45, bright: 0.45, space: 0.22 },
      'Over the ridge': { intensity: 1, bpm: 110, swing: 0.2, bright: 0.75 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
