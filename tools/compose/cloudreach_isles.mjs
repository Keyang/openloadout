#!/usr/bin/env node
// Writes sounds/cloudreach-isles.json: "Island theme", the calm level music of the Cloudreach precision-platformer kit
// (bundles/specs/kit-platformer-cloudreach.md, batch CM1). Built on the music kit (kit.mjs) with the `orchestra` band
// (sound/bands.js, docs/music-styles.md).
//
//   G major, 108 bpm, 8 bars: G Bm C G | Em Am C D. Light and open, four in a bar: the string section bowed short on
//   the "and" of every beat, low strings on the root of each bar that step to the next root in the bar's last beat, a
//   skipping tune that starts every phrase on beat 1 and leaves beat 4 free, a soft snare on 2 and 4, timpani on the
//   first beat of bars 1 and 5 only, a cymbal swell into bar 5, and two long soft horn notes that answer the tune in
//   bars 4 and 8.
//
//   node tools/compose/cloudreach_isles.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/cloudreach_isles.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/cloudreach_isles.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/cloudreach_isles.mjs             when it is ready: write sounds/cloudreach-isles.json
import { band, brassSection, param, clock, chords, arrangement, drumRow, noteRow, eightBars, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('orchestra');

// Level of each of the ten melody instruments for this tune, then of the five that play along, from `--match` on lF
// (the band has no colour after the melody bus).
export const GAINS = [1, 0.804, 1.05, 0.994, 1.67, 2.11, 0.864, 1.31, 1.21, 1.33, 0.763, 0.881, 0.89, 1.34, 1.41];

// D' keeps the last root above the C before it (a step up, not a seventh down): roots G B C G | E A C D.
export const CHORDS = "G Bm C G | Em Am C D'";

// The tune, one token per 16th. Every phrase starts on beat 1 and plays nothing new on beat 4. Bar 1 runs along the
// G chord (D down to B, back to D, up to G: the hook); bar 2 holds F# and drops to D over Bm; bars 3 and 4 say the
// same in the same rhythm over C and G. Bars 5 to 8 walk: E twice and down by steps to B, up by steps from A to E, a held
// E that turns up to G, and a fall down the D chord onto A, a step above the home note, so the loop climbs a fourth
// back to the D that opens it.
export const TUNE = [
  'D5 _ B4- _ D5 _ _ _ G5 _ _ _ _ _ _ _',           // G    D B D, then G held
  'F#5 _ _ _ _ _ _ _ D5 _ _ _ _ _ _ _',             // Bm   F# held, then D
  'E5 _ C5- _ E5 _ _ _ G5 _ _ _ _ _ _ _',           // C    the same rhythm: E C E, then G held
  'D5 _ _ _ _ _ _ _ B4 _ _ _ _ _ _ _',              // G    D held, then B (the horns answer under it)
  'E5 _ E5- _ D5 _ C5- _ B4 _ _ _ _ _ _ _',         // Em   says E twice, then walks down by steps to B
  'A4 _ B4- _ C5 _ D5- _ E5 _ _ _ _ _ _ _',         // Am   walks up by steps, A to E
  'E5 _ _ _ _ _ _ _ G5 _ _ _ _ _ _ _',              // C    E held, turning up to G
  'F#5 _ D5- _ _ _ _ _ A4 _ _ _ _ _ _ _',           // D    down the chord onto A, a step above home
];

// The horn answers: two long notes in bar 4 and two in bar 8, chord tones under the tune.
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = eightBars(REST, {
  4: 'B3 _ _ _ _ _ _ _ D4 _ _ _ _ _ _ _',           // G    a third up, under the tune's held D and B
  8: 'D4 _ _ _ _ _ _ _ F#4 _ _ _ _ _ _ _',          // D    up to F#, which leans back into G
});

// The low strings: the root on beat 1, and on beat 4 a note one step from the next bar's root (semitones above this
// bar's root).            G>B  Bm>C  C>G  G>E  | Em>A  Am>C  C>D  D>G
const BASS_STEP = [2, 3, -3, -1, 3, 2, 4, -5];   // A   D    A    F#   | G     B     E    A
const BASS_ROW = BASS_STEP.map((s) => `0 _ _ _ _ _ _ _ _ _ _ _ ${s} _ _ _`);

// Which layers play, in the row's intensity order. Sections (the Length control): the 32-bar version opens with the
// strings and low strings, then the tune, then the drums, then everything (the 8-bar version is section 4 only).
export const LAYERS = {
  bed: { intensity: [0, 1], floor: 0.8 },               // 1, 2 off-beat strings and low strings: always there
  // 3 the tune. The row brings it in between 0.25 and 0.5; it is all there by 0.35, because looks set intensity
  // from 0.4 up and must keep the melody (it is still playing at 0.5, as the row asks)
  tune: { section: 2, intensity: [0.25, 0.35] },
  drums: { section: 3, intensity: [0.5, 0.6] },         // 4 the soft snare and the two timpani strokes
  full: { section: 4, intensity: [0.75, 0.85] },        // 5 the horn answers and the cymbal swell
  lift: { intensity: [0.4, 1], floor: 0.8 },            // not a layer: tune and drums lean in as intensity climbs
};

// The strings step back a little while the tune plays: the tune must lead in its own band.
const DIP = '0.35*gTune*lead';
const M = B.mix;         // { drums, bass, chords, lead } from the band's probe
const L = B.kitLevels;   // { timpani, cymbal, snare }
// Light: the strings are short strokes (so far less energy than held chords: lifted above the band's chord level),
// the snare is brushed (well under the kit level), the horns are soft.
const STR = 2.2, SNARE = 0.5, HORN = 0.55, CYM = 0.5, BASS = 0.7;
// The strings are opened up past the band's low-pass and carry a high-passed copy of themselves, the edge of the bow
// (as menu_orchestra.mjs does): short strokes need it to be heard as strokes, and Brightness turns it up.
const STR_CUTOFF = '1800 + bright*3600';
const STR_EDGE = { hp: 1400, level: '(0.5 + bright)*2.5' };
/** The band's string section, opened up, plus its edge: pL and pR carry both. */
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
  timp: `tO*${0.8 * L.timpani * M.drums}*gDrums*gLift`,
  snare: `sO*${L.snare * M.drums * SNARE}*gDrums*gLift`,
  cymL: `cO*${L.cymbal * M.drums * CYM}*0.8*gFull`,
  cymR: `cO*${L.cymbal * M.drums * CYM}*1.2*gFull`,
  bass: `bO*${M.bass * BASS}*gBed`,
  strL: `pL*pS*${M.chords * STR}*gBed`,
  strR: `pR*pS*${M.chords * STR}*gBed`,
  tune: 'lF*0.5*lead*gTune*gLift',
  hornL: `eO*${M.lead * HORN}*1.2*gFull`,
  hornR: `eO*${M.lead * HORN}*0.8*gFull`,
};
const LEVEL = 1.1;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.strL} + ${MIX.hornL}`,
  drums: `${MIX.timp} + ${MIX.snare} + ${MIX.cymL}`,
  bed: `${MIX.bass} + ${MIX.strL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  const kit = B.drums({ timpani: 'tT', cymbal: 'cT', snare: 'sT', noise: 'nz' });   // -> tO, cO, sO; tA ducks
  return assemble({
    id: 'cloudreach-isles',
    name: 'Island theme',
    tags: ['music', 'level', ...B.tags, 'adaptive', 'loop'],
    description: 'Light, open level music for islands in the sky, like a clear morning with a long way down: short string strokes off the beat, low strings that step from bar to bar, a skipping tune, a soft drum and two horn notes that answer it. Intensity brings in the tune, then the drums, then the horns; you can change the speed, pitch, length, lilt and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/exploration', themes: ['fantasy'], gameTypes: ['platformer', 'arcade'],
      words: ['level', 'stage', 'island', 'sky', 'clouds', 'explore', 'calm', 'light', 'morning', 'journey', 'strings', 'flute', 'orchestra', 'airy'],
      license: 'draft',
    },
    tempo: B.checkTempo([96, 120, 108]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
      param('swing', 'Lilt', 0, 1, 0.15),
    ],
    nodes: [
      clock({ swing: 'swing', on: 8 }),      // the piece is in 8ths: Lilt brings the 8th between two beats a little late
      chords(CHORDS, { tonic: 'G' }),      // roots: G B C G | E(below) A C D(above)
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- 4 drums: a soft snare on 2 and 4; timpani on beat 1 of bars 1 and 5 only; a cymbal swell through bar 4
      // that stops on the first beat of bar 5
      drumRow('sT', '....x.......x...'),
      drumRow('tT', eightBars('................', { 1: 'X...............', 5: 'X...............' })),
      drumRow('cT', eightBars('................', { 4: 'X...............' })),
      kit,

      // --- 2 low strings: the root of each bar, then a step toward the next root on beat 4
      drumRow('bR', 'X...........x...'),
      noteRow('bJ', BASS_ROW),
      B.bass('b', { trig: 'bR', semis: 'bJ' }),

      // --- 1 the string section on the "and" of every beat. The band's section holds its chord for most of a bar,
      // so a short stroke of this track's own (pS) shapes each bow: in fast, a 16th long, gone before the next beat
      drumRow('pG', '..x...x...x...x.'),
      ...strings('p', { trig: 'pG', dip: DIP }),
      { id: 'pS', type: 'ad', trig: 'pG', attack: 0.02, hold: '15/bpm', decay: '15/bpm*1.2', curve: 1.4 },

      // --- 3 the tune, on whichever instrument the listener picks (Flute by default)
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.2 }),

      // --- 5 the horn answers on the band's brass section, held for most of a half note, shut down so they stay soft
      melody('e', ANSWER, { voice: B.range }),
      brassSection('ex', { trig: 'eG', pitch: 'eP', vel: 'eV', attack: 0.1, hold: '60/bpm*1.5', decay: 0.5, cutoff: 500, open: '900 + bright*1600' }),
      { id: 'eO', type: 'expr', expr: 'exO' },

      // --- mix: timpani, snare and low strings in the centre; strings, cymbal and horns spread; the tune in both
      bus({
        centre: `${MIX.timp} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.strL} + ${MIX.tune} + ${MIX.hornL} + ${MIX.cymL}`,
        right: `${MIX.strR} + ${MIX.tune} + ${MIX.hornR} + ${MIX.cymR}`,
        duck: `${kit.duck}*gDrums`, duckAmount: 0.1,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 10% and stop at the range: these stay inside 96 to 120 bpm
      'Clear morning': { intensity: 0.45, bpm: 102, bright: 0.4, swing: 0.3 },   // strings, low strings and the tune
      'Between islands': { intensity: 0.85, bpm: 108 },
      'Long way down': { intensity: 1, bpm: 114, bright: 0.7, key: 2, swing: 0.05 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
