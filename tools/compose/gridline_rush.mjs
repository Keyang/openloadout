#!/usr/bin/env node
// Writes sounds/gridline-rush.json: "Fast play", the pressure music of the Gridline falling-block puzzle kit
// (bundles/specs/kit-puzzle-gridline.md, batch GM3), on the `chip` band (docs/music-styles.md). Built on the music kit.
//
//   A major, 156 bpm, 8 bars: A E F#m D | A C D E (the C major chord in bar 6 is borrowed from the minor, for a lift).
//   Urgent, bright and driving: a stepped triangle bass jumping root and octave in 8ths, a metallic hat in 16ths,
//   a pulse running the chord tones in 16ths, the tune on whichever melody instrument is chosen (Synth lead by
//   default), a chip kick on the beats that goes to every 8th when the snare comes in, and at the top of Intensity
//   the band's own thin pulse playing the tune an octave up as well.
//
//   node tools/compose/gridline_rush.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/gridline_rush.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/gridline_rush.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/gridline_rush.mjs             when it is ready: write sounds/gridline-rush.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('chip');

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.819, 0.984, 0.96, 1.58];

export const CHORDS = 'A E F#m D | A C D E';

// The tune, one token per 16th. A two-bar riff: quick pairs of notes climb a piece of the scale (A A, B B, C# C#, up
// to E), and a broken chord falls back down in answer. Bars 3 and 4 say it from F#, bars 5 and 6 a third higher than
// bars 1 and 2 (the fall on the borrowed C major chord), and bars 7 and 8 climb once more and turn on the E chord's
// G#, which leads back to A. It stays between D4 and F#5 so the band's lead can play it an octave up in every key.
export const TUNE = [
  'A4 A4- _ _ B4 B4- _ _ C#5 C#5- _ _ E5 _ _ _',       // A    pairs climbing: A, B, C#, and a hop to E
  'E5 _ B4 _ G#4 _ E4 _ _ _ G#4- _ B4 _ _ _',          // E    the answer: the E chord falling, and a turn back up
  'F#4 F#4- _ _ G#4 G#4- _ _ A4 A4- _ _ C#5 _ _ _',    // F#m  the riff from F#
  'D5 _ A4 _ F#4 _ _ _ A4 _ D5- _ F#5 _ E5 _',         // D    the D chord falling and straight back up, ending a step down
  'C#5 C#5- _ _ D5 D5- _ _ E5 E5- _ _ F#5 _ _ _',      // A    the riff a third higher
  'E5 _ C5 _ G4 _ E4 _ _ _ G4- _ C5 _ _ _',            // C    the answer on the borrowed chord
  'D5 D5- _ _ E5 E5- _ _ F#5 F#5- _ _ D5 _ _ _',       // D    one more climb
  'E5 _ B4 _ G#4 _ B4 _ E5 _ _ _ G#4 _ _ _',           // E    falls, rises, and rests on G#, the note below home
];

// Which layers play. `section` is for the Length control (the 32-bar version: bass and hats, then the running notes
// and the tune, then the full kit, then everything); `intensity` is the window in which the Intensity control brings
// the layer in.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },              // bass and hats: always there, a little fuller as it builds
  arp: { section: 2, intensity: [0, 1], floor: 0.8 },  // the running notes: there at every Intensity, from the second section
  // the tune. The specification brings it in between 0.25 and 0.5 and wants it playing at 0.5; looks set intensity
  // as low as 0.4, so it is all there by 0.4 (compose.js: the tune's window must end by 0.4)
  tune: { section: 2, intensity: [0.25, 0.38] },
  kick: { section: 3, intensity: [0.3, 0.42] },
  snare: { section: 3, intensity: [0.5, 0.62] },
  busy: { section: 3, intensity: [0.5, 0.51] },        // a switch: the kick goes to every 8th note
  full: { section: 4, intensity: [0.75, 0.87] },       // the band's lead plays the tune an octave up as well
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and drums lean in as intensity climbs
};

// The mix, part by part, so each can be measured by itself (`--measure`, and the tests).
// `arpDip` pulls the running notes back while the tune plays: they share 300 to 1200 Hz, and the tune must lead there.
const arpDip = '(1 - 0.4*gTune*lead)';
export const MIX = {
  kick: 'kO*(0.6 - 0.12*gBusy)*gKick*gLift',           // a kick on every 8th is a little lighter
  snare: 'sF*0.5*gSnare*gLift',
  hat: 'hO*0.24*(0.3 + 1.15*bright)*gBed',
  bass: 'bF*0.24/(1 + 0.55*grit)*gBed',                // Grit squares the bass off; the division keeps its level
  arpL: `aF*(0.36 + 0.15*c16p)*gArp*${arpDip}`,
  arpR: `aF*(0.51 - 0.15*c16p)*gArp*${arpDip}`,
  tune: 'lF*0.52*lead*gTune*gLift',
  dblL: 'eO*0.22*lead*gFull',
  dblR: 'eO*0.13*lead*gFull',
};
const LEVEL = 0.9;   // into the limiter
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.arpL} + ${MIX.dblL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hat}`,
  bed: `${MIX.bass} + ${MIX.hat}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'gridline-rush',
    name: 'Fast play',
    tags: ['music', ...B.tags, 'battle', 'fast', 'adaptive', 'loop'],
    description: 'Urgent, bright, driving synthesised chip-style music for a puzzle game at high speed or with the clock running out, in short or long versions: Intensity brings in the tune and a thump on the beat, then the snare and a pounding thump, then a second thin voice playing the tune high as well, and you can change the speed, pitch, grit, brightness and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/battle', themes: ['neutral', 'sci-fi'], gameTypes: ['puzzle', 'arcade'],
      words: ['fast', 'rush', 'hurry', 'speed up', 'time running out', 'pressure', 'danger', 'urgent', 'driving', 'blocks', 'chiptune', '8-bit', 'retro', 'bleep'],
      license: 'draft',
    },
    tempo: B.checkTempo([144, 160, 156]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Synth lead' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('grit', 'Grit', 0, 1, 0.2),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'A' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: the band's kit. Kick on the beats, then on every 8th; noise snare on 2 and 4; hat in 16ths
      drumRow('kLo', 'X...X...X...X...'),
      drumRow('kHi', 'X.x.X.x.X.x.X.x.'),
      { id: 'kT', type: 'expr', expr: 'gBusy > 0.5 ? kHi : kLo' },
      drumRow('sT', '....X.......X...'),
      drumRow('hT', 'XoxoXoxoXoxoXoxo'),
      B.drums({ kick: 'kT', snare: 'sT', hat: 'hT', noise: 'nz' }),      // -> kO (and kA), sO, hO
      // Grit crushes the snare: fewer levels and a lower rate
      { id: 'sX', type: 'crush', in: 'sO', bits: '12 - grit*8.5', rate: '30000 - grit*25000' },
      { id: 'sF', type: 'filter', mode: 'lp', in: 'sX', freq: '2200 + bright*10000', q: 0.7 },     // Brightness opens the snare

      // --- bass: the band's stepped triangle in 8ths, jumping root and octave
      drumRow('bG', 'X.x.X.x.X.x.X.x.'),
      noteRow('bS', '0 _ 12 _ 0 _ 12 _ 0 _ 12 _ 0 _ 12 _'),
      B.bass('b', { trig: 'bG', semis: 'bS' }),                          // -> bO
      { id: 'bD', type: 'shaper', in: 'bO', drive: '1 + grit*4' },       // Grit squares the bass off
      { id: 'bF', type: 'filter', mode: 'lp', in: 'bD', freq: '260 + bright*2800', q: 0.7 },       // Brightness gives the bass its buzzy edge

      // --- running notes: the band's pulse on the chord tones in 16ths (0 root, 1 third, 2 fifth, 3 octave)
      drumRow('aG', 'XxxxXxxxXxxxXxxx'),
      noteRow('aD', '0 2 1 3 0 2 1 2'),
      B.chords('a', { trig: 'aG', pick: 'aD' }),                         // -> aO
      // Grit crushes them too
      { id: 'aX', type: 'crush', in: 'aO', bits: '12 - grit*8.5', rate: '30000 - grit*25000' },
      { id: 'aF', type: 'filter', mode: 'lp', in: 'aX', freq: '500 + bright*9500', q: 0.8 },

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),

      // --- the tune an octave up, on the band's own lead, a few cents off so the two do not lock together
      melody('e', TUNE, { transpose: 12, voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP*1.004' }),                    // -> eO

      // --- mix: kick, snare, hat and bass in the centre; running notes bounce left and right; the high tune on the left
      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.bass}`,
        left: `${MIX.arpL} + ${MIX.tune} + ${MIX.dblL}`,
        right: `${MIX.arpR} + ${MIX.tune} + ${MIX.dblR}`,
        duck: 'kA*gKick', duckAmount: 0.18,      // the music dips under the kick, only while the kick plays
        send: 'sF*0.15*gSnare',
        ...B.room,
        level: LEVEL,
        drive: '1 + grit*0.5',                   // Grit also leans the whole mix on the limiter
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range
      'Speed up': { intensity: 0.5, bpm: 148, grit: 0.1 },
      'Final rows': { intensity: 0.85, bpm: 156 },
      'Danger zone': { intensity: 1, bpm: 158, bright: 0.8, grit: 0.6, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
