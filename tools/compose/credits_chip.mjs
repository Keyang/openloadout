#!/usr/bin/env node
// Writes sounds/credits-chip.json: "One More Coin", end-credits music on the `chip` band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs) and band('chip').
//
//   B flat major, 124 bpm, 8 bars: Bb F Eb Bb | Gm Dm Eb F. The machine thanking the player: bright, proud and a
//   little wistful, unhurried for a chip tune (menu-chip runs at 140). The stepped triangle bass in half notes (root,
//   then fifth) and a closed hat on the beats are there even at Intensity 0; then the pulse arpeggio running chord
//   tones in 8ths; then the tune (Chiptune by default) in long notes with a quick turn at the end of each bar; then
//   kick on 1 and 3, snare on 2 and 4 and the hat in 8ths; and at the top the thin pulse lead answers in bars 4 and 8
//   while the arpeggio moves to 16ths.
//
//   node tools/compose/credits_chip.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_chip.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/credits_chip.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_chip.mjs             when it is ready: write sounds/credits-chip.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars } from './kit.mjs';

const B = band('chip');

// Level of each melody instrument for this tune, from `--match`.
export const GAINS = [1, 0.805, 0.958, 0.918, 1.47, 2.16, 0.855, 1.37, 1.13, 1.26, 0.677, 1.21, 1.33, 1.86, 1.44];

// The commas drop F an octave, so every root lies from F3 to Eb4 and the arpeggio stays under the tune.
export const CHORDS = 'Bb F, Eb Bb | Gm Dm Eb F,';

// The tune, one token per 16th: a half note, two 8ths, a quarter (bars 4 and 8 stop and hold instead). Bars 1 to 4 start on the third (D), step up to
// the fifth (F), fall back and stop on the second (C) over the Bb chord's return: a question. Bars 5 to 8 begin a
// third higher (F), make the tune's one leap (D up a sixth to Bb, in bar 6) and walk down by step to C, the fifth of
// F, which is a step under the D that starts the loop again.
export const TUNE = [
  'D5 _ _ _ _ _ _ _ C5 _ D5 _ Eb5 _ _ _',        // Bb   the third, a turn, a step up
  'F5 _ _ _ _ _ _ _ Eb5 _ D5 _ C5 _ _ _',        // F    the fifth, then falls back by step
  'Bb4 _ _ _ _ _ _ _ C5 _ D5 _ Eb5 _ _ _',       // Eb   from the bottom, steps up again
  'D5 _ _ _ C5 _ _ _ _ _ _ _ _ _ _ _',           // Bb   a quarter, then stops on the second and holds it: the question
  'F5 _ _ _ _ _ _ _ G5 _ F5 _ D5 _ _ _',         // Gm   a third higher than bar 1, turns and drops to D
  'D5 _ _ _ _ _ _ _ Bb5 _ A5 _ G5 _ _ _',        // Dm   the one leap: D up a sixth to Bb, then down
  'G5 _ _ _ _ _ _ _ F5 _ Eb5 _ D5 _ _ _',        // Eb   walks on down
  'C5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',            // F    the fifth of F, held: a step under the start
];

// The answer on the band's thin pulse lead, in the second half of bars 4 and 8, above the tune's held note: steps,
// not a fanfare. Bar 4 turns around F; bar 8 walks down from A to the Eb above the D that starts the loop.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST, REST, REST,
  '_ _ _ _ _ _ _ _ F5 _ G5 _ F5 _ D5- _',        // Bb
  REST, REST, REST,
  '_ _ _ _ _ _ _ _ A5 _ G5 _ F5 _ Eb5- _',       // F
];

// The arpeggio's chord tones (0 root, 1 third, 2 fifth, 3 octave). In 8ths only every second number is played
// (0 2 3 1 0 2 3 2, then 0 1 3 2 0 1 3 1: the root and its octave on the beats); in 16ths, at the top of the build, all of them are.
const ARP = ['0 1 2 3 3 2 1 0 0 1 2 3 3 2 2 1', '0 0 1 2 3 2 2 1 0 0 1 2 3 2 1 2'];

// Layers in the specification's order: bed, arpeggio, tune, drums, answer. The 32-bar version brings them in a
// section at a time: bed and arpeggio, then the tune, then the drums, then the answers and the 16th arpeggio.
export const LAYERS = {
  bed: { intensity: [0, 0.15], floor: 0.7 },            // triangle bass in half notes and a hat on the beats: still music at 0
  arp: { intensity: [0.12, 0.22] },                     // the pulse arpeggio in 8ths
  tune: { section: 2, intensity: [0.3, 0.4] },          // all there by 0.4, so a look at 0.5 keeps it
  beat: { section: 3, intensity: [0.5, 0.6] },          // kick, snare, the hat in 8ths
  busy: { section: 4, intensity: [0.75, 0.76] },        // a switch: the arpeggio goes to 16ths
  answer: { section: 4, intensity: [0.75, 0.85] },      // the thin pulse lead answers
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: the tune and drums lean in as it builds
};

// The arpeggio is pulled back while the tune plays: both sit in 300 to 1200 Hz and the tune must lead there.
const arpDip = '(1 - 0.4*gTune*lead)';
const L = B.kitLevels ?? { kick: 0.8, snare: 0.45, hat: 0.35 };
export const MIX = {
  kick: `kO*${L.kick}*0.8*gBeat*gLift`,
  snare: `sO*${L.snare}*0.9*gBeat*gLift`,
  hat: `hO*${L.hat}*(0.55 + 0.6*bright)*(0.85 + 0.15*gBeat)*gBed`,
  bass: 'bO*0.36*gBed',
  arpL: `pF*(0.2 + 0.08*c16p)*gArp*${arpDip}`,
  arpR: `pF*(0.28 - 0.08*c16p)*gArp*${arpDip}`,
  tune: 'lF*0.42*lead*gTune*gLift',
  ansL: 'eF*0.3*lead*gAnswer',
  ansR: 'eF*0.2*lead*gAnswer',
};
const LEVEL = 0.92;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.arpL} + ${MIX.ansL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hat}`,
  bed: `${MIX.bass} + ${MIX.hat}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

const twoBars = (a, b) => [a, b, a, b, a, b, a, b];

export function build(gains = GAINS) {
  return assemble({
    id: 'credits-chip',
    name: 'One More Coin',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'A bright, proud and slightly wistful synthesised chip-like piece for the end credits, as the machine thanks the player: a slow stepping bass and a ticking hat, then a run of chord notes, the tune in long notes, a chip drum beat, and at the top a thin second voice answering the tune. Intensity brings the layers in; you can change the length, speed, pitch, bounce and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'shooter'],
      words: ['credits', 'ending', 'thank you', 'high score', 'coin', 'chiptune', 'chip', '8-bit', 'retro', 'arcade', 'bleep', 'proud', 'wistful'],
      license: 'draft',
    },
    tempo: B.checkTempo([120, 136, 124]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Chiptune' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.15),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'Bb' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: kick on 1 and 3, snare on 2 and 4 (a small push into bar 5 and into the loop); the hat ticks on
      //     the beats in the bed and goes to 8ths when the beat comes in
      drumRow('kT', eightBars('X.......X.......', { 8: 'X.......X.....x.' })),
      drumRow('sT', eightBars('....X.......X...', { 4: '....X.......X.x.', 8: '....X.......X.xx' })),
      drumRow('h4', 'X...x...X...x...'),
      drumRow('h8', 'X.o.x.o.X.o.x.o.'),
      { id: 'hT', type: 'expr', expr: 'gBeat > 0.5 ? h8 : h4' },
      B.drums({ kick: 'kT', snare: 'sT', hat: 'hT', noise: 'nz' }),   // -> kO, sO, hO

      // --- the stepped triangle bass in half notes: root, then fifth; each note lasts most of its half bar
      drumRow('bG', 'X.......x.......'),
      noteRow('bQ', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bQ', hold: '96/bpm', decay: 0.03 }),   // -> bO

      // --- the pulse arpeggio: chord tones in 8ths, in 16ths at the top; Brightness opens its low-pass
      drumRow('p8', 'x.x.x.x.x.x.x.x.'),
      { id: 'pT', type: 'expr', expr: 'gBusy > 0.5 ? c16 : p8' },
      noteRow('pK', twoBars(ARP[0], ARP[1])),
      B.chords('p', { trig: 'pT', pick: 'pK' }),                    // -> pO
      { id: 'pF', type: 'filter', mode: 'lp', in: 'pO', freq: '1100 + bright*6500', q: 0.7 },

      // --- the tune, on whichever instrument the listener picks; with long notes: the half notes ring for most of their length
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 3 }),

      // --- the answer on the band's thin pulse lead, its width switched note by note
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),                     // -> eO
      { id: 'eF', type: 'filter', mode: 'lp', in: 'eO', freq: '2000 + bright*8000', q: 0.7 },

      // --- mix: kick, snare, hat and bass in the centre; the arpeggio bouncing left and right; the answer a little left
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
      // looks move the tempo by up to 5% and stop at the range: leave them room inside 120 to 136
      'Credits roll': { intensity: 0.85, bpm: 124 },
      'Name entry': { intensity: 0.45, bpm: 121, bright: 0.4 },
      'One more go': { intensity: 1, bpm: 129, bright: 0.8 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
