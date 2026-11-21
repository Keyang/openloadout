#!/usr/bin/env node
// Writes sounds/hearthvale-cave.json: the cave theme of the Hearthvale action-adventure kit
// (bundles/specs/kit-adventure-hearthvale.md, batch AM3), on the marimba band (sound/bands.js, docs/music-styles.md).
// Built on the music kit (kit.mjs).
//
//   B minor, 92 bpm, 8 bars: Bm D Em Bm | G D Em F#. Damp, hollow and curious: drips, echoes, a lantern. Low marimba
//   broken chords on the 8ths and a woodblock that drips on the "and" of 2 and on 4; then a bass bar playing half
//   notes as 16th-note rolls and the tune (Plucked string by default), which hops down the chord on the off-beats;
//   then a log drum on 1 and one guiro scrape every second bar; and at the top a marimba that echoes the last three
//   notes of every two-bar phrase an octave up, in the bar the tune holds.
//
//   node tools/compose/hearthvale_cave.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/hearthvale_cave.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/hearthvale_cave.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/hearthvale_cave.mjs             when it is ready: write sounds/hearthvale-cave.json
import { band, param, clock, chords, arrangement, drumRow, noteRow, eightBars, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('marimba');

// Level of each melody instrument for this tune, from `--match` (all five within 1 dB on the melody bus).
export const GAINS = [1, 0.747, 0.981, 0.937, 1.81];

// Every root is dropped an octave (the commas), so the broken chords sit low, from F#3 to B4, and the bass bar
// (written from B3) plays F#2 to E3.
export const CHORDS = 'Bm, D, Em, Bm, | G, D, Em, F#,';

// The tune, one token per 16th. Every phrase starts on the "and" of 1 and hops on the off-beats. The hook runs down
// the chord: bar 1 drops B, F#, D over Bm and steps back up to E, and bar 2 holds F# over D. Bars 3 and 4 run down
// E minor the same way and settle on D, then on B (the specification's B3 is below what the five instruments can
// all play in every key, so it is the B above). Bar 5 lifts the hook a third over G, bars 6 and 7 walk down by
// steps (B A G F#, then E) and turn up the E minor chord, and bar 8 ends on A#, the leading note, over F#: a
// semitone from the B the loop starts on.
export const TUNE = [
  '_ _ B4 _ _ _ F#4 _ _ _ D4 _ _ _ E4 _',        // Bm   the hook: down the chord, a step back up
  'F#4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',           // D    holds
  '_ _ B4 _ _ _ G4 _ _ _ E4 _ _ _ D4 _',         // Em   down E minor the same way
  'B4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',            // Bm   home
  '_ _ D5 _ _ _ B4 _ _ _ G4 _ _ _ B4 _',         // G    the hook a third higher
  'A4 _ _ _ G4 _ F#4 _ _ _ _ _ _ _ _ _',         // D    walks down by steps and waits
  '_ _ E4 _ _ _ G4 _ _ _ B4 _ _ _ _ _',          // Em   one more step down, then up the chord
  'A#4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',           // F#   the leading note: back to B
];

// The marimba's echo: the last three notes of each two-bar phrase, an octave up and soft, in the bar the tune holds.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ECHO = [
  REST,
  '_ _ _ _ _ _ D5- _ _ _ E5- _ F#5- _ _ _',      // D    D E F# of bars 1 and 2
  REST,
  '_ _ _ _ _ _ E5- _ _ _ D5- _ B5- _ _ _',       // Bm   E D B of bars 3 and 4
  REST,
  '_ _ _ _ _ _ _ _ _ _ A5- _ G5- _ F#5- _',      // D    A G F# of bar 6, as soon as the tune waits
  REST,
  '_ _ _ _ _ _ G5- _ _ _ B5- _ A#5- _ _ _',      // F#   G B A# of bars 7 and 8
];

// Which layers play, in the specification's order: broken chords and woodblock (always: still music at 0), then the
// bass and the tune, then the log drum and the guiro, then the echo line.
// `section` is for the Length control (32 bars: chords and woodblock, then bass and tune, then the wood kit, then
// everything); `intensity` is the window in which the Intensity control brings the layer in.
export const LAYERS = {
  bass: { section: 2, intensity: [0.25, 0.37] },       // bass bar rolls
  tune: { section: 2, intensity: [0.26, 0.38] },       // all there by 0.4, where whole-bundle looks may set it
  kit: { section: 3, intensity: [0.5, 0.62] },         // log drum and guiro
  top: { section: 4, intensity: [0.75, 0.87] },        // the echo line
  lift: { intensity: [0.3, 1], floor: 0.8 },           // not a layer: the tune leans in as it builds
};

// The mix, part by part, so each can be measured by itself (`--measure`).
// The broken chords are pulled back while the tune plays (`dip`): they share 250 to 500 Hz and the tune must lead.
const DIP = '0.45*gTune*lead';
export const MIX = {
  log: 'gO*0.6*gKit',
  woodblock: 'wO*0.4',
  guiro: 'uO*0.26*gKit',
  bass: 'bO*0.4*gBass',
  barsL: 'pB*0.5',
  barsR: 'pB*0.4',
  tune: 'lF*0.5*lead*gTune*gLift',
  echoL: 'eB*0.24*gTop',
  echoR: 'eB*0.38*gTop',
};
const LEVEL = 0.95;
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.barsL} + ${MIX.echoL}`,
  drums: `${MIX.log} + ${MIX.woodblock} + ${MIX.guiro}`,
  bed: `${MIX.bass} + ${MIX.barsL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'hearthvale-cave',
    name: 'Cave theme',
    tags: ['music', 'exploration', 'cave', ...B.tags, 'adaptive', 'loop'],
    description: 'A damp, hollow, curious loop for caves and tunnels: low broken chords on wooden bars with a woodblock that drips, then a rolled bass bar and a tune that hops down in the gaps, a log drum and a scrape, and at the top a high wooden echo of the tune. Intensity brings the layers in; you can change the speed, pitch, bounce, room and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/exploration', themes: ['fantasy', 'dungeon'], gameTypes: ['top-down-rpg', 'platformer'],
      words: ['cave', 'cavern', 'tunnel', 'underground', 'mine', 'drips', 'echo', 'hollow', 'damp', 'curious', 'mysterious', 'marimba', 'wooden', 'exploration'],
      license: 'draft',
    },
    tempo: B.checkTempo([80, 104, 92]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Plucked string', space: 0.28 },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Bounce', 0, 1, 0.25),
    ],
    nodes: [
      clock({ swing: 'swing' }),
      chords(CHORDS, { tonic: 'B' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- the bars: broken chords on the 8ths, low (root, fifth, third, fifth; the second bar climbs to the octave)
      drumRow('pG', 'X.x.x.x.x.x.x.x.'),
      noteRow('pK', ['0 _ 2 _ 1 _ 2 _ 0 _ 2 _ 1 _ 2 _', '0 _ 1 _ 2 _ 1 _ 0 _ 1 _ 2 _ 3 _']),
      B.chords('p', { trig: 'pG', pick: 'pK', dip: DIP, noise: 'nz' }),   // -> pO
      // Brightness opens the bars: shut, little but their fundamentals; open, their upper partials ring too
      { id: 'pB', type: 'filter', mode: 'lp', in: 'pO', freq: '350 + bright*8000', q: 0.7 },

      // --- bass bar: half notes, root then fifth, each held as a 16th-note roll (accent on the first stroke)
      drumRow('bR', 'XxxxxxxxXxxxxxxx'),
      noteRow('bQ', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bR', semis: 'bQ', note: '48 + tonic', noise: 'nz' }),   // -> bO

      // --- drums: the woodblock drips on the "and" of 2 and on 4, and once more on the "and" of 3 in bars 4 and 8;
      // the guiro scrapes once, on beat 3 of every second bar; the log drum is on 1
      drumRow('wT', eightBars('......x.....X...', { 4: '......x...x.X...', 8: '......x...x.X...' })),
      drumRow('uT', ['................', '........X.......']),
      drumRow('gT', 'X...............'),
      B.drums({ log: 'gT', woodblock: 'wT', guiro: 'uT', noise: 'nz' }),   // -> gO, wO, uO

      // --- the tune, on whichever instrument the listener picks; long notes, because it holds whole bars
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.4 }),
      // --- the marimba's echoes, an octave above the tune
      melody('e', ECHO, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP', noise: 'nz' }),            // -> eO
      { id: 'eB', type: 'filter', mode: 'lp', in: 'eO', freq: '800 + bright*9000', q: 0.7 },

      // --- mix: bass and log drum in the centre; bars a little left, echoes a little right, the drips to one side
      // and the scrape to the other, tune in both
      bus({
        centre: `${MIX.bass} + ${MIX.log}`,
        left: `${MIX.woodblock}*0.7 + ${MIX.guiro}*1.2 + ${MIX.barsL} + ${MIX.tune} + ${MIX.echoL}`,
        right: `${MIX.woodblock}*1.3 + ${MIX.guiro}*0.8 + ${MIX.barsR} + ${MIX.tune} + ${MIX.echoR}`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Dripping dark': { intensity: 0.2, bpm: 86, bright: 0.3, space: 0.4, swing: 0.35 },
      'Lantern light': { intensity: 0.62, bpm: 92, bright: 0.6 },
      'Something moves': { intensity: 1, bpm: 98, bright: 0.65, swing: 0.12, lead: 0.9 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
