#!/usr/bin/env node
// Writes sounds/credits-darkambient.json: "Embers After the Storm", a dark ambient end-credits track on the
// `darkambient` band (sound/bands.js, docs/music-styles.md). Built on the music kit (kit.mjs).
//
//   E minor turning to E major, 66 bpm, 32 bars by default: Em C G D | Am C Esus4 E. Bar 8 is a Picardy close: the
//   suspended A of bar 7 falls to G#, so the major E answers the minor E each time the loop comes round. The darkness
//   lifting after the last fight while the names scroll: a slow, soft heartbeat on every beat, a drone and wind under
//   the chords, a sub drone swelling on the root, a slow tune through a long echo, sparse glass replies and, only at
//   the very top of Intensity, a tom and a low metal hit on the bar turns.
//
//   node tools/compose/credits_darkambient.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_darkambient.mjs --match     measure the ten melody instruments and the five that play along, print matching gains
//   node tools/compose/credits_darkambient.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_darkambient.mjs             when it is ready: write sounds/credits-darkambient.json
import { band, param, clock, chords, arrangement, drumRow, eightBars, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('darkambient');

// Level of each melody instrument for this tune, through the band's echo colour (`--match` on lcO).
export const GAINS = [1, 0.768, 1.05, 1.01, 1.73, 1.41, 0.823, 1.25, 1.15, 1.26, 0.709, 0.939, 0.686, 1.4, 1.39, 1.97];

export const CHORDS = 'Em C G D | Am C Esus4 E';

// The tune, one token per 16th. A four-bar phrase: a long B falling to G over E minor, settling on E and lifting; the
// one leap, up a fourth to D, and steps down over G and D. The answer phrase starts bar 1's figure a step higher over
// A minor, returns to bar 2, then holds the suspended A over Esus4 and lets it fall to G# over E major: the light
// breaking through. From the closing B the loop finds the minor again.
export const TUNE = [
  'B4 _ _ _ _ _ _ _ _ _ _ _ G4 _ A4- _',            // Em     a long B, falling to G
  'G4 _ _ _ E4 _ _ _ _ _ _ _ G4 _ A4- _',           // C      settles on E, lifts
  'D5 _ _ _ _ _ _ _ _ _ B4 _ _ _ _ _',              // G      the one leap: up a fourth to D, down to B
  'A4 _ _ _ F#4 _ _ _ _ _ _ _ _ _ G4- _',           // D
  'C5 _ _ _ _ _ _ _ _ _ _ _ A4 _ B4- _',            // Am     bar 1's figure, a step higher
  'G4 _ _ _ E4 _ _ _ _ _ _ _ G4 _ A4- _',           // C      bar 2 returns
  'A4 _ _ _ _ _ _ _ _ _ B4 _ A4 _ _ _',             // Esus4  the suspension held
  'G#4 _ _ _ _ _ B4 _ _ _ _ _ _ _ _ _',              // E      it falls to G#, then B: the major answers
];

// The glass replies: one or two notes a bar in the holes the tune's long notes leave, chord tones only, an octave up.
export const ANSWER = [
  '_ _ _ _ G5 _ _ _ B5 _ _ _ _ _ _ _',              // Em
  '_ _ _ _ _ _ _ _ C6 _ _ _ _ _ _ _',              // C
  '_ _ _ _ B5 _ _ _ D6 _ _ _ _ _ _ _',              // G
  '_ _ _ _ _ _ _ _ A5 _ _ _ _ _ _ _',              // D
  '_ _ _ _ E6 _ _ _ C6 _ _ _ _ _ _ _',              // Am
  '_ _ _ _ _ _ _ _ G5 _ _ _ _ _ _ _',              // C
  '_ _ _ _ B5 _ _ _ _ _ _ _ _ _ _ _',              // Esus4
  '_ _ _ _ _ _ _ _ E6 _ _ _ B5 _ _ _',              // E      the glass rings the major chord's root and fifth
];

// Which layers play, in the brief's intensity order: 1 pulse, 2 bed, 3 sub, 4 tune, 5 answer (glass, then the tom
// and metal only at the very top). Sections (the Length control): the 32-bar version opens with the heartbeat, the
// bed and the sub drone; the tune joins in section 2, the glass in section 3, the tom and metal in section 4, the full
// band (the 8-bar version is section 4 only; 16 bars is sections 3 and 4).
export const LAYERS = {
  pulse: { intensity: [0, 1], floor: 0.7 },            // 1 heartbeat: every beat at every intensity, soft, leaning in
  bed: { intensity: [0, 0.15], floor: 0.45 },          // 2 drone + wind and the chord shade: already there at 0
  sub: { intensity: [0.15, 0.3] },                     // 3 the sub drone, swelling on the root
  tune: { section: 2, intensity: [0.3, 0.4] },         // 4 the tune (all there by 0.4, so looks at 0.5 keep it)
  glass: { section: 3, intensity: [0.55, 0.65] },      // 5 the glass replies
  perc: { section: 4, intensity: [0.9, 0.98] },        // 5 the tom and low metal on bar turns: only at the very top
  lift: { intensity: [0.4, 1], floor: 0.65 },          // not a layer: heartbeat, tune and glass lean in as it climbs
};

// The drone and wind dip while the tune plays: they share the tune's band, and the tune must lead there.
const DIP = '0.4*gTune*lead';
const M = B.mix;   // { drums, bass, chords, lead } from the band's probe
export const MIX = {
  heart: `kO*${0.55 * M.drums}*gPulse*(0.7 + 0.3*gLift)`,
  tom: `tO*${0.55 * M.drums}*gPerc`,
  metalL: `xO*${0.45 * M.drums}*0.8*gPerc`,
  metalR: `xO*${0.45 * M.drums}*1.2*gPerc`,
  sub: `bO*${M.bass * 0.7}*gSub`,
  bedL: `pL*${M.chords}*gBed`,
  bedR: `pR*${M.chords}*gBed`,
  shadeL: `(shT*0.7 + shF*0.3)*shA*0.1*gBed*(1 - ${DIP})`,
  shadeR: `(shT*0.3 + shF*0.7)*shA*0.1*gBed*(1 - ${DIP})`,
  tune: 'lcO*0.42*lead*gTune*gLift',
  glassL: `eO*${M.lead * 1.3}*0.8*gGlass*gLift`,
  glassR: `eO*${M.lead * 1.3}*1.2*gGlass*gLift`,
};
const LEVEL = 0.76;
/** Parts of the mix to measure against each other (left channel). */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.bedL} + ${MIX.shadeL} + ${MIX.glassL}`,
  drums: `${MIX.heart} + ${MIX.tom} + ${MIX.metalL}`,
  bed: `${MIX.sub} + ${MIX.bedL}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

// Brightness reaches further than the band's own voices let it: the drone and wind band-passes sweep from low and
// muffled to open on an exponential curve, the echo's low-pass opens from 600 Hz to 3 kHz, and the glass rings harder.
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
  if (left.size) throw new Error(`credits-darkambient: brightness nodes not found: ${[...left].join(', ')}`);
}

export function build(gains = GAINS) {
  const kit = B.drums({ heartbeat: 'kT', tom: 'tT', metal: 'xT', noise: 'nz' });   // -> kO, tO, xO; kA ducks
  const bed = B.chords('p', { trig: 'pG', dip: DIP });                              // -> pL, pR
  const echo = B.colour('lc', { input: 'lF' });
  const glass = B.lead('e', { trig: 'eG', pitch: 'eP' });
  brighten(bed, echo, glass);
  return assemble({
    id: 'credits-darkambient',
    name: 'Embers After the Storm',
    tags: ['music', ...B.tags, 'credits', 'ending', 'adaptive', 'loop'],
    description: 'Slow, vast and still dark ambient music for the end credits, like light breaking through ash after the storm: a soft heartbeat, a low drone and wind, a quiet tune with a long echo and glassy replies, dark at first and turning hopeful at the end of every loop. Intensity brings in a deep swelling drone, the tune, the glass and at the very top a tom and a low metal hit; you can change the speed, pitch, length and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['horror', 'dungeon'], gameTypes: ['roguelike-action', 'top-down-rpg', 'puzzle'],
      words: [...B.words, 'credits', 'ending', 'hopeful', 'consoling'],
      license: 'draft',
    },
    tempo: B.checkTempo([64, 76, 66]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Flute' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock(),
      chords(CHORDS, { tonic: 'E' }),     // roots: E C G D | A C E E, within a fourth below and a fifth above
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- 1 heartbeat on every beat; 5 at the very top, a tom at the bar turns and a low metal hit on bars 1 and 5
      drumRow('kT', 'X...X...X...X...'),
      drumRow('tT', eightBars('..............x.', { 4: '............x.x.', 8: '..........x.x.X.' })),
      drumRow('xT', eightBars('................', { 1: 'X...............', 5: 'X...............' })),
      kit,

      // --- 3 sub drone on the root, tied across bars: it changes only when the chord does
      drumRow('bR', 'X...............'),
      B.bass('b', { trig: 'bR' }),

      // --- 2 the bed: the band's drone and wind (root), plus a quiet shade of the chord's third and fifth under the
      // tune's register, swelling in each bar, so every bar's chord is heard: G over Em, A over Esus4, G# over E
      drumRow('pG', 'X...............'),
      bed,
      { id: 'shT', type: 'osc', wave: 'tri', freq: 'midi(48 + tonic + tr + third)*0.998' },
      { id: 'shF', type: 'osc', wave: 'tri', freq: 'midi(48 + tonic + tr + fifth)*1.003' },
      { id: 'shA', type: 'ad', trig: 'pG', attack: 0.35, hold: '240/bpm*0.45', decay: '240/bpm*0.5', curve: 1.2 },

      // --- 4 the tune, on whichever instrument the listener picks, through the band's long echo
      melody('l', TUNE),
      instruments('l', { gains, noise: 'nz', length: 1.5 }),
      echo,

      // --- 5 the glass replies, on the band's own voice
      melody('e', ANSWER, { voice: B.range }),
      glass,

      // --- mix: heartbeat, sub and tom in the centre; drone, shade, glass and metal spread; the tune in both
      bus({
        centre: `${MIX.heart} + ${MIX.sub} + ${MIX.tom}`,
        left: `${MIX.bedL} + ${MIX.shadeL} + ${MIX.tune} + ${MIX.glassL} + ${MIX.metalL}`,
        right: `${MIX.bedR} + ${MIX.shadeR} + ${MIX.tune} + ${MIX.glassR} + ${MIX.metalR}`,
        duck: `${kit.duck}*gPulse`, duckAmount: 0.12,
        ...B.room,
        level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 10% and stop at the range: these stay inside 64 to 76 bpm
      'Names scroll': { intensity: 0.85, bpm: 66 },
      'Ash settles': { intensity: 0.5, bpm: 64, bright: 0.35 },
      'Light breaks through': { intensity: 1, bpm: 70, bright: 0.8 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
