#!/usr/bin/env node
// Writes sounds/credits-rock.json: "Last Encore", end-credits music on the rock band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs) and band('rock').
//
//   A major, 120 bpm, 8 bars: A D G D | A E G D (I IV bVII IV | I V bVII IV). Every chord is major; the second half
//   answers the first by going to E where the first went to D, and the loop turns home from D to A. The band's slow
//   closing number: big, open, triumphant and tired in a good way. A picked bass and a closed hat in 8ths are there
//   even at Intensity 0; then power chords, let ring on beat 1 and palm-muted in 8ths after it; then the tune, long
//   held notes reached by a slide from the step below, with falling tails; then kick, snare and a crash at the top
//   of each half; and at the top the driven lead answers in bars 4 and 8, with a tom fill into bar 1.
//   Slower than menu-rock (144, E minor) and major where that one is minor.
//
//   node tools/compose/credits_rock.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_rock.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/credits_rock.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_rock.mjs             when it is ready: write sounds/credits-rock.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars, band, hatDrum, tomDrum } from './kit.mjs';

const B = band('rock');

/** Sets fields on named nodes of a voice's node list in place (keeps the list and its .out); throws on an unknown id. */
function tune(nodes, changes) {
  for (const [id, set] of Object.entries(changes)) {
    const n = nodes.find((x) => x.id === id);
    if (!n) throw new Error(`credits_rock: no node ${id} to retune`);
    Object.assign(n, set);
  }
  return nodes;
}

// Level of each melody instrument for this tune, measured after the rock colour (`--match` on lcO).
export const GAINS = [1, 0.737, 1.12, 0.999, 1.57, 1.79, 0.795, 1.23, 1.23, 1.34, 0.686, 0.846, 0.904, 1.31, 1.22];

// G drops below the home note (G2), D and E sit above it (D3, E3).
export const CHORDS = 'A D G D | A E G D';

// The tune, one token per 16th: a two-bar shape used four times. A soft note a step below, on the last 16th before
// the bar, slides up (the melody's glide) into a long high note that is held for the whole bar; the next bar walks
// three notes down in quarters and lets the last one ring. It starts on the fifth (E), then a step lower (D), then the fifth again, and the last
// time a small third higher, on G, the top of the tune, walking down to the root of D, which leads back.
export const TUNE = [
  'E5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',            // A    the fifth, E, held for the bar
  'D5 _ _ _ C#5 _ _ _ B4 _ _ _ _ _ _ C#5-',      // D    walks down: D, C#, B; then the step below the next note
  'D5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',            // G    a step lower: D, the fifth of G
  'C#5 _ _ _ B4 _ _ _ A4 _ _ _ _ _ _ D5-',       // D    walks down to A: room for the answer
  'E5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',            // A    the fifth again
  'D5 _ _ _ C#5 _ _ _ B4 _ _ _ _ _ _ F#5-',      // E    walks down to B, the fifth of E; the one leap, up to F#
  'G5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',            // G    a small third higher: the root of G, the top of the tune
  'F#5 _ _ _ E5 _ _ _ D5 _ _ _ _ _ _ D5-',       // D    walks down by step to the root of D, which leads back
];

// The answer on the driven lead, with glide, in the last half of bars 4 and 8 (both over D): a falling reply down
// the chord after the first half, a rising one into the loop at the end.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = eightBars(REST, {
  4: '_ _ _ _ _ _ _ _ A5 _ _ F#5 _ _ D5 _',         // D   down the chord
  8: '_ _ _ _ _ _ _ _ F#5 _ _ A5 _ _ D6 _',         // D   up the chord, over the tom fill
});

// Layers in the credits plan's order (the same as every credits track, so a game can swap one for another): the
// bed; the chord voice by 0.22; the tune by 0.4; the drums by 0.6; the answers by 0.85. The 32-bar version brings
// them in in the same order, a section at a time: bed and chords, then the tune, then the drums, then the answers.
export const LAYERS = {
  bass: { intensity: [0, 0.12], floor: 0.7 },          // at 0: the picked bass and the closed hat in 8ths, still music
  power: { intensity: [0.12, 0.22] },                  // power chords: rung on beat 1, palm-muted after it
  tune: { section: 2, intensity: [0.3, 0.4] },         // all there by 0.4, so a look at 0.5 keeps it
  drums: { section: 3, intensity: [0.5, 0.6] },        // kick, snare, crash
  answer: { section: 4, intensity: [0.75, 0.85] },     // the driven lead's reply and the tom fill
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and the drums lean in as it builds
};

const L = B.kitLevels;
export const MIX = {
  kick: `kO*${L.kick}*0.7*gDrums*gLift`,
  snare: `sO*${L.snare}*gDrums*gLift`,
  bass: 'bO*0.36*gBass',
  tom: `tO*${L.tom}*0.8*gAnswer`,
  hatL: `hO*${L.hat}*1.5*gBass*(0.5 + bright)`,
  hatR: `hO*${L.hat}*1.0*gBass*(0.5 + bright)`,
  crashL: `cO*${L.crash}*0.7*gDrums*(0.5 + bright)`,
  crashR: `cO*${L.crash}*gDrums*(0.5 + bright)`,
  // the rung chord a little left, the muted 8ths a little right (with a short delayed copy across for width);
  // both pulled back a little under the tune
  powerL: '(qD*0.9 + pD*0.55 + pQ*0.6)*0.3*gPower*(1.3 - 0.3*gTune)',
  powerR: '(qH*0.7 + pD*0.8 + pQ*0.8)*0.3*gPower*(1.3 - 0.3*gTune)',
  tune: 'lcO*0.5*lead*gTune*gLift',
  answerL: 'eO*0.3*lead*gAnswer',
  answerR: 'eO*0.44*lead*gAnswer',
};
const LEVEL = 0.8;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  power: MIX.powerL,
  answer: MIX.answerL,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.crashL} + ${MIX.tom}`,
  bed: `${MIX.bass} + ${MIX.hatL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const tempo = B.checkTempo([112, 132, 120]);
  return assemble({
    id: 'credits-rock',
    name: 'Last Encore',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'A big, open synthesised arcade-rock anthem for the end credits, the band\'s slow closing number: a picked bass and a ticking hat, then ringing and palm-muted power chords, the tune in long held notes with falling tails, kick, snare and crash, and at the top a driven lead that answers, with a tom fill. Intensity brings the layers in; you can change the length, speed, pitch and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['arcade', 'shooter', 'platformer'],
      words: ['credits', 'ending', 'encore', 'anthem', 'finale', ...B.words, 'triumphant'],
      license: 'draft',
    },
    tempo,
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Synth lead' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'A', low: -3 }),           // bass roots G2 to E3
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- rock kit: kick on 1 and the "and" of 2, snare on 2 and 4, crash on beat 1 of bars 1 and 5
      drumRow('kT', 'X.....X.........'),
      drumRow('sT', '....X.......X...'),
      drumRow('cT', eightBars('................', { 1: 'X...............', 5: 'X...............' })),
      B.drums({ kick: 'kT', snare: 'sT', crash: 'cT', noise: 'nz' }),
      // the closed hat in 8ths: part of the bed
      drumRow('hT', 'X.x.x.x.X.x.x.x.'),
      ...hatDrum('h', { trig: 'hT', noise: 'nz' }),
      // the tom fill in the last half of bar 8, down the D chord (octave, fifth, third, root) into bar 1
      drumRow('tT', eightBars('................', { 8: '........X.x.X.x.' })),
      noteRow('tS', eightBars('0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', { 8: '0 _ _ _ _ _ _ _ 12 _ 7 _ 4 _ 0 _' })),
      ...tomDrum('t', { trig: 'tT', note: 36, semis: 'tonic + tS', noise: 'nz' }),

      // --- picked bass in 8ths on the root
      drumRow('bG', 'X.x.x.x.X.x.x.x.'),
      // a more open cabinet than the band's own (800 Hz): the bed is alone at Intensity 0 and must reach a phone speaker
      B.bass('b', { trig: 'bG', semis: 0, noise: 'nz', cutoff: 1400 }),

      // --- power chords (root, fifth and octave: no third). `q` is the chord let ring on beat 1: a long fall and
      //     an open hand; `p` is the same chord palm-muted in 8ths after it.
      drumRow('qG', 'X...............'),
      tune(B.chords('q', { trig: 'qG' }), { qA: { hold: 0.25, decay: 1.3 }, qF: { freq: '1500 + bright*2500' }, qO: { freq: '2200 + bright*3200' } }),
      { id: 'qD', type: 'filter', mode: 'hp', in: 'qO', freq: 150, q: 0.7 },
      { id: 'qH', type: 'delay', in: 'qD', time: 0.015, feedback: 0, mix: 1, max: 0.02 },
      drumRow('pG', '..x.x.x.x.x.x.x.'),
      // Brightness opens the palm mute and the cabinet; the mute stays near 1 kHz so the chords bite on a phone
      tune(B.chords('p', { trig: 'pG' }), { pF: { freq: '900 + bright*1200' }, pO: { freq: '2000 + bright*3200' } }),
      { id: 'pD', type: 'filter', mode: 'hp', in: 'pO', freq: 150, q: 0.7 },
      { id: 'pP', type: 'ad', trig: 'pG', attack: 0.001, hold: 0, decay: 0.018, curve: 2 },
      { id: 'pQ', type: 'filter', mode: 'bp', in: 'nz*pP', freq: '1100 + bright*1600', q: 1.4 },

      // --- the tune, on whichever instrument the listener picks, through the band's drive and cabinet. The long
      //     glide is the slide into each held note; the notes are made longer so they last their bar.
      melody('l', TUNE, { glide: 0.07 }),
      instruments('l', { gains, noise: 'nz', length: 1.6 }),
      tune(B.colour('lc', { input: 'lF' }), { lcO: { freq: '2500 + bright*3500' } }),

      // --- the driven lead's answers, with glide
      melody('e', ANSWER, { voice: B.range, glide: 0.05 }),
      tune(B.lead('e', { trig: 'eG', pitch: 'eP' }), { exO: { freq: '2200 + bright*3200' } }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass} + ${MIX.tom}`,
        left: `${MIX.hatL} + ${MIX.crashL} + ${MIX.powerL} + ${MIX.tune} + ${MIX.answerL}`,
        right: `${MIX.hatR} + ${MIX.crashR} + ${MIX.powerR} + ${MIX.tune} + ${MIX.answerR}`,
        duck: 'kA*gDrums', duckAmount: 0.25,
        send: `sO*${L.snare}*0.3*gDrums`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Credits roll': { intensity: 0.85, bpm: 120 },
      'Lights down': { intensity: 0.35, bpm: 115, bright: 0.4 },
      'Final bow': { intensity: 1, bpm: 125, bright: 0.75 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
