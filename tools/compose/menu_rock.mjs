#!/usr/bin/env node
// Writes sounds/menu-rock.json: "High Score Riot", an arcade title loop on the rock band (docs/music-styles.md).
// Built on the music kit (kit.mjs) and band('rock') from sound/bands.js.
//
//   E minor, 144 bpm, 8 bars: Em C D B | Em G A B. B major (the harmonic-minor V) closes each half and turns the
//   loop around; the A major in bar 7 is a Dorian lift. Cocky and revved up: palm-muted power chords from the start,
//   a picked bass locked to the kick, a rock kit whose hats open up at the top, the tune, and a driven lead that
//   squeals back in bars 4 and 8 with tom fills down the B chord into bar 1.
//
//   node tools/compose/menu_rock.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_rock.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/menu_rock.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_rock.mjs             when it is ready: write sounds/menu-rock.json
import { param, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main, eightBars, band, hatDrum, tomDrum } from './kit.mjs';

const B = band('rock');

/** Sets fields on named nodes of a voice's node list in place (keeps the list and its .out); throws on an unknown id. */
function tune(nodes, changes) {
  for (const [id, set] of Object.entries(changes)) {
    const n = nodes.find((x) => x.id === id);
    if (!n) throw new Error(`menu_rock: no node ${id} to retune`);
    Object.assign(n, set);
  }
  return nodes;
}

// Level of each melody instrument for this tune, measured after the rock colour (`--match` on lcO).
export const GAINS = [1, 0.728, 1.07, 1.05, 1.52];

export const CHORDS = 'Em C D B | Em G A B';

// The tune, one token per 16th: a 4-bar phrase that returns in bars 5 to 8. Each chord gets the same swagger: a
// bounce down to its fifth and back in 8ths, a push on the last 16th of beat 2 into the top note, then a step down;
// bars 4 and 8 fall to the B chord in syncopated dotted 8ths and leave beats 3 and 4 to the answering lead.
export const TUNE = [
  'E5 _ B4 _ E5 _ _ F#5 G5 _ _ _ E5 _ F#5 _',     // Em   bounce on E, push up to G, lean on F#
  'C5 _ G4 _ C5 _ _ D5 E5 _ _ _ G5 _ E5 _',       // C    the figure on C, to its top
  'D5 _ A4 _ D5 _ _ E5 F#5 _ _ _ A5 _ F#5 _',     // D    a step higher, up to A
  'D#5 _ _ F#5 _ _ B4 _ _ _ _ _ _ _ _ _',         // B    the leading tone D#, then B rings: room for the answer
  'E5 _ B4 _ E5 _ _ F#5 G5 _ _ _ E5 _ F#5 _',     // Em   the phrase returns
  'D5 _ B4 _ D5 _ _ E5 G5 _ _ _ D5 _ B4 _',       // G    the figure on G
  'C#5 _ A4 _ C#5 _ _ D5 E5 _ _ _ A5 _ G5- _',    // A    the bright C#, the Dorian lift
  'F#5 _ _ D#5 _ _ B4 _ _ _ _ _ _ _ _ _',         // B    down the B chord: the turnaround
];

// The answer on the driven lead, with glide: a squealing reply on beats 3 and 4 of bars 4 and 8, up the B chord.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = eightBars(REST, {
  4: '_ _ _ _ _ _ _ _ F#5 _ B5 _ D#6 _ B5 _',        // B   up the chord and back
  8: '_ _ _ _ _ _ _ _ B5 _ D#6 _ F#6 _ D#6 B5',      // B   higher, a squeal at the top, falls onto B
});

// Layers in the specification's intensity order: power chords (there at 0); bass; drums; the tune; the answer
// (with its tom fills). The 32-bar version brings them in in the same order, a section at a time.
export const LAYERS = {
  power: { intensity: [0, 0.1], floor: 0.8 },           // palm-muted power chords: always there
  bass: { intensity: [0.08, 0.16] },                    // picked bass with the kick
  drums: { section: 2, intensity: [0.18, 0.28] },       // kick, snare, closed hats, crash
  tune: { section: 3, intensity: [0.3, 0.4] },          // all there by 0.4, so a look at 0.5 keeps it
  open: { section: 4, intensity: [0.6, 0.7] },          // the off-beat hats open up
  answer: { section: 4, intensity: [0.75, 0.85] },      // the driven lead's reply and the tom fills
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: the tune and drums lean in as it climbs
};

const L = B.kitLevels;
export const MIX = {
  kick: `kO*${L.kick}*0.7*gDrums*gLift*(0.3 + 0.7*gTune)`,   // a lighter kick until the tune arrives (phone speakers)
  snare: `sO*${L.snare}*gDrums*gLift`,
  bass: 'bO*0.42*gBass*(0.3 + 0.7*gTune)',          // the bass sits back until the tune arrives
  tom: `tO*${L.tom}*0.8*gAnswer`,
  hatL: `hO*${L.hat}*0.8*gDrums*(0.5 + bright)`,
  hatR: `hO*${L.hat}*0.5*gDrums*(0.5 + bright)`,
  openL: `oO*${L.hat}*0.45*gDrums*gOpen*(0.5 + bright)`,
  openR: `oO*${L.hat}*0.75*gDrums*gOpen*(0.5 + bright)`,
  crashL: `cO*${L.crash}*0.7*gDrums*(0.5 + bright)`,
  crashR: `cO*${L.crash}*gDrums*(0.5 + bright)`,
  powerL: '(pD + pQ*0.8)*0.3*gPower*(1.5 - 0.5*gTune)',   // louder while it is alone, with its pick click
  powerR: '(pH + pQ*0.55)*0.3*gPower*(1.5 - 0.5*gTune)',
  tune: 'lcO*0.5*lead*gTune*gLift',
  answerL: 'eO*0.46*lead*gAnswer',
  answerR: 'eO*0.28*lead*gAnswer',
};
const LEVEL = 0.8;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  power: MIX.powerL,
  answer: MIX.answerL,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.hatL} + ${MIX.openL} + ${MIX.crashL} + ${MIX.tom}`,
  bass: MIX.bass,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const tempo = B.checkTempo([128, 160, 144]);
  return assemble({
    id: 'menu-rock',
    name: 'High Score Riot',
    tags: ['music', 'menu', 'title', ...B.tags, 'loop', 'adaptive'],
    description: 'A cocky synthesised arcade-rock title loop in short or long versions: Intensity starts on palm-muted power chords and brings in a picked bass, a rock kit with opening hats, the tune and a squealing driven lead with tom fills; you can change the speed, pitch and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['arcade', 'shooter', 'platformer'],
      words: ['menu', 'title', 'start screen', 'high score', ...B.words, 'palm muted'],
      license: 'draft',
    },
    tempo,
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Synth lead' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'E', low: -3 }),           // bass roots D2 to C3: D below E; G, A, B, C above
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- rock kit: kick, heavy snare on 2 and 4, crash on bars 1 and 5
      drumRow('kT', 'X.....x.X.x.....'),
      drumRow('sT', '....X.......X...'),
      drumRow('cT', eightBars('................', { 1: 'X...............', 5: 'X...............' })),
      B.drums({ kick: 'kT', snare: 'sT', crash: 'cT', noise: 'nz' }),
      // hats: closed 8ths; once `open` is in, the off-beats open up and the closed hat keeps the down-beats
      drumRow('hC', 'x.x.x.x.x.x.x.x.'),
      drumRow('hD', 'x...x...x...x...'),
      drumRow('oT', '..x...x...x...x.'),
      ...hatDrum('h', { trig: 'gOpen > 0.5 ? hD : hC', noise: 'nz' }),
      ...hatDrum('o', { trig: 'oT', noise: 'nz', freq: '6000 + bright*2500', decay: 0.16 }),
      // tom fill down the B chord (octave, fifth, third, root) into bar 1
      drumRow('tT', eightBars('................', { 8: '............XxXx' })),
      noteRow('tS', eightBars('0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', { 8: '0 _ _ _ _ _ _ _ _ _ _ _ 12 7 4 0' })),
      ...tomDrum('t', { trig: 'tT', note: 36, semis: 'tonic + tS', noise: 'nz' }),

      // --- picked bass 8ths, accented where the kick lands
      drumRow('bG', 'X.x.x.X.X.X.x.x.'),
      B.bass('b', { trig: 'bG', semis: 0, noise: 'nz' }),

      // --- palm-muted power chords in 8ths with the same accents; a short delayed copy on the right for width
      drumRow('pG', eightBars('X.x.x.X.X.X.x.x.', { 4: 'X.x.x.X.X.x.X.x.', 8: 'X.x.x.X.X.x.X.X.' })),
      // Brightness opens the palm mute and the cabinet; the mute stays above 1 kHz so the chords bite on a phone
      tune(B.chords('p', { trig: 'pG' }), { pF: { freq: '1000 + bright*1400' }, pO: { freq: '2000 + bright*3200' } }),
      // a high-pass under the chunk (the bass has the lows) and a pick click near 1.5 kHz: bite on a phone speaker
      { id: 'pD', type: 'filter', mode: 'hp', in: 'pO', freq: '150 + 80*(1 - gTune)', q: 0.7 },
      { id: 'pP', type: 'ad', trig: 'pG', attack: 0.001, hold: 0, decay: 0.018, curve: 2 },
      { id: 'pQ', type: 'filter', mode: 'bp', in: 'nz*pP', freq: '1100 + bright*1600', q: 1.4 },
      { id: 'pH', type: 'delay', in: 'pD', time: 0.013, feedback: 0, mix: 1, max: 0.02 },

      // --- the tune, on whichever instrument the listener picks, through the band's drive and cabinet
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz' }),
      tune(B.colour('lc', { input: 'lF' }), { lcO: { freq: '2500 + bright*3500' } }),

      // --- the squealing answer on the driven lead, with glide
      melody('e', ANSWER, { voice: B.range, glide: 0.045 }),
      tune(B.lead('e', { trig: 'eG', pitch: 'eP' }), { exO: { freq: '2200 + bright*3200' } }),

      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass} + ${MIX.tom}`,
        left: `${MIX.hatL} + ${MIX.openL} + ${MIX.crashL} + ${MIX.powerL} + ${MIX.tune} + ${MIX.answerL}`,
        right: `${MIX.hatR} + ${MIX.openR} + ${MIX.crashR} + ${MIX.powerR} + ${MIX.tune} + ${MIX.answerR}`,
        duck: 'kA*gDrums', duckAmount: 0.25,
        send: `sO*${L.snare}*0.3*gDrums`,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      'Title screen': { intensity: 0.85, bpm: 144 },
      'Pause menu': { intensity: 0.3, bpm: 136, bright: 0.45 },
      'Press start': { intensity: 1, bpm: 152, bright: 0.75 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
