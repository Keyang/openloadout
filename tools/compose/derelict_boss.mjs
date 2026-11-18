#!/usr/bin/env node
// Writes sounds/derelict-boss.json: "Station boss theme", the boss music of the roguelite kit
// (bundles/specs/kit-roguelite-scifi.md, batch S22). Built on the music kit (kit.mjs).
//
//   C minor, 164 bpm, 8 bars: Cm Cm Fm Gm | Cm Eb F#dim G. Relentless, distorted, alarm-like: a driven saw bass jumping
//   between the root and its octave, crushed 16th hats, a half-time kick and snare that turn into a kick on every
//   8th, a two-note alarm a semitone apart, gated saw chords on the off-beats, a sub drop at the top of every
//   section, and a tune of short stabs that climbs to the G chord.
//
//   The chords are this track's own (the specification's Cm Cm Ab Bb | Cm Eb F G is, step for step, the chord order
//   of hearthvale-battle, and no two tracks may share one): two bars of C minor, then the bass drops to F and G
//   below it (i i iv v), and the second half climbs C, E flat, F sharp, G: minor thirds and a last semitone,
//   through a diminished chord, into the only major chord of the piece.
//
//   node tools/compose/derelict_boss.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/derelict_boss.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/derelict_boss.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/derelict_boss.mjs             when it is ready: write sounds/derelict-boss.json
import {
  param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main,
  eightBars, kickDrum, snareDrum, hatDrum, sawBass, brassStab, halfTimeBeat, subDrop, chorus, alarmTone,
} from './kit.mjs';

// Level of each melody instrument for this tune, from `--match` repeated until it settles (the tune goes through a
// shaper, so one pass is not enough): all five within 1 dB on the melody bus lX.
export const GAINS = [1, 0.714, 1.19, 0.961, 1.48];

// A comma drops that bar's root an octave: the bass falls to F and G under the C it started on, then climbs.
export const CHORDS = 'Cm Cm Fm, Gm, | Cm Eb F#dim G';

// The tune, one token per 16th. Two stabs and nothing else: a leap up of two notes, and three notes that hammer
// one pitch and step up off it, left hanging. Bars 1 to 4 trade them a bar each, after the alarm, landing on the
// snare, and their top creeps up: G, A flat, A flat (the third of F minor, reached from C), then B flat breaking
// off to D (the third and fifth of G minor). Bars 5 to 8 squeeze both into
// every bar, either side of the snare, and climb with the chords to the G chord, where the last note (E flat over
// G) leans on the alarm's C in bar 1. The alarm has the first beat of every odd bar to itself.
export const TUNE = [
  '_ _ _ _ _ _ Eb5- _ G5 _ _ _ _ _ _ _',          // Cm   the leap: E flat up to G, landing with the snare
  '_ _ _ _ _ _ G5- _ G5 _ Ab5 _ _ _ _ _',         // Cm   the hammer: G, G, and a semitone up to A flat
  '_ _ _ _ _ _ C5- _ Ab5 _ _ _ _ _ _ _',          // Fm   the leap, wider: from the alarm's C up a sixth (E flat is not in F minor)
  '_ _ _ _ _ _ Bb5- _ Bb5 _ D6 _ _ _ _ _',        // Gm   the hammer again, breaking off upward by a third
  '_ _ _ _ Eb5 _ G5 _ _ _ G5- _ G5 _ Ab5 _',      // Cm   both in one bar: bars 1 and 2 at twice the pace
  '_ _ _ _ G5 _ Bb5 _ _ _ Bb5- _ Bb5 _ C6 _',     // Eb   up with the chord
  '_ _ _ _ A5 _ C6 _ _ _ C6- _ C6 _ D6 _',        // F#dim  a step higher: A and C are both notes of the diminished chord
  '_ _ _ _ B5 _ D6 _ _ _ D6- _ D6 _ Eb6 _',       // G    a step higher: the top, on the leading note's chord
];

// Which layers play. `section` is for the Length control (the 32-bar version is bass and alarm, then the drums,
// then the gated chords and the busy kick, then the full band); `intensity` is the window in which the Intensity
// control brings the layer in.
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },              // the bass: always there, a little fuller as it builds
  hats: { section: 2 },                                // the crushed hats: with the bass from intensity 0; in a long version they come with the drums
  beat: { section: 2, intensity: [0.3, 0.38] },        // the half-time kick and snare
  alarm: { intensity: [0.3, 0.38] },                   // the alarm and the sub drop: they open a long version with the bass
  busy: { section: 3, intensity: [0.6, 0.61] },        // a switch: the kick goes to every 8th note
  chords: { section: 3, intensity: [0.6, 0.72] },      // the gated chords
  // The melody. The specification adds it at 0.85, but whole-bundle looks set intensity as low as 0.5 (Night) and a
  // look must keep the tune (style guide, section 12), so it is in, held back, by 0.4 ...
  tune: { section: 4, intensity: [0.32, 0.4] },
  // ... leans in from 0.7 (`lift`, not a layer: the level of the tune), and from 0.85, where the specification puts
  // it, it is doubled by two detuned copies of itself while the drums are crushed (`rage`: the boss is enraged)
  lift: { intensity: [0.7, 1], floor: 0.85 },
  rage: { section: 4, intensity: [0.85, 1] },
};

// The mix, part by part, so each can be measured by itself (`--measure`).
// `dip` pulls the gated chords back while the tune plays: they share 300 to 1200 Hz, and the tune must lead there.
const dip = '(1 - 0.45*gTune*lead)';
export const MIX = {
  kick: '(kO*(0.6 - 0.1*gBusy) + sN*kC*0.5)*gBeat',        // a click on the thump; a kick on every 8th is a little lighter
  snare: 'sO*1.1*gBeat',
  hat: 'hO*(0.7 + 0.5*bright)*gHats',
  bass: 'bO*(0.46 - 0.08*grit)*gBed*(1 - (0.4 - 0.15*gBusy)*kA*gBeat)',   // the bass steps back under each kick (less when the kick is on every 8th); more drive is not more level
  drop: 'dO*0.55*gAlarm',
  alarmL: 'alO*(0.34 + 0.17*alS)*gAlarm',                    // the first note leans left, the second right
  alarmR: 'alO*(0.17 - 0.17*alS)*gAlarm',
  chordL: `stL*1.2*gChords*${dip}`,
  chordR: `stR*1.2*gChords*${dip}`,
  tune: 'lX*0.9*lead*gTune*gLift',
  wideL: 'cL*0.4*lead*gRage',
  wideR: 'cR*0.4*lead*gRage',
};
const LEVEL = 0.4;   // into the limiter: measured, the loudest moments reach it at about 1.2 (1.4 with the default Grit)
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: `${MIX.tune} + ${MIX.wideL}`,
  backing: `${MIX.chordL} + ${MIX.alarmL}`,
  'backing and bass': `${MIX.chordL} + ${MIX.alarmL} + ${MIX.bass}`,
  drums: 'drX',
  bed: `${MIX.bass}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

const HALF = halfTimeBeat(), DRIVING = halfTimeBeat({ driving: true });

export function build(gains = GAINS) {
  return assemble({
    id: 'derelict-boss',
    name: 'Station boss theme',
    tags: ['music', 'boss', 'electronic', 'adaptive', 'loop'],
    description: 'Relentless, distorted boss music in C minor with an alarm in it, 8 to 32 bars long: Intensity brings in a half-time kick and snare and the alarm, then a kick on every 8th note with gated chords, then pushes the melody forward over crushed drums, and you can change the tempo, key, grit and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/boss', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'],
      words: ['boss', 'fight', 'battle', 'showdown', 'danger', 'alarm', 'siren', 'enraged', 'relentless', 'distorted', 'electronic', 'synth', 'industrial', 'heavy'],
      license: 'draft',
    },
    tempo: [150, 180, 164],
    defaults: { intensity: 0.85, bars: 8, inst: 'Synth lead', bright: 0.6, space: 0.08 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('grit', 'Grit', 0, 1, 0.5),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'C', low: -4 }),           // bass roots: C C F G (both below) | C Eb F# G (climbing)
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: a half-time kick and snare (the snare on beat 3 only); from Intensity 0.6 the kick is on every 8th.
      // The kick lands on the chord root; the snare and hats have no pitch.
      drumRow('kLo', HALF.kick),
      drumRow('kHi', DRIVING.kick),
      { id: 'kT', type: 'expr', expr: 'gBusy > 0.5 ? kHi : kLo' },
      kickDrum('k', 'kT', { low: 28, from: 1.8, fall: 0.03, hold: 0.015, decay: 0.15 }),
      drumRow('sT', HALF.snare),
      snareDrum('s', 'sT', { noise: 'nz', crack: 1700, body: 330, decay: 0.19 }),
      { id: 'kC', type: 'ad', trig: 'kT', attack: 0.0005, decay: 0.012, curve: 2 },   // the kick's click: a blink of the snare's noise band
      // crushed hats in 16ths: the hiss itself is three bits deep and held at a low sample rate before the hat shapes it
      { id: 'nzX', type: 'crush', in: 'nz', bits: 3, rate: '8000 + bright*5000' },
      drumRow('hT', eightBars('XoxoXoxoXoxoXoxo', { 4: 'XoxoXoxoXoxoXoXx', 8: 'XoxoXoxoXoxoXxXX' })),
      hatDrum('h', 'hT', { noise: 'nzX', freq: '5200 + bright*2600', decay: 0.035 }),
      // the whole kit through one crusher that only bites when the boss is enraged (Intensity above 0.85)
      { id: 'dr', type: 'expr', expr: `${MIX.kick} + ${MIX.snare} + ${MIX.hat}` },
      { id: 'drX', type: 'crush', in: 'dr', bits: '14 - 8*gRage', rate: 'sr - (sr - 12000)*gRage' },

      // --- bass: a saw and a square through a shaper, 8th notes jumping between the root and its octave; the last
      // half bar hammers the octave in 16ths into the repeat
      drumRow('bT', eightBars('X.x.X.x.X.x.X.x.', { 8: 'X.x.X.x.XxxxXxxx' })),
      noteRow('bS', eightBars('0 _ 0 _ 12 _ 0 _ 0 _ 12 _ 0 _ 12 _', { 4: '0 _ 0 _ 12 _ 0 _ 0 _ 12 _ 12 _ 0 _', 8: '0 _ 0 _ 12 _ 0 _ 12 12 12 12 12 12 12 12' })),
      sawBass('b', 'bT', { note: 36, semis: 'bS', decay: 0.18, cutoff: 170, open: '550 + bright*1400', drive: '2.5 + grit*5', q: 2 }),

      // --- sub drop: a sine falling two octaves from the chord root, on the first beat of every 8-bar section
      drumRow('dT', 'X', { every: 128 }),
      subDrop('d', 'dT', { from: 'midi(48 + tr)', octaves: 2, fall: 0.45, decay: 0.8 }),

      // --- alarm: C then the B a semitone below it, on the first beat of every second bar. It ignores the chords
      // (C belongs to all three chords it sounds over: Cm, F minor and F sharp diminished), and the tune leaves that beat to it
      drumRow('alT', ['X.X.............', '................']),
      noteRow('alS', '0 0 -1 -1'),
      alarmTone('al', 'alT', { semis: 'alS', base: 84, width: 0.22, hold: 0.06, decay: 0.08, grit: 'grit' }),

      // --- gated chords: short saw chords on the off-beats, the third to the left and the fifth to the right
      drumRow('stT', eightBars('..x...x...x...x.', { 4: '..x...x...x.x.x.', 8: '..x...x...x.x.x.' })),
      brassStab('st', 'stT', { note: 48, attack: 0.003, hold: 0.025, decay: 0.09, cutoff: 350, open: '1300 + bright*2600', q: 1.4 }),

      // --- the tune, on whichever instrument the listener picks, short notes, voiced harsh: pushed into a shaper
      // (harder as Grit rises; the division keeps its level), and doubled by two detuned copies when enraged
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 0.7 }),
      { id: 'lHs', type: 'shaper', in: 'lF*0.55', drive: '1 + grit*3' },
      { id: 'lX', type: 'expr', expr: 'lHs/(0.354 + 0.838*grit - 0.292*grit*grit)' },
      chorus('c', 'lX', { depth: '0.8', rate: 0.9 }),

      // --- mix: drums, bass and the sub drop in the centre; the alarm bounces left to right; chords wide; the tune
      // in the centre with its detuned copies either side
      bus({
        centre: `drX + ${MIX.bass} + ${MIX.drop}`,
        left: `${MIX.alarmL} + ${MIX.chordL} + ${MIX.tune} + ${MIX.wideL}`,
        right: `${MIX.alarmR} + ${MIX.chordR} + ${MIX.tune} + ${MIX.wideR}`,
        duck: 'kA*gBeat', duckAmount: 0.18,     // light: with a kick on every 8th a deep dip would swallow the stabs
        send: 'sN*sA*0.3*gBeat',
        level: LEVEL,
        drive: '1 + grit*0.4',
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Boss appears': { intensity: 0.2, bpm: 158, bright: 0.45, grit: 0.3 },
      'Phase two': { intensity: 0.7, bpm: 164 },
      'Enraged': { intensity: 1, bpm: 171, key: 1, bright: 0.8, grit: 0.85, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { node: 'lX', layers: PARTS });
