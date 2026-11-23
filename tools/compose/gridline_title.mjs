#!/usr/bin/env node
// Writes sounds/gridline-title.json: "Title theme", the menu music of the Gridline falling-block puzzle kit
// (bundles/specs/kit-puzzle-gridline.md, batch GM1), on the `chip` band (docs/music-styles.md). Built on the music kit.
//
//   F major, 132 bpm, 8 bars: F Bb C Dm | Bb Gm Am C. Bright, bouncy and welcoming, shapes clicking into place:
//   a stepped triangle bass walking root, fifth, octave in quarter notes, a pulse running the chord tones in 16ths,
//   the tune on whichever melody instrument is chosen (Chiptune by default), a three-piece chip kit, and at the top
//   of Intensity the band's own thin pulse answering the tune in bars 4 and 8 while the running notes go up an octave.
//
//   node tools/compose/gridline_title.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/gridline_title.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/gridline_title.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/gridline_title.mjs             when it is ready: write sounds/gridline-title.json
import { param, band, chipArp, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('chip');

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.798, 1.03, 0.984, 1.55, 1.77, 0.864, 1.33, 1.15, 1.4, 0.961, 0.958, 1.13, 1.54, 1.57, 2.01];

export const CHORDS = 'F Bb C Dm | Bb Gm Am C';

// The tune, one token per 16th. A two-bar phrase hops up a third and a fourth (A C F) and settles back by steps;
// bars 3 and 4 say it again a step higher (bar 4 bent onto the D minor chord). Bars 5 to 8 answer: one leap of a
// sixth (D up to Bb) and then down by steps, three notes at a time, to rest on C, the fifth, which leads back round.
export const TUNE = [
  'A4 _ C5 _ F5 _ _ _ _ _ E5- _ D5 _ C5 _',        // F    hop up a third and a fourth, step back down
  'Bb4 _ _ _ D5 _ C5- _ Bb4 _ _ _ _ _ A4- _',      // Bb   settles; a quick note leads up
  'Bb4 _ D5 _ G5 _ _ _ _ _ F5- _ E5 _ D5 _',       // C    bar 1 a step higher
  'D5 _ _ _ F5 _ E5- _ D5 _ _ _ _ _ _ _',          // Dm   bar 2 on the D minor chord; the second half is left for the answer
  'D5 _ _ _ Bb5 _ _ _ A5 _ G5- _ F5 _ _ _',        // Bb   the one big leap, a sixth, then down by steps
  'G5 _ _ _ F5- _ E5- _ D5 _ _ _ _ _ _ _',         // Gm   the same fall a step lower, lighter (F and E are passing notes here)
  'E5 _ D5 _ C5 _ _ _ _ _ E5- _ D5 _ C5 _',        // Am   and again, in bar 1's rhythm
  'D5 _ _ _ E5 _ D5- _ C5 _ _ _ _ _ _ _',          // C    rests on C, the fifth
];

// The answer, on the band's own thin pulse: a quick run up the chord in the holes the tune leaves in bars 4 and 8.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST, REST, REST,
  '_ _ _ _ _ _ _ _ _ _ F5 A5 D6 _ A5- _',          // Dm
  REST, REST, REST,
  '_ _ _ _ _ _ _ _ _ _ E5 G5 C6 _ G5- E5-',        // C
];

// Which layers play. `section` is for the Length control (the 32-bar version: running notes and bass, then the tune,
// then the drums, then everything); `intensity` is the window in which the Intensity control brings the layer in.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },              // running notes and bass: always there, a little fuller as it builds
  // the tune. The specification brings it in between 0.25 and 0.5 and wants it playing at 0.5; looks set intensity
  // as low as 0.4, so it is all there by 0.4 (compose.js: the tune's window must end by 0.4)
  tune: { section: 2, intensity: [0.25, 0.38] },
  kick: { section: 3, intensity: [0.3, 0.42] },
  beat: { section: 3, intensity: [0.5, 0.62] },        // snare and hats
  full: { section: 4, intensity: [0.75, 0.87] },       // the answer line
  up: { section: 4, intensity: [0.75, 0.76] },         // a switch: the running notes go up an octave
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and drums lean in as intensity climbs
};

// The mix, part by part, so each can be measured by itself (`--measure`, and the tests).
// `arpDip` pulls the running notes back while the tune plays: they share 300 to 1200 Hz, and the tune must lead there.
const arpDip = '(1 - 0.35*gTune*lead)';
// the running notes: the band's arpeggio, or (when everything is in) the same voice an octave up, a little softer
const arp = '(gUp > 0.5 ? uO*0.9 : aO)';
export const MIX = {
  kick: 'kO*0.8*gKick*gLift',
  snare: 'sO*0.45*gBeat*gLift',
  hat: 'hO*0.3*(0.55 + 0.75*bright)*gBeat*gLift',
  bass: 'bO*0.3*gBed',
  arpL: `aF*(0.34 + 0.16*c16p)*gBed*${arpDip}`,
  arpR: `aF*(0.5 - 0.16*c16p)*gBed*${arpDip}`,
  tune: 'lF*0.46*lead*gTune*gLift',
  ansL: 'eO*0.1*lead*gFull',
  ansR: 'eO*0.26*lead*gFull',
};
const LEVEL = 0.9;   // into the limiter
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.arpL} + ${MIX.ansL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hat}`,
  bed: `${MIX.bass} + ${MIX.arpL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'gridline-title',
    name: 'Title theme',
    tags: ['music', ...B.tags, 'menu', 'title', 'adaptive', 'loop'],
    description: 'Bright, bouncy, welcoming synthesised chip-style music for a puzzle game\'s title screen and menus, in short or long versions: Intensity brings in the tune and a thump, then the drums, then a second voice that answers the tune while the running notes climb higher, and you can change the speed, pitch, bounce, brightness and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['neutral', 'sci-fi'], gameTypes: ['puzzle', 'arcade'],
      words: ['menu', 'title', 'title screen', 'start screen', 'mode select', 'options', 'welcome', 'bouncy', 'cheerful', 'blocks', 'chiptune', '8-bit', 'retro', 'bleep'],
      license: 'draft',
    },
    tempo: B.checkTempo([120, 150, 132]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Chiptune' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.15),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'F' }),                    // roots F Bb C(below) D(below) | Bb G A C(below)
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },
      // "Bounce" also leans on the beat: the 16ths between the 8th notes get softer as it rises
      { id: 'acc', type: 'expr', expr: '1 - swing*0.5*(1 - c16p)' },

      // --- drums: the band's kit. Kick on 1 and 3, noise snare on 2 and 4, hat in 8ths
      drumRow('kT', 'X.......X.......'),
      drumRow('sT', '....X.......X...'),
      drumRow('hT', 'X.x.x.x.X.x.x.x.'),
      B.drums({ kick: 'kT', snare: 'sT', hat: 'hT', noise: 'nz' }),      // -> kO (and kA), sO, hO

      // --- bass: the band's stepped triangle, quarter notes walking root, fifth, octave, fifth
      drumRow('bG', 'X...x...x...x...'),
      noteRow('bS', '0 _ _ _ 7 _ _ _ 12 _ _ _ 7 _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bS' }),                          // -> bO

      // --- running notes: the band's pulse on the chord tones in 16ths (0 root, 1 third, 2 fifth, 3 octave)
      drumRow('aG', 'xxxxxxxxxxxxxxxx'),
      noteRow('aD', '0 1 2 3 2 1 2 1'),
      B.chords('a', { trig: 'aG', pick: 'aD' }),                         // -> aO
      chipArp('u', { trig: 'aG', pick: 'aD', note: '60 + tonic' }),      // -> uO: the same voice an octave up, for the top of Intensity
      { id: 'aF', type: 'filter', mode: 'lp', in: `${arp}*acc`, freq: '700 + bright*8500', q: 0.8 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),

      // --- the answer, on the band's own lead
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),                          // -> eO

      // --- mix: kick, snare, hat and bass in the centre; running notes bounce left and right; the answer on the right
      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.bass}`,
        left: `${MIX.arpL} + ${MIX.tune} + ${MIX.ansL}`,
        right: `${MIX.arpR} + ${MIX.tune} + ${MIX.ansR}`,
        duck: 'kA*gKick', duckAmount: 0.2,       // the music dips under the kick, only while the kick plays
        send: 'sO*0.15*gBeat',
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Title screen': { intensity: 0.85, bpm: 132 },
      'Options menu': { intensity: 0.45, bpm: 126, bright: 0.5, lead: 0.75, swing: 0.3 },
      'Attract mode': { intensity: 1, bpm: 142, bright: 0.8, swing: 0.05 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
