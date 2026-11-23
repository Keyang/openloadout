#!/usr/bin/env node
// Writes sounds/hearthvale-battle.json: "Party battle theme", the battle music of the RPG kit
// (bundles/specs/kit-rpg-fantasy.md, batch R22). Built on the music kit (kit.mjs).
//
//   A minor (Dorian: F sharp in the tune, a D major chord), 152 bpm, 8 bars: Am Am F G | Am C D E.
//   A galloping saw-and-square bass, a quiet string ostinato that rocks against the root, kick on every beat with
//   snare and hats, brass stabs on the off-beats of bars 4 and 8, the tune (doubled an octave up when everything
//   is in) and a tom fill at the end of bar 8.
//
//   node tools/compose/hearthvale_battle.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/hearthvale_battle.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/hearthvale_battle.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/hearthvale_battle.mjs             when it is ready: write sounds/hearthvale-battle.json
import {
  param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main,
  eightBars, chordTone, kickDrum, snareDrum, hatDrum, tomDrum, sawBass, stringPair, brassStab,
} from './kit.mjs';

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.8, 0.996, 0.96, 1.7, 1.78, 0.859, 1.33, 1.18, 1.41, 0.943, 0.962, 1.27, 1.55, 1.52, 2.01];

export const CHORDS = 'Am Am F G | Am C D E';

// The tune, one token per 16th. A two-bar call: A leaps up a fifth to a long E, touches the G above, and marches
// down the Dorian scale in a dotted rhythm (g f#, E d C, C b A). Two bars later the answer: the same call a step
// higher from its long note on (a long F, then a g, F e D, D c B). The second half climbs bar by bar, through
// F sharp on the D chord, to the top B on the E chord, and falls back down that chord to the A that starts the
// loop again.
export const TUNE = [
  'A4 _ _ _ E5 _ _ _ _ _ _ _ G5- _ F#5- _',       // Am   the call: up a fifth, hold, then from the G above
  'E5 _ _ D5- C5 _ _ _ C5 _ _ B4- A4 _ _ _',      // Am   the march down: (g f#) E d C, C b A
  'A4 _ _ _ F5 _ _ _ _ _ _ _ A5- _ G5- _',        // F    the answer: the long note a step higher, then from A
  'F5 _ _ E5- D5 _ _ _ D5 _ _ C5- B4 _ _ _',      // G    its march down, a step higher: (a g) F e D, D c B
  'A4 _ _ B4- C5 _ _ _ E5 _ _ _ _ _ D5- _',       // Am   the climb starts: A b C, E
  'E5 _ _ F#5- G5 _ _ _ _ _ _ _ E5- _ G5- _',     // C    E f# G
  'F#5 _ _ G5- A5 _ _ _ _ _ _ _ F#5- _ A5- _',    // D    the same a step higher, on the Dorian F sharp
  'B5 _ _ _ _ _ G#5 _ E5 _ _ _ D5- _ B4- _',      // E    the top, then down the E chord and home
];

// Which layers play. `section` is for the Length control (the 32-bar version is bass and ostinato, then drums,
// then stabs and the tune, then everything); `intensity` is the window in which the Intensity control brings the layer in.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },              // gallop bass and string ostinato: always there
  beat: { section: 2, intensity: [0.25, 0.35] },       // kick and hats
  // the melody. The specification names it at 0.75, with its octave doubling; but whole-bundle looks set intensity
  // as low as 0.4 (Night: 0.5 exactly), which would mute the tune, so the tune alone is all there by 0.4
  tune: { section: 3, intensity: [0.3, 0.4] },
  snare: { section: 2, intensity: [0.5, 0.6] },
  stab: { section: 3, intensity: [0.5, 0.6] },         // brass stabs in bars 4 and 8
  full: { section: 4, intensity: [0.75, 0.85] },       // the tune doubled an octave up
  busy: { section: 4, intensity: [0.75, 0.76] },       // a switch: the hats go to 16ths
  fill: { section: 2, intensity: [0.75, 0.85] },       // the tom fill that ends every section with drums
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: tune and drums lean in as intensity climbs
  push: { section: 4 },                                // not a layer: 1 in the last section, 0 before it
};

// The mix, part by part, so each can be measured by itself (`--measure`, and the tests).
// `ostDip` pulls the ostinato back while the tune plays: they share 300 to 1200 Hz, and the tune must lead there.
const ostDip = '(1 - 0.7*gTune*lead)';
// in the last section the band digs in: the tune and the drums are a little louder than in the section before
const push = '(0.9 + 0.1*gPush)';
export const MIX = {
  kick: `kO*0.9*gBeat*gLift*${push}`,
  snare: `sO*0.8*gSnare*gLift*${push}`,
  hat: 'hO*(0.5 + 0.5*bright)*gBeat*gLift',
  toms: 'tmO*0.8*gFill',
  bass: 'bO*0.34*gBed',
  ostL: `aL*0.7*gBed*${ostDip}`,
  ostR: `aR*0.7*gBed*${ostDip}`,
  stabL: 'stL*0.5*gStab',
  stabR: 'stR*0.5*gStab',
  tune: `lF*1.1*lead*gTune*gLift*${push}`,
  octL: 'dL*0.8*lead*gFull',
  octR: 'dR*0.8*lead*gFull',
};
const LEVEL = 0.5;   // into the limiter: measured, the loudest moments (kick, snare and a melody note together) reach it at about 1.5
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.ostL} + ${MIX.stabL}`,                       // ostinato and stabs: what shares the tune's register
  under: `${MIX.bass} + ${MIX.ostL} + ${MIX.stabL}`,           // everything pitched under the tune, the bass too
  octave: MIX.octL,
  octaveRight: MIX.octR,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.toms}`,
  bed: `${MIX.bass} + ${MIX.ostL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

const REST = '................';

export function build(gains = GAINS) {
  return assemble({
    id: 'hearthvale-battle',
    name: 'Party battle theme',
    tags: ['music', 'battle', 'rpg', 'adaptive', 'loop'],
    description: 'Heroic, galloping battle music, serious but hopeful, in short or long versions: Intensity brings in the drums, the tune and short brass hits, then the tune played high as well and drum rolls, and you can change the speed, pitch, grit and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/battle', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg'],
      words: ['battle', 'fight', 'combat', 'encounter', 'enemy', 'monster', 'party', 'heroic', 'gallop', 'urgent', 'brass', 'strings', 'wyrm', 'boss'],
      license: 'draft',
    },
    tempo: [140, 172, 152],
    defaults: { intensity: 0.85, bars: 8, inst: 'Synth lead', bright: 0.6, space: 0.08 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('grit', 'Grit', 0, 1, 0.4),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'A', low: -4 }),          // roots: A A F G | A C D E, the second half climbing
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: kick on every beat, snare on 2 and 4, hats on 8ths (16ths when everything is in)
      drumRow('kT', 'X...X...X...X...'),
      kickDrum('k', 'kT', { decay: 0.16 }),
      drumRow('sT', '....X.......X...'),
      snareDrum('s', 'sT', { noise: 'nz' }),
      drumRow('h8', 'X.x.X.x.X.x.X.x.'),
      drumRow('h16', 'XoxoXoxoXoxoXoxo'),
      { id: 'hT', type: 'expr', expr: 'gBusy > 0.5 ? h16 : h8' },
      hatDrum('h', 'hT', { noise: 'nz' }),
      // --- tom fill: the last half of bar 8, walking down the bar's chord (octave, fifth, root)
      drumRow('tmT', eightBars(REST, { 8: '........X.xxXxXx' })),
      noteRow('tmS', '12 _ _ _ _ _ _ _ 12 _ 12 12 7 7 0 0'),
      tomDrum('tm', 'tmT', { semis: 'tmS', noise: 'nz', decay: 0.16 }),

      // --- gallop bass: "X.xx" on every beat, on the chord root; the even bars lift to the fifth on beat 4
      drumRow('bT', 'X.xxX.xxX.xxX.xx'),
      noteRow('bS', eightBars('0 _ 0 0 0 _ 0 0 0 _ 0 0 0 _ 0 0', Object.fromEntries([2, 4, 6].map((b) => [b, '0 _ 0 0 0 _ 0 0 0 _ 0 0 7 _ 7 7'])))),
      sawBass('b', 'bT', { semis: 'bS', open: '700 + bright*1800', drive: '1.5 + grit*5' }),

      // --- string ostinato: 16ths rocking between the root and the chord tones above it, quiet, one saw on each side
      noteRow('aD', ['2 0 1 0 2 0 1 0 3 0 1 0 2 0 1 0', '2 0 1 0 2 0 1 0 3 0 2 0 1 0 2 0']),
      chordTone('aS', 'aD'),
      stringPair('a', 'midi(57 + tr + aS)', { cutoff: '700 + bright*2200', open: 1200 }),

      // --- brass stabs: the whole chord on the four off-beats of bars 4 and 8
      drumRow('stT', eightBars(REST, { 4: '..X...X...X...X.', 8: '..X...X...X...X.' })),
      brassStab('st', 'stT', { open: '1500 + bright*4000 + grit*1500' }),

      // --- the tune, on whichever instrument the listener picks
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.3 }),
      // --- its octave doubling: a bright pair of saws an octave above, on the same notes. Both saws sit a few cents
      // off the exact octave (7 under, 5 over): a saw at exactly twice the tune's pitch stays locked to it and, measured,
      // cancelled 3 dB of the Chiptune instrument on the left
      stringPair('d', 'lP*2*0.996', { trig: 'lG', attack: 0.01, decay: 0.38, curve: 1.4, cutoff: '1200 + bright*3000', open: 2500 }),

      // --- mix: drums and bass in the centre; ostinato, stabs and the doubling spread left and right
      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.hat} + ${MIX.toms} + ${MIX.bass}`,
        left: `${MIX.ostL} + ${MIX.stabL} + ${MIX.tune} + ${MIX.octL}`,
        right: `${MIX.ostR} + ${MIX.stabR} + ${MIX.tune} + ${MIX.octR}`,
        duck: 'kA*gBeat', duckAmount: 0.25,      // the music dips under the kick, only while the kick plays
        send: 'sN*sA*0.4*gSnare',
        level: LEVEL,
        drive: '1 + grit*0.8',
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Random encounter': { intensity: 0.65, bpm: 148, grit: 0.25 },
      'Tough fight': { intensity: 0.9, bpm: 156, grit: 0.55 },
      'Wyrm': { intensity: 1, bpm: 163, key: -2, bright: 0.75, space: 0.18, grit: 0.85 },
    },
  });
}

main(build, import.meta.url, { layers: PARTS });
