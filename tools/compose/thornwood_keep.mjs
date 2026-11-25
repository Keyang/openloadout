#!/usr/bin/env node
// Writes sounds/thornwood-keep.json: "Keep run theme", the music of the caves and the keep in the Thornwood side-view
// roguelike kit (bundles/specs/kit-roguelike-thornwood.md, batch TM1), on the `chip` band (docs/music-styles.md).
// Built on the music kit (kit.mjs) and band('chip') from sound/bands.js.
//
//   E minor, 148 bpm, 8 bars: Em A Em D | C G Am B (the A major chord in bar 2 is borrowed: only that bar has a
//   C-sharp). Driven and wary: a stepped triangle bass in 8ths (root, root, fifth, root, octave, root, fifth, root),
//   a pulse running the chord tones in 16ths, a metallic hat on the 8ths, the tune (off the beat, in straight 8ths),
//   a chip kick on 1 and the "and" of 2, a noise snare on 2 and 4, and at the top of Intensity the band's own thin
//   pulse answering the tune high up in bars 4 and 8, with a snare pair leading into those bars.
//
//   node tools/compose/thornwood_keep.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/thornwood_keep.mjs --match     measure the ten melody instruments and the six that play along, print matching gains
//   node tools/compose/thornwood_keep.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/thornwood_keep.mjs             when it is ready: write sounds/thornwood-keep.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars } from './kit.mjs';

const B = band('chip');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.799, 0.998, 0.969, 1.65, 1.73, 0.857, 1.35, 1.11, 1.35, 0.808, 0.8, 1.03, 1.27, 1.33, 1.66];

export const CHORDS = 'Em A Em D | C G Am B';

// The tune, one token per 16th. Every phrase starts on the "and" of 1 and moves in straight 8ths. Bar 1 leaps a
// fourth up from B and steps on to a held F#; bar 2 turns on the borrowed chord's C# and drops to A; bar 3 answers
// bar 1 a third lower; bar 4 falls down the D chord and leaves its second half to the answer. Bars 5 to 7 climb a
// chord each (the hook), and bar 8 holds D#, the note under home, which pulls the loop back to the B that starts it.
export const TUNE = [
  '_ _ B4 _ E5 _ G5 _ F#5 _ _ _ _ _ _ _',      // Em   up a fourth, a step, and a held F#
  '_ _ E5 _ C#5 _ E5 _ A4 _ _ _ _ _ _ _',      // A    the C# is the tune's own colour
  '_ _ G4 _ B4 _ E5 _ D5 _ _ _ _ _ _ _',       // Em   bar 1 a third lower
  '_ _ D5 _ A4 _ F#4 _ _ _ _ _ _ _ _ _',       // D    falls, then leaves room for the answer
  '_ _ C5 _ E5 _ G5 _ _ _ _ _ _ _ _ _',        // C    the climb
  '_ _ B4 _ D5 _ G5 _ _ _ _ _ _ _ _ _',        // G
  '_ _ A4 _ C5 _ E5 _ E5 _ _ _ _ _ _ _',       // Am   and the E again, held
  '_ _ D#5 _ _ _ _ _ _ _ _ _ _ _ _ _',         // B    the leading note, held
];

// The answer: the band's chipLead an octave above the tune's home, a three-note turn in the second half of bars 4 and 8.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = eightBars(REST, {
  4: '_ _ _ _ _ _ _ _ D6 _ E6- _ D6 _ _ _',     // D    the root, the note above, the root
  8: '_ _ _ _ _ _ _ _ F#6 _ E6- _ F#6 _ _ _',   // B    the fifth, the note below, the fifth
});

// Which layers play. `section` is for the Length control (the 32-bar version: bass and running notes, then the tune,
// then the kit, then everything); `intensity` is the window in which the Intensity control brings the layer in.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },                // bass and running notes: always there, a little fuller as it builds
  hat: { section: 3, intensity: [0, 1], floor: 0.8 },    // the hat on the 8ths: at every Intensity, with the kit in a long version
  // the tune. The specification brings it in between 0.25 and 0.5 and wants it playing at 0.5; looks set intensity
  // as low as 0.4, so it is all there by 0.4 (compose.js: the tune's window must end by 0.4)
  tune: { section: 2, intensity: [0.25, 0.38] },
  kick: { section: 3, intensity: [0.25, 0.38] },
  snare: { section: 3, intensity: [0.5, 0.62] },
  full: { section: 4, intensity: [0.75, 0.87] },         // the band's lead answers in bars 4 and 8
  busy: { section: 4, intensity: [0.75, 0.76] },         // a switch: the snare pair into bars 4 and 8
  lift: { intensity: [0.4, 1], floor: 0.8 },             // not a layer: the tune and drums lean in as intensity climbs
};

// The mix, part by part, so each can be measured by itself (`--measure`, and the tests).
// `arpDip` pulls the running notes back while the tune plays: the tune must lead.
const arpDip = '(1 - 0.4*gTune*lead)';
export const MIX = {
  kick: 'kO*0.6*gKick*gLift',
  snare: 'sF*0.5*gSnare*gLift',
  hat: 'hO*0.26*(0.3 + 1.15*bright)*gHat',
  bass: 'bF*0.21/(1 + 0.55*grit)*gBed',                  // Grit squares the bass off; the division keeps its level
  arpL: `aF*(0.4 + 0.16*c16p)*gBed*${arpDip}`,
  arpR: `aF*(0.56 - 0.16*c16p)*gBed*${arpDip}`,
  tune: 'lF*0.52*lead*gTune*gLift',
  ansL: 'eF*0.3*lead*gFull',
  ansR: 'eF*0.2*lead*gFull',
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
    id: 'thornwood-keep',
    name: 'Keep run theme',
    tags: ['music', ...B.tags, 'battle', 'dungeon', 'adaptive', 'loop'],
    description: 'Driven, wary, quick-footed synthesised chip-style music for the hard part of a run, in short or long versions: Intensity brings in the tune and a thump, then the snare, then a second thin voice answering the tune high up, and you can change the speed, pitch, grit, brightness and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/battle', themes: ['fantasy', 'dungeon'], gameTypes: ['roguelike-action', 'platformer', 'arcade'],
      words: ['run', 'keep', 'castle', 'cave', 'danger', 'tense', 'wary', 'driving', 'chase', 'fight', 'level', 'chiptune', '8-bit', 'retro'],
      license: 'draft',
    },
    tempo: B.checkTempo([136, 156, 148]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Chiptune', space: 0.05 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('grit', 'Grit', 0, 1, 0.2),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'E' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: the band's kit. Hat on the 8ths; kick on 1 and the "and" of 2; noise snare on 2 and 4, and at the
      // top a pair of 16ths at the end of bars 3 and 7, leading into bars 4 and 8
      drumRow('kT', 'X.....x.........'),
      drumRow('sPlain', '....X.......X...'),
      drumRow('sFill', eightBars('....X.......X...', { 3: '....X.......X.xx', 7: '....X.......X.xx' })),
      { id: 'sT', type: 'expr', expr: 'gBusy > 0.5 ? sFill : sPlain' },
      drumRow('hT', 'X.x.X.x.X.x.X.x.'),
      B.drums({ kick: 'kT', snare: 'sT', hat: 'hT', noise: 'nz' }),      // -> kO (and kA), sO, hO
      // Grit crushes the snare: fewer levels and a lower rate
      { id: 'sX', type: 'crush', in: 'sO', bits: '12 - grit*8.5', rate: '30000 - grit*25000' },
      { id: 'sF', type: 'filter', mode: 'lp', in: 'sX', freq: '2200 + bright*10000', q: 0.7 },     // Brightness opens the snare

      // --- bass: the band's stepped triangle in 8ths: root, root, fifth, root, octave, root, fifth, root
      drumRow('bG', 'X.x.X.x.X.x.X.x.'),
      noteRow('bS', '0 0 7 0 12 0 7 0', { every: 2 }),
      B.bass('b', { trig: 'bG', semis: 'bS' }),                          // -> bO
      { id: 'bD', type: 'shaper', in: 'bO', drive: '1 + grit*4' },       // Grit squares the bass off
      { id: 'bF', type: 'filter', mode: 'lp', in: 'bD', freq: '260 + bright*2800', q: 0.7 },       // Brightness gives the bass its buzzy edge

      // --- running notes: the band's pulse on the chord tones in 16ths, up and back (0 root, 1 third, 2 fifth, 3 octave)
      drumRow('aG', 'XxxxXxxxXxxxXxxx'),
      noteRow('aD', '0 1 2 3 2 1 0 1'),
      B.chords('a', { trig: 'aG', pick: 'aD' }),                         // -> aO
      // Grit crushes them too
      { id: 'aX', type: 'crush', in: 'aO', bits: '12 - grit*8.5', rate: '30000 - grit*25000' },
      { id: 'aF', type: 'filter', mode: 'lp', in: 'aX', freq: '500 + bright*9500', q: 0.8 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),

      // --- the answer on the band's own lead, in bars 4 and 8
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),                          // -> eO
      { id: 'eF', type: 'filter', mode: 'lp', in: 'eO', freq: '2400 + bright*8000', q: 0.7 },

      // --- mix: kick, snare, hat and bass in the centre; running notes bounce left and right; the answer a little left
      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.bass}`,
        left: `${MIX.arpL} + ${MIX.tune} + ${MIX.ansL}`,
        right: `${MIX.arpR} + ${MIX.tune} + ${MIX.ansR}`,
        duck: 'kA*gKick', duckAmount: 0.18,      // the music dips under the kick, only while the kick plays
        send: 'sF*0.15*gSnare',
        ...B.room,
        level: LEVEL,
        drive: '1 + grit*0.5',                   // Grit also leans the whole mix on the limiter
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range
      'Down the stair': { intensity: 0.5, bpm: 140, bright: 0.45, grit: 0.1 },
      'Keep halls': { intensity: 0.85, bpm: 148 },
      'Hunted': { intensity: 1, bpm: 154, bright: 0.8, grit: 0.55, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
