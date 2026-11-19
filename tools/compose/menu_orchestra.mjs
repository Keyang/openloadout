#!/usr/bin/env node
// Writes sounds/menu-orchestra.json: "Banners at Dawn", a noble sunrise title card for an adventure.
// Built on the music kit (kit.mjs) with the `orchestra` band (sound/bands.js, docs/music-styles.md).
//
//   Bb major, 88 bpm, 8 bars: Bb Eb Gm F | Cm Eb Fsus4 F. Broad held strings swell in every bar over low strings bowed
//   on the roots in whole notes; a high woodwind tune rises a fourth to open each phrase; timpani on the root on beats
//   1 and 3, a cymbal swell cresting on bars 4 and 8, a snare roll building through
//   the Fsus4 into bar 8; and a sustained horn call that answers the tune while it holds.
//   Strings and horns are opened up past the band's filters and carry a high-passed edge, so the brass call and the
//   strings' top sit in the 1-4 kHz presence band.
//
//   node tools/compose/menu_orchestra.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_orchestra.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/menu_orchestra.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_orchestra.mjs             when it is ready: write sounds/menu-orchestra.json
import { band, brassSection, param, clock, chords, arrangement, drumRow, eightBars, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('orchestra');

// Level of each melody instrument for this tune (`--match` on lF; the band has no colour after the melody bus).
export const GAINS = [1, 0.805, 1.06, 1, 1.86];

export const CHORDS = 'Bb Eb Gm F | Cm Eb Fsus4 F';

// The tune, one token per 16th. A four-bar phrase that opens with a rising fourth (F to Bb) and climbs by step to G
// over Eb, turns down through Gm and stops on A, a question; the answer opens with the same rising fourth on C minor
// (G to C), climbs to G again, sinks to the suspension's Bb and C, and comes home down the F chord.
export const TUNE = [
  'F4 _ _ _ Bb4 _ _ _ _ _ C5- _ D5 _ _ _',          // Bb   the rising fourth, then steps up
  'Eb5 _ F5- _ G5 _ _ _ _ _ _ _ _ _ _ _',           // Eb   on up to G, held while the horn answers
  'G5 _ _ _ _ _ F5- _ _ _ D5 _ _ _ Bb4- _',         // Gm   turns down
  'C5 _ _ _ _ _ _ _ _ _ A4 _ _ _ _ _',              // F    stops on A: a question
  'G4 _ _ _ C5 _ _ _ _ _ D5- _ Eb5 _ _ _',          // Cm   the rising fourth again, on C minor
  'G5 _ _ _ _ _ F5- _ _ _ Eb5 _ _ _ Bb4- _',        // Eb
  'Bb4 _ _ _ _ _ C5 _ _ _ _ _ Bb4- _ _ _',          // Fsus4  the suspension: Bb and C
  'C5 _ _ _ _ _ _ _ A4- _ _ _ F4 _ _ _',            // F    home down the chord, onto the F that opens the loop
];

// The horn call, under the tune and between its notes: chord tones, mostly where the tune holds.
export const ANSWER = [
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',                // Bb   the tune alone
  '_ _ _ _ _ _ _ _ Bb3 _ _ _ Eb4 _ _ _',            // Eb   a fourth up under the held G
  'D4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',               // Gm
  '_ _ _ _ C4 _ _ _ F4 _ _ _ _ _ _ _',              // F    answers the question
  'Eb4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',              // Cm
  '_ _ _ _ _ _ _ _ Bb3 _ _ _ Eb4 _ _ _',            // Eb
  'F4 _ _ _ _ _ _ _ Bb4 _ _ _ _ _ _ _',             // Fsus4
  'A3 _ _ _ _ _ _ _ _ _ _ _ C4 _ _ _',              // F    leads back into the loop
];

// Which layers play, in the brief's intensity order. Sections (the Length control): the 32-bar version opens with
// strings and low strings; the tune joins in section 2, the drums in section 3 and the horn call in section 4, the
// full band (the 8-bar version is section 4 only; 16 bars is sections 3 and 4).
export const LAYERS = {
  strings: { intensity: [0, 1], floor: 0.75 },          // 1 held chords: there at 0, a little broader as it builds
  bass: { intensity: [0.1, 0.2] },                      // 2 low strings on the roots
  tune: { section: 2, intensity: [0.25, 0.35] },        // 3 the woodwind tune (all there by 0.4, so looks keep it)
  drums: { section: 3, intensity: [0.45, 0.55] },       // 4 timpani, cymbal swells, snare roll
  answer: { section: 4, intensity: [0.65, 0.75] },      // 5 the horn call
  lift: { intensity: [0.4, 1], floor: 0.75 },           // not a layer: tune, drums and horn lean in as it climbs
};

// The strings dip a little while the tune plays: they hold chords in the tune's band, and the tune must lead there.
const DIP = '0.45*gTune*lead';
const M = B.mix;   // { drums, bass, chords, lead } from the band's probe
const L = B.kitLevels;
// The cymbal swells sit at half the kit level: louder, their slow rise of noise hides the quarter-note timpani from the
// beat detector (it found 199 bpm), and the swell still crests clearly on bars 4 and 8.
const CYM = 0.4;
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
  timp: `tO*${0.85 * L.timpani * M.drums}*gDrums*gLift`,
  snare: `sO*${L.snare * M.drums}*gDrums*gLift`,
  cymL: `cO*${L.cymbal * M.drums * CYM}*0.8*gDrums*gLift`,
  cymR: `cO*${L.cymbal * M.drums * CYM}*1.2*gDrums*gLift`,
  bass: `bO*${M.bass * 0.8}*gBass`,
  strL: `pL*${M.chords}*gStrings`,
  strR: `pR*${M.chords}*gStrings`,
  tune: 'lF*0.5*lead*gTune*gLift',
  hornL: `eO*${M.lead}*1.2*gAnswer*gLift`,
  hornR: `eO*${M.lead}*0.8*gAnswer*gLift`,
};
const LEVEL = 0.92;
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
    id: 'menu-orchestra',
    name: 'Banners at Dawn',
    tags: ['music', 'menu', ...B.tags, 'adaptive', 'loop'],
    description: 'Noble, slow synthesised strings and brass for an adventure title screen, like the sun rising over the road ahead: broad held chords, low strings, a high tune, timpani and a horn call that answers it. Intensity brings in the low strings, the tune, the drums and then the horns; you can change the speed, pitch, length and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'platformer'],
      words: ['title', 'menu', 'title screen', 'main theme', 'sunrise', 'dawn', 'noble', 'adventure', 'journey', 'strings', 'brass', 'heroic', 'cinematic', 'epic'],
      license: 'draft',
    },
    tempo: B.checkTempo([76, 100, 88]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'Bb' }),     // roots: Bb Eb G F | C Eb F F, within a fourth below and a fifth above
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- 4 drums: timpani on the root on beats 1 and 3 (the steady pulse under the held strings);
      // a cymbal swell through bars 3 and 7 that crests on the downbeats of bars 4 and 8; a snare roll building through the Fsus4 bar into bar 8
      drumRow('tT', 'X.......x.......'),
      drumRow('cT', eightBars('................', { 3: 'X...............', 7: 'X...............' })),
      drumRow('sT', eightBars('................', { 7: '........oooxoxxX' })),
      kit,

      // --- 2 low strings, bowed whole notes on the chord roots (one stroke a bar, held through it)
      drumRow('bR', 'X...............'),
      B.bass('b', { trig: 'bR' }),

      // --- 1 the string section, held chords bowed again on every bar
      drumRow('pG', 'X...............'),
      ...strings('p', { trig: 'pG', dip: DIP }),

      // --- 3 the tune, on whichever instrument the listener picks (Flute by default)
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.4 }),

      // --- 5 the horn call on the band's brass section, held longer than its default so the call is sustained
      melody('e', ANSWER, { voice: B.range }),
      brassSection('ex', { trig: 'eG', pitch: 'eP', vel: 'eV', attack: 0.09, hold: '60/bpm*1.4', decay: 0.6, cutoff: BRASS_SHUT, open: BRASS_OPEN }),
      { id: 'exH', type: 'filter', mode: 'hp', in: '(exW1 + exW2)*0.45*exA*exV', freq: BRASS_EDGE.hp, q: 0.7 },
      { id: 'eO', type: 'expr', expr: `exO + exH*${BRASS_EDGE.level}` },

      // --- mix: timpani, snare and low strings in the centre; strings, cymbal and horns spread; the tune in both
      bus({
        centre: `${MIX.timp} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.strL} + ${MIX.tune} + ${MIX.hornL} + ${MIX.cymL}`,
        right: `${MIX.strR} + ${MIX.tune} + ${MIX.hornR} + ${MIX.cymR}`,
        duck: `${kit.duck}*gDrums`, duckAmount: 0.15,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 10% and stop at the range: these stay inside 76 to 100 bpm
      'Before sunrise': { intensity: 0.55, bpm: 85, bright: 0.35 },   // the soft timpani are in: they carry the beat
      'Title card': { intensity: 0.85, bpm: 88 },
      'The road ahead': { intensity: 1, bpm: 90, bright: 0.7, key: 1 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
