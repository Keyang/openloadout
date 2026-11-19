#!/usr/bin/env node
// Writes sounds/menu-twang.json: "Sundown Saddle", a western title-card loop on the twang band (docs/music-styles.md).
// Built on the music kit (kit.mjs) and band('twang') from sound/bands.js.
//
//   E major, 112 bpm, 8 bars: E E A E | B A E B, a squeezed blues turnaround that ends on the V so the loop rolls over.
//   Dusty and laid back with a wink: a walking upright bass, muted off-beat strums, the tune through the spring,
//   a brushed train beat, and low twang licks answering the tune at the top of the Intensity control.
//
//   node tools/compose/menu_twang.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_twang.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/menu_twang.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_twang.mjs             when it is ready: write sounds/menu-twang.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars, band } from './kit.mjs';

const B = band('twang');

// Level of each melody instrument for this tune, measured after the spring colour (`--match` on lcO).
export const GAINS = [1, 0.832, 1, 0.982, 1.58];

export const CHORDS = 'E E A E | B A E B';

// The tune, one token per 16th. Every bar leans on the same lazy dotted figure (a dotted 8th, a 16th, a held note);
// bars 1 and 2 are the phrase, bars 5 and 6 say it again a step lower over B and A, and bar 8 hangs on F# (the
// fifth of B), then lands on B, which rings on into the E of bar 1. The D natural in bar 6 is the wink: a blue passing note between beats.
export const TUNE = [
  'E5 _ _ F#5 G#5 _ _ _ G#5 _ F#5- _ E5 _ _ _',      // E    up E F# G#, lean on G#, step back home
  'C#5 _ _ B4 G#4 _ _ _ B4 _ _ _ _ _ _ _',           // E    the sixth leaning onto B: room for a lick
  'A4 _ _ B4 C#5 _ _ _ E5 _ C#5- _ A4 _ _ _',        // A    the figure on A
  'G#4 _ _ _ B4 _ G#4- _ E4 _ _ _ _ _ F#4- G#4-',    // E    settles on E, two notes pick up
  'D#5 _ _ E5 F#5 _ _ _ F#5 _ E5- _ D#5 _ _ _',      // B    bar 1's contour again, a step lower, on B
  'E5 _ _ C#5 A4 _ _ _ C#5 _ D5- _ C#5 _ A4 _',      // A    the blue D between beats
  'G#4 _ _ A4 B4 _ _ _ E5 _ B4- _ G#4 _ _ _',        // E    home
  'F#4 _ _ G#4 F#4 _ D#4- _ F#4 _ _ _ B4- _ _ _',    // B    hangs on the fifth of B, then B4 (in both B and E) rolls over
];

// The answer: low twang licks in the gaps the tune leaves (bars 2, 4 and 8, beats 3 and 4). "_" lets a lick ring out.
export const LICKS = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ E3 _ G3- G#3 B3 _ E4 _',          // E    a hammer from G to G# (the wink again), up the chord
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ B3 _ C#4- B3 G#3 _ _ _',          // E
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ B3 _ A3- _ F#3 D#3 B2 _',          // B    down the dominant seventh to B, which E keeps
];

// The walking bass: quarter notes in semitones above the bar's root, through chord tones (the sixth on beat 4 of the
// E bars), each bar stepping into the next root.
//                 E            E             A            E            B             A            E            B
const WALK = ['0 _ _ _ 4 _ _ _ 7 _ _ _ 9 _ _ _', '12 _ _ _ 9 _ _ _ 7 _ _ _ 4 _ _ _', '0 _ _ _ 4 _ _ _ 7 _ _ _ 4 _ _ _',
  '0 _ _ _ 4 _ _ _ 7 _ _ _ 9 _ _ _', '12 _ _ _ 7 _ _ _ 4 _ _ _ 0 _ _ _', '0 _ _ _ 4 _ _ _ 7 _ _ _ 4 _ _ _',
  '0 _ _ _ 4 _ _ _ 7 _ _ _ 9 _ _ _', '0 _ _ _ 4 _ _ _ 7 _ _ _ 10 _ _ _'];

// Layers in the specification's intensity order: walking bass; muted strums; the tune; the train beat; the licks.
// The 32-bar version brings them in in the same order, a section at a time.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.85 },              // the walking bass: always there
  strum: { intensity: [0.12, 0.22] },                   // the muted off-beat strums
  tune: { section: 2, intensity: [0.3, 0.4] },          // all there by 0.4, so a look at 0.5 keeps it
  beat: { section: 3, intensity: [0.5, 0.6] },          // kick, brushes and rim
  licks: { section: 4, intensity: [0.75, 0.85] },       // twang guitar and spring answering the tune
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: the tune and drums lean in as it climbs
};

const L = B.kitLevels;
export const MIX = {
  kick: `kO*${L.kick}*0.7*gBeat*gLift`,
  snare: `sO*${L.snare}*gBeat*gLift`,
  rim: `rO*${L.rim}*gBeat*gLift`,
  bass: 'bO*0.5*gBed',
  strumL: 'uL*0.5*gStrum',
  strumR: 'uR*0.5*gStrum',
  tune: 'lcO*0.5*lead*gTune*gLift',
  licksL: 'eO*0.36*lead*gLicks',
  licksR: 'eO*0.56*lead*gLicks',
};
const LEVEL = 0.84;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.strumL} + ${MIX.licksL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.rim}`,
  bed: `${MIX.bass} + ${MIX.strumL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const tempo = B.checkTempo([100, 124, 112]);
  return assemble({
    id: 'menu-twang',
    name: 'Sundown Saddle',
    tags: ['music', 'menu', 'title', ...B.tags, 'loop', 'adaptive'],
    description: 'A laid-back synthesised western title loop at dusk, in short or long versions: Intensity brings in a walking bass, muted strums, the tune through a spring echo, a brushed train beat and twangy answering licks; you can change the speed, pitch, shuffle and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['arcade', 'shooter', 'platformer'],
      words: ['menu', 'title', 'start screen', ...B.words.filter((w) => w !== 'spring'), 'dusk', 'shuffle', 'laid back'],
      license: 'draft',
    },
    tempo,
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Plucked string', bright: 0.6, space: 0.15 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Shuffle', 0, 1, 0.35),
    ],
    nodes: [
      clock({ swing: 'swing', on: 8 }),                 // the off-beat 8ths lag behind: a lazy shuffle
      chords(CHORDS, { tonic: 'E', low: 0 }),           // roots E, A a fourth up, B a fifth up
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- train beat: kick on 1 and 3, brushes on every 8th (pushing the off-beats), rim on 2 and 4
      drumRow('kT', 'X.......X.......'),
      drumRow('sT', eightBars('o.x.o.x.o.x.o.x.', { 8: 'o.x.o.x.o.x.oxXx' })),
      drumRow('rT', '....X.......X...'),
      B.drums({ kick: 'kT', snare: 'sT', rim: 'rT', noise: 'nz' }),

      // --- walking upright bass, quarter notes
      drumRow('bG', 'X...x...X...x...'),
      noteRow('bQ', WALK),
      B.bass('b', { trig: 'bG', semis: 'bQ' }),

      // --- muted strums on the off-beats; bar 8 pushes into the turnaround
      drumRow('uG', eightBars('..x...x...x...x.', { 8: '..x...x...x.x.X.' })),
      B.chords('u', { trig: 'uG' }),

      // --- the tune, on whichever instrument the listener picks, through the band's spring
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),
      B.colour('lc', { input: 'lF' }),

      // --- answering licks on the twang guitar (with its own spring)
      melody('e', LICKS, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.rim} + ${MIX.bass}`,
        left: `${MIX.strumL} + ${MIX.tune} + ${MIX.licksL}`,
        right: `${MIX.strumR} + ${MIX.tune} + ${MIX.licksR}`,
        duck: 'kA*gBeat', duckAmount: 0.2,
        send: `sO*${L.snare}*0.3*gBeat`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      'Title card': { intensity: 0.85, bpm: 112 },
      'Saloon wait': { intensity: 0.45, bpm: 104, swing: 0.55, bright: 0.45, space: 0.2 },
      'Ride out': { intensity: 1, bpm: 118, swing: 0.2, bright: 0.75 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
