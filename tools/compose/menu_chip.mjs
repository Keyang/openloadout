#!/usr/bin/env node
// Writes sounds/menu-chip.json: "Press Start Parade", a chip-like title-screen fanfare on the `chip` band
// (docs/music-styles.md). Built on the music kit (kit.mjs) and band('chip') from sound/bands.js.
//
//   D major with a mixolydian colour, 140 bpm, 8 bars: D D Bb C | D G Bb A. Two borrowed lifts (the flat VI and the
//   flat VII) give it an arcade-hero swagger, and bar 8 lands on A, the V, so the loop rolls back into D.
//   A walking stepped-triangle bass, a 25% pulse running the chord tones in 16ths, the tune, a chip backbeat, and at the
//   top of Intensity a narrow-pulse counter-line (its duty switched note by note) answering in the tune's gaps.
//
//   node tools/compose/menu_chip.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_chip.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/menu_chip.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_chip.mjs             when it is ready: write sounds/menu-chip.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars } from './kit.mjs';

const B = band('chip');

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.804, 1, 0.97, 1.5, 2.37, 0.857, 1.37, 1.18, 1.33, 1.09, 0.996, 1.18, 1.59, 1.64];

export const CHORDS = 'D D Bb C | D G Bb A';

// The tune, one token per 16th. A two-bar call: a ta-da-da-DAH up the D chord to A, a cheeky B on top, then steps
// home; bar 3 throws the same figure onto Bb (the flat-VI lift) and bar 4 answers on C. Bars 5 and 6 say the call
// again an octave-ish higher, with the C natural (the mixolydian seventh) as the wink; bar 7 is the Bb figure going
// down, and bar 8 falls down the A chord and leaves the last beats to the answer, which climbs back into D.
export const TUNE = [
  'D5 _ D5- F#5 A5 _ _ _ B5- A5 _ _ F#5 _ D5 _',    // D    ta-da-da-DAH up the chord, a cheeky B, back down
  'D5 _ _ _ E5- _ F#5 _ D5 _ _ _ _ _ _ _',          // D    steps home, holds: room for the answer
  'D5 _ D5- F5 Bb5 _ _ _ C6- Bb5 _ _ F5 _ D5 _',    // Bb   the same call on Bb: the lift
  'E5 _ _ _ G5 _ E5- _ C5 _ _ _ _ _ _ _',           // C    the flat VII answers, then holds
  'F#5 _ F#5- A5 D6 _ _ _ C6- A5 _ _ F#5 _ A5 _',   // D    the call again, higher, with the C natural
  'G5 _ _ _ B5 _ D6- _ B5 _ _ _ _ _ _ _',           // G    up the G chord, holds
  'Bb5 _ Bb5- F5 D5 _ _ _ F5 _ D5- _ Bb4 _ _ _',    // Bb   the call turned upside down: the lift going down
  'A4 _ A4- C#5 E5 _ _ _ A5 _ _ _ _ _ _ _',         // A    the V, up its chord to A, leaves the end to the answer
];

// The answer: a chipLead counter-line in the gaps the tune leaves (bars 2, 4, 6 and 8, beats 3 and 4), low under it.
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ A4 _ F#4 _ A4 _ D5- _',          // D
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ G4 _ E4 _ G4 _ C5- E5',          // C    runs up into the F# of bar 5
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ D5 _ B4 _ G4 _ B4- _',           // G
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ E5 _ C#5 _ A4 _ C#5- E5',        // A    climbs the V back into D
];
// The counter-line is band('chip')'s chipLead, whose pulse width switches between 12.5% and 25% on every note it plays.

// The walking bass: quarter notes in semitones above the bar's root, root, fifth, octave, fifth; turnaround bars step
// into the next root.
//                 D             D              Bb            C             D             G             Bb            A
const WALK = [
  '0 _ _ _ 7 _ _ _ 12 _ _ _ 7 _ _ _', '0 _ _ _ 7 _ _ _ 12 _ _ _ 7 _ _ _',
  '0 _ _ _ 7 _ _ _ 12 _ _ _ 7 _ _ _', '0 _ _ _ 7 _ _ _ 12 _ _ _ 0 _ _ _',
  '0 _ _ _ 7 _ _ _ 12 _ _ _ 7 _ _ _', '0 _ _ _ 7 _ _ _ 12 _ _ _ 7 _ _ _',
  '0 _ _ _ 7 _ _ _ 12 _ _ _ 7 _ _ _', '0 _ _ _ 7 _ _ _ 12 _ _ _ 4 _ _ _',
];

// The arpeggio's chord tones (0 root, 1 third, 2 fifth, 3 octave, 4 third above, 5 fifth above): up-and-down bars,
// and a climbing bar every second bar.
const ARP = ['0 1 2 3 2 1 0 1 2 3 4 3 2 1 2 1', '0 2 1 3 2 4 3 5 3 4 2 3 1 2 0 2'];

// Layers in the brief's intensity order: bass, arpeggio, tune, drums, answer. The 32-bar version brings them in a
// section at a time: bass and arpeggio, then the tune, then the drums, then the answer.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.7 },               // the walking bass: always there
  arp: { intensity: [0.1, 0.2] },                       // the 16th arpeggio
  tune: { section: 2, intensity: [0.28, 0.38] },        // all there by 0.4, so a look at 0.5 keeps it
  beat: { section: 3, intensity: [0.5, 0.6] },          // kick, snare, hat
  busy: { section: 4, intensity: [0.75, 0.76] },        // a switch: the hat goes to 16ths
  answer: { section: 4, intensity: [0.75, 0.85] },      // the counter-line
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: the tune and drums lean in as it climbs
};

// The arpeggio is pulled back while the tune plays: both sit in 300 to 1200 Hz and the tune must lead there.
const arpDip = '(1 - 0.35*gTune*lead)';
const L = B.kitLevels;
export const MIX = {
  kick: `kO*${L.kick}*0.8*gBeat*gLift`,
  snare: `sO*${L.snare}*gBeat*gLift`,
  hat: `hO*${L.hat}*(0.55 + 0.6*bright)*gBeat*gLift`,
  bass: 'bO*0.34*gBed',
  arpL: `pF*(0.18 + 0.08*c16p)*gArp*${arpDip}`,
  arpR: `pF*(0.26 - 0.08*c16p)*gArp*${arpDip}`,
  tune: 'lF*0.5*lead*gTune*gLift',
  ansL: 'eF*0.22*lead*gAnswer',
  ansR: 'eF*0.34*lead*gAnswer',
};
const LEVEL = 0.92;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.arpL} + ${MIX.ansL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hat}`,
  bed: `${MIX.bass} + ${MIX.arpL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

const twoBars = (a, b) => [a, b, a, b, a, b, a, b];

export function build(gains = GAINS) {
  return assemble({
    id: 'menu-chip',
    name: 'Press Start Parade',
    tags: ['music', 'menu', 'title', ...B.tags, 'loop', 'adaptive'],
    description: 'A bright, cheeky synthesised chip-like title-screen fanfare in short or long versions: Intensity brings in a walking bass, a quick run of chord notes, the tune, a chip drum beat and a second tune answering the first; you can change the speed, pitch, bounce and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'shooter'],
      words: ['menu', 'title', 'start screen', 'press start', 'chiptune', '8-bit', 'retro', 'arcade', 'chip', 'fanfare', 'cheeky', 'bright', 'heroic', 'upbeat'],
      license: 'draft',
    },
    tempo: B.checkTempo([128, 156, 140]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Chiptune', bright: 0.6, space: 0.08 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.35),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'D' }),                   // roots: D, Bb a third below, C a step below, G a fourth up, A a fourth below
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- backbeat: kick on 1 and 3, snare on 2 and 4 (a fill into the turnaround), hat on 8ths, 16ths when busy
      drumRow('kT', eightBars('X.......X.......', { 8: 'X.......X.x.....' })),
      drumRow('sT', eightBars('....X.......X...', { 4: '....X.......X..x', 8: '....X.....x.XxXX' })),
      drumRow('h8', 'x.x.x.x.x.x.x.x.'),
      drumRow('h16', 'XoxoXoxoXoxoXoxo'),
      { id: 'hT', type: 'expr', expr: 'gBusy > 0.5 ? h16 : h8' },
      B.drums({ kick: 'kT', snare: 'sT', hat: 'hT', noise: 'nz' }),

      // --- walking stepped-triangle bass, quarter notes
      drumRow('bG', 'X...x...X...x...'),
      noteRow('bQ', WALK),
      B.bass('b', { trig: 'bG', semis: 'bQ' }),

      // --- the arpeggio: chord tones in 16ths on a 25% pulse; Brightness opens its low-pass
      noteRow('pK', twoBars(ARP[0], ARP[1])),
      B.chords('p', { trig: 'c16', pick: 'pK' }),
      { id: 'pF', type: 'filter', mode: 'lp', in: 'pO', freq: '1200 + bright*7000', q: 0.7 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),

      // --- the answer on the band's chipLead, its duty switched per note
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),
      { id: 'eF', type: 'filter', mode: 'lp', in: 'eO', freq: '2000 + bright*8000', q: 0.7 },

      // --- mix: kick, snare, hat and bass in the centre; arpeggio bouncing left and right; the answer a little right
      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.bass}`,
        left: `${MIX.arpL} + ${MIX.tune} + ${MIX.ansL}`,
        right: `${MIX.arpR} + ${MIX.tune} + ${MIX.ansR}`,
        duck: 'kA*gBeat', duckAmount: 0.2,
        send: `sO*${L.snare}*0.3*gBeat`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks move the tempo by up to 5%: leave them room inside 128 to 156
      'Attract mode': { intensity: 0.55, bpm: 134, bright: 0.45, swing: 0.5 },
      'Title screen': { intensity: 0.85, bpm: 140 },
      'Press start!': { intensity: 1, bpm: 148, bright: 0.8, swing: 0.15 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
