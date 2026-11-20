// Creature generators of migration batch C2 (family "creature"; docs/data-sprites.md section 7): the six bugs and
// beasts whose drawing lived in five code rigs (rigs/hive-bug.js, rigs/creature-topdown.js, rigs/crawler.js,
// rigs/brood-queen.js, rigs/quadruped.js) and the engine helpers they share (engine/creature.js, engine/fx.js,
// engine/hive.js, engine/beast.js, engine/plating.js, engine/shapes.js, engine/rock.js). Each is a port generator
// (engine/gen/port-sprite.js, as migration batches M9, E1 and E2 ported theirs): the code sprite's drawing runs word for
// word on a paint-ref grid the size of its old frame, its arguments the old settings and its colours the paint refs the
// data file names, so sprites/<id>.json draws what sprites/<id>.js drew, pixel for pixel
// (tests/fixtures/redraw-pixels-c2/<id>.json).
//
// THE SHARED DRAWING IS PORTED ONCE. Every rig and helper has one copy in engine/gen/ports/c2/ (the rigs) or in E2's
// engine/gen/ports/e2/ (creature.js, fx.js, plating.js, shapes.js, palettes.js, which E2 copied first and C2 imports,
// never copies again) or C1's engine/gen/ports/c1/rock.js (engine/rock.js, the wyrm's seams); the six small files ports/c2/<sprite>.js hold only what each code sprite drew itself (the
// spitter's sac and mouth, the thorn beetle's shell and thorns; the other four only pick the rig's options). So
// bug.crawler@1 and bug.mite@1 draw through one hive bug rig, which draws its legs and burrow through the one top-down
// creature rig that bug.spitter@1 stands on too.
//
// ONE CALL A SPRITE. Every clip of a creature is drawn by the same call: its `picture` argument is `clip` (the default),
// the clip being drawn (ctx.clip, as the pictures layout gives it), or one picture named (a word may not hold "_", so
// the top-down clip walk_side is the picture walk-side). A port's cost charges its whole old drawing, and the validator
// prices every call a body writes as if all drew in one frame, so a call per clip (as E2's emitters are) would price a
// boss at seven times what one frame takes. A ctx.clip that is not one of its clips draws its first picture.
//
// What a port cannot be: a bone rig the studio can take apart (its body is opaque: one generator call). Its attach points
// are what the code's sockets() gave (CREATURE_POINTS below) for the clip, frame and settings: a pictures body's points
// sit on its nodes, so each port that had points has a motion, <port>.points@1 (pointsMotion below, as creature batch
// C1's creature.<id>.points@1), which moves one empty node per socket there each frame; the data file names it in
// body.pictures.motion, bound to the same controls, and puts each point on the node of its name.
// The Motion sliders (Bounce, Stride) stay what they were: settings the old drawing reads, so arguments here, bound to
// the same controls, and the motion they scale is the code's exactly (a clip `travel` scales key poses, and a port has none).
// Pure: no randomness, no clock, no DOM; Node and browser.
import { defineGenerator } from './registry.js';
import { point, share, px, word, flag, paint, SHAPE_CAPS } from './args.js';
import { portPhase } from './port-sprite.js';
import { PortSurface, withPaintTable, portTiles, shiftTo } from './port-surface.js';
import { workCost } from './pixels.js';
import * as crawlerBug from './ports/c2/crawler-bug.js';
import * as swarmMite from './ports/c2/swarm-mite.js';
import * as spitterBug from './ports/c2/spitter-bug.js';
import * as thornBeetle from './ports/c2/thorn-beetle.js';
import * as hiveMother from './ports/c2/hive-mother.js';
import * as emberWyrm from './ports/c2/ember-wyrm.js';

/** A slider of the old sprite that runs past 0..1 (a part's Length or Span, 0.65 to 1.35): its own numbers. */
const factor = (about) => px(0.65, 1.35, { default: 1, about });
/** The old settings from the arguments: the glowing colour, `glow` in the code, is the argument `lit` (a call field is named glow). */
const old = (p) => (Object.hasOwn(p, 'lit') ? { ...p, glow: p.lit } : p);
/** The picture word of an old clip name (walk_side -> walk-side). */
const wordOf = (clip) => clip.replace(/_(down|up|side)$/, '-$1');
/** The old clip of a picture word (walk-side -> walk_side). */
const clipOf = (picture) => picture.replace(/-(down|up|side)$/, '_$1');

/** The stamp pixels a frame may hold (engine/gen/args.js SHAPE_CAPS.stampPixels: a stamp counts its whole block), the side of a big frame's stamps, and the most rects a big frame gives besides them. */
const STAMP_CAP = SHAPE_CAPS.stampPixels, BIG_TILE = 16, RUN_RECTS = 512;
const KEY_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** How many stamps a W x H grid gives at most: its 32 x 32 tiles, or for a frame bigger than the stamp cap its BIG_TILE tiles. */
const tilesOf = (W, H) => (W * H > STAMP_CAP ? Math.ceil(W / BIG_TILE) * Math.ceil(H / BIG_TILE) : portTiles(W, H));

/** A grid's painted pixels as stamps of at most T x T, each cut to the box of what its tile paints (anchor tl, moved by [dx, dy]): { stamps, area } (area: the stamp pixels they hold). */
function trimmedStamps(g, T, [dx, dy]) {
  const { data, w, h } = g, stamps = [];
  let area = 0;
  for (let ty = 0; ty < h; ty += T) for (let tx = 0; tx < w; tx += T) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = ty; y < Math.min(h, ty + T); y++) for (let x = tx; x < Math.min(w, tx + T); x++) if (data[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) continue;
    const chars = new Map(), key = {}, rows = [];
    for (let y = y0; y <= y1; y++) {
      let row = '';
      for (let x = x0; x <= x1; x++) {
        const c = data[y * w + x];
        if (!c) { row += '.'; continue; }
        let ch = chars.get(c);
        if (ch === undefined) { ch = KEY_CHARS[chars.size]; chars.set(c, ch); key[ch] = g.table.ref(c); }
        row += ch;
      }
      rows.push(row);
    }
    area += (x1 - x0 + 1) * (y1 - y0 + 1);
    stamps.push({ kind: 'stamp', at: [x0 + dx, y0 + dy], anchor: 'tl', rows, key });
  }
  return { stamps, area };
}

/**
 * A port's grid as primitives moved by [dx, dy]. A frame within the stamp cap: its stamps (engine/gen/port-surface.js
 * stamps(), 32 x 32 tiles). A bigger frame (the queen's 96 x 96, the wyrm's 128 x 96): stamps of BIG_TILE tiles each cut
 * to what it paints, and while they hold more stamp pixels than a frame may, its longest runs of one paint along a row
 * come out as one-row rects (at most RUN_RECTS, which hold no stamp pixels): the same pixels either way, as E1's
 * explosion-large gives the pixels round its box. No library look reached the rects in the C2 review's sweep of the
 * heaviest looks (at most 7,048 stamp pixels a frame); they are the net for one that would, and RUN_RECTS is charged for them.
 * Exported for tests/unit/gen-creature-c2.test.mjs, which forces them with a grid over the cap.
 */
export function gridPrimitives(g, [dx, dy]) {
  const { data, w, h } = g;
  if (w * h <= STAMP_CAP) return g.stamps([dx, dy]);
  let out = trimmedStamps(g, BIG_TILE, [dx, dy]);
  if (out.area <= STAMP_CAP) return out.stamps;
  const runs = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
    const c = data[y * w + x];
    if (!c) { x++; continue; }
    let e = x + 1;
    while (e < w && data[y * w + e] === c) e++;
    if (e - x >= 2) runs.push([e - x, y, x, c]);
    x = e;
  }
  // longest first; then top to bottom, left to right, so the choice is the same every time
  runs.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  const rest = g.blank(w, h), rects = [];
  rest.data.set(data);
  for (const [n, y, x, c] of runs) {
    if (rects.length >= RUN_RECTS) break;
    for (let i = 0; i < n; i++) rest.data[y * w + x + i] = 0;
    rects.push({ kind: 'rect', at: [x + dx, y + dy], size: [n, 1], paint: g.table.ref(c), shade: 0 });
    if (rects.length % 16 === 0) { out = trimmedStamps(rest, BIG_TILE, [dx, dy]); if (out.area <= STAMP_CAP) return [...out.stamps, ...rects]; }
  }
  return [...trimmedStamps(rest, BIG_TILE, [dx, dy]).stamps, ...rects];
}

const UNITS = {};
/** The measured units each creature port declares ("<id>@<v>" -> its heaviest call's time at 0.01 ms a unit, times 1.5): tests/unit/gen-c2-safety.test.mjs holds the time to them. */
export const CREATURE_UNITS = UNITS;

const POINTS = {};
/** The attach points of each creature generator (the code sprite's sockets()), "<id>@<v>" -> (args with defaults, ctx { clip, frame }) -> { id: { x, y, angle } } in the call's pixels, angle in radians: for a layout that hands a generator's points on (the pictures layout does not yet). */
export const CREATURE_POINTS = POINTS;

/**
 * Declares and registers one creature port: { id, v, about, size [W, H] (the old frame), origin [x, y] (the old frame's
 * point `at` names: its pivot), clips (the old clips in order, { name: { frames, loop } }), args (the old settings),
 * units (its heaviest call, measured: tests/unit/gen-c2-safety.test.mjs), draw (the old render(g, { clip, t, p })),
 * sockets (the old sockets(clip, t, p), optional) }. As engine/gen/port-sprite.js portGenerator, but the picture is the
 * clip being drawn unless the call names one (ONE CALL A SPRITE above).
 */
function creaturePort({ id, v = 1, about, size, origin, clips, args, units, draw, sockets }) {
  if (!(Number.isInteger(units) && units > 0)) throw new Error(`${id}: a creature port needs its measured units (tests/unit/gen-c2-safety.test.mjs)`);
  const [W, H] = size, names = Object.keys(clips), words = names.map(wordOf);
  // the clip a call draws, and its frame and phase as engine/sprite.js renderFrame gave them
  const at = (a, ctx) => {
    const name = a.picture !== 'clip' ? clipOf(a.picture) : Object.hasOwn(clips, ctx?.clip) ? ctx.clip : names[0];
    const st = clips[name], frames = st.frames, loop = st.loop !== false;
    const frame = Number.isInteger(ctx?.frame) ? Math.max(0, Math.min(frames - 1, ctx.frame)) : 0;
    return { clip: name, frame, t: portPhase(frame, frames, loop) };
  };
  UNITS[`${id}@${v}`] = units;
  const entry = defineGenerator({
    id, v, family: 'creature', about,
    args: {
      at: point({ about: `Where its ${W} x ${H} picture's pivot goes (the old frame's point ${origin[0]}, ${origin[1]})` }),
      picture: word(['clip', ...words], { default: 'clip', about: 'Which clip it draws: clip (the one being drawn), or one by name (walk-side is walk_side)' }),
      ...args,
    },
    // its stamps (one a 32 x 32 tile), the rects of a frame bigger than the stamp cap, and its shape tests or its measured work, whichever is more
    cost: () => tilesOf(W, H) + (W * H > STAMP_CAP ? RUN_RECTS : 0) + Math.max(workCost(W * H * 64), units),
    run(a, ctx) {
      const { clip, t } = at(a, ctx);
      return withPaintTable(() => {
        const g = new PortSurface(W, H);
        draw(g, { clip, t, p: old(a) });
        return gridPrimitives(g, shiftTo(a.at, origin[0], origin[1]));
      });
    },
  });
  if (sockets) {
    POINTS[`${id}@${v}`] = (a, ctx = {}) => {
      const { clip, t } = at(a, ctx), [dx, dy] = shiftTo(a.at, origin[0], origin[1]), out = {};
      for (const [k, q] of Object.entries(sockets(clip, t, old(a)) ?? {})) if (q && Number.isFinite(q.x) && Number.isFinite(q.y)) out[k] = { x: q.x + dx, y: q.y + dy, angle: Number.isFinite(q.angle) ? q.angle : 0 };
      return out;
    };
    SPECS[id] = { v, origin, args: entry.args };
  }
  return entry;
}

const SPECS = {};
/**
 * Declares the attach-point motion of a creature port, `<port id>.points` (family motion, version 1), as creature batch
 * C1 declares its own (engine/gen/creature-c1.js pointsMotion): a pictures body's points sit on its nodes, so each frame
 * this moves the empty node named after each socket (at [0, 0], no parent, in the data file) to where the code's
 * sockets() put it for this clip, frame and these settings (CREATURE_POINTS), and turns it so a point on it at angle 0
 * has the code's angle. Its arguments are the port's settings (not its colours), bound to the same controls, and `at`,
 * the point the port's call is drawn at (the sprite's pivot). Returns the frozen registry entry.
 */
function pointsMotion(id, about) {
  const spec = SPECS[id], points = POINTS[`${id}@${spec.v}`];
  const args = Object.fromEntries(Object.entries(spec.args).filter(([k, t]) => k !== 'at' && t.type !== 'paint'));
  return defineGenerator({
    id: `${id}.points`, v: 1, family: 'motion', about,
    args: { at: point({ default: [...spec.origin], about: `Where its port's call is drawn (the old frame's point ${spec.origin[0]}, ${spec.origin[1]}): the sprite's pivot` }), ...args },
    cost: () => 0,
    run(a, ctx) {
      // nodeFrame (engine/draw-list.js) turns v, a node's down, to [-sin, cos] of its turn, so a point at angle 0 on a
      // node turned by -angle (in degrees) has the rig angle `angle`
      return Object.entries(points(a, ctx ?? {})).slice(0, 16).map(([node, s]) => ({ node, move: [s.x, s.y], turn: -s.angle * 180 / Math.PI }));
    },
  });
}

// the old clips, in their order: { frames, loop }
const TOPDOWN_BUG = { idle_down: { frames: 8 }, walk_down: { frames: 8 }, walk_up: { frames: 8 }, walk_side: { frames: 8 },
  attack_down: { frames: 8, loop: false }, attack_up: { frames: 8, loop: false }, attack_side: { frames: 8, loop: false },
  hurt: { frames: 4, loop: false }, die: { frames: 8, loop: false } };

/** bug.crawler@1: A segmented six-legged hive bug seen from above, idle facing the camera, walking and biting in three directions, hurt and dying on its back. Port of sprites/crawler-bug.js on rigs/hive-bug.js (engine/gen/ports/c2/), pixel for pixel. */
export const crawlerBugPort = creaturePort({
  id: 'bug.crawler', v: 1, units: 217, size: [48, 48], origin: [24, 40], clips: TOPDOWN_BUG,
  about: 'A segmented six-legged hive bug seen from above: idle, walk and bite in three directions, hurt, die on its back.',
  args: {
    size: share({ default: 0.5, about: 'Size: Small to Big' }),
    legs: share({ default: 0.5, about: 'Legs: Short to Long' }),
    length: word(['short', 'medium', 'long'], { default: 'medium', about: 'How many body segments' }),
    spikes: flag({ default: false, about: 'Back spikes' }),
    horns: word(['pincers', 'tusks', 'none'], { default: 'pincers', about: 'What grows on its head' }),
    hornLength: factor('Horn length: 0.65 short to 1.35 long'),
    tail: word(['none', 'stinger', 'club'], { default: 'none', about: 'What it has behind' }),
    tailLength: factor('Tail length: 0.65 short to 1.35 long'),
    body: paint({ about: 'Shell' }),
    accent: paint({ about: 'Legs and underside' }),
    lit: paint({ about: 'The glowing colour (the code\'s glow): Eyes' }),
    bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy' }),
    stride: share({ default: 0.5, about: 'Stride: Small steps to Big steps' }),
  },
  draw: crawlerBug.render,
  sockets: crawlerBug.sockets,
});

/** bug.mite@1: A tiny hive bug for crowds, the same from every side: it idles, skitters, nips and pops. Port of sprites/swarm-mite.js on rigs/hive-bug.js (engine/gen/ports/c2/), pixel for pixel. */
export const swarmMitePort = creaturePort({
  id: 'bug.mite', v: 1, units: 145, size: [32, 32], origin: [16, 28],
  clips: { idle: { frames: 8 }, walk: { frames: 8 }, attack: { frames: 6, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 6, loop: false } },
  about: 'A tiny hive bug drawn for crowds, the same from every side: it idles, skitters, nips and pops.',
  args: {
    size: share({ default: 0.5, about: 'Size: Small to Big' }),
    legs: word(['four', 'six', 'eight'], { default: 'six', about: 'How many legs' }),
    shape: word(['round', 'long', 'spiky'], { default: 'round', about: 'Body shape' }),
    eyes: word(['one', 'two', 'many'], { default: 'two', about: 'How many eyes' }),
    body: paint({ about: 'Body' }),
    lit: paint({ about: 'The glowing colour (the code\'s glow): Eyes' }),
    bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy' }),
  },
  draw: swarmMite.render,
});

/** bug.spitter@1: A squat hive bug facing the camera with a glowing acid sac on its back: it breathes, spits, digs itself into the floor, is hurt and bursts. Port of sprites/spitter-bug.js on rigs/creature-topdown.js (engine/gen/ports/c2/), pixel for pixel. */
export const spitterBugPort = creaturePort({
  id: 'bug.spitter', v: 1, units: 261, size: [48, 48], origin: [24, 42],
  clips: { idle: { frames: 8 }, shoot: { frames: 8, loop: false }, burrow: { frames: 8, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 8, loop: false } },
  about: 'A squat hive bug with a glowing acid sac on its back: it breathes, spits, digs into the floor and bursts.',
  args: {
    size: share({ default: 0.5, about: 'Size: Small to Big' }),
    bulk: share({ default: 0.5, about: 'Sac: Small to Bloated' }),
    shape: word(['round', 'three-way', 'slit'], { default: 'round', about: 'Mouth' }),
    horns: word(['none', 'crest', 'spines'], { default: 'none', about: 'What stands on its head' }),
    hornLength: factor('Horn length: 0.65 short to 1.35 long'),
    body: paint({ about: 'Shell' }),
    accent: paint({ about: 'Sac' }),
    lit: paint({ about: 'The glowing colour (the code\'s glow): Acid' }),
    bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy (how much the sac pulses and the body breathes)' }),
  },
  draw: spitterBug.render,
  sockets: spitterBug.sockets,
});

/** bug.beetle@1: A low armoured beetle seen from the side on six short legs: a domed wing case with thorns, a horn, eyes and feelers; it walks, jabs, curls up, is hurt and dies on its back. Port of sprites/thorn-beetle.js on rigs/crawler.js (engine/gen/ports/c2/), pixel for pixel. */
export const thornBeetlePort = creaturePort({
  id: 'bug.beetle', v: 1, units: 372, size: [48, 48], origin: [24, 42],
  clips: { idle: { frames: 8 }, walk: { frames: 8 }, attack: { frames: 8, loop: false }, block: { frames: 6, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 8, loop: false } },
  about: 'A low armoured beetle seen from the side with a thorned dome: it walks, jabs its horn, curls up and dies on its back.',
  args: {
    size: share({ default: 0.5, about: 'Size: Small to Big' }),
    shell: share({ default: 0.5, about: 'Shell: Flat to Domed' }),
    spikes: share({ default: 0.5, about: 'Thorns: Few to Many' }),
    legs: share({ default: 0.5, about: 'Legs: Short to Long' }),
    eyes: word(['dots', 'angry', 'glow'], { default: 'dots', about: 'Eyes' }),
    horns: word(['stag', 'rhino', 'none'], { default: 'stag', about: 'What grows on its head' }),
    hornLength: factor('Horn length: 0.65 short to 1.35 long'),
    body: paint({ about: 'Shell' }),
    accent: paint({ about: 'Legs and underside' }),
    bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy' }),
  },
  draw: thornBeetle.render,
  sockets: thornBeetle.sockets,
});

/** bug.queen@1: A bloated hive queen facing the camera, a boss: armoured head, scythe legs, a pale abdomen studded with glowing egg sacs; she stabs, sprays acid, spawns, enrages, is hurt and bursts. Port of sprites/hive-mother.js on rigs/brood-queen.js (engine/gen/ports/c2/), pixel for pixel. */
export const hiveMotherPort = creaturePort({
  id: 'bug.queen', v: 1, units: 2716, size: [96, 96], origin: [48, 88],
  clips: { idle: { frames: 8 }, attack: { frames: 10, loop: false }, shoot: { frames: 12, loop: false }, spawn: { frames: 10, loop: false },
    enrage: { frames: 10, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 12, loop: false } },
  about: 'A bloated hive queen boss facing the camera, studded with glowing egg sacs: stab, acid spray, spawn, enrage, burst.',
  args: {
    size: share({ default: 0.5, about: 'Size: Small to Big' }),
    bulk: share({ default: 0.5, about: 'Abdomen: Lean to Bloated' }),
    legs: word(['four', 'six', 'eight'], { default: 'six', about: 'How many legs' }),
    pieces: share({ default: 0.5, about: 'Egg sacs: Few to Many' }),
    horns: word(['crown', 'antlers', 'none'], { default: 'crown', about: 'What stands on her head' }),
    hornLength: factor('Horn length: 0.65 short to 1.35 long'),
    wings: word(['none', 'stubs', 'veil'], { default: 'none', about: 'What stands behind her abdomen' }),
    wingSpan: factor('Wing span: 0.65 small to 1.35 wide'),
    body: paint({ about: 'Shell' }),
    accent: paint({ about: 'Sacs' }),
    lit: paint({ about: 'The glowing colour (the code\'s glow): Acid' }),
    bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy (how much she pulses as she breathes)' }),
  },
  draw: hiveMother.render,
  sockets: hiveMother.sockets,
});

/** beast.quadruped@1: A long-necked four-legged beast seen from the side, a boss: crouched body, jawed head, curling tail, wings, horns and spines; it bites, breathes fire, beats its wings, is hurt and falls. Port of sprites/ember-wyrm.js on rigs/quadruped.js (engine/gen/ports/c2/), pixel for pixel. */
export const emberWyrmPort = creaturePort({
  id: 'beast.quadruped', v: 1, units: 1797, size: [128, 96], origin: [56, 90],
  clips: { idle: { frames: 8 }, attack: { frames: 12, loop: false }, breath: { frames: 12, loop: false }, buffet: { frames: 10, loop: false },
    hurt: { frames: 4, loop: false }, die: { frames: 12, loop: false } },
  about: 'A long-necked four-legged beast boss seen from the side: bite, fire breath, wing buffet, hurt, fall.',
  args: {
    size: share({ default: 0.5, about: 'Size: Small to Big' }),
    length: share({ default: 0.5, about: 'Neck: Short to Long' }),
    bulk: share({ default: 0.5, about: 'Bulk: Lean to Heavy' }),
    spines: word(['none', 'ridge', 'sails'], { default: 'ridge', about: 'What runs along its back' }),
    wings: word(['large', 'small', 'tattered', 'none'], { default: 'large', about: 'Wings' }),
    wingSpan: factor('Wing span: 0.65 small to 1.35 wide'),
    horns: word(['swept', 'ram', 'crown', 'none'], { default: 'swept', about: 'Horns' }),
    hornLength: factor('Horn length: 0.65 short to 1.35 long'),
    tail: word(['spade', 'club', 'flame'], { default: 'spade', about: 'What the tail ends in' }),
    tailLength: factor('Tail length: 0.65 short to 1.35 long'),
    body: paint({ about: 'Hide' }),
    accent: paint({ about: 'Belly and wings' }),
    lit: paint({ about: 'The glowing colour (the code\'s glow): Fire' }),
    bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy (how deeply it breathes)' }),
  },
  draw: emberWyrm.render,
  sockets: emberWyrm.sockets,
});

// ---- the attach-point motions (pointsMotion above): one a port that had sockets; the mite had none ------------------

/** bug.crawler.points@1: Moves the crawler bug's points (head, back, tail, feet) each frame to where sprites/crawler-bug.js sockets() put them, at every setting. */
export const crawlerBugPoints = pointsMotion('bug.crawler', 'Moves the crawler bug\'s points (head, back, tail, feet) each frame to where its code put them.');
/** bug.spitter.points@1: Moves the spitter bug's points (head, muzzle) each frame to where sprites/spitter-bug.js sockets() put them, at every setting. */
export const spitterBugPoints = pointsMotion('bug.spitter', 'Moves the spitter bug\'s points (head, muzzle) each frame to where its code put them.');
/** bug.beetle.points@1: Moves the thorn beetle's point (head) each frame to where sprites/thorn-beetle.js sockets() put it, at every setting. */
export const thornBeetlePoints = pointsMotion('bug.beetle', 'Moves the thorn beetle\'s point (head) each frame to where its code put it.');
/** bug.queen.points@1: Moves the hive mother's points (head, back, feet, muzzle, spawn1 to spawn3) each frame to where sprites/hive-mother.js sockets() put them, at every setting. */
export const hiveMotherPoints = pointsMotion('bug.queen', 'Moves the hive mother\'s points (head, back, feet, muzzle, spawn1-3) each frame to where its code put them.');
/** beast.quadruped.points@1: Moves the ember wyrm's points (head, back, tail, feet, muzzle) each frame to where sprites/ember-wyrm.js sockets() put them, at every setting. */
export const emberWyrmPoints = pointsMotion('beast.quadruped', 'Moves the ember wyrm\'s points (head, back, tail, feet, muzzle) each frame to where its code put them.');
