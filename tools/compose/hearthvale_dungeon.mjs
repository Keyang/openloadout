#!/usr/bin/env node
// Writes sounds/hearthvale-dungeon.json: "Dungeon theme", the crypt music of the Hearthvale action-adventure kit
// (bundles/specs/kit-adventure-hearthvale.md, batch AM2), on the organ band (docs/music-styles.md). Built on the
// music kit (kit.mjs) and band('organ'), after menu_organ.mjs.
//
//   E minor, 80 bpm, 8 bars: Em C Am B | Em D C B. Cold, slow, watchful: the band's organ holds each chord low and
//   quiet through the rotary swirl, a pedal bass holds the root and walks to the next one on beat 4, a sparse tune
//   in long notes with gaps (a 2-bar cell: up a third and held, then down a third and held), from the middle of
//   Intensity a ride on the beats and a kick on 1, then a brushed snare on 3 and the organ answering high in bars 4
//   and 8. Both halves stop on B, and the tune ends on D sharp, so the loop wants to start again.
//
//   node tools/compose/hearthvale_dungeon.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/hearthvale_dungeon.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/hearthvale_dungeon.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/hearthvale_dungeon.mjs             when it is ready: write sounds/hearthvale-dungeon.json
import { param, band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';
import { rotary } from '../../sound/voices.js';

const B = band('organ');

// Level of each melody instrument for this tune, from `--match`. Run `--match` again after any change to the tune.
export const GAINS = [1, 0.798, 1.05, 0.999, 2.02];

export const CHORDS = 'Em C Am B | Em D C B';

// The tune, one token per 16th: long notes, and nothing after them until the next bar. The cell is two bars: E up a
// minor third to G and held (Em), then G again and down a third to E, held (C). Bars 3 and 4 answer it a fourth
// higher, A up to C (Am), and rest on B over B. Bars 5 to 8 turn the cell upside down, B down to G (Em), then up to
// A (D), and fall by steps, G, a short F sharp, E (C), to D sharp over B: the leading note. Every held note is a
// note of its bar's chord. The second note of the cell lands on beat 2, so the tune itself marks the beat.
export const TUNE = [
  'E4 _ _ _ G4 _ _ _ _ _ _ _ _ _ _ _',          // Em   E, up a third to G, held
  'G4 _ _ _ E4- _ _ _ _ _ _ _ _ _ _ _',         // C    G again, down a third to E, held (soft: on the Bell a loud E rings an F sharp over C)
  'A4 _ _ _ C5 _ _ _ _ _ _ _ _ _ _ _',          // Am   the cell a fourth higher: A up to C, held
  'B4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',           // B    B, held: the organ answers above
  'B4 _ _ _ G4 _ _ _ _ _ _ _ _ _ _ _',          // Em   the cell upside down: B down to G, held
  'A4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',           // D    up to A, held
  'G4 _ _ _ _ _ _ _ _ _ F#4-- _ E4- _ _ _',     // C    falling by steps: G, a short F sharp, E
  'D#4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',          // B    the leading note, held: the organ answers above
];

// The organ's answer, high, in the second half of bars 4 and 8 while the tune's last note dies away: it climbs the
// B chord in bar 4 and comes down it in bar 8.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST, REST, REST,
  '_ _ _ _ _ _ D#5- _ F#5- _ _ _ B5- _ _ _',    // B    up the chord: D sharp, F sharp, B
  REST, REST, REST,
  '_ _ _ _ _ _ B5- _ F#5- _ _ _ D#5- _ _ _',    // B    and down it again
];

// The pedal bass: the root for a dotted half, then a quarter-note passing tone that leads to the next bar's root
// (semitones above this bar's root). The roots are E2 C2 A2 B1 | E2 D2 C2 B1 (chords() keeps them from B1 to A2):
// E2 D2 | C2 G2 | A2 A1 | B1 D#2 | E2 C2 | D2 B1 | C2 A1 | B1 D#2 (back to E2). Where the next root is one step
// down (bars 5 to 7) the bass dips under it and comes up to it.
const PASSING = [-2, 7, -12, 4, -4, -3, -3, 4];
export const BASS_SEMIS = PASSING.map((p) => `0 _ _ _ _ _ _ _ _ _ _ _ ${p} _ _ _`);

// Which layers play, in the specification's intensity order: the held organ and the pedal bass always; the tune from
// 0.3; ride and kick from 0.5; the brushed snare and the answer from 0.75. Length: the 32-bar version is organ and
// bass, then the tune, then the kit, then everything.
export const LAYERS = {
  tune: { section: 2, intensity: [0.3, 0.4] },         // all there by 0.4: whole-bundle looks go as low as 0.4
  kit: { section: 3, intensity: [0.5, 0.6] },          // ride on the quarters, kick on 1
  top: { section: 4, intensity: [0.75, 0.85] },        // the brushed snare on 3 and the answer line
  lift: { intensity: [0.3, 1], floor: 0.75 },          // not a layer: the tune and the kit lean in as intensity climbs
};

// The organ chords dip while the tune plays: they share 300 to 1200 Hz, and the tune must lead there.
const DIP = '0.45*gTune*lead';
// Brightness opens a low-pass over the organ (chords and answer): dark and covered at 0, open at 1.
const ORGAN_LP = '500 + bright*6000';
export const MIX = {
  kick: 'kO*0.5*gKit*gLift',
  snare: 'sO*0.3*gTop*gLift',
  rideL: 'rO*0.14*gKit*gLift*(0.45 + 1.1*bright)',      // the ride's shimmer grows with Brightness
  rideR: 'rO*0.2*gKit*gLift*(0.45 + 1.1*bright)',
  bass: 'bO*0.22',
  organL: 'oL*0.4',
  organR: 'oR*0.4',
  tune: 'lF*0.6*lead*gTune*gLift',
  answerL: 'aLf*0.2*gTop',
  answerR: 'aRf*0.3*gTop',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.organL} + ${MIX.answerL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.rideL}`,
  bass: MIX.bass,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const kit = B.drums({ kick: 'kT', snare: 'sT', ride: 'rT', noise: 'nz' });     // -> kO, sO, rO; kit.duck = 'kA'
  const organ = B.chords('p', { trig: 'hG', dip: DIP, noise: 'nz' });            // -> pL, pR: held, low, through the rotary
  return assemble({
    id: 'hearthvale-dungeon',
    name: 'Dungeon theme',
    tags: ['music', 'dungeon', 'crypt', ...B.tags, 'adaptive', 'loop'],
    description: 'Cold, slow, watchful synthesised organ music for a crypt, in short or long versions: low held chords and a deep bass under a sparse tune of long notes, Intensity brings in the tune, then a soft beat, then a high answering line, and you can change the speed, pitch, room and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/exploration', themes: ['fantasy', 'dungeon'], gameTypes: ['top-down-rpg', 'turn-based-rpg'],
      words: ['dungeon', 'crypt', 'tomb', 'catacomb', 'underground', 'explore', 'organ', 'cold', 'eerie', 'slow', 'watchful', 'gothic', 'candlelit', 'stone'],
      license: 'draft',
    },
    tempo: B.checkTempo([72, 92, 80]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Bell' },
    extraParams: [param('lead', 'Melody', 0, 1, 0.8)],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'E' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the light kit: a ride on the quarters and a short kick on 1; then a brushed snare on 3
      drumRow('kT', 'X...............'),
      drumRow('sT', '........x.......'),
      drumRow('rT', 'x...o...x...o...'),
      kit,

      // --- the pedal bass: a dotted half on the root, a passing quarter on beat 4
      drumRow('bG', 'X...........x...'),
      noteRow('bS', BASS_SEMIS),
      B.bass('b', { trig: 'bG', semis: 'bS', noise: 'nz' }),

      // --- the organ: the chord held all bar, low and quiet, through the rotary swirl
      drumRow('hG', 'X...............'),
      organ,
      { id: 'oL', type: 'filter', mode: 'lp', in: organ.out[0], freq: ORGAN_LP, q: 0.7 },
      { id: 'oR', type: 'filter', mode: 'lp', in: organ.out[1], freq: ORGAN_LP, q: 0.7 },

      // --- the tune, on whichever instrument the listener picks; slow notes ring longer
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 2 }),

      // --- the answer, on the band's organ lead through the rotary swirl, high, in bars 4 and 8
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP', noise: 'nz' }),
      rotary('a', { input: 'eO' }),
      { id: 'aLf', type: 'filter', mode: 'lp', in: 'aL', freq: ORGAN_LP, q: 0.7 },
      { id: 'aRf', type: 'filter', mode: 'lp', in: 'aR', freq: ORGAN_LP, q: 0.7 },

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.organL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.rideL}`,
        right: `${MIX.organR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.rideR}`,
        duck: `${kit.duck}*gKit`, duckAmount: 0.12,
        send: 'sO*0.2*gTop',
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% and stop at the range: the slow style sits 5% over 72, the fast one 5% under 92
      'First steps': { intensity: 0.45, bpm: 76, bright: 0.35, space: 0.42 },
      'Deeper': { intensity: 0.7, bpm: 80, key: -2 },
      'Before the door': { intensity: 1, bpm: 87, bright: 0.65, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
