#!/usr/bin/env node
// Writes sounds/credits-orchestra.json: "The Long Road Back", end-credits music on the orchestra band (synthesised
// strings and brass; sound/bands.js, docs/music-styles.md). Built on the music kit (kit.mjs) and band('orchestra').
//
//   F major, 80 bpm, 8 bars: F Gm Am Bb | F Dm Gm C. The journey looked back on: a broad, grateful, slow hymn that
//   grows, never a march. The bass climbs by step for four bars (F G A Bb) while the tune comes down by step from the
//   high home note. Low strings in whole notes on the root and a soft timpani stroke on beat 1 of bars 1 and 5 are
//   there even at Intensity 0; then the string section holding the chords; then the tune (Flute by default) in even
//   half notes; then timpani on beats 1 and 3, a cymbal swell into bars 5 and 1 and a quiet snare roll in the last
//   half of bar 8; and at the top the brass answers in bars 4 and 8 and doubles the tune's last two bars.
//   Slower than menu-orchestra (88) and built the other way round: that tune rises a fourth to open each phrase,
//   this one falls by step.
//
//   node tools/compose/credits_orchestra.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_orchestra.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/credits_orchestra.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_orchestra.mjs             when it is ready: write sounds/credits-orchestra.json
import { band, brassSection, param, clock, chords, arrangement, drumRow, eightBars, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('orchestra');

// Level of each melody instrument for this tune (`--match` on lF; the band has no colour after the melody bus).
export const GAINS = [1, 0.806, 1.07, 0.998, 1.86, 1.9, 0.85, 1.27, 1.19, 1.55, 0.612, 0.769, 0.618, 1.24, 1.14];

// Roots, counted from F: 0 2 4 5 | 0 -3 2 -5. The first four climb by step; D and C lie below the home note.
export const CHORDS = 'F Gm Am Bb | F Dm Gm C';

// The tune, one token per 16th: even half notes, two to a bar. Bars 1 to 3 come down by step from the high home note
// (F5) to the fifth (C5) while the bass climbs: F E, D C, and D C again, the same two notes leaning on A minor as they
// passed over G minor. Bar 4 is the turn, the tune's one pair of quarter notes: Bb A, back to Bb, held. Bars 5 to 8
// open with the one leap, up a sixth from that Bb to G, and walk down the scale two notes a bar, each bar leaning on
// its first note and settling on its second (G F over F, E D over Dm, C Bb over Gm, A G over C): it ends on G, the
// second, over C, a step above the F that starts the loop again.
export const TUNE = [
  'F5 _ _ _ _ _ _ _ E5- _ _ _ _ _ _ _',             // F    the high home note, a step down
  'D5 _ _ _ _ _ _ _ C5- _ _ _ _ _ _ _',             // Gm   on down to the fifth
  'D5 _ _ _ _ _ _ _ C5- _ _ _ _ _ _ _',             // Am   the same two notes, leaning on the new chord
  'Bb4 _ _ _ A4- _ _ _ Bb4 _ _ _ _ _ _ _',          // Bb   the turn: the one pair of quarter notes
  'G5 _ _ _ _ _ _ _ F5- _ _ _ _ _ _ _',             // F    the leap, up a sixth, then down by step
  'E5 _ _ _ _ _ _ _ D5- _ _ _ _ _ _ _',             // Dm
  'C5 _ _ _ _ _ _ _ Bb4- _ _ _ _ _ _ _',            // Gm
  'A4 _ _ _ _ _ _ _ G4- _ _ _ _ _ _ _',             // C    stops on the second, which leads back
];

// The brass: an answer of two rising chord tones under the tune's held Bb in bar 4, then the tune's last two bars an
// octave lower, with one note of the C chord at the very end that leads back into the loop.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST,
  REST,
  REST,
  '_ _ _ _ _ _ _ _ D4 _ _ _ F4 _ _ _',              // Bb   answers under the held note
  REST,
  REST,
  'C4 _ _ _ _ _ _ _ Bb3- _ _ _ _ _ _ _',            // Gm   doubles the tune, an octave lower
  'A3 _ _ _ _ _ _ _ G3 _ _ _ C4- _ _ _',            // C    and on, with one note that leads back
];

// Which layers play, in the brief's intensity order (the same plan as the other credits tracks). Sections (the Length
// control): the 32-bar version opens with the bed and the chords; the tune joins in section 2, the drums in section 3
// and the brass in section 4, the full band (the 8-bar version is section 4 only; 16 bars is sections 3 and 4).
export const LAYERS = {
  bed: { intensity: [0, 0.15], floor: 0.75 },           // 1 low strings and the soft timpani strokes: there at 0, still music
  strings: { intensity: [0.12, 0.22] },                 // 2 the string section holding the chords
  tune: { section: 2, intensity: [0.3, 0.4] },          // 3 the tune (all there by 0.4, so looks keep it)
  drums: { section: 3, intensity: [0.5, 0.6] },         // 4 timpani on 1 and 3, cymbal swells, the snare roll
  answer: { section: 4, intensity: [0.75, 0.85] },      // 5 the brass
  lift: { intensity: [0.4, 1], floor: 0.75 },           // not a layer: tune, drums and brass lean in as it climbs
};

// The strings dip a little while the tune plays: they hold chords in the tune's band, and the tune must lead there.
const DIP = '0.45*gTune*lead';
const M = B.mix;   // { drums, bass, chords, lead } from the band's probe
const L = B.kitLevels;
// The cymbal swells and the snare roll sit well under the kit level: they are hiss, and louder they hide the beat from
// the beat detector (with the swell at 0.4 and nothing marking the quarter notes it found 188 bpm, not 80).
const CYM = 0.15;
const SN = 0.4;
// Nothing in this piece plays on every beat (whole-note bass, half-note tune, timpani on 1 and 3), so the string
// section leans a little on each quarter note, as a section does when it bows a held chord again: the pulse of the hymn.
const BOW = 0.6;
// Brighter than the band's strings and horns, so the brass call and the strings' top reach the 1-4 kHz presence band
// (with the band's filters the track measured almost the same as menu-marimba, nearly nothing above 1 kHz).
// The low-pass alone barely moves it (a saw chord on C3 has little left above 1 kHz), so each section also gets a
// high-passed copy of itself, its bow and brass edge, which the Brightness control turns up.
const STR_CUTOFF = '2000 + bright*4000';
const STR_EDGE = { hp: 1400, level: '(0.5 + bright)*3' };
const BRASS_SHUT = '700 + bright*700';
const BRASS_OPEN = '1800 + bright*3000';
const BRASS_EDGE = { hp: 1200, level: '(0.5 + bright)*2.5' };
/** The band's string section, opened up, plus its edge: pL and pR now carry both. */
function strings(id, o) {
  const nodes = B.chords(id, o), out = [];
  for (const n of nodes) {
    if (n.id !== `${id}L` && n.id !== `${id}R`) { out.push(n); continue; }
    out.push({ ...n, id: `${n.id}b`, freq: STR_CUTOFF });
    out.push({ id: `${n.id}h`, type: 'filter', mode: 'hp', in: n.in, freq: STR_EDGE.hp, q: 0.7 });
    out.push({ id: n.id, type: 'expr', expr: `${n.id}b + ${n.id}h*${STR_EDGE.level}` });
  }
  return out;
}
export const MIX = {
  bedTimp: `uO*${0.6 * L.timpani * M.drums}*gBed`,
  timp: `tO*${0.85 * L.timpani * M.drums}*gDrums*gLift`,
  snare: `sO*${SN * L.snare * M.drums}*gDrums*gLift`,
  cymL: `cO*${L.cymbal * M.drums * CYM}*0.8*gDrums*gLift`,
  cymR: `cO*${L.cymbal * M.drums * CYM}*1.2*gDrums*gLift`,
  bass: `bO*${M.bass * 0.8}*gBed`,
  strL: `pL*${M.chords}*gStrings*(${1 - BOW / 2} + ${BOW}*qA)`,
  strR: `pR*${M.chords}*gStrings*(${1 - BOW / 2} + ${BOW}*qA)`,
  tune: 'lF*0.5*lead*gTune*gLift',
  hornL: `eO*${M.lead}*0.8*gAnswer*gLift`,
  hornR: `eO*${M.lead}*1.2*gAnswer*gLift`,
};
const LEVEL = 0.92;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.strL} + ${MIX.hornL}`,
  drums: `${MIX.bedTimp} + ${MIX.timp} + ${MIX.snare} + ${MIX.cymL}`,
  bed: `${MIX.bass} + ${MIX.bedTimp}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const bedKit = B.drums({ timpani: 'uT', noise: 'nz' });                              // -> uO: the bed's soft strokes
  const kit = B.drums({ timpani: 'tT', cymbal: 'cT', snare: 'sT', noise: 'nz' });      // -> tO, cO, sO; tA ducks
  return assemble({
    id: 'credits-orchestra',
    name: 'The Long Road Back',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'A broad, grateful slow hymn on synthesised strings and brass for the end credits of an adventure, the journey looked back on: low strings and a soft kettledrum, then held string chords, the tune, drums with cymbal swells, and at the top brass that answers and joins the tune. Intensity brings the layers in; you can change the length, speed, pitch and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'platformer'],
      words: ['credits', 'ending', 'farewell', 'journey', 'homecoming', 'hymn', 'grateful', 'adventure', 'strings', 'brass', 'cinematic', 'epic', 'synth orchestra'],
      license: 'draft',
    },
    tempo: B.checkTempo([72, 92, 80]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'F' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- 1 the bed's timpani: one soft stroke on the root on beat 1 of bars 1 and 5
      drumRow('uT', eightBars('................', { 1: 'x...............', 5: 'x...............' })),
      bedKit,
      // --- 4 drums: timpani on the root on beats 1 and 3; a cymbal swell through bars 4 and 8 that stops on the
      // downbeats of bars 5 and 1; a quiet snare roll in the last half of bar 8
      drumRow('tT', 'X.......x.......'),
      drumRow('cT', eightBars('................', { 4: 'X...............', 8: 'X...............' })),
      drumRow('sT', eightBars('................', { 8: '........ooooooxx' })),
      kit,

      // --- 1 low strings, bowed whole notes on the chord roots (one stroke a bar, held through it)
      drumRow('bR', 'X...............'),
      B.bass('b', { trig: 'bR' }),

      // --- 2 the string section, held chords bowed again on every bar with a short attack, pulled back under the tune
      drumRow('pG', 'X...............'),
      // the bow leaning on every beat (see BOW)
      drumRow('qT', 'X...X...X...X...'),
      { id: 'qA', type: 'ad', trig: 'qT', attack: 0.02, decay: '60/bpm*0.7', curve: 1.5 },
      ...strings('p', { trig: 'pG', dip: DIP }),

      // --- 3 the tune, on whichever instrument the listener picks (Flute by default); its half notes are held
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.6 }),

      // --- 5 the brass on the band's section, held longer than its default so each note lasts its half bar
      melody('e', ANSWER, { voice: B.range }),
      brassSection('ex', { trig: 'eG', pitch: 'eP', vel: 'eV', attack: 0.09, hold: '60/bpm*1.4', decay: 0.6, cutoff: BRASS_SHUT, open: BRASS_OPEN }),
      { id: 'exH', type: 'filter', mode: 'hp', in: '(exW1 + exW2)*0.45*exA*exV', freq: BRASS_EDGE.hp, q: 0.7 },
      { id: 'eO', type: 'expr', expr: `exO + exH*${BRASS_EDGE.level}` },

      // --- mix: timpani, snare and low strings in the centre; strings, cymbal and brass spread; the tune in both
      bus({
        centre: `${MIX.bedTimp} + ${MIX.timp} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.strL} + ${MIX.tune} + ${MIX.hornL} + ${MIX.cymL}`,
        right: `${MIX.strR} + ${MIX.tune} + ${MIX.hornR} + ${MIX.cymR}`,
        duck: `${kit.duck}*gDrums`, duckAmount: 0.15,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: these stay inside 72 to 92 bpm
      'Credits roll': { intensity: 0.85, bpm: 80 },
      'Names in candlelight': { intensity: 0.4, bpm: 76, bright: 0.35 },
      'Curtain call': { intensity: 1, bpm: 84, bright: 0.7 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
