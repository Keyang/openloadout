// Effect behaviours added by migration batch E2 (docs/data-sprites.md section 9, the effect batches; 2.5c; family "fx"):
// what the library effects redrawn as data needed that the B12 and B12c behaviours did not draw. Each RETURNS PRIMITIVES
// (stamps keyed to the paints its call names), and this module gathers its stamp bounds, size keys and frame-pixel
// reasons for engine/gen/index.js in one place.
//   fall.field@2   fall.field@1 (engine/gen/fx-fields.js) priced by its pieces, streaks up to 12 px, a head and a
//                  tail paint per piece: the far and near rain of sprites/rainfall.json, the snow of snowfall.json
//   effect.<name>@1  one library effect whose drawing was its own code (layouts worked out from several settings at
//                  once, marks placed so they never touch, shapes drawn cell by cell), ported whole as M9 ported the
//                  interface pictures (engine/gen/port-sprite.js): the code sprite's render, word for word, runs on a
//                  paint-ref grid (engine/gen/ports/e2/fx-<id>.js, with E2 copies of the engine helpers it calls), its
//                  arguments the old settings, its colours the paint refs the data file names, so the data file keeps
//                  every control, clip and colour and draws what the code drew, pixel for pixel
// Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, flag, word, paint, paints, stampPixels } from './args.js';
import { hash } from '../motion.js';
import { boxIn, emptyBox, gridOf, isNone, areaOf, charge } from './fx-common.js';
import { WEATHER_PIECES, fallLattice, fallAt, pieceCells } from './fx-fields.js';
import { portGenerator } from './port-sprite.js';
import { render as ashFallRender } from './ports/e2/fx-ash-fall.js';
import { render as petalFallRender } from './ports/e2/fx-petal-fall.js';
import { render as zapCrackleRender } from './ports/e2/fx-zap-crackle.js';
import { render as windGustRender } from './ports/e2/fx-wind-gust.js';
import { render as sunRaysRender } from './ports/e2/fx-sun-rays.js';
import { render as splashBurstRender } from './ports/e2/fx-splash-burst.js';
import { render as rainRipplesRender } from './ports/e2/fx-rain-ripples.js';
import { render as leafBurstRender } from './ports/e2/fx-leaf-burst.js';
import { render as smokePlumeRender } from './ports/e2/fx-smoke-plume.js';
import { render as poisonHazeRender } from './ports/e2/fx-poison-haze.js';
import { render as flamesRender } from './ports/e2/fx-flames.js';
import { render as fireworkRender } from './ports/e2/fx-firework.js';
import { render as firefliesRender } from './ports/e2/fx-fireflies.js';
import { render as fallingLeavesRender } from './ports/e2/fx-falling-leaves.js';
import { render as emberDriftRender } from './ports/e2/fx-ember-drift.js';
import { render as dodgeTrailRender } from './ports/e2/fx-dodge-trail.js';
import { render as dizzyRingRender } from './ports/e2/fx-dizzy-ring.js';
import { render as debrisBurstRender } from './ports/e2/fx-debris-burst.js';
import { render as confettiRender } from './ports/e2/fx-confetti.js';
import { render as caveDripRender } from './ports/e2/fx-cave-drip.js';
import { render as bubbleStreamRender } from './ports/e2/fx-bubble-stream.js';
import { render as pickupSparkleRender } from './ports/e2/fx-pickup-sparkle.js';
import { render as enemyPoofRender } from './ports/e2/fx-enemy-poof.js';

// ---- fall.field@2 --------------------------------------------------------------------------------------------------

const SLANTS = Object.freeze({ none: 0, left: -1, right: 1 });
const mod = (v, m) => ((v % m) + m) % m;
const KEY_CHARS = 'abcdefghijklmnopqrstuvwxyz';
/** The work of one weather piece at most (fall.field@1's): a leaf tests 49 cells up to fifteen times. */
const PIECE_WORK = 800;

/** The biggest box one piece of a shape can fill (engine/gen/fx-fields.js pieceCells), so the pixels of its stamps: a leaf or petal tests 7 x 7 cells, a slanting streak is as wide as long. */
export function pieceMost(shape, size, straight) {
  switch (shape) {
    case 'dot': return 4;
    case 'streak': { const n = Math.max(1, Math.round(size)); return straight ? n : n * n; }
    case 'grain': return 6;
    case 'flake': return 25;
    case 'leaf': case 'petal': return 49;
    case 'seed': return 25;
    default: return 9;   // ash
  }
}

/** Is cell [x, y] of a piece one of its tips: a streak's far end, a big flake's four diagonal ends. */
function isTip(shape, cells, k, x, y) {
  if (shape === 'streak') return cells.length > 1 && k === cells.length - 1;
  if (shape === 'flake') return cells.length === 13 && Math.abs(x) === 2 && Math.abs(y) === 2;
  return false;
}

/**
 * fall.field@2: fall.field@1's wrapping field of falling pieces (rain, snow, leaves, petals, ash, blowing sand), drawn
 * the same when `head` and `tail` are clear, with three changes: a piece's middle (a streak's leading pixel, a flake's
 * centre, a dot's first pixel) is painted `head` and its tips (a streak's trailing pixel, a big flake's four diagonal
 * ends) `tail`, when given; streaks reach 12 px; and its stamp bound counts the pieces (columns x rows x the most a
 * piece covers) instead of the whole square, so a weather sprite can lay a far and a near field in one frame.
 */
export const fallField2 = defineGenerator({
  id: 'fall.field', v: 2, family: 'fx',
  about: 'A field of falling rain, snow, leaves, petals, ash or sand that wraps round a square, each piece with a bright head and dark tips if wanted.',
  args: {
    at: point({ about: 'The top-left corner of the square the field wraps round (1, 1 inside a frame\'s border)' }),
    period: px(2, 640, { default: 62, about: 'The side of that square: copies laid this far apart join' }),
    cols: count(1, 32, { default: 8, about: 'How many columns of pieces' }),
    rows: count(1, 16, { default: 2, about: 'Pieces in each column' }),
    laps: count(1, 8, { default: 1, about: 'Row gaps each piece falls per loop: faster' }),
    slant: word(['none', 'left', 'right'], { default: 'none', about: 'Drift a pixel sideways per pixel of fall (none: straight)' }),
    sway: px(0, 16, { default: 0, about: 'Pixels a piece sways side to side' }),
    swayCycles: count(0, 8, { default: 1, about: 'Sways per period of fall' }),
    turns: count(1, 8, { default: 1, about: 'Flips of a leaf, petal or ash fleck per row gap' }),
    axis: word(['down', 'right'], { default: 'down', about: 'The way they fall: down, or right for a stream blowing sideways' }),
    shape: word(WEATHER_PIECES, { default: 'dot', about: 'Dot, streak, flake, leaf, petal, seed, ash or grain' }),
    size: px(0, 12, { default: 2, about: 'A piece\'s size: dot 1-2, streak length up to 12, flake 1-3, leaf 3-5, petal 2-4, ash 2-3, grain 2-6' }),
    alt: word(['none', ...WEATHER_PIECES], { default: 'none', about: 'Every other column\'s shape (none: all `shape`)' }),
    altSize: px(0, 6, { default: 2, about: 'The size of the other columns\' pieces' }),
    paints: paints(8, { about: 'The pieces\' colours, by column in turn' }),
    rim: paint({ default: 'clear', about: 'The edge of a leaf or petal and a seed\'s tuft (clear: a tone darker than the piece)' }),
    core: paint({ default: 'clear', about: 'The glowing middle of an ash fleck while it faces up (clear: none)' }),
    coreEvery: count(0, 8, { default: 0, about: 'Light the core of every n-th column (0: none)' }),
    head: paint({ default: 'clear', about: 'A piece\'s middle: a streak\'s leading pixel, a flake\'s centre (clear: the piece\'s own paint)' }),
    tail: paint({ default: 'clear', about: 'A piece\'s tips: a streak\'s trailing pixel, a big flake\'s four diagonal ends (clear: the piece\'s own paint)' }),
    seed: seed({ default: 0, about: 'Where the columns stand' }),
    shift: point({ lo: -64, hi: 64, default: [0, 0], about: 'Moves the whole field by whole pixels [dx, dy], so two fields do not line up' }),
  },
  keyable: ['sway'],
  // its square: the work of every piece and the scans of its grid (fall.field@1's, which counts its tiles), and a stamp
  // for each of the four parts the square's wrap can cut a piece into (more than that and it gives the square's tiles)
  cost: (a) => { const s = a.period + 1; return Math.max(4 * a.cols * a.rows, charge(s, s, a.cols * a.rows * PIECE_WORK + 3 * areaOf(s, s))); },
  run(a, ctx) {
    const [W, H] = ctx.size, period = a.period, [ox, oy] = a.at;
    const S = boxIn([0, 0, W, H], ox, oy, ox + period + 1, oy + period + 1);
    if (emptyBox(S)) return [];
    const slant = SLANTS[a.slant], axis = a.axis === 'right' ? 'x' : 'y';
    const list = a.alt === 'none' ? [a.shape] : [a.shape, { shape: a.alt, size: a.altSize }];
    const sx = Math.round(a.shift[0]), sy = Math.round(a.shift[1]);
    const moveAngle = axis === 'x' ? Math.atan2(1, slant) : Math.atan2(slant, 1);
    const lattice = fallLattice(a.cols, a.rows, period, a.seed);
    const opts = { rows: a.rows, period, laps: a.laps, slant, sway: a.sway, swayCycles: a.swayCycles, turns: a.turns, axis };
    const rim = isNone(a.rim) ? undefined : a.rim, core = isNone(a.core) ? undefined : a.core;
    const head = isNone(a.head) ? null : a.head, tail = isNone(a.tail) ? null : a.tail;
    const out = [];
    for (let i = 0; i < a.cols; i++) {
      const entry = list[i % list.length];
      const name = typeof entry === 'string' ? entry : entry.shape;
      const pSize = typeof entry === 'object' ? entry.size : a.size;
      const colour = a.paints[i % a.paints.length];
      const lean = name === 'leaf' || name === 'petal' ? moveAngle + Math.PI / 2 + (hash(i, a.seed * 31 + 5) - 0.5) * 1.2
        : name === 'grain' ? (axis === 'x' ? Math.PI / 2 : 0) : moveAngle;
      const lit = a.coreEvery > 0 && i % a.coreEvery === 0 ? core : undefined;
      const here = lattice.filter((p) => p.col === i).map((p) => fallAt(p, ctx.t, opts)).sort((p, q) => (axis === 'x' ? p.x - q.x : p.y - q.y));
      for (const at of here) {
        const ax = Math.floor(at.x), ay = Math.floor(at.y);
        const cells = pieceCells(name, { size: pSize, colour, rim, core: lit, angle: lean, turn: at.turn });
        // one stamp a piece, or one for each part of it the square's wrap puts elsewhere: its pixels, never its square
        const parts = new Map();
        cells.forEach(([dx, dy, c], k) => {
          const rx = ax + dx + sx, ry = ay + dy + sy, x = ox + mod(rx, period), y = oy + mod(ry, period);
          if (x < S[0] || y < S[1] || x >= S[2] || y >= S[3]) return;
          const part = `${Math.floor(rx / period)},${Math.floor(ry / period)}`;
          if (!parts.has(part)) parts.set(part, []);
          parts.get(part).push([x, y, head && dx === 0 && dy === 0 ? head : tail && isTip(name, cells, k, dx, dy) ? tail : c]);
        });
        for (const px of parts.values()) out.push(px);
      }
    }
    // a stamp a piece, unless the pieces' boxes would hold more than the square itself (a crowded or tiny square): then
    // the whole square's pixels, in fall.field@1's tiles; either way the same pixels, later pieces over earlier ones
    const stamps = out.map(stampOf), pieces = a.cols * a.rows;
    if (stamps.length <= 4 * pieces && stampPixels(stamps) <= (S[2] - S[0]) * (S[3] - S[1])) return stamps;
    const g = gridOf(S);
    for (const px of out) for (const [x, y, c] of px) g.set(x, y, c);
    return g.stamps();
  },
});

/** One stamp holding the pixels [[x, y, paint]] (a later one over an earlier at the same place), at its box's top left. */
function stampOf(px) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of px) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const grid = Array.from({ length: y1 - y0 + 1 }, () => Array(x1 - x0 + 1).fill('.'));
  const chars = new Map(), key = {};
  for (const [x, y, c] of px) {
    const id = typeof c === 'string' ? c : JSON.stringify(c);
    if (!chars.has(id)) { const ch = KEY_CHARS[chars.size]; chars.set(id, ch); key[ch] = c; }
    grid[y - y0][x - x0] = chars.get(id);
  }
  return { kind: 'stamp', at: [x0, y0], anchor: 'tl', rows: grid.map((r) => r.join('')), key };
}

// ---- effect ports ---------------------------------------------------------------------------------------------------

/** The stamp bound of every effect port: its old frame's area, as the tiles of its grid can hold no more. */
const EFFECT_BOUNDS = {};

/**
 * Declares an effect port (see the head of this file): portGenerator (engine/gen/port-sprite.js) with family fx and
 * version 1, drawing `render` (the ported code sprite's render) on a grid of the old frame `size`, `origin` the point
 * `at` names, `states` its clips; its stamp bound is the frame's area; `names` maps an argument to the old setting it
 * stands for, where a call field holds the old name; `units` the measured work of its heaviest call in cost units of about
 * 0.01 ms (1.5 times what it took: tests/unit/gen-e2-safety.test.mjs holds it to its cost; review E2 round 1, issue 3).
 * Returns the frozen registry entry.
 */
function effectPort({ id, size, origin, states, about, args, render, work, units, names = {} }) {
  if (!(Number.isInteger(units) && units > 0)) throw new Error(`${id}: an effect port needs its measured units (tests/unit/gen-e2-safety.test.mjs)`);
  EFFECT_BOUNDS[`${id}@1`] = () => size[0] * size[1];
  // an old setting whose name a call field holds (glow) is an argument of another name: `names` maps it back
  const settings = (p) => { const out = { ...p }; for (const [arg, old] of Object.entries(names)) { out[old] = p[arg]; delete out[arg]; } return out; };
  return portGenerator({ id, v: 1, family: 'fx', about, size, origin, states, args, units, ...(work ? { work } : {}),
    draw: (g, { clip, t, frame, frames, loop, p }) => render(g, { clip, t, frame, frames, loop, p: settings(p) }) });
}

// ---- effect.enemy-poof@1 (sprites/enemy-poof.json) -------------------------------------------------------------------------

/** effect.enemy-poof@1: A defeated enemy's poof: a white ball that boils into puffs breaking up on a ring, then stars or skulls drifting up, or a last cloud. Port of sprites/enemy-poof.js (engine/gen/ports/e2/fx-enemy-poof.js), pixel for pixel. */
export const enemyPoofEffect = effectPort({
  id: 'effect.enemy-poof', units: 50, size: [48,48], origin: [24,24], states: {"burst":{"frames":8,"loop":false}},
  about: "A defeated enemy's poof: a white ball that boils into puffs breaking up on a ring, then stars or skulls drifting up, or a last cloud.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(4, 8, { default: 6, about: "Pieces: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["cloud","stars","skulls"], { default: "stars", about: "Style" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: enemyPoofRender,
});

// ---- effect.pickup-sparkle@1 (sprites/pickup-sparkle.json) -----------------------------------------------------------------

/** effect.pickup-sparkle@1: The sparkle a collected pickup leaves: a flash, then a ring of plus, diamond or dot marks that spreads and drifts up; or a looping shimmer of marks round the item. Port of sprites/pickup-sparkle.js (engine/gen/ports/e2/fx-pickup-sparkle.js), pixel for pixel. */
export const pickupSparkleEffect = effectPort({
  id: 'effect.pickup-sparkle', units: 30, size: [32,32], origin: [16,16], states: {"burst":{"frames":8,"loop":false},"loop":{"frames":8}},
  about: "The sparkle a collected pickup leaves: a flash, then a ring of plus, diamond or dot marks that spreads and drifts up; or a looping shimmer of marks round the item.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(4, 8, { default: 6, about: "Pieces: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["plus","diamond","dot"], { default: "plus", about: "Style" }),
    rise: share({ default: 0.5, about: "Rise: Low to High" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: pickupSparkleRender,
});

// ---- effect.bubble-stream@1 (sprites/bubble-stream.json) -------------------------------------------------------------------

/** effect.bubble-stream@1: Bubbles rising in a stream from the bottom of the frame, growing as they climb, kept from touching, and popping at the top: fizz, big bubbles or a mix. Port of sprites/bubble-stream.js (engine/gen/ports/e2/fx-bubble-stream.js), pixel for pixel. */
export const bubbleStreamEffect = effectPort({
  id: 'effect.bubble-stream', units: 30, size: [64,64], origin: [32,62], states: {"loop":{"frames":8}},
  about: "Bubbles rising in a stream from the bottom of the frame, growing as they climb, kept from touching, and popping at the top: fizz, big bubbles or a mix.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(4, 12, { default: 7, about: "Pieces: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    rise: share({ default: 0.5, about: "Rise: Low to High" }),
    style: word(["fizz","big","mixed"], { default: "mixed", about: "Style" }),
    body: paint({ about: "Bubbles" }),
    core: paint({ about: "Shine" }),
    wobble: share({ default: 0.5, about: "Wobble: Firm to Wobbly" }),
  },
  render: bubbleStreamRender,
});

// ---- effect.cave-drip@1 (sprites/cave-drip.json) ---------------------------------------------------------------------------

/** effect.cave-drip@1: Water dripping from a cave ceiling: a drop swells, stretches, falls and lands with a small splash, ring or puddle. Port of sprites/cave-drip.js (engine/gen/ports/e2/fx-cave-drip.js), pixel for pixel. */
export const caveDripEffect = effectPort({
  id: 'effect.cave-drip', units: 170, size: [64,64], origin: [32,62], states: {"loop":{"frames":8}},
  about: "Water dripping from a cave ceiling: a drop swells, stretches, falls and lands with a small splash, ring or puddle.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    fall: share({ default: 0.5, about: "Fall: Short to Long" }),
    pieces: count(1, 3, { default: 1, about: "Drips: Few to Many" }),
    style: word(["splash","ripple","puddle"], { default: "splash", about: "Style" }),
    body: paint({ about: "Water" }),
    core: paint({ about: "Foam" }),
  },
  render: caveDripRender,
});

// ---- effect.confetti@1 (sprites/confetti.json) -----------------------------------------------------------------------------

/** effect.confetti@1: A burst of confetti: a white pop, then paper, streamers or glitter thrown up and fluttering down. Port of sprites/confetti.js (engine/gen/ports/e2/fx-confetti.js), pixel for pixel. */
export const confettiEffect = effectPort({
  id: 'effect.confetti', units: 100, size: [64,64], origin: [32,32], states: {"burst":{"frames":12,"loop":false}},
  about: "A burst of confetti: a white pop, then paper, streamers or glitter thrown up and fluttering down.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(6, 18, { default: 12, about: "Pieces: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["paper","streamers","glitter"], { default: "paper", about: "Style" }),
    body: paint({ about: "Main colour" }),
    accent: paint({ about: "Accent colour" }),
    trim: paint({ about: "Trim colour" }),
  },
  render: confettiRender,
});

// ---- effect.debris-burst@1 (sprites/debris-burst.json) ---------------------------------------------------------------------

/** effect.debris-burst@1: What flies off a beaten enemy: metal scrap that tumbles and comes to rest, or goo that splashes and flattens. Port of sprites/debris-burst.js (engine/gen/ports/e2/fx-debris-burst.js), pixel for pixel. */
export const debrisBurstEffect = effectPort({
  id: 'effect.debris-burst', units: 1660, size: [48,48], origin: [24,24], states: {"burst":{"frames":8,"loop":false},"goo":{"frames":8,"loop":false}},
  about: "What flies off a beaten enemy: metal scrap that tumbles and comes to rest, or goo that splashes and flattens.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(3, 9, { default: 6, about: "Pieces: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["plates","shards","bolts"], { default: "plates", about: "Style" }),
    spin: flag({ default: true, about: "Tumble" }),
    body: paint({ about: "Scrap" }),
    accent: paint({ about: "Goo" }),
  },
  render: debrisBurstRender,
});

// ---- effect.dizzy-ring@1 (sprites/dizzy-ring.json) -------------------------------------------------------------------------

/** effect.dizzy-ring@1: A dazed status: little stars, pluses or dots running round a flattened ring over a stunned head. Port of sprites/dizzy-ring.js (engine/gen/ports/e2/fx-dizzy-ring.js), pixel for pixel. */
export const dizzyRingEffect = effectPort({
  id: 'effect.dizzy-ring', units: 30, size: [32,32], origin: [16,16], states: {"loop":{"frames":8}},
  about: "A dazed status: little stars, pluses or dots running round a flattened ring over a stunned head.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(2, 5, { default: 3, about: "Marks: Few to Many" }),
    style: word(["stars","pluses","dots"], { default: "stars", about: "Style" }),
    depth: share({ default: 0.75, about: "Ring depth: Flat to Round" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: dizzyRingRender,
});

// ---- effect.dodge-trail@1 (sprites/dodge-trail.json) -----------------------------------------------------------------------

/** effect.dodge-trail@1: The fading blurs and speed lines a dodge to the right leaves behind. Port of sprites/dodge-trail.js (engine/gen/ports/e2/fx-dodge-trail.js), pixel for pixel. */
export const dodgeTrailEffect = effectPort({
  id: 'effect.dodge-trail', units: 170, size: [48,48], origin: [24,24], states: {"burst":{"frames":6,"loop":false}},
  about: "The fading blurs and speed lines a dodge to the right leaves behind.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    length: share({ default: 0.5, about: "Length: Short to Long" }),
    pieces: count(2, 6, { default: 4, about: "Streaks: Few to Many" }),
    style: word(["streaks","ghosts","sparks"], { default: "streaks", about: "Style" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: dodgeTrailRender,
});

// ---- effect.ember-drift@1 (sprites/ember-drift.json) -----------------------------------------------------------------------

/** effect.ember-drift@1: Glowing embers, ash or sparks rising and swaying over heat, cooling to dark dots before they vanish. Port of sprites/ember-drift.js (engine/gen/ports/e2/fx-ember-drift.js), pixel for pixel. */
export const emberDriftEffect = effectPort({
  id: 'effect.ember-drift', units: 40, size: [64,64], origin: [32,62], states: {"loop":{"frames":8}},
  about: "Glowing embers, ash or sparks rising and swaying over heat, cooling to dark dots before they vanish.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(4, 14, { default: 8, about: "Pieces: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    rise: share({ default: 0.5, about: "Rise: Low to High" }),
    style: word(["embers","ash","sparks"], { default: "embers", about: "Style" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Embers" }),
  },
  render: emberDriftRender,
});

// ---- effect.falling-leaves@1 (sprites/falling-leaves.json) -----------------------------------------------------------------

/** effect.falling-leaves@1: Leaves in two colours turning over as they fall and sway through the whole frame, drifting, fluttering or blown slantwise; the field wraps so copies join. Port of sprites/falling-leaves.js (engine/gen/ports/e2/fx-falling-leaves.js), pixel for pixel. */
export const fallingLeavesEffect = effectPort({
  id: 'effect.falling-leaves', units: 50, size: [64,64], origin: [32,32], states: {"loop":{"frames":8}},
  about: "Leaves in two colours turning over as they fall and sway through the whole frame, drifting, fluttering or blown slantwise; the field wraps so copies join.",
  args: {
    pieces: count(3, 9, { default: 5, about: "Leaves: Few to Many" }),
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    style: word(["drift","flutter","gust"], { default: "drift", about: "Style" }),
    sway: share({ default: 0.5, about: "Sway: Still to Swaying" }),
    body: paint({ about: "Leaves" }),
    accent: paint({ about: "Second leaves" }),
  },
  render: fallingLeavesRender,
});

// ---- effect.fireflies@1 (sprites/fireflies.json) ---------------------------------------------------------------------------

/** effect.fireflies@1: Small lights drifting in the dark, each glowing, dimming and blinking on its own. Port of sprites/fireflies.js (engine/gen/ports/e2/fx-fireflies.js), pixel for pixel. */
export const firefliesEffect = effectPort({
  id: 'effect.fireflies', units: 20, size: [64,64], origin: [32,32], states: {"loop":{"frames":8}},
  about: "Small lights drifting in the dark, each glowing, dimming and blinking on its own.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(1, 9, { default: 5, about: "Lights: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["fireflies","wisps","specks"], { default: "fireflies", about: "Style" }),
    flicker: share({ default: 0.5, about: "Flicker: Steady to Wild" }),
    core: paint({ about: "Core" }),
    glowPaint: paint({ about: "Glow (the old setting glow: a call field holds that name)" }),
  },
  render: firefliesRender, names: { glowPaint: 'glow' },
});

// ---- effect.firework@1 (sprites/firework.json) -----------------------------------------------------------------------------

/** effect.firework@1: A firework bursting in a white flash and a bloom of sparks with an inner ring, alone or after its rocket rises. Port of sprites/firework.js (engine/gen/ports/e2/fx-firework.js), pixel for pixel. */
export const fireworkEffect = effectPort({
  id: 'effect.firework', units: 30, size: [64,64], origin: [32,32], states: {"burst":{"frames":12,"loop":false},"launch":{"frames":12,"loop":false}},
  about: "A firework bursting in a white flash and a bloom of sparks with an inner ring, alone or after its rocket rises.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(8, 20, { default: 14, about: "Sparks: Few to Many" }),
    style: word(["peony","ring","willow"], { default: "peony", about: "Style" }),
    trail: flag({ default: true, about: "Trail" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
    accent: paint({ about: "Inner sparks" }),
  },
  render: fireworkRender,
});

// ---- effect.flames@1 (sprites/flames.json) ---------------------------------------------------------------------------------

/** effect.flames@1: Fire with nothing under it, licking and flickering, that can be snuffed out and lit again. Port of sprites/flames.js (engine/gen/ports/e2/fx-flames.js), pixel for pixel. */
export const flamesEffect = effectPort({
  id: 'effect.flames', units: 180, size: [32,32], origin: [16,30], states: {"loop":{"frames":8},"out":{"frames":6,"loop":false},"ignite":{"frames":6,"loop":false}},
  about: "Fire with nothing under it, licking and flickering, that can be snuffed out and lit again.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    width: share({ default: 0.5, about: "Width: Narrow to Wide" }),
    pieces: count(1, 4, { default: 3, about: "Tongues: Few to Many" }),
    style: word(["torch","wild","magic"], { default: "torch", about: "Style" }),
    sparks: flag({ default: false, about: "Sparks" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Flame" }),
    flicker: share({ default: 0.5, about: "Flicker: Steady to Wild" }),
  },
  render: flamesRender,
});

// ---- effect.poison-haze@1 (sprites/poison-haze.json) -----------------------------------------------------------------------

/** effect.poison-haze@1: Poison hanging over a fighter or the ground: rising bubbles, a churning cloud or small skulls, and a puff of gas. Port of sprites/poison-haze.js (engine/gen/ports/e2/fx-poison-haze.js), pixel for pixel. */
export const poisonHazeEffect = effectPort({
  id: 'effect.poison-haze', units: 530, size: [48,48], origin: [24,46], states: {"loop":{"frames":8},"burst":{"frames":8,"loop":false}},
  about: "Poison hanging over a fighter or the ground: rising bubbles, a churning cloud or small skulls, and a puff of gas.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(3, 8, { default: 5, about: "Pieces: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    rise: share({ default: 0.5, about: "Rise: Low to High" }),
    style: word(["bubbles","cloud","skulls"], { default: "bubbles", about: "Style" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Poison" }),
  },
  render: poisonHazeRender,
});

// ---- effect.smoke-plume@1 (sprites/smoke-plume.json) -----------------------------------------------------------------------

/** effect.smoke-plume@1: A column of smoke, steam or soot rising and drifting from one point, which can die down. Port of sprites/smoke-plume.js (engine/gen/ports/e2/fx-smoke-plume.js), pixel for pixel. */
export const smokePlumeEffect = effectPort({
  id: 'effect.smoke-plume', units: 180, size: [48,48], origin: [24,46], states: {"loop":{"frames":8},"fade":{"frames":8,"loop":false}},
  about: "A column of smoke, steam or soot rising and drifting from one point, which can die down.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(3, 8, { default: 5, about: "Puffs: Few to Many" }),
    drift: share({ default: 0.5, about: "Drift: Still to Windy" }),
    style: word(["smoke","steam","soot"], { default: "smoke", about: "Style" }),
    core: paint({ about: "Light smoke" }),
    edge: paint({ about: "Dark smoke" }),
  },
  render: smokePlumeRender,
});

// ---- effect.leaf-burst@1 (sprites/leaf-burst.json) -------------------------------------------------------------------------

/** effect.leaf-burst@1: Leaves flying from a cut bush or a shaken tree and settling on the ground, as a burst or a shower. Port of sprites/leaf-burst.js (engine/gen/ports/e2/fx-leaf-burst.js), pixel for pixel. */
export const leafBurstEffect = effectPort({
  id: 'effect.leaf-burst', units: 80, size: [48,48], origin: [24,46], states: {"burst":{"frames":12,"loop":false}},
  about: "Leaves flying from a cut bush or a shaken tree and settling on the ground, as a burst or a shower.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(4, 12, { default: 8, about: "Leaves: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["burst","shower"], { default: "burst", about: "Style" }),
    body: paint({ about: "Leaves" }),
    accent: paint({ about: "Sunlit leaves" }),
  },
  render: leafBurstRender,
});

// ---- effect.rain-ripples@1 (sprites/rain-ripples.json) ---------------------------------------------------------------------

/** effect.rain-ripples@1: Raindrops striking water seen from above: each opens a flat ring that breaks into arcs, or splashes, or both. Port of sprites/rain-ripples.js (engine/gen/ports/e2/fx-rain-ripples.js), pixel for pixel. */
export const rainRipplesEffect = effectPort({
  id: 'effect.rain-ripples', units: 40, size: [64,64], origin: [32,32], states: {"loop":{"frames":8}},
  about: "Raindrops striking water seen from above: each opens a flat ring that breaks into arcs, or splashes, or both.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(3, 10, { default: 5, about: "Drops: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["rings","splashes","both"], { default: "rings", about: "Style" }),
    core: paint({ about: "Foam" }),
    edge: paint({ about: "Water" }),
  },
  render: rainRipplesRender,
});

// ---- effect.splash-burst@1 (sprites/splash-burst.json) ---------------------------------------------------------------------

/** effect.splash-burst@1: Something falling into water, seen from the side: a crown or jet of water whose drops arc out and fall back while a ring spreads along the surface. Port of sprites/splash-burst.js (engine/gen/ports/e2/fx-splash-burst.js), pixel for pixel. */
export const splashBurstEffect = effectPort({
  id: 'effect.splash-burst', units: 60, size: [48,48], origin: [24,46], states: {"burst":{"frames":8,"loop":false}},
  about: "Something falling into water, seen from the side: a crown or jet of water whose drops arc out and fall back while a ring spreads along the surface.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(3, 10, { default: 6, about: "Drops: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["crown","column","ripple"], { default: "crown", about: "Style" }),
    core: paint({ about: "Foam" }),
    edge: paint({ about: "Water" }),
  },
  render: splashBurstRender,
});

// ---- effect.sun-rays@1 (sprites/sun-rays.json) -----------------------------------------------------------------------------

/** effect.sun-rays@1: Shafts of light falling through a gap, with dashes running down them or a slow swell, and dust glinting in the light. Port of sprites/sun-rays.js (engine/gen/ports/e2/fx-sun-rays.js), pixel for pixel. */
export const sunRaysEffect = effectPort({
  id: 'effect.sun-rays', units: 40, size: [64,64], origin: [32,32], states: {"loop":{"frames":8}},
  about: "Shafts of light falling through a gap, with dashes running down them or a slow swell, and dust glinting in the light.",
  args: {
    pieces: count(1, 7, { default: 4, about: "Rays: Few to Many" }),
    length: share({ default: 0.5, about: "Length: Short to Long" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    slant: share({ default: 0.5, about: "Slant: Straight down to Slanted" }),
    style: word(["dashed","solid"], { default: "dashed", about: "Style" }),
    motes: flag({ default: false, about: "Dust" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Light" }),
  },
  render: sunRaysRender,
});

// ---- effect.wind-gust@1 (sprites/wind-gust.json) ---------------------------------------------------------------------------

/** effect.wind-gust@1: Wind blowing to the right: thin streaks of different lengths slide across and fade, with dust or glints carried along. Port of sprites/wind-gust.js (engine/gen/ports/e2/fx-wind-gust.js), pixel for pixel. */
export const windGustEffect = effectPort({
  id: 'effect.wind-gust', units: 40, size: [64,64], origin: [32,32], states: {"loop":{"frames":8}},
  about: "Wind blowing to the right: thin streaks of different lengths slide across and fade, with dust or glints carried along.",
  args: {
    pieces: count(3, 10, { default: 6, about: "Streaks: Few to Many" }),
    length: share({ default: 0.5, about: "Length: Short to Long" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["lines","dust","glints"], { default: "lines", about: "Style" }),
    core: paint({ about: "Streaks" }),
    accent: paint({ about: "Dust" }),
  },
  render: windGustRender,
});

// ---- effect.zap-crackle@1 (sprites/zap-crackle.json) -----------------------------------------------------------------------

/** effect.zap-crackle@1: Electricity crackling over something shocked, or one bright zap with a ring of sparks. Port of sprites/zap-crackle.js (engine/gen/ports/e2/fx-zap-crackle.js), pixel for pixel. */
export const zapCrackleEffect = effectPort({
  id: 'effect.zap-crackle', units: 150, size: [32,32], origin: [16,16], states: {"loop":{"frames":8},"burst":{"frames":6,"loop":false}},
  about: "Electricity crackling over something shocked, or one bright zap with a ring of sparks.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(2, 5, { default: 3, about: "Arcs: Few to Many" }),
    style: word(["arcs","sparks","ring"], { default: "arcs", about: "Style" }),
    forks: flag({ default: false, about: "Forks" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Light" }),
    flicker: share({ default: 0.5, about: "Flicker: Steady to Wild" }),
  },
  render: zapCrackleRender,
});

// ---- effect.petal-fall@1 (sprites/petal-fall.json) -------------------------------------------------------------------------

/** effect.petal-fall@1: Petals drifting and spinning down over a square that wraps: blossom teardrops that darken as they turn, two-tone rose petals or fluffy seeds. Port of sprites/petal-fall.js (engine/gen/ports/e2/fx-petal-fall.js), pixel for pixel. */
export const petalFallEffect = effectPort({
  id: 'effect.petal-fall', units: 50, size: [64,64], origin: [32,32], states: {"loop":{"frames":8}},
  about: "Petals drifting and spinning down over a square that wraps: blossom teardrops that darken as they turn, two-tone rose petals or fluffy seeds.",
  args: {
    pieces: count(4, 12, { default: 8, about: "Petals: Few to Many" }),
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    style: word(["blossom","rose","seeds"], { default: "blossom", about: "Style" }),
    sway: share({ default: 0.5, about: "Sway: Still to Swaying" }),
    body: paint({ about: "Petals" }),
    accent: paint({ about: "Second petals" }),
  },
  render: petalFallRender,
});

// ---- effect.ash-fall@1 (sprites/ash-fall.json) -----------------------------------------------------------------------------

/** effect.ash-fall@1: Ash tumbling down over a square that wraps: grey flecks, glowing cinders that blink as they tumble, or fine soot. Port of sprites/ash-fall.js (engine/gen/ports/e2/fx-ash-fall.js), pixel for pixel. */
export const ashFallEffect = effectPort({
  id: 'effect.ash-fall', units: 50, size: [64,64], origin: [32,32], states: {"loop":{"frames":8}},
  about: "Ash tumbling down over a square that wraps: grey flecks, glowing cinders that blink as they tumble, or fine soot.",
  args: {
    pieces: count(4, 12, { default: 8, about: "Flakes: Few to Many" }),
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    style: word(["ash","cinders","soot"], { default: "ash", about: "Style" }),
    sway: share({ default: 0.5, about: "Sway: Still to Swaying" }),
    body: paint({ about: "Ash" }),
    glowPaint: paint({ about: "Embers (the old setting glow: a call field holds that name)" }),
  },
  render: ashFallRender, names: { glowPaint: 'glow' },
});

// ---- stamp bounds, size keys, frame pixels --------------------------------------------------------------------------

/** The most stamp pixels each behaviour of this file can return in a frame of `size`: "<id>@<v>" -> (args, size) -> pixels (engine/gen/index.js STAMP_BOUNDS). */
export const E2_STAMP_BOUNDS = Object.freeze({
  ...EFFECT_BOUNDS,
  // every piece of every column at the most its shape covers, cut to its square and to the frame
  // (more than the square holds and it gives the square's own tiles, as fall.field@1 does)
  'fall.field@2': (a, size) => Math.min(Array.isArray(size) ? size[0] * size[1] : 640 * 360, areaOf(a.period + 1, a.period + 1),
    // a square narrower than a piece can cut it into more than four parts, so it is priced as its square
    a.period < 13 ? Infinity : a.cols * a.rows * Math.max(pieceMost(a.shape, a.size, a.slant === 'none'), a.alt === 'none' ? 0 : pieceMost(a.alt, a.altSize, a.slant === 'none'))),
});

/** The keyable arguments of each behaviour of this file that its cost or stamp bound reads (engine/gen/index.js SIZE_KEYS). */
export const E2_SIZE_KEYS = Object.freeze({
  ...Object.fromEntries(Object.keys(EFFECT_BOUNDS).map((k) => [k, Object.freeze([])])),   // an effect port keys nothing
  'fall.field@2': Object.freeze([]),
});

/** Why each behaviour of this file works in frame pixels (engine/gen/index.js FRAME_GENERATORS). */
export const E2_FRAME_GENERATORS = Object.freeze({
  'fall.field@2': 'a field that wraps round a square of the frame, clipped to the frame: name it as an emitter, not in a draw list on a node',
});
