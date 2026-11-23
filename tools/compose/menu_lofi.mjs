#!/usr/bin/env node
// Writes sounds/menu-lofi.json: "Rainy Save Point", pause and menu music on the lofi band (docs/music-styles.md).
// Built on the music kit (kit.mjs), after thornwood_overworld.mjs.
//
//   F minor, 76 bpm, swung, 8 bars: Fm7 Bbm7 Eb7 Abmaj7 | Dbmaj7 Bbm7 C7 Fm7. A pause menu on a rainy night,
//   unhurried and a little melancholy. In the order Intensity brings them in: a crackle bed, electric-piano-like
//   seventh chords, a warm bass laid back on 1 and the and-of-2, the tune through the band's wobble and crush,
//   a dusty kick, snare and hat, and at the top an electric-piano answer line. A tape finish on the whole mix.
//
//   node tools/compose/menu_lofi.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_lofi.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/menu_lofi.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_lofi.mjs             when it is ready: write sounds/menu-lofi.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, band, tape } from './kit.mjs';

const B = band('lofi');

// Level of each melody instrument for this tune, measured after the band's colour chain (lcO).
export const GAINS = [1, 0.784, 1.07, 1.06, 1.67, 1.78, 0.835, 1.23, 1.18, 1.35, 0.699, 0.974, 0.804, 1.5, 1.46, 2.04];

export const CHORDS = 'Fm Bbm Eb Ab | Db Bbm C Fm';
// The sevenths, in semitones above each bar's root: Fm7 Bbm7 Eb7 Abmaj7 | Dbmaj7 Bbm7 C7 Fm7.
const SEVENTHS = '10 | 10 | 10 | 11 | 11 | 10 | 10 | 10';

// The tune, one token per 16th. Two bars that sit on C and lean up to D flat and back, a climb with the one leap
// (B flat up to E flat), a held C; then the same two-bar shape a sixth higher on D flat and B flat minor, and a fall
// down the C chord (E natural, C, G) that steps up to A flat and home to F.
export const TUNE = [
  'C5 _ _ _ _ _ _ _ Ab4 _ Bb4- _ C5 _ _ _',     // Fm   a long C, then Ab, Bb, C
  'Db5 _ _ _ _ _ _ _ C5- _ Bb4 _ _ _ _ _',      // Bbm  lean up to Db, step down to Bb
  'G4 _ _ _ Bb4 _ _ _ Eb5 _ _ _ Db5- _ _ _',    // Eb   climb, the leap up to Eb, the seventh
  'C5 _ _ _ _ _ _ _ Eb5 _ _ _ _ _ _ _',         // Ab   held: a question
  'F5 _ _ _ _ _ _ _ Db5 _ Eb5- _ F5 _ _ _',     // Db   bar 1's shape, higher
  'F5 _ _ _ _ _ _ _ Eb5- _ Db5 _ _ _ _ _',      // Bbm  bar 2's shape, higher
  'E5 _ _ _ _ _ _ _ _ _ C5 _ _ _ G4 _',       // C    down the C chord from its major third, G leading to Ab
  'Ab4 _ _ _ _ _ _ _ F4 _ _ _ _ _ _ _',         // Fm   home
];

// The answer line, on the band's electric piano, under the tune and in its gaps.
export const ANSWER = [
  '_ _ _ _ F4 _ Ab4- _ _ _ _ _ _ _ _ _',
  '_ _ _ _ _ _ _ _ _ _ _ _ Db4 _ F4- _',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '_ _ _ _ Eb4 _ C4- _ _ _ _ _ Ab3 _ _ _',
  '_ _ _ _ Ab3 _ C4- _ _ _ _ _ _ _ _ _',
  '_ _ _ _ Bb3 _ Db4- _ _ _ _ _ _ _ _ _',
  '_ _ _ _ E4 _ G4- _ _ _ _ _ _ _ _ _',          // under the held E: the C chord's third and fifth
  '_ _ _ _ C4 _ Eb4- _ _ _ _ _ F4 _ _ _',
];

// Which layers play, in the brief's intensity order. `section` is for Length (32 bars: keys and bass, then the
// tune, then the drums, then the answer; 16 bars is sections 3 and 4).
export const LAYERS = {
  bed: {},                                              // the crackle: at every intensity
  keys: { intensity: [0, 0.12], floor: 0.6 },           // the seventh chords: there at 0, so it is still music
  bass: { intensity: [0.12, 0.22] },
  tune: { section: 2, intensity: [0.3, 0.4] },          // in by 0.4, so every look keeps the tune
  drums: { section: 3, intensity: [0.5, 0.6] },
  answer: { section: 4, intensity: [0.75, 0.85] },      // last in, and in by the default (0.85)
  lift: { intensity: [0.4, 1], floor: 0.8 },            // the tune and the drums lean in as intensity climbs
};

// The mix, part by part. The chords sit under the tune's register; keysDip pulls them back while the tune plays.
const keysDip = '(1 - 0.3*gTune*lead)';
export const MIX = {
  crackle: 'xO*0.12*gBed',
  kick: 'kO*0.45*gDrums*gLift',
  snare: 'sO*0.4*gDrums*gLift',
  hat: 'hO*0.3*gDrums*gLift',
  bass: '(bO*0.16 + bU*0.07)*gBass',
  keysL: `pH*0.5*gKeys*${keysDip}`,
  keysR: `pH*0.5*gKeys*${keysDip}`,
  tune: 'lcO*0.5*lead*gTune*gLift',
  answerL: 'eO*0.17*0.8*lead*gAnswer',
  answerR: 'eO*0.17*1.2*lead*gAnswer',
};
const LEVEL = 0.85;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.keysL} + ${MIX.answerL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.crackle}`,
  bed: `${MIX.bass} + ${MIX.keysL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const fin = tape('tp', { left: 'mL', right: 'mR', cutoff: '3500 + bright*3500' });
  return assemble({
    id: 'menu-lofi',
    name: 'Rainy Save Point',
    tags: ['music', 'menu', ...B.tags, 'adaptive', 'loop'],
    description: 'Slow, swung, synthesised lo-fi music for a pause or save menu on a rainy night: Intensity brings in the electric-piano-like chords, a warm bass, the tune, dusty drums and an answer line over a crackle bed, and you can change the speed, pitch, swing and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['neutral', 'city'], gameTypes: ['arcade', 'turn-based-rpg', 'platformer'],
      words: ['pause', 'menu', 'save', 'lofi', 'chill', 'rain', 'rainy', 'night', 'mellow', 'calm', 'tape', 'dusty', 'relax'],
      license: 'draft',
    },
    tempo: B.checkTempo([68, 84, 76]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Bell' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Swing', 0, 1, 0.6),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'F' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: boom-bap on the swung clock, and the crackle bed from the first step
      drumRow('kT', 'X......x..X.....'),
      drumRow('sT', '....X.......X...'),
      drumRow('hT', 'x.x.x.xox.x.x.xo'),
      drumRow('xT', 'X...............'),
      B.drums({ kick: 'kT', snare: 'sT', hat: 'hT', crackle: 'xT', noise: 'nz' }),   // -> kO, sO, hO, xO

      // --- bass: the root on 1, the fifth on the and-of-2, swung by the clock
      drumRow('bG', 'X.....x.........'),
      noteRow('bS', '0 _ _ _ _ _ 7 _ _ _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bS' }),
      // its body: the 4th and 6th harmonics (two octaves up and the fifth above), so a phone speaker still hears the line
      { id: 'bU2', type: 'osc', freq: 'bHz*4' },
      { id: 'bU3', type: 'osc', freq: 'bHz*6' },
      { id: 'bU', type: 'expr', expr: '(bU2 + bU3*0.5)*bA*bV' },

      // --- the seventh chords on the electric piano
      drumRow('pG', 'X.......x.....x.'),
      noteRow('pE', SEVENTHS, { every: 16 }),
      B.chords('p', { trig: 'pG', extra: 'pE' }),
      { id: 'pH', type: 'filter', mode: 'hp', in: 'pO', freq: 300, q: 0.6 },   // thinned below the tune, as lo-fi keys are

      // --- the tune, on whichever instrument the listener picks, through the band's wobble and crush
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.5 }),
      B.colour('lc', { input: 'lF' }),

      // --- the answer, on the band's electric piano
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.keysL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.hat}*0.9 + ${MIX.crackle}*1.2`,
        right: `${MIX.keysR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.hat}*1.1 + ${MIX.crackle}*0.8`,
        duck: 'kA*gDrums', duckAmount: 0.2,
        ...B.room, level: LEVEL,
      }),
      fin,
    ],
    out: ['tpL', 'tpR'],
    presets: {
      'Paused': { intensity: 0.45, bpm: 73 },
      'Save screen': { intensity: 0.85, bpm: 76 },
      'Long night': { intensity: 1, bpm: 79, bright: 0.5, swing: 0.5 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
