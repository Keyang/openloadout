#!/usr/bin/env node
// Writes sounds/menu-darkambient.json: "Hollow Threshold", a dark ambient menu / pause track for a horror title.
// Built on the music kit (kit.mjs) with the `darkambient` band (sound/bands.js, docs/music-styles.md).
//
//   C# minor, 66 bpm, 8 bars: C#m C#m A A | F#m D C#m G#m. The D is a Neapolitan (bII) for dread; the bar of G#m
//   (a minor v, no leading note) leaves the loop unresolved. Standing at a sealed door in the dark: a heartbeat on every
//   beat, a drone and wind under the chords, a sub drone tied across the bars, a slow tune through a long dark echo,
//   a sparse glass answer, and from intensity 0.5 a tom on the bar ends and a low metal hit on bars 1 and 5.
//
//   node tools/compose/menu_darkambient.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/menu_darkambient.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/menu_darkambient.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/menu_darkambient.mjs             when it is ready: write sounds/menu-darkambient.json
import { band, param, clock, chords, arrangement, drumRow, eightBars, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('darkambient');

// Level of each melody instrument for this tune, through the band's echo colour (`--match` on lcO).
export const GAINS = [1, 0.817, 1.05, 1.03, 1.79];

export const CHORDS = 'C#m C#m A A | F#m D C#m G#m';

// The tune, one token per 16th. A four-bar phrase: a semitone neighbour (G# A G#) that sinks to the tonic, one leap
// up a sixth to C#, and a slow fall back; the answer returns the neighbour a tone higher on F#m, sinks through the
// Neapolitan D, finds the opening figure again at home and lifts to D# over G#m, unresolved, before the loop.
export const TUNE = [
  'G#4 _ _ _ _ _ A4- _ G#4 _ _ _ _ _ _ _',          // C#m  the neighbour: G# A G#
  'E4 _ _ _ _ _ _ _ C#4 _ _ _ _ _ D#4- E4-',        // C#m  sinks to the tonic, two quiet notes back up
  'C#5 _ _ _ _ _ B4- _ A4 _ _ _ _ _ _ _',           // A    the one leap: up a sixth, then steps down
  'E4 _ _ _ _ _ _ _ A4 _ _ _ _ _ G#4- _',           // A
  'A4 _ _ _ _ _ B4- _ A4 _ _ _ _ _ _ _',            // F#m  the neighbour again, a tone higher
  'F#4 _ _ _ _ _ _ _ D4 _ _ _ _ _ E4- F#4-',        // D    sinks through the Neapolitan
  'G#4 _ _ _ _ _ A4- _ G#4 _ _ _ _ _ B4- _',        // C#m  the opening figure, home
  'D#5 _ _ _ _ _ _ _ B4- _ _ _ _ _ _ _',            // G#m  lifts to D#: no resolution
];

// The glass answer: two notes a bar, chord tones only, an octave and more above the tune, between its notes.
export const ANSWER = [
  '_ _ _ _ G#5 _ _ _ _ _ _ _ E5 _ _ _',             // C#m
  '_ _ _ _ C#6 _ _ _ _ _ _ _ G#5 _ _ _',            // C#m
  '_ _ _ _ E5 _ _ _ _ _ _ _ A5 _ _ _',              // A
  '_ _ _ _ C#6 _ _ _ _ _ _ _ E5 _ _ _',             // A
  '_ _ _ _ C#6 _ _ _ _ _ _ _ F#5 _ _ _',            // F#m
  '_ _ _ _ A5 _ _ _ _ _ _ _ D6 _ _ _',              // D
  '_ _ _ _ G#5 _ _ _ _ _ _ _ E5 _ _ _',             // C#m
  '_ _ _ _ D#6 _ _ _ _ _ _ _ B5 _ _ _',             // G#m
];

// Which layers play, in the brief's intensity order. Sections (the Length control): the 32-bar version opens with the
// heartbeat, the bed and the sub drone; the glass answer joins in section 2, the tune in section 3, and the tom and
// metal in section 4, the full band (the 8-bar version is section 4 only; 16 bars is sections 3 and 4).
export const LAYERS = {
  pulse: { intensity: [0, 1], floor: 0.75 },          // 1 heartbeat: every beat at every intensity, leaning in as it builds
  bed: { intensity: [0, 0.15], floor: 0.45 },          // 2 drone + wind and the chord shade: already there at 0
  sub: { intensity: [0.15, 0.25] },                    // 3 the sub drone
  tune: { section: 3, intensity: [0.3, 0.4] },         // 4 the tune (all there by 0.4, so looks keep it)
  glass: { section: 2, intensity: [0.4, 0.5] },        // 5 the glass answer
  perc: { section: 4, intensity: [0.5, 0.6] },         // 6 tom on the bar ends, metal on bars 1 and 5
  lift: { intensity: [0.5, 1], floor: 0.6 },           // not a layer: the heartbeat, tune, glass and hits lean in as it
                                                       // climbs past 0.5, so every step up is heard
};

// The drone and wind dip while the tune plays: they share the tune's band, and the tune must lead there.
const DIP = '0.4*gTune*lead';
const M = B.mix;   // { drums, bass, chords, lead } from the band's probe
export const MIX = {
  heart: `kO*${0.7 * M.drums}*gPulse*(0.7 + 0.3*gLift)`,
  tom: `tO*${0.6 * M.drums}*gPerc*gLift`,
  metalL: `xO*${0.5 * M.drums}*0.8*gPerc*gLift`,
  metalR: `xO*${0.5 * M.drums}*1.2*gPerc*gLift`,
  sub: `bO*${M.bass * 0.7}*gSub`,
  bedL: `pL*${M.chords}*gBed`,
  bedR: `pR*${M.chords}*gBed`,
  shadeL: `(shT*0.7 + shF*0.3)*shA*0.09*gBed*(1 - ${DIP})`,
  shadeR: `(shT*0.3 + shF*0.7)*shA*0.09*gBed*(1 - ${DIP})`,
  tune: 'lcO*0.42*lead*gTune*gLift',
  glassL: `eO*${M.lead * 1.3}*0.8*gGlass*gLift`,
  glassR: `eO*${M.lead * 1.3}*1.2*gGlass*gLift`,
};
const LEVEL = 0.68;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.bedL} + ${MIX.shadeL} + ${MIX.glassL}`,
  drums: `${MIX.heart} + ${MIX.tom} + ${MIX.metalL}`,
  bed: `${MIX.sub} + ${MIX.bedL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

// Brightness reaches further than the band's own voices let it: the drone and wind band-passes sweep from low and
// muffled (300 and 400 Hz) to open (2 and 2.2 kHz) on an exponential curve, the echo's low-pass opens from 600 Hz to
// 3 kHz, and the glass rings harder (FM index 0.12 to 0.72). Set on the band's nodes by id, after they are made.
export const BRIGHT = {
  pdL: { freq: '300*6.67^bright*(1 + pdS*0.5)' },
  pdR: { freq: '300*6.67^bright*(1 - pdS*0.5)' },
  pwO: { freq: '400*5.5^bright*(1 + pwS*0.5)' },
  lceO: { freq: '600*5^bright' },
  exC: { pm: 'exM*exI*(0.12 + bright*0.6)' },
};
function brighten(...groups) {
  const left = new Set(Object.keys(BRIGHT));
  for (const n of groups.flat()) if (BRIGHT[n.id]) { Object.assign(n, BRIGHT[n.id]); left.delete(n.id); }
  if (left.size) throw new Error(`menu-darkambient: brightness nodes not found: ${[...left].join(', ')}`);
}

export function build(gains = GAINS) {
  const kit = B.drums({ heartbeat: 'kT', tom: 'tT', metal: 'xT', noise: 'nz' });   // -> kO, tO, xO; kA ducks
  const bed = B.chords('p', { trig: 'pG', dip: DIP });                              // -> pL, pR
  const echo = B.colour('lc', { input: 'lF' });
  const glass = B.lead('e', { trig: 'eG', pitch: 'eP' });
  brighten(bed, echo, glass);
  return assemble({
    id: 'menu-darkambient',
    name: 'Hollow Threshold',
    tags: ['music', 'menu', ...B.tags, 'adaptive', 'loop'],
    description: 'Slow, cold, dark ambient music for a horror title or pause screen, like standing at a sealed door in the dark: a heartbeat, a low drone and wind, a quiet tune with a long echo and glassy answers that never resolve. Intensity brings in a deep low drone, the tune, the glass and then a tom and metal hits; you can change the speed, pitch, length and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/menu', themes: ['horror', 'dungeon'], gameTypes: ['roguelike-action', 'top-down-rpg', 'puzzle'],
      words: [...B.words, 'horror', 'menu', 'pause', 'title', 'creepy', 'tense'],
      license: 'draft',
    },
    tempo: B.checkTempo([64, 80, 66]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 16, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'C#' }),     // roots: C# C# A A | F# D C# G#, within a fourth below and a fifth above
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- 1 heartbeat on every beat; 6 a tom on the last 16th of each bar and a low metal hit on bars 1 and 5
      drumRow('kT', 'X...X...X...X...'),
      drumRow('tT', eightBars('..............x.', { 4: '............x.x.', 8: '..........x.x.X.' })),
      drumRow('xT', eightBars('................', { 1: 'X...............', 5: 'X...............' })),
      kit,

      // --- 3 sub drone on the root, tied across bars: it changes only when the chord does
      drumRow('bR', 'X...............'),
      B.bass('b', { trig: 'bR' }),

      // --- 2 the bed: the band's drone and wind (root), plus a quiet shade of the chord's third and fifth under the
      // tune's register, swelling in each bar, so every bar's chord is heard, minor or major
      drumRow('pG', 'X...............'),
      bed,
      { id: 'shT', type: 'osc', wave: 'tri', freq: 'midi(48 + tonic + tr + third)*0.998' },
      { id: 'shF', type: 'osc', wave: 'tri', freq: 'midi(48 + tonic + tr + fifth)*1.003' },
      { id: 'shA', type: 'ad', trig: 'pG', attack: 0.35, hold: '240/bpm*0.45', decay: '240/bpm*0.5', curve: 1.2 },

      // --- 4 the tune, on whichever instrument the listener picks, through the band's long dark echo
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.5 }),
      echo,

      // --- 5 the glass answer, on the band's own voice
      melody('e', ANSWER, { voice: B.range }),
      glass,

      // --- mix: heartbeat, sub and tom in the centre; drone, shade, glass and metal spread; the tune in both
      bus({
        centre: `${MIX.heart} + ${MIX.sub} + ${MIX.tom}`,
        left: `${MIX.bedL} + ${MIX.shadeL} + ${MIX.tune} + ${MIX.glassL} + ${MIX.metalL}`,
        right: `${MIX.bedR} + ${MIX.shadeR} + ${MIX.tune} + ${MIX.glassR} + ${MIX.metalR}`,
        duck: `${kit.duck}*gPulse`, duckAmount: 0.15,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 10% and stop at the range: these stay inside 67 to 76 bpm
      'Pause screen': { intensity: 0.45, bpm: 68, bright: 0.2 },
      'Sealed door': { intensity: 0.85, bpm: 68 },
      'Something behind it': { intensity: 1, bpm: 74, bright: 0.45, key: -1 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
