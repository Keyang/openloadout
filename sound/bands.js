// bands.js: the twelve music styles (docs/music-styles.md). In prose a "music style"; in code a "band", because
// "style" already means a track's three presets and the visual style registry. A band is chosen once, when a track
// is written, never by a control: it is the voices that play the track (a signature lead, a chord voice, a bass and a
// drum kit), a typical tempo and a room. The tune itself stays on the ten melody instruments behind `inst`,
// unchanged (compose.js's instruments()); a band only picks the default one and may colour what comes after it.
//
//   import { band, ... } from './kit.mjs';
//   const B = band('folk');                                    // an unknown name throws a KitError listing the twelve
//   ... B.drums({ hand: 'dT', shaker: 'kT', tambourine: 'tT', noise: 'nz' })   // -> dO, kO, tO
//       B.bass('b', { trig: 'bR', semis: 'bJ' })                // -> bO
//       B.chords('p', { trig: 'pG' })                           // -> pL, pR (chip, musicbox, steelpan, marimba: also pick)
//       melody('e', ANSWER, { voice: B.range }), B.lead('e', { trig: 'eG', pitch: 'eP' })   // -> eO
//       bus({ ..., ...B.room })
//   main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
//
// What band(name) returns is listed above band() below. bandProbe(name) builds one fixed 8-bar track with a band,
// which tests/unit/compose-bands.test.mjs measures (levels, pitch, how far the bands are from each other).
// Pure JavaScript with no Node or page APIs (Contract 11). Every voice here is a synthesiser's sketch: no band
// sounds like a recording of the instruments it is named after, and nothing here is a voice that sings.

import {
  KitError, clock, chords as chordRow, arrangement, drumRow, noteRow, chordTone, eightBars, melody, instruments, bus, assemble,
  kickDrum, snareDrum, hatDrum, tomDrum, clap, shaker, handDrum, sawBass, roundBass, sawPad, chorus, tempoEcho, pluckedString,
} from './compose.js';
import * as V from './voices.js';

export * from './voices.js';

const fail = (msg) => { throw new KitError(msg); };
const num = (x) => String(Math.round(x * 1e6) / 1e6);
const withOut = (nodes, out) => Object.assign(nodes, { out });

// ---- how each band plays ----------------------------------------------------------------------------------------------
// lead(id, o)    the signature voice on a melody line; its nodes are named <id>x..., and it ends in <id>O
// chords(id, o)  the chord voice; ends in <id>L, <id>R or <id>O (the list's .out says which)
// bass(id, o)    the bass; ends in <id>O
// kit            role: { make(id, { trig, noise }), pitched, level }; `pulse` roles play at every intensity
// colour(id, o)  nodes after the melody bus, ending in <id>O; null for none
// rows           the probe's rows: bass gate and chord tones, the chord voice's row (and its tone picks), one per drum
// takesPick      the chord voice plays one note at a time, the chord tone a `pick` row names (0 root, 1 third, 2 fifth,
//                3 octave; compose.js's chordTone); band().chords requires `pick` there and refuses it otherwise
// picks          the chord voice reads its pick through the node pJ (chordTone('pJ', pick)); chip's chipArp reads it itself
// takesExtra     the chord voice plays an `extra` row of added notes (sevenths); band().chords refuses `extra` otherwise
// takesDip       the chord voice is pulled back by a `dip` expression (0 to 1); band().chords refuses `dip` otherwise

// Notes are written from a C plus the `tonic` node (the home note chords() gives), so a band plays in whatever key the
// track's chords are in. compose.js's voices take `note` as a number: they get the C, and the tonic goes into `semis`.
const K = (c) => `${c} + tonic`;
const P = (c) => `midi(${c} + tonic + tr + (pJ))`;   // a chord-tone pick, for chord voices that play one note at a time
/** The options for one of compose.js's chord-following voices: a C as the note and the tonic added to semis, unless the track gave a note. */
const inKey = (o, c) => (o.note === undefined ? { ...o, note: c, semis: `(${o.semis ?? 0}) + tonic` } : o);
/**
 * folk's lead: compose.js's pluckedString, which has no vel of its own (it plucks as hard as the mark of its row). Without
 * vel it is that voice unchanged. With vel the voice's output is scaled by a strength node, <id>xS (the expression
 * given, or 1 for null), and the mark is no longer read (<id>xV is 1), so vel replaces the row's mark as it does in
 * voices.js's leads instead of multiplying it. The string is linear, so this is the same as plucking it vel hard.
 */
function folkLead(id, { trig, pitch, vel }) {
  const nodes = pluckedString(`${id}x`, { trig, pitch, ring: 1.1 });
  if (vel === undefined) return nodes;
  return [
    ...nodes.map((n) => (n.id === `${id}xV` ? { id: n.id, type: 'expr', expr: '1' } : n)),
    { id: `${id}xS`, type: 'expr', expr: vel === null ? '1' : String(vel) },
    { id: `${id}O`, type: 'expr', expr: `${id}xO*${id}xS` },
  ];
}

const SPEC = {
  chip: {
    label: 'Chip-like', tempo: [120, 168, 144], room: { space: 0.03, size: 0.4, damp: 0.2 }, bright: 0.6, inst: 'Chiptune', range: [43, 96],
    tags: ['chip', 'retro'], words: ['chip', 'chiptune', 'retro', '8-bit', 'arcade', 'pixel', 'bleep'],
    lead: (id, o) => V.chipLead(`${id}x`, o),
    chords: (id, o) => withOut(V.chipArp(id, { trig: o.trig, pick: o.pick, note: K(48) }), [`${id}O`, `${id}O`]),
    takesPick: true,
    bass: (id, o) => V.triBass(id, { note: K(36), ...o }),
    kit: {
      kick: { make: (id, o) => V.chipKick(id, o), pitched: true, level: 0.8 },
      snare: { make: (id, o) => V.chipSnare(id, o), level: 0.45 },
      hat: { make: (id, o) => V.chipHat(id, o), level: 0.35 },
    },
    rows: {
      bass: ['X...x...X...x...', '0 _ _ _ 2 _ _ _ 3 _ _ _ 2 _ _ _'], chords: ['xxxxxxxxxxxxxxxx', '0 1 2 1 3 2 1 2 0 1 2 1 3 2 4 2'],
      drums: { kick: 'X.......X.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    },
    mix: { drums: 1, bass: 0.45, chords: 0.22, lead: 0.3 },
  },
  synthwave: {
    label: 'Synthwave', tempo: [80, 118, 100], room: { space: 0.25, size: 0.85, damp: 0.35 }, bright: 0.5, inst: 'Synth lead', range: [43, 96],
    tags: ['synthwave', 'retro'], words: ['synthwave', 'retro', 'neon', 'night', 'drive', 'eighties', 'synth'],
    lead: (id, o) => [...V.sawLead(`${id}x`, o), ...tempoEcho(`${id}y`, { input: `${id}xO`, steps: 3, feedback: 0.35, tone: 2600 }), { id: `${id}O`, type: 'expr', expr: `${id}xO + ${id}yO*0.4` }],
    chords: (id, o) => withOut([
      ...sawPad(`${id}p`, { pitches: ['midi(48 + tonic + tr)', 'midi(48 + tonic + tr + third)', 'midi(48 + tonic + tr + fifth)', ...(o.extra ? [`midi(48 + tonic + tr + (${o.extra}))`] : [])], trig: o.trig }),
      ...chorus(`${id}c`, { input: `(${id}pL + ${id}pR)*0.5`, depth: '0.6' }),
      { id: `${id}L`, type: 'expr', expr: `(${id}pL*0.75 + ${id}cL*0.45)*${dipOf(o)}` },
      { id: `${id}R`, type: 'expr', expr: `(${id}pR*0.75 + ${id}cR*0.45)*${dipOf(o)}` },
    ], [`${id}L`, `${id}R`]),
    takesExtra: true,
    takesDip: true,
    bass: (id, o) => sawBass(id, inKey(o, 36)),
    kit: {
      kick: { make: (id, o) => kickDrum(id, { trig: o.trig, decay: 0.35 }), pitched: true, level: 0.85, duck: true },
      snare: { make: (id, o) => V.gatedSnare(id, o), level: 0.5 },
      clap: { make: (id, o) => clap(id, o), level: 0.3 },
      hat: { make: (id, o) => hatDrum(id, o), level: 0.3 },
    },
    rows: {
      bass: ['XxxxXxxxXxxxXxxx', '0 3 0 3 0 3 0 3 0 3 0 3 0 3 0 3'], chords: ['X...............'],
      drums: { kick: 'X...X...X...X...', snare: '....X.......X...', clap: '............X...', hat: '..x...x...x...x.' },
    },
    colour: (id, o) => [...tempoEcho(`${id}e`, { input: o.input, steps: 3, feedback: 0.3, tone: 3000 }), { id: `${id}O`, type: 'expr', expr: `${o.input} + ${id}eO*0.35` }],
    mix: { drums: 1, bass: 0.32, chords: 0.3, lead: 0.28 },
  },
  orchestra: {
    label: 'Synth orchestra', tempo: [70, 150, 112], room: { space: 0.3, size: 0.9, damp: 0.5 }, bright: 0.5, inst: 'Flute', range: [43, 88],
    tags: ['orchestra', 'cinematic'], words: ['orchestra', 'strings', 'brass', 'cinematic', 'epic', 'heroic', 'synth orchestra'],
    lead: (id, o) => V.brassSection(`${id}x`, o),
    chords: (id, o) => withOut(V.stringSection(id, { trig: o.trig, dip: o.dip, note: K(48) }), [`${id}L`, `${id}R`]),
    takesDip: true,
    bass: (id, o) => V.lowStrings(id, { note: K(36), ...o }),
    kit: {
      timpani: { make: (id, o) => V.timpani(id, o), pitched: true, level: 0.7, duck: true },
      cymbal: { make: (id, o) => V.cymbalSwell(id, o), level: 0.3 },
      snare: { make: (id, o) => snareDrum(id, o), level: 0.3 },
    },
    rows: {
      bass: ['X...............', '0'], chords: ['X...............'],
      drums: { timpani: 'X.......x.......', cymbal: eightBars('................', { 4: 'X...............', 8: 'X...............' }), snare: eightBars('................', { 4: '............oxox', 8: '........oxoxoxXx' }) },
    },
    mix: { drums: 1, bass: 0.35, chords: 0.3, lead: 0.3 },
  },
  folk: {
    label: 'Plucked folk', tempo: [84, 132, 108], room: { space: 0.12, size: 0.6, damp: 0.4 }, bright: 0.55, inst: 'Plucked string', range: [48, 96],
    tags: ['folk', 'plucked'], words: ['folk', 'plucked', 'strummed', 'village', 'tavern', 'market', 'countryside'],
    lead: (id, o) => folkLead(id, o),
    chords: (id, o) => withOut(V.strum(id, { trig: o.trig, dip: o.dip, note: K(48) }), [`${id}L`, `${id}R`]),
    takesDip: true,
    bass: (id, o) => roundBass(id, inKey(o, 36)),
    kit: {
      hand: { make: (id, o) => handDrum(id, { ...o, pitch: 'midi(41 + (tonic + tr + 79) % 12)' }), pitched: true, level: 0.6, duck: true },
      shaker: { make: (id, o) => shaker(id, o), level: 0.3 },
      tambourine: { make: (id, o) => V.tambourine(id, o), level: 0.25 },
    },
    rows: {
      bass: ['X.......x.......', '0 _ _ _ _ _ _ _ 2 _ _ _ _ _ _ _'], chords: ['X.x.X.x.X.x.X.x.'],
      drums: { hand: 'X.....x.X.....x.', shaker: '..x...x...x...x.', tambourine: '....X.......X...' },
    },
    mix: { drums: 1, bass: 0.4, chords: 0.3, lead: 0.32 },
  },
  musicbox: {
    label: 'Music box', tempo: [64, 100, 80], room: { space: 0.15, size: 0.5, damp: 0.2 }, bright: 0.7, inst: 'Bell', range: [55, 103],
    tags: ['music box', 'lullaby'], words: ['music box', 'lullaby', 'dream', 'toy', 'gentle', 'sleep', 'tinkling'],
    lead: (id, o) => V.tine(`${id}x`, o),
    chords: (id, o) => withOut(V.tine(id, { trig: o.trig, pitch: P(60) }), [`${id}O`, `${id}O`]),
    picks: true,
    takesPick: true,
    bass: (id, o) => V.lowTine(id, { note: K(48), ...o }),
    kit: { mechanism: { make: (id, o) => V.mechanism(id, o), level: 0.35, pulse: true } },
    rows: {
      bass: ['X...............', '0'], chords: ['X...x...x...x...', '2 _ _ _ 4 _ _ _ 3 _ _ _ 1 _ _ _'],
      drums: { mechanism: 'x...x...x...x...' },
    },
    mix: { drums: 1, bass: 0.3, chords: 0.1, lead: 0.12 },
  },
  organ: {
    label: 'Organ', tempo: [64, 140, 96], room: { space: 0.35, size: 0.95, damp: 0.45 }, bright: 0.5, inst: 'Synth lead', range: [36, 96],
    tags: ['organ', 'chapel'], words: ['organ', 'drawbar', 'chapel', 'hymn', 'gothic', 'swirling', 'keys'],
    lead: (id, o) => V.drawbarOrgan(`${id}x`, o),
    chords: (id, o) => withOut([
      ...V.drawbarOrgan(`${id}o`, { trig: o.trig, pitches: ['midi(48 + tonic + tr)', 'midi(48 + tonic + tr + third)', 'midi(48 + tonic + tr + fifth)', ...(o.extra ? [`midi(48 + tonic + tr + (${o.extra}))`] : [])], partials: [1, 2, 4], hold: '240/bpm*0.9', noise: o.noise }),
      ...V.rotary(id, { input: `${id}oO*${dipOf(o)}` }),
    ], [`${id}L`, `${id}R`]),
    takesExtra: true,
    takesDip: true,
    bass: (id, o) => V.pedalBass(id, { note: K(36), ...o }),
    drumWindow: [0.6, 0.7],
    kit: {
      kick: { make: (id, o) => kickDrum(id, { trig: o.trig, decay: 0.12 }), pitched: true, level: 0.6, duck: true },
      snare: { make: (id, o) => V.brushSnare(id, o), level: 0.3 },
      ride: { make: (id, o) => V.ride(id, o), level: 0.18 },
    },
    rows: {
      bass: ['X...........x...', '0 _ _ _ _ _ _ _ _ _ _ _ 2 _ _ _'], chords: ['X...............'],
      drums: { kick: 'X.......X.......', snare: '....x.......x...', ride: 'X..xX..xX..xX..x' },
    },
    mix: { drums: 1, bass: 0.35, chords: 0.25, lead: 0.26 },
  },
  twang: {
    label: 'Twang (western and surf)', tempo: [100, 172, 140], room: { space: 0.15, size: 0.5, damp: 0.3 }, bright: 0.65, inst: 'Plucked string', range: [40, 88],
    tags: ['twang', 'western'], words: ['twang', 'western', 'surf', 'desert', 'cowboy', 'saloon', 'spring'],
    lead: (id, o) => [...V.twangGuitar(`${id}x`, o), ...V.spring(`${id}y`, { input: `${id}xO` }), { id: `${id}O`, type: 'expr', expr: `${id}xO + ${id}yO*0.45` }],
    chords: (id, o) => withOut(V.mutedStrum(id, { trig: o.trig, note: K(48) }), [`${id}L`, `${id}R`]),
    bass: (id, o) => V.uprightBass(id, { note: K(36), ...o }),
    kit: {
      kick: { make: (id, o) => kickDrum(id, { trig: o.trig }), pitched: true, level: 0.7, duck: true },
      snare: { make: (id, o) => V.brushSnare(id, o), level: 0.3 },
      rim: { make: (id, o) => V.rimClick(id, o), level: 0.3 },
    },
    rows: {
      bass: ['X...x...X...x...', '0 _ _ _ 1 _ _ _ 2 _ _ _ 1 _ _ _'], chords: ['..x...x...x...x.'],
      drums: { kick: 'X.......X.......', snare: 'x.x.x.x.x.x.x.x.', rim: '....X.......X...' },
    },
    colour: (id, o) => [...V.spring(`${id}s`, { input: o.input }), { id: `${id}O`, type: 'expr', expr: `${o.input} + ${id}sO*0.4` }],
    mix: { drums: 1, bass: 0.5, chords: 0.3, lead: 0.3 },
  },
  steelpan: {
    label: 'Steel pan (island)', tempo: [96, 132, 116], room: { space: 0.06, size: 0.4, damp: 0.3 }, bright: 0.6, inst: 'Bell', range: [55, 96],
    tags: ['steel pan', 'island'], words: ['steel pan', 'island', 'beach', 'tropical', 'sunny', 'calypso', 'carnival'],
    lead: (id, o) => V.steelPan(`${id}x`, o),
    chords: (id, o) => withOut([...V.steelPan(`${id}x`, { trig: o.trig, pitch: P(60) }), { id: `${id}O`, type: 'expr', expr: `${id}xO*${dipOf(o)}` }], [`${id}O`, `${id}O`]),
    picks: true,
    takesPick: true,
    takesDip: true,
    bass: (id, o) => V.bassPan(id, { note: K(36), ...o }),
    kit: {
      conga: { make: (id, o) => handDrum(id, { ...o, pitch: 'midi(45 + (tonic + tr + 75) % 12)', slapHz: 900 }), pitched: true, level: 0.5, duck: true },
      shaker: { make: (id, o) => shaker(id, o), level: 0.25 },
      clave: { make: (id, o) => V.clave(id, o), pitched: true, level: 0.25 },
      cowbell: { make: (id, o) => V.cowbell(id, o), pitched: true, level: 0.12 },
    },
    rows: {
      bass: ['X.....x.....x...', '0'], chords: ['..x...x...x...x.', '2 _ _ _ 1 _ _ _ 3 _ _ _ 1 _ _ _'],
      drums: { conga: 'X..x..x.X..x..x.', shaker: 'xoxoxoxoxoxoxoxo', clave: 'X..X...X..X.X...', cowbell: 'x...x...x...x...' },
    },
    mix: { drums: 1, bass: 0.4, chords: 0.22, lead: 0.3 },
  },
  lofi: {
    label: 'Lo-fi keys', tempo: [64, 96, 80], room: { space: 0.12, size: 0.5, damp: 0.7 }, bright: 0.35, inst: 'Bell', range: [43, 96],
    tags: ['lofi', 'chill'], words: ['lofi', 'chill', 'study', 'relax', 'tape', 'dusty', 'mellow', 'electric piano'],
    swing: 0.6,
    lead: (id, o) => V.electricPiano(`${id}x`, o),
    chords: (id, o) => withOut(V.electricPiano(id, { trig: o.trig, pitches: ['midi(48 + tonic + tr)', 'midi(48 + tonic + tr + third)', 'midi(48 + tonic + tr + fifth)', ...(o.extra ? [`midi(48 + tonic + tr + (${o.extra}))`] : [])] }), [`${id}O`, `${id}O`]),
    takesExtra: true,
    bass: (id, o) => V.warmBass(id, { note: K(36), ...o }),
    kit: {
      kick: { make: (id, o) => V.dustyKick(id, { trig: o.trig }), pitched: true, level: 0.8, duck: true },
      snare: { make: (id, o) => V.dustySnare(id, o), level: 0.4 },
      hat: { make: (id, o) => V.dustyHat(id, o), level: 0.3 },
      crackle: { make: (id, o) => V.crackle(id, { trig: o.trig }), level: 0.12, pulse: true },
    },
    rows: {
      bass: ['X.....x.........', '0'], chords: ['X.......x.....x.'], extra: '11 | 10 | 11 | 10 | 11 | 10 | 11 | 10',
      drums: { kick: 'X......x..X.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', crackle: 'X...............' },
    },
    colour: (id, o) => [
      { id: `${id}Wb`, type: 'osc', freq: 0.55 },
      { id: `${id}D`, type: 'delay', in: o.input, time: `0.006 + ${id}Wb*0.0006`, feedback: 0, mix: 1, max: 0.008 },
      { id: `${id}C`, type: 'crush', in: `${id}D`, bits: 9, rate: 16000 },
      { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}C`, freq: 4500, q: 0.7 },
    ],
    finish: ({ left, right }) => ({ nodes: V.tape('tp', { left, right }), out: ['tpL', 'tpR'] }),
    mix: { drums: 1, bass: 0.45, chords: 0.17, lead: 0.17 },
  },
  darkambient: {
    label: 'Dark ambient', tempo: [64, 96, 72], room: { space: 0.45, size: 0.97, damp: 0.6 }, bright: 0.3, inst: 'Flute', range: [48, 100],
    tags: ['dark ambient', 'eerie'], words: ['dark', 'ambient', 'eerie', 'drone', 'cave', 'dread', 'haunted', 'abyss'],
    lead: (id, o) => V.glass(`${id}x`, o),
    chords: (id, o) => withOut([
      ...V.drone(`${id}d`, { trig: o.trig, note: K(48) }),
      ...V.wind(`${id}w`, { trig: o.trig }),
      { id: `${id}L`, type: 'expr', expr: `(${id}dL + ${id}wO*0.35)*${dipOf(o)}` },
      { id: `${id}R`, type: 'expr', expr: `(${id}dR + ${id}wO*0.35)*${dipOf(o)}` },
    ], [`${id}L`, `${id}R`]),
    takesDip: true,
    bass: (id, o) => V.subDrone(id, { trig: o.trig, semis: o.semis, note: o.note ?? K(36) }),
    kit: {
      heartbeat: { make: (id, o) => V.heartbeat(id, { trig: o.trig }), pitched: true, level: 0.7, pulse: true, duck: true },
      tom: { make: (id, o) => tomDrum(id, { ...o, note: 48, semis: 'tonic', decay: 0.35 }), pitched: true, level: 0.4 },
      metal: { make: (id, o) => V.metalHit(id, { trig: o.trig }), pitched: true, level: 0.25 },
    },
    rows: {
      bass: ['X...............', '0'], chords: ['X...............'],
      drums: { heartbeat: 'X...X...X...X...', tom: '..............x.', metal: eightBars('................', { 1: 'X...............', 5: 'X...............' }) },
    },
    colour: (id, o) => [...tempoEcho(`${id}e`, { input: o.input, steps: 8, feedback: 0.45, tone: 1200 }), { id: `${id}O`, type: 'expr', expr: `${o.input} + ${id}eO*0.45` }],
    mix: { drums: 1, bass: 0.35, chords: 0.2, lead: 0.17 },
  },
  rock: {
    label: 'Arcade rock', tempo: [112, 176, 150], room: { space: 0.1, size: 0.6, damp: 0.4 }, bright: 0.6, inst: 'Synth lead', range: [40, 96],
    tags: ['rock', 'arcade'], words: ['rock', 'arcade', 'guitar', 'driving', 'loud', 'action', 'power chord'],
    lead: (id, o) => V.driveLead(`${id}x`, o),
    chords: (id, o) => withOut(V.powerChord(id, { trig: o.trig, note: K(36) }), [`${id}O`, `${id}O`]),
    bass: (id, o) => V.rockBass(id, { note: K(36), ...o }),
    kit: {
      kick: { make: (id, o) => kickDrum(id, { trig: o.trig }), pitched: true, level: 0.8, duck: true },
      snare: { make: (id, o) => snareDrum(id, { ...o, decay: 0.18, mix: [1.6, 2.2] }), level: 0.45 },
      hat: { make: (id, o) => hatDrum(id, o), level: 0.3 },
      crash: { make: (id, o) => V.crash(id, o), level: 0.25 },
      tom: { make: (id, o) => tomDrum(id, { ...o, note: 48, semis: 'tonic' }), pitched: true, level: 0.4 },
    },
    rows: {
      bass: ['X.x.X.x.X.x.X.x.', '0'], chords: ['x.x.x.x.x.x.x.x.'],
      drums: { kick: 'X.....x.X.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', crash: eightBars('................', { 1: 'X...............', 5: 'X...............' }), tom: eightBars('................', { 8: '............XxXx' }) },
    },
    colour: (id, o) => [{ id: `${id}S`, type: 'shaper', in: `${o.input}*0.8`, drive: 1.8 }, { id: `${id}O`, type: 'filter', mode: 'lp', in: `${id}S`, freq: 3500, q: 0.7 }],
    mix: { drums: 1, bass: 0.4, chords: 0.28, lead: 0.26 },
  },
  marimba: {
    label: 'Wooden bars', tempo: [72, 120, 92], room: { space: 0.2, size: 0.75, damp: 0.55 }, bright: 0.5, inst: 'Flute', range: [45, 100],
    tags: ['marimba', 'wooden'], words: ['marimba', 'wooden', 'mallet', 'jungle', 'village', 'warm', 'bouncy'],
    lead: (id, o) => V.marimba(`${id}x`, o),
    chords: (id, o) => withOut([...V.marimba(`${id}x`, { trig: o.trig, pitch: P(60), noise: o.noise }), { id: `${id}O`, type: 'expr', expr: `${id}xO*${dipOf(o)}` }], [`${id}O`, `${id}O`]),
    picks: true,
    takesPick: true,
    takesDip: true,
    bass: (id, o) => V.bassBar(id, { note: K(36), ...o }),
    kit: {
      woodblock: { make: (id, o) => V.woodblock(id, { trig: o.trig }), pitched: true, level: 0.2 },
      guiro: { make: (id, o) => V.guiro(id, o), level: 0.3 },
      log: { make: (id, o) => V.logDrum(id, { trig: o.trig }), pitched: true, level: 0.6 },
    },
    rows: {
      bass: ['XxxxxxxxXxxxxxxx', '0 _ _ _ _ _ _ _ 2 _ _ _ _ _ _ _'], chords: ['x.x.x.x.x.x.x.x.', '0 _ 1 _ 2 _ 3 _ 2 _ 1 _ 0 _ 1 _'],
      drums: { woodblock: '..x...x...x...x.', guiro: 'X.......X.......', log: 'X.....x...X.....' },
    },
    mix: { drums: 1, bass: 0.4, chords: 0.24, lead: 0.3 },
  },
};
/** The lead and bass functions above that take a white-noise node (the others make no noise of their own). */
const NEEDS_NOISE = new Set([SPEC.organ.lead, SPEC.organ.bass, SPEC.rock.bass, SPEC.marimba.lead, SPEC.marimba.bass]);
/** The level factor of a chord voice: 1, or 1 minus its `dip` expression. */
function dipOf(o) { return o.dip === undefined || o.dip === 0 ? '1' : `(1 - (${o.dip}))`; }

// Gains that level the ten melody instruments on each band's probe, then the five that play along (Guitar, Piano, Violin,
// Trumpet, Bass), fifteen numbers (matchGains from DEFAULT_GAINS, 4 bars at 44.1 kHz). The first five were measured 2026-11-19
// (rock, whose colour is a shaper, took a second pass; darkambient re-measured after its heartbeat went to every beat,
// unchanged at 3 significant figures) and came out the same on 2026-11-22, when the other ten were added (rock took two
// passes again). A new track starts from these and measures its own (`--match`): level depends on the tune.
const START_GAINS = {
  chip: [1, 0.825, 1.05, 1.02, 1.71, 2.82, 0.898, 1.36, 1.17, 1.37, 0.992, 1.01, 1.23, 1.57, 1.73], synthwave: [1, 0.766, 1.04, 0.998, 1.62, 3.11, 0.833, 1.21, 1.12, 1.31, 0.988, 0.997, 0.943, 1.86, 1.67], orchestra: [1, 0.754, 1, 0.959, 1.52, 3.02, 0.823, 1.2, 1.14, 1.26, 0.972, 0.961, 1.01, 1.53, 1.67],
  folk: [1, 0.778, 1.04, 0.988, 1.6, 2.98, 0.85, 1.23, 1.13, 1.31, 0.989, 0.994, 0.981, 1.57, 1.71], musicbox: [1, 0.795, 1.08, 1.01, 1.73, 2.69, 0.859, 1.21, 1.22, 1.38, 1.09, 1.03, 0.85, 1.67, 1.68], organ: [1, 0.787, 1.06, 1.01, 1.67, 3.05, 0.856, 1.23, 1.19, 1.32, 0.973, 1.02, 0.927, 1.94, 1.67],
  twang: [1, 0.784, 0.97, 0.955, 1.56, 2.55, 0.921, 1.22, 1.19, 1.24, 1.04, 0.962, 1.15, 1.51, 1.67], steelpan: [1, 0.794, 1.05, 0.999, 1.65, 2.79, 0.866, 1.25, 1.2, 1.37, 1.01, 1, 1.06, 1.66, 1.76], lofi: [1, 0.769, 1.09, 1.13, 1.62, 3.66, 0.828, 1.17, 1.24, 1.34, 0.93, 1.04, 0.861, 1.69, 1.71],
  darkambient: [1, 0.78, 1.1, 1.08, 1.59, 3.65, 0.84, 1.22, 1.21, 1.33, 0.9, 1.04, 0.804, 1.59, 1.74], rock: [1, 0.676, 1.11, 1.12, 1.44, 2.99, 0.74, 1.3, 1.17, 1.21, 0.918, 0.947, 1.16, 1.49, 1.61], marimba: [1, 0.759, 1.03, 0.971, 1.58, 3.04, 0.824, 1.19, 1.16, 1.31, 0.874, 0.983, 0.872, 1.54, 1.6],
};

/** The twelve bands, as plain data: { name: { name, label, tempo, room, defaults, range, roles, tags, words, startGains, mix } }. */
export const BANDS = Object.freeze(Object.fromEntries(Object.entries(SPEC).map(([name, s]) => [name, Object.freeze({
  name, label: s.label, tempo: [...s.tempo], room: { size: s.room.size, damp: s.room.damp },
  defaults: { inst: s.inst, space: s.room.space, bright: s.bright }, range: [...s.range], roles: Object.keys(s.kit),
  tags: [...s.tags], words: [...s.words], startGains: [...START_GAINS[name]], mix: { ...s.mix },
})])));

/**
 * One of the twelve bands, ready to play a track: its voices as functions and its settings as data; an unknown name throws a KitError listing the twelve.
 * Arguments: name ('chip', 'synthwave', 'orchestra', 'folk', 'musicbox', 'organ', 'twang', 'steelpan', 'lofi',
 * 'darkambient', 'rock', 'marimba').
 * Returns { name, label, tempo: [slowest, fastest, typical], checkTempo(tempo), defaults: { inst, space, bright }
 * (spread into assemble's defaults), room: { size, damp } (spread into bus()), range: the lead's notes [low, high]
 * for melody()'s voice option, roles: the drum kit, drums({ role: row id, ..., noise }) (one voice per role, named
 * after its row without the last letter: kT -> kO), bass(id, { trig, semis, note }) (<id>O; semis in semitones),
 * chords(id, { trig, pick, extra, dip }) (.out names its two sides; `pick`, the id of a noteRow of chord-tone numbers,
 * required where takesPick and refused elsewhere; `extra` only where takesExtra, `dip` only where takesDip; no chord
 * voice takes `semis`, so it is refused), lead(id, { trig, pitch, vel }) (<id>O), colour(id, { input }) or
 * null, finish({ left, right }) or null ({ nodes, out }), matchNode (what `--match` levels), startGains, mix, tags, words }.
 */
export function band(name) {
  const s = SPEC[name];
  if (!s) fail(`band: "${name}" is not a music style; the twelve are ${Object.keys(SPEC).join(', ')}`);
  const data = BANDS[name];
  const roleId = (role, row) => {
    if (typeof row !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(row)) fail(`${name}.drums: give the id of a drumRow for "${role}", got ${JSON.stringify(row)}`);
    return row.length > 1 && /T$/.test(row) ? row.slice(0, -1) : `${row}D`;
  };
  return {
    ...data,
    defaults: { ...data.defaults }, room: { ...data.room }, range: [...data.range], tempo: [...data.tempo],
    checkTempo(tempo) {
      if (!Array.isArray(tempo) || tempo.length !== 3) fail(`${name}: give the track's tempo as [slowest, fastest, written]`);
      if (tempo[0] < s.tempo[0] || tempo[1] > s.tempo[1]) fail(`${name}: the track's tempo ${tempo[0]} to ${tempo[1]} bpm is outside the band's ${s.tempo[0]} to ${s.tempo[1]} bpm`);
      return tempo;
    },
    drums(rows = {}) {
      const { noise, ...given } = rows, nodes = [], out = {}, duck = [];
      for (const [role, row] of Object.entries(given)) {
        const k = s.kit[role];
        if (!k) fail(`${name} has no ${role}: its roles are ${Object.keys(s.kit).join(', ')}`);
        const id = roleId(role, row);
        const made = k.make(id, { trig: row, ...(noise ? { noise } : {}) });
        nodes.push(...made);
        out[role] = `${id}O`;
        if (k.duck && made.some((n) => n.id === `${id}A`)) duck.push(`${id}A`);
      }
      return Object.assign(nodes, { out, duck: duck[0] });
    },
    bass(id, { trig, semis = 0, note, noise } = {}) {
      if (!trig) fail(`${name}.bass: give trig, the row that plays it`);
      return s.bass(id, { trig, semis, ...(note === undefined ? {} : { note }), ...(noise && NEEDS_NOISE.has(s.bass) ? { noise } : {}) });
    },
    chords(id, { trig, pick, semis, extra, dip, noise } = {}) {
      if (!trig) fail(`${name}.chords: give trig, the row that plays the chords`);
      const pickers = Object.keys(SPEC).filter((n) => SPEC[n].takesPick).join(', ');
      if (semis !== undefined) fail(`${name}.chords: no chord voice takes semis (semitones are for bass()); to choose chord tones give pick, the id of a noteRow of chord-tone numbers (0 root, 1 third, 2 fifth, 3 octave), on the bands that take it: ${pickers}`);
      if (pick !== undefined && !s.takesPick) fail(`${name}.chords: this band's chord voice plays whole chords and takes no pick; bands that do: ${pickers}`);
      if (extra !== undefined && !s.takesExtra) fail(`${name}.chords: this band's chord voice plays fixed chord tones and takes no extra notes; bands that do: ${Object.keys(SPEC).filter((n) => SPEC[n].takesExtra).join(', ')}`);
      if (dip !== undefined && !s.takesDip) fail(`${name}.chords: this band's chord voice has no dip (it is sparse enough to leave the tune room); bands that have one: ${Object.keys(SPEC).filter((n) => SPEC[n].takesDip).join(', ')}`);
      if (s.takesPick && !pick) fail(`${name}.chords: give pick, the id of a noteRow of chord-tone numbers (0 root, 1 third, 2 fifth, 3 octave): this band plays its chords one note at a time`);
      const pre = s.picks ? [chordTone('pJ', pick)] : [];
      if (s.picks && id === 'pJ') fail(`${name}.chords: the id "pJ" is taken by the chord-tone node; choose another`);
      const nodes = s.chords(id, { trig, pick, extra, dip, noise });
      return withOut([...pre, ...nodes], nodes.out);
    },
    lead(id, { trig, pitch, vel, noise } = {}) {
      if (!trig || !pitch) fail(`${name}.lead: give trig and pitch, the gate and the pitch of a melody line ('eG', 'eP')`);
      const nodes = s.lead(id, { trig, pitch, ...(vel === undefined ? {} : { vel }), ...(noise && NEEDS_NOISE.has(s.lead) ? { noise } : {}) });
      if (!nodes.some((n) => n.id === `${id}O`)) nodes.push({ id: `${id}O`, type: 'expr', expr: `${id}xO` });
      return nodes;
    },
    colour: s.colour ? (id = 'lc', { input = 'lF' } = {}) => s.colour(id, { input }) : null,
    finish: s.finish ? ({ left = 'mL', right = 'mR' } = {}) => s.finish({ left, right }) : null,
    matchNode: s.colour ? 'lcO' : 'lF',
    takesExtra: !!s.takesExtra,
    takesPick: !!s.takesPick,
    takesDip: !!s.takesDip,
    swing: s.swing ?? 0,
    drumWindow: s.drumWindow ?? [0.4, 0.5],
    pulseRoles: Object.keys(s.kit).filter((r) => s.kit[r].pulse),
    pitchedRoles: Object.keys(s.kit).filter((r) => s.kit[r].pitched),
    kitLevels: Object.fromEntries(Object.entries(s.kit).map(([r, k]) => [r, k.level])),
    probeRows: s.rows,
  };
}

// ---- the probe: one fixed track per band ----------------------------------------------------------------------------------

const PROBE_CHORDS = 'C Am | F G | C Am | F G';
const PROBE_TUNE = [
  'E5 _ G5 _ C6 _ _ _ G5 _ E5- _ D5 _ _ _',
  'C5 _ _ _ E5 _ A5- _ A5 _ _ _ G5- _ E5 _',
  'F5 _ A5 _ C6 _ _ _ A5 _ F5- _ C5 _ _ _',
  'D5 _ _ _ G5 _ B5- _ B5 _ _ _ A5- _ G5 _',
  'G5 _ E5 _ C5 _ _ _ E5 _ G5- _ E5 _ _ _',
  'E5 _ _ _ C5 _ A4- _ A4 _ _ _ C5- _ E5 _',
  'F5 _ C5 _ A4 _ _ _ C5 _ F5- _ A5 _ _ _',
  'G5 _ _ _ D5 _ B4- _ G4 _ _ _ _ _ _ _',
];
const PROBE_ANSWER = ['G4 _ _ _ _ _ _ _ E4 _ _ _ _ _ _ _', 'A4 _ _ _ _ _ _ _ C5 _ _ _ _ _ _ _', 'A4 _ _ _ _ _ _ _ C5 _ _ _ _ _ _ _', 'B4 _ _ _ _ _ _ _ D5 _ _ _ _ _ _ _'];
/** Ids of the probe's rows: a drum role plays from the row <letter>T and its voice is <letter>. */
const ROLE_LETTERS = 'kshqdwjxyzuvnio';

/**
 * One fixed 8-bar track built with a band (chords C Am | F G twice, a drum row per role, a bass row, a tune, an answer on the band's lead), to measure it.
 * Arguments: name (a band); gains: the fifteen melody instrument gains, ten and then the five that play along (default: the band's startGains).
 * Returns { patch, parts }: the assembled patch, with three styles (calm, busy, full at intensity 0.3, 0.7 and 1),
 * and parts: { drums, bass, chords, lead }, one expression per part over the patch's nodes, for measureLayers.
 */
export function bandProbe(name, gains) {
  const B = band(name), rows = B.probeRows;
  const g = gains || B.startGains;
  const roles = B.roles;
  const kitRows = {}, drumNodes = [];
  roles.forEach((role, i) => { const row = `${ROLE_LETTERS[i]}T`; kitRows[role] = row; drumNodes.push(drumRow(row, rows.drums[role])); });
  const kit = B.drums({ ...kitRows, noise: 'nz' });
  const gate = (role) => (B.pulseRoles.includes(role) ? 'gPulse' : 'gDrums');
  const drums = roles.map((r) => `${kit.out[r]}*${num(B.kitLevels[r] * B.mix.drums)}*${gate(r)}`).join(' + ');
  const chordNodes = B.chords('p', { trig: 'pG', noise: 'nz', ...(rows.chords[1] ? { pick: 'pK' } : {}), ...(rows.extra ? { extra: 'pE' } : {}) });
  const [cl, cr] = chordNodes.out;
  const lead = 'eO*' + num(B.mix.lead) + '*gLead';
  const bass = `bO*${num(B.mix.bass)}*gBed`;
  const tune = `${B.matchNode}*0.42*gTune`;
  const parts = { drums, bass, chords: `(${cl} + ${cr})*0.5*${num(B.mix.chords)}*gBed`, lead };
  const fin = B.finish ? B.finish({ left: 'mL', right: 'mR' }) : null;
  const patch = assemble({
    id: `band-probe-${name}`, name: `${B.label} probe`,
    tags: ['music', ...B.tags],
    description: `A short synthesised test piece in the ${B.label.toLowerCase()} music style, to measure the style's voices.`,
    meta: { type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['arcade'], words: [...B.words.slice(0, 13), 'probe'].slice(0, 14), license: 'draft' },
    tempo: B.tempo,
    defaults: { ...B.defaults, intensity: 1, bars: 8 },
    nodes: [
      clock(B.swing ? { swing: num(B.swing) } : {}),
      chordRow(PROBE_CHORDS, { tonic: 'C' }),
      arrangement({ bed: {}, pulse: {}, drums: { intensity: B.drumWindow }, tune: { intensity: [0.2, 0.3] }, lead: { intensity: [0.6, 0.7] } }),
      { id: 'nz', type: 'noise' },
      ...drumNodes, kit,
      drumRow('bR', rows.bass[0]), noteRow('bQ', rows.bass[1] || '0'), chordTone('bJ', 'bQ'),
      B.bass('b', { trig: 'bR', semis: 'bJ', noise: 'nz' }),
      drumRow('pG', rows.chords[0]),
      ...(rows.chords[1] ? [noteRow('pK', rows.chords[1])] : []),
      ...(rows.extra ? [noteRow('pE', rows.extra, { every: 16 })] : []),
      chordNodes,
      melody('l', PROBE_TUNE), instruments('l', { gains: g, noise: 'nz' }),
      ...(B.colour ? [B.colour('lc', { input: 'lF' })] : []),
      melody('e', [...PROBE_ANSWER, ...PROBE_ANSWER], { voice: B.range }),
      B.lead('e', { trig: 'eG', pitch: 'eP', noise: 'nz' }),
      bus({
        centre: `${drums} + ${bass}`,
        left: `${cl}*${num(B.mix.chords)}*gBed + ${tune} + ${lead}*0.8`,
        right: `${cr}*${num(B.mix.chords)}*gBed + ${tune} + ${lead}*1.2`,
        ...(kit.duck ? { duck: `${kit.duck}*${gate(roles.find((r) => kit.out[r] === kit.duck.replace(/A$/, 'O')))}`, duckAmount: 0.2 } : {}),
        ...B.room, level: 0.6,
      }),
      ...(fin ? [fin.nodes] : []),
    ],
    presets: { calm: { intensity: 0.3 }, busy: { intensity: 0.7 }, full: { intensity: 1 } },
    ...(fin ? { out: fin.out } : {}),
  });
  return { patch, parts };
}
