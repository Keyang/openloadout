#!/usr/bin/env node
// Writes sounds/gridline-results.json: "Results", the end-of-round music of the Gridline puzzle kit, on the
// synthwave band (docs/music-styles.md). Built on the music kit (kit.mjs), after gridline_calm.mjs.
//
//   E-flat major, 92 bpm, 8 bars: Eb Cm Gm Ab | Eb Cm Ab Bb. Warm, satisfied, a little wistful: the numbers count
//   up. In the order Intensity brings them in: a wide held pad and a bass in half notes, root then fifth; the tune
//   (a slow climb from the fifth to the octave and an arc back down); a kick on 1 and 3, a clap on 2 and 4 and hats
//   in 8ths; and at the top the band's own lead with its echo, repeating the end of each phrase, and a gated snare
//   on beat 4 of every second bar. "Bounce" swings the notes between the 8ths.
//
//   node tools/compose/gridline_results.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/gridline_results.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/gridline_results.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/gridline_results.mjs             when it is ready: write sounds/gridline-results.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, band } from './kit.mjs';

const B = band('synthwave');

// Level of each melody instrument for this tune, measured after the band's echo (lcO).
export const GAINS = [1, 0.806, 1.06, 1.01, 1.76, 1.59, 0.843, 1.33, 1.17, 1.35, 0.711, 0.914, 0.826, 1.62, 1.37, 1.91];

export const CHORDS = 'Eb Cm Gm Ab | Eb Cm Ab Bb';

// The tune, one token per 16th. A four-bar phrase: it starts on the fifth (B flat) and climbs by steps to the octave
// (E flat) over bars 1 and 2, each step leaned into by a short pickup, then falls back in a slow arc to A flat.
// Bars 5 to 8 vary it: the climb is quicker and goes on, with the one leap (a third, E flat up to G), comes down
// by steps to rest on C, the third of the A flat chord, and the B flat bar turns it round with a low pickup.
export const TUNE = [
  'Bb4 _ _ _ _ _ _ Bb4- C5 _ _ _ _ _ _ _',      // Eb   the fifth, a step up
  'D5 _ _ _ _ _ _ D5- Eb5 _ _ _ _ _ _ _',       // Cm   on up to the octave
  'D5 _ _ _ _ _ C5 _ _ _ Bb4 _ _ _ _ _',        // Gm   the arc turns down
  'C5 _ _ _ Bb4- _ _ _ Ab4 _ _ _ _ _ _ _',      // Ab   and comes to rest on the root
  'Bb4 _ _ _ _ _ _ Bb4- C5 _ _ _ D5 _ Eb5 _',   // Eb   again, and this time it keeps climbing
  'G5 _ _ _ _ _ F5- _ Eb5 _ _ _ _ _ _ _',       // Cm   the leap, the top of the tune
  'Eb5 _ _ _ _ _ D5- _ C5 _ _ _ _ _ _ _',       // Ab   down to rest on the third
  'Bb4 _ _ _ _ _ _ _ _ _ _ _ F4- _ Ab4- _',     // Bb   the turn-round
];

// The echo line, on the band's own lead with its dotted-8th echo: it repeats the end of each phrase, an octave up,
// in the gap the tune leaves in bars 4 and 8.
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ C6- _ Bb5- _ Ab5 _ _ _',     // Ab   the phrase's last three notes
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ D6- _ C6- _ Bb5 _ _ _ _ _ _ _',      // Bb   the fall onto the rest, landing on the B flat chord
];

// Which layers play, in the specification's intensity order. `section` is for Length (32 bars: pad and bass, then
// the tune, then the drums, then everything; 8 bars, the default, is the full band).
export const LAYERS = {
  pad: {},                                               // at every intensity: at 0 it is still music
  open: { intensity: [0, 0.75] },                        // the bass's tone opens a little as intensity climbs
  tune: { section: 2, intensity: [0.3, 0.4] },           // in by 0.4, so every look keeps the tune
  beat: { section: 3, intensity: [0.5, 0.62] },          // kick, clap and hats
  top: { section: 4, intensity: [0.75, 0.85] },          // the echo line and the gated snare; in by the default (0.85)
  lift: { intensity: [0.4, 1], floor: 0.8 },             // the tune and the drums lean in as intensity climbs
};

// The mix, part by part. padDip pulls the pad back while the tune plays (given to the band's chord voice).
const padDip = '0.08*gTune*lead';
export const MIX = {
  kick: 'kO*0.36*gBeat*gLift',
  clap: 'qO*0.24*gBeat*gLift',
  hat: 'hO*0.34*(0.6 + 0.8*bright)*acc*gBeat*gLift',
  snare: 'sO*0.3*gTop',
  bass: 'bF*0.3',
  padL: 'pL*0.46*gPad',
  padR: 'pR*0.46*gPad',
  tune: 'lcO*0.46*lead*gTune*gLift',
  echoL: 'eO*0.2*1.25*lead*gTop',
  echoR: 'eO*0.2*0.75*lead*gTop',
};
const LEVEL = 1.3;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.padL} + ${MIX.echoL}`,
  drums: `${MIX.kick} + ${MIX.clap} + ${MIX.hat} + ${MIX.snare}`,
  bed: `${MIX.bass} + ${MIX.padL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'gridline-results',
    name: 'Results',
    tags: ['music', 'puzzle', ...B.tags, 'results', 'adaptive', 'loop'],
    description: 'Warm, satisfied, slightly wistful synthesised music for the results screen, high-score table and credits of a puzzle game: Intensity brings in the tune over a wide held pad and a slow bass, then a kick, clap and hats, then an echoing second voice and a big snare, and you can change the speed, pitch, bounce, length and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['puzzle', 'arcade'],
      words: ['results', 'score', 'high score', 'credits', 'victory', 'round over', 'tally', 'warm', 'wistful', ...B.words.slice(0, 4), 'ending'],
      license: 'draft',
    },
    tempo: B.checkTempo([84, 104, 92]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 8, inst: 'Plucked string' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.2),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'Eb', low: -3 }),          // roots Eb C(below) G Ab | Eb C(below) Ab Bb
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },
      // "Bounce" also leans on the beat: the hats between the beats get softer as it rises
      { id: 'acc', type: 'expr', expr: '1 - swing*0.5*(1 - c16p)' },

      // --- drums: kick on 1 and 3, clap on 2 and 4, hats in 8ths with a swung 16th before beats 1 and 3, the gated snare on beat 4 of every second bar
      drumRow('kT', 'X.......X.......'),
      drumRow('qT', '....X.......X...'),
      drumRow('hT', 'x.x.x.xox.x.x.xo'),
      drumRow('sT', ['................', '............X...']),
      B.drums({ kick: 'kT', clap: 'qT', hat: 'hT', snare: 'sT', noise: 'nz' }),   // -> kO (kA), qO, hO, sO

      // --- bass: half notes, the root then the fifth; its tone opens a little with intensity
      drumRow('bG', 'X.......x.......'),
      noteRow('bS', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bS' }),
      { id: 'bF', type: 'filter', mode: 'lp', in: 'bO', freq: '420 + gOpen*(900 + bright*2200)', q: 0.8 },

      // --- the pad: one held chord a bar, wide, pulled back a little while the tune plays
      drumRow('pG', 'X...............'),
      B.chords('p', { trig: 'pG', dip: padDip }),

      // --- the tune, on whichever instrument the listener picks, through the band's echo
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.4 }),
      B.colour('lc', { input: 'lF' }),

      // --- the echo line, on the band's saw lead with its own echo
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.padL} + ${MIX.tune} + ${MIX.echoL} + ${MIX.hat}*1.1 + ${MIX.clap}*0.9`,
        right: `${MIX.padR} + ${MIX.tune} + ${MIX.echoR} + ${MIX.hat}*0.9 + ${MIX.clap}*1.1`,
        duck: 'kA*gBeat', duckAmount: 0.2,
        ...B.room, level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% and stop at the range: leave them room
      'Score count': { intensity: 0.85, bpm: 92 },
      'High score table': { intensity: 0.45, bpm: 88, bars: 16, lead: 0.7 },
      'Credits roll': { intensity: 1, bpm: 96, bars: 32, bright: 0.6, space: 0.35 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
