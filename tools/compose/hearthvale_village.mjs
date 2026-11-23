#!/usr/bin/env node
// Writes sounds/hearthvale-village.json: "Village and fields theme", the map music of the turn-based RPG kit
// (bundles/specs/kit-rpg-fantasy.md, batch R21). Built on the music kit (kit.mjs), after thornwood_overworld.mjs.
//
//   F major, 92 bpm, 8 bars: F C Dm Bb | F Bb C F. Storybook: two plucked strings rolling the chord in 8th notes,
//   a soft pad, a round bass on beats 1 and 3, a tune in long notes, a shaker and a hand drum, and a chime that
//   answers the tune in bars 4 and 8. "Lilt" swings the 8th notes.
//
//   node tools/compose/hearthvale_village.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/hearthvale_village.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/hearthvale_village.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/hearthvale_village.mjs             when it is ready: write sounds/hearthvale-village.json
import {
  param, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main,
  clockEighths, ringRows, pluckedString, struckBell, roundBass, handDrum, shaker, sawPad, eightBars,
} from './kit.mjs';

// Level of each melody instrument for this tune, from `--match` (all five within 0.2 dB on the melody bus).
// Run `--match` again after any change to the tune or to the instruments.
export const GAINS = [1, 0.805, 1.04, 0.998, 2.05, 1.57, 0.865, 1.28, 1.15, 1.31, 0.721, 1.07, 0.96, 1.65, 1.4, 2.25];

export const CHORDS = 'F C Dm Bb | F Bb C F';

// The tune, one token per 16th. Four bars that rise a sixth from F to D (through A) and fall back to F by steps,
// resting on B flat; then four bars that begin the same way, reach the F above, and come home to F down the chords.
export const TUNE = [
  'F4 _ _ _ _ _ _ _ A4 _ _ _ D5 _ _ _',        // F    up a sixth: a long F, then A and D
  'C5 _ _ _ _ _ _ _ _ _ _ _ Bb4- _ _ _',       // C    and back by steps: a long C, B flat,
  'A4 _ _ _ _ _ G4- _ F4 _ _ _ _ _ _ _',       // Dm   A, G, F
  'Bb4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',         // Bb   a long B flat: the chime answers
  'F4 _ _ _ _ _ _ _ A4 _ _ _ D5 _ _ _',        // F    the same rise
  'F5 _ _ _ _ _ D5- _ Bb4 _ _ _ _ _ _ _',      // Bb   on to the F above, then down the B flat chord
  'C5 _ _ _ _ _ Bb4- _ G4 _ _ _ _ _ _ _',      // C    C, B flat, G
  'F4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',          // F    home: the chime answers
];

// The chime's two answers, in semitones above F5: in bar 4 it comes down the B flat chord (D F D B flat), in bar 8
// it climbs home (C D F).
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const CHIME = eightBars(REST, {
  4: '_ _ _ _ 9 _ 12- _ 9 _ _ _ 5 _ _ _',
  8: '_ _ _ _ 7 _ 9- _ 12 _ _ _ _ _ _ _',
});

// The rolling strings: eight 8th notes a bar, low, up, top and back, in semitones above F3. The lowest notes walk
// F E D D | F D E F under the chords; everything stays at or under the tune's lowest note (F4).
const ROLL_BARS = [
  '0 4 7 4 0 4 7 4',          // F    F A C
  '-1 2 7 2 -1 2 7 2',        // C    E G C
  '-3 4 9 4 -3 0 9 4',        // Dm   D A D, with the F once: the D says this bar is not F major
  '-3 0 5 0 -3 0 5 9',        // Bb   D F B flat (and the D above, once)
  '0 4 7 4 0 4 7 4',          // F
  '-3 0 5 0 -3 0 5 0',        // Bb
  '-1 7 11 7 -1 2 11 7',      // C    E C E, with the G once (the tune holds a G here)
  '0 4 7 4 0 4 7 12',         // F    up to the F above before the loop comes round
];
/** One bar of 8th notes as 16 tokens: every second 8th (the one that swings) is played softer. */
const eighths = (bar) => bar.split(/\s+/).map((n, i) => `${n}${i % 2 ? '-' : ''} _`).join(' ');
export const ROLL = ROLL_BARS.map(eighths);

// What the pad holds in each bar, in semitones above F3: three chord tones that move by a step or stay.
//             F  C  Dm Bb | F  Bb C  F
const PAD_LOW = '0 -1 0 0 | 0 0 -1 0';     // F3 E3 F3 F3 | F3 F3 E3 F3
const PAD_MID = '4 2 4 5 | 4 5 2 4';       // A3 G3 A3 Bb3 | A3 Bb3 G3 A3
const PAD_HIGH = '7 7 9 9 | 7 9 7 7';      // C4 C4 D4 D4 | C4 D4 C4 C4

// The strings ring for 1.8 s. At the default Brightness the pick is the kit's own (1.3 ms): measured, a longer pick
// only adds weight under 300 Hz and takes away the clear start above 1.2 kHz, which is what lets the strings be
// heard beside the tune. Brightness moves it further than the kit does: 2.6 ms (warm, round) to 0.5 ms (crisp).
const STRING = { ring: 1.8, pick: '0.0026 - bright*0.0021' };

// The bass: the root on beat 1 and the chord's fifth on beat 3, kept between F2 and D3.
const bassBar = (fifth) => `0 _ _ _ _ _ _ _ ${fifth} _ _ _ _ _ _ _`;
const BASS = [bassBar(7), bassBar(-5), bassBar(-5), bassBar(-5), bassBar(7), bassBar(-5), bassBar(-5), bassBar(7)];

// Which layers play. `section` is for the Length control (the 32-bar version is the strings alone, then with the
// pad and the bass, then the tune, then everything); `intensity` is the window in which the Intensity control
// brings the layer in.
export const LAYERS = {
  roll: { intensity: [0, 1], floor: 0.8 },             // the strings: always there, a little fuller as it builds
  pad: { section: 2 },
  bass: { section: 2, intensity: [0.3, 0.4] },
  // the tune. The specification brings it in between 0.3 and 0.55; looks set intensity as low as 0.4 (Night: 0.5),
  // and must keep the tune, so it is all there by 0.4
  tune: { section: 3, intensity: [0.3, 0.4] },
  perc: { section: 4, intensity: [0.55, 0.65] },       // shaker and hand drum
  top: { section: 4, intensity: [0.8, 0.85] },         // the chime, and the tune doubled an octave up
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and the percussion lean in as intensity climbs
};

// The mix, part by part, so each can be measured by itself (`--measure`, and the tests).
// `rollDip` and `padDip` pull the strings and the pad back while the tune plays: their overtones reach into 300 to
// 1200 Hz, where the tune must lead. Alone (low Intensity, the opening sections) they play at their full level.
const rollDip = '(1 - 0.5*gTune*lead)';
const padDip = '(1 - 0.5*gTune*lead)';
export const MIX = {
  rollL: `(r1O*0.64 + r2O*0.36)*1.7*gRoll*${rollDip}`,
  rollR: `(r1O*0.36 + r2O*0.64)*1.7*gRoll*${rollDip}`,
  padL: `pL*0.75*gPad*${padDip}`,
  padR: `pR*0.75*gPad*${padDip}`,
  bass: 'bO*0.3*gBass',
  drum: 'dO*0.55*gPerc*gLift',
  shake: 'kO*0.6*gPerc*gLift',
  tune: 'lF*0.9*lead*gTune*gLift',
  octave: 'oO*lFlA*lV*0.22*lead*gTune*gTop',
  chimeL: '(q1O*0.7 + q2O*0.3)*1.6*gTop',
  chimeR: '(q1O*0.3 + q2O*0.7)*1.6*gTop',
};
const LEVEL = 0.7;   // into the limiter: measured, the loudest moments reach it at 1.2 (Flute) to 1.8 (Plucked string)
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the percussion, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.rollL} + ${MIX.padL}`,
  percussion: `${MIX.drum} + ${MIX.shake}`,
  bed: `${MIX.bass} + ${MIX.rollL}`,
  chime: MIX.chimeL,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'hearthvale-village',
    name: 'Village and fields theme',
    tags: ['music', 'village', 'storybook', 'adaptive', 'loop'],
    description: 'Warm, gentle, happy village music in short or long versions: plucked strings roll under a tune in long notes, Intensity brings in the bass and the tune, then a shaker and hand drum, then a chime, and you can change the speed, pitch, lilt and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/exploration', themes: ['fantasy', 'farm'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'farming-sim'],
      words: ['village', 'town', 'fields', 'home', 'map', 'walk', 'wander', 'explore', 'shop', 'peaceful', 'gentle', 'cozy', 'pastoral', 'flute'],
      license: 'draft',
    },
    tempo: [80, 108, 92],
    defaults: { intensity: 0.85, bars: 16, inst: 'Flute', bright: 0.6, space: 0.08 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Lilt', 0, 1, 0.35),
    ],
    nodes: [
      // "Lilt" swings the 8th notes, and only gently: at the top the 8th between two beats comes a fifth of an 8th late
      clockEighths({ swing: 'swing*0.6' }),
      chords(CHORDS, { tonic: 'F', low: 0 }),            // roots F C D Bb | F Bb C F, all at or above F
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the rolling strings: two plucked strings take turns, so every note rings on under the next
      ringRows('r', ROLL),
      pluckedString('r1', 'rG1', 'midi(53 + round(key) + rS1)', STRING),
      pluckedString('r2', 'rG2', 'midi(53 + round(key) + rS2)', STRING),

      // --- the pad: soft saws holding three chord tones, swelling once a bar
      noteRow('hA', PAD_LOW, { every: 16 }),
      noteRow('hB', PAD_MID, { every: 16 }),
      noteRow('hC', PAD_HIGH, { every: 16 }),
      drumRow('pT', 'X...............'),
      sawPad('p', ['midi(53 + round(key) + hA)', 'midi(53 + round(key) + hB)', 'midi(53 + round(key) + hC)'],
        { trig: 'pT', attack: 0.6, sustain: 0.5, detune: 0.004, cutoff: '260 + bright*620' }),

      // --- the bass: a round sine and triangle, root on beat 1, fifth on beat 3
      drumRow('bT', 'X.......x.......'),
      noteRow('bS', BASS),
      roundBass('b', 'bT', { note: 41, semis: 'bS' }),

      // --- percussion: a shaker on the 8th notes and a soft hand drum on 2 and 4, tuned to the chord root
      drumRow('kT', 'x.o.x.o.x.o.x.o.'),
      shaker('k', 'kT', { noise: 'nz' }),
      drumRow('dT', eightBars('....X.......X...', { 4: '....X.......X.o.', 8: '....X.....o.X...' })),
      handDrum('d', 'dT', { pitch: 'midi(41 + tr)', noise: 'nz' }),

      // --- the tune, on whichever instrument the listener picks; the notes are long, so the instruments hold longer
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 2.6 }),
      // the tune doubled an octave up, on a plain whistle (a sine with the flute's breath and vibrato)
      { id: 'oO', type: 'osc', freq: 'lP*2*(1 + lVib*0.007)' },

      // --- the chime that answers the tune in bars 4 and 8: two bells take turns
      ringRows('q', CHIME),
      struckBell('q1', 'qG1', 'midi(77 + round(key) + qS1)', { ring: 1.6 }),
      struckBell('q2', 'qG2', 'midi(77 + round(key) + qS2)', { ring: 1.6 }),

      // --- mix: bass, hand drum and shaker in the centre; one string each side; the chime's bells left and right
      bus({
        centre: `${MIX.bass} + ${MIX.drum} + ${MIX.shake}`,
        left: `${MIX.rollL} + ${MIX.padL} + ${MIX.tune} + ${MIX.octave} + ${MIX.chimeL}`,
        right: `${MIX.rollR} + ${MIX.padR} + ${MIX.tune} + ${MIX.octave} + ${MIX.chimeR}`,
        send: `(q1O + q2O)*0.15*gTop`,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Quiet morning': { intensity: 0.45, bpm: 86, bright: 0.45, swing: 0.2, space: 0.14 },
      'Market day': { intensity: 1, bpm: 100, bright: 0.75, swing: 0.6 },
      'Shop': { intensity: 0.7, bpm: 96, bars: 8, inst: 4, key: 2, swing: 0.5, lead: 0.75 },
    },
  });
}

main(build, import.meta.url, { layers: PARTS });
