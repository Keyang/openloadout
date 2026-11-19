#!/usr/bin/env node
// Writes sounds/credits-synthwave.json: "Home Before Dawn", end-credits music on the synthwave band (sound/bands.js,
// docs/music-styles.md). Built on the music kit (kit.mjs) and band('synthwave'), after credits_steelpan.mjs.
//
//   E major, 90 bpm, straight, 8 bars, starting on its fourth chord: A B G#m C#m | F#m B E E (IV V iii vi ii V I I),
//   so the loop comes home only in its last two bars. The drive home after the last race: warm, glowing,
//   bittersweet, wide and slow. In the order Intensity brings them in: the plucked saw bass in straight 8ths on the
//   root with a soft kick on every beat (there at 0); the wide saw pad through chorus, pulled back under the tune;
//   the tune through the band's dotted-8th echo; the gated snare on 2 and 4 with a clap doubling it in bars 4 and 8
//   and hats in 8ths; and at the top the detuned saw lead answers in the last half of bars 4 and 8 while the bass
//   moves to 16ths with the octave on the off-16ths.
//   Against menu-synthwave (A minor, 96 bpm, starts at home, a busy tune on the beat): major, away from home, and a
//   tune of few, late, held notes.
//
//   node tools/compose/credits_synthwave.mjs --out <scratch file>   write the patch somewhere to try it (see kit.mjs)
//   node tools/compose/credits_synthwave.mjs --match     measure the five melody instruments, print matching gains
//   node tools/compose/credits_synthwave.mjs --measure   print instrument, section, intensity and layer levels
//   node tools/compose/credits_synthwave.mjs             when it is ready: write sounds/credits-synthwave.json
import { band, param, clock, chords, arrangement, drumRow, noteRow, eightBars, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('synthwave');

// Level of each melody instrument for this tune, measured after the band's echo (lcO), from `--match`.
export const GAINS = [1, 0.871, 1.02, 0.92, 2.68];

// The apostrophes lift B an octave, so every root lies from C#2 to B2 in the bass (never the B a fourth below it,
// which is too low to be heard on a small speaker) and the pad sits from C#3 to B3, under the tune.
export const CHORDS = "A B' G#m C#m | F#m B' E E";

// The tune, one token per 16th. Every note enters on the "and" of beat 2 (the 7th 16th) and is held, tied over the
// bar line. Bars 1 to 4: E hangs over A (its fifth) and again over B (now a note leaning on the chord, wanting to
// fall), falls to D sharp over G#m (its fifth) and to C sharp over C#m (its root): two steps down. Bars 5 to 8: the
// same C sharp again over F#m (now its fifth), then up by step, D sharp, E, F sharp through F#m and B, to G sharp,
// the third of E, which enters in bar 7 and is held through the whole of bar 8 and on into the top of the loop.
export const TUNE = [
  '_ _ _ _ _ _ E5 _ _ _ _ _ _ _ _ _',            // A     E, the fifth, entering late
  '_ _ _ _ _ _ E5 _ _ _ _ _ _ _ _ _',            // B     the same E, now leaning
  '_ _ _ _ _ _ D#5 _ _ _ _ _ _ _ _ _',           // G#m   a step down
  '_ _ _ _ _ _ C#5 _ _ _ _ _ _ _ _ _',           // C#m   a step down again
  '_ _ _ _ _ _ C#5 _ _ _ _ _ D#5- _ _ _',        // F#m   C sharp again, then up a step
  '_ _ _ _ _ _ E5 _ _ _ _ _ F#5- _ _ _',         // B     up by step twice more
  '_ _ _ _ _ _ G#5 _ _ _ _ _ _ _ _ _',           // E     settles on the third of home
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',             // E     held for the whole bar
];

// The detuned saw lead's answers, in the last half of bars 4 and 8, under the tune's held note: both fall by step
// (never a rising run up the chord).
const REST = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
export const ANSWER = [
  REST, REST, REST,
  '_ _ _ _ _ _ _ _ G#4 _ F#4- _ E4 _ _ _',       // C#m   fifth down to third
  REST, REST, REST,
  '_ _ _ _ _ _ _ _ B4 _ A4- _ G#4 _ F#4- _',     // E     fifth down by step, leading into A
];

// How long each note of the tune is held, from the tune as written: one number per 16th, 1 while a note sounds and
// 0 in the breath before the next one. A note is held until `breath` 16ths before the next note enters (so it
// crosses the bar line and lets go on beat 2, just before the next late entry); two notes six 16ths apart or closer
// are joined with a breath of one 16th. The last note of the loop rings on through the top of the loop.
export function heldSteps(bars, { breath = 2 } = {}) {
  const toks = bars.join(' ').trim().split(/\s+/), n = toks.length, on = toks.map((x) => x !== '_');
  const out = new Array(n).fill(1);
  on.forEach((starts, i) => {
    if (!starts) return;
    let gap = 1;
    while (!on[(i - gap + n) % n]) gap++;                     // 16ths since the note before this one
    const rest = Math.min(gap <= 6 ? 1 : breath, gap - 1);
    for (let k = 1; k <= rest; k++) out[(i - k + n) % n] = 0;
  });
  const rows = [];
  for (let i = 0; i < n; i += 16) rows.push(out.slice(i, i + 16).join(' '));
  return rows;
}

// The level a held note rests at after its start, as a share of its start (0.75 is 2.5 dB under it).
const REST_LEVEL = 0.75;
// The kit's Synth lead, Flute and Chiptune stop every note after a fixed time in seconds, whatever its written
// length. Here each of the three is held for as long as the tune writes it: the kit's envelope stays as the start
// of the note (renamed <id>Hit), and the note then rests at REST_LEVEL until the hold row lets go (`held`, the hold
// row smoothed over 60 ms). The Bell and the Plucked string are struck and cannot be held: they are given a ring
// as long as the longest note instead (RING, about two and a half bars at any speed), and still fade as they ring.
const RING = { lBeA: '900/bpm', lPl: '2000/bpm' };
function holdNotes(nodes, held) {
  return nodes.map((n) => (['lA', 'lFlA', 'lChA'].includes(n.id) && n.type === 'ad'
    ? [{ ...n, id: `${n.id}Hit` }, { id: n.id, type: 'expr', expr: `${held}*(${REST_LEVEL} + ${1 - REST_LEVEL}*${n.id}Hit)` }]
    : [RING[n.id] ? { ...n, decay: RING[n.id] } : n])).flat();
}

// Which layers play, in the brief's order. `section` is for the Length control (the 32-bar version: bed and pad,
// then the tune, then the drums, then the answers); `intensity` is the window in which Intensity brings a layer in.
export const LAYERS = {
  bed: { intensity: [0, 0.15], floor: 0.7 },           // at 0: the bass in 8ths and the soft kick, still music
  pad: { intensity: [0.12, 0.22] },
  tune: { section: 2, intensity: [0.3, 0.4] },         // all there by 0.4, where whole-bundle looks may set it
  drums: { section: 3, intensity: [0.5, 0.6] },        // gated snare, clap in bars 4 and 8, hats in 8ths
  answer: { section: 4, intensity: [0.75, 0.85] },     // the saw lead answers; the bass moves to 16ths
  lift: { intensity: [0.4, 1], floor: 0.8 },           // not a layer: the tune and the drums lean in as it builds
};

// The pad is pulled back while the tune plays (`dip`).
const DIP = '0.2*gTune*lead';
export const MIX = {
  kick: 'kO*0.3*gBed',
  snare: 'sO*0.32*gDrums*gLift',
  clap: 'qO*0.2*gDrums*gLift',
  hat: 'hO*0.16*gDrums*gLift',
  bass: 'bO*0.2*gBed',
  padL: 'pL*0.58*gPad',
  padR: 'pR*0.58*gPad',
  tune: 'lcO*0.28*lead*gTune*gLift',
  answerL: 'eO*0.17*1.25*lead*gAnswer',
  answerR: 'eO*0.17*0.75*lead*gAnswer',
};
const LEVEL = 1.25;
/** Parts of the mix to measure against each other (left channel): the tune, what plays under it, the drums, the bed. */
export const PARTS = {
  tune: MIX.tune,
  backing: `${MIX.padL} + ${MIX.answerL}`,
  drums: `${MIX.kick} + ${MIX.snare} + ${MIX.clap} + ${MIX.hat}`,
  bed: `${MIX.bass} + ${MIX.kick}`,
  'into limiter': `(ctr + muL + rv*space*2)*${LEVEL}`,
};

export function build(gains = GAINS) {
  return assemble({
    id: 'credits-synthwave',
    name: 'Home Before Dawn',
    tags: ['music', 'credits', 'ending', ...B.tags, 'adaptive', 'loop'],
    description: 'Warm, glowing, bittersweet synthesised synthwave for the end credits, the slow drive home before sunrise: a pulsing buzzy bass and a soft kick, then a wide buzzy pad, a tune of few long echoing notes, a big snare with claps and ticking hats, and at the top a bright synth answer over a busier bass. Intensity brings the layers in; you can change the length, speed, pitch and the instrument that plays the tune.',
    meta: {
      type: 'music', role: 'music/victory', themes: ['neutral'], gameTypes: ['racing', 'arcade', 'shooter'],
      words: ['credits', 'ending', 'synthwave', 'retro', 'neon', 'night', 'drive', 'eighties', 'synth', 'dawn', 'sunrise', 'bittersweet', 'warm'],
      license: 'draft',
    },
    tempo: B.checkTempo([84, 100, 90]),
    defaults: { ...B.defaults, intensity: 0.85, bars: 32, inst: 'Synth lead' },
    extraParams: [
      param('lead', 'Melody', 0, 1, 0.8),
    ],
    nodes: [
      clock({}),
      chords(CHORDS, { tonic: 'E' }),
      arrangement(LAYERS),
      { id: 'nz', type: 'noise' },

      // --- drums: a soft kick on every beat (part of the bed); the gated snare on 2 and 4, a clap doubling it in
      //     bars 4 and 8 only, hats in 8ths
      drumRow('kT', 'x...x...x...x...'),
      drumRow('sT', '....X.......X...'),
      drumRow('qT', eightBars('................', { 4: '....X.......X...', 8: '....X.......X...' })),
      drumRow('hT', 'x.o.x.o.x.o.x.o.'),
      B.drums({ kick: 'kT', snare: 'sT', clap: 'qT', hat: 'hT', noise: 'nz' }),   // -> kO, sO, qO, hO

      // --- bass: straight 8ths on the root; at the top, 16ths with the octave on the off-16ths
      drumRow('bG', 'X.x.x.x.X.x.x.x.'),
      drumRow('bH', 'XxxxXxxxXxxxXxxx'),
      noteRow('bS', '0 12 0 12 0 12 0 12 0 12 0 12 0 12 0 12'),
      { id: 'bT', type: 'expr', expr: 'gAnswer > 0.5 ? bH : bG' },
      B.bass('b', { trig: 'bT', semis: '(gAnswer > 0.5 ? bS : 0)' }),             // -> bO

      // --- the pad: whole-bar chords, wide, through chorus, pulled back under the tune
      drumRow('pG', 'X...............'),
      B.chords('p', { trig: 'pG', dip: DIP }),                                    // -> pL, pR

      // --- the tune, on whichever instrument the listener picks, every note held for its written length (tied over
      //     the bar line; the last one through the whole of bar 8), through the band's dotted-8th echo
      melody('l', TUNE),
      noteRow('lH', heldSteps(TUNE)),
      { id: 'lHd', type: 'lag', in: 'lH', time: 0.06 },
      ...holdNotes(instruments('l', { gains, noise: 'nz', length: 2.5 }), 'lHd'),
      B.colour('lc', { input: 'lF' }),                                            // -> lcO

      // --- the answers, on the band's detuned saw lead through its own echo
      melody('e', ANSWER, { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP' }),                                   // -> eO

      // --- mix: kick, snare and bass in the centre; pad wide; clap and hats a little to each side; answers left
      bus({
        centre: `${MIX.kick} + ${MIX.snare} + ${MIX.bass}`,
        left: `${MIX.padL} + ${MIX.tune} + ${MIX.answerL} + ${MIX.clap}*1.1 + ${MIX.hat}*0.85`,
        right: `${MIX.padR} + ${MIX.tune} + ${MIX.answerR} + ${MIX.clap}*0.9 + ${MIX.hat}*1.15`,
        duck: 'kA*gBed', duckAmount: 0.22,
        ...B.room, level: LEVEL,
      }),
    ],
    presets: {
      // looks change the tempo by up to 5% (a random one by 10%) and stop at the range: leave them room
      'Credits roll': { intensity: 0.85, bpm: 90 },
      'Engine off': { intensity: 0.4, bpm: 88, bright: 0.35, space: 0.38 },
      'Sunrise': { intensity: 1, bpm: 92, bright: 0.7 },
    },
  });
}

main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
