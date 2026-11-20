// Creature ports of creature batch C1 (docs/data-sprites.md section 7, the migration; family "creature"): six library
// creatures that had no rig (bat, crow-scout, slime, wolf, spore-hopper) or drew their stones on a code rig of their own
// (moss-golem, rigs/bigbody.js), ported whole as migration batches M9, E1 and E2 ported theirs (engine/gen/port-sprite.js
// portGenerator, whose shape creaturePort below keeps). Each port runs the code sprite's drawing, word for word, on a paint-ref grid
// (engine/gen/ports/c1/<id>.js, which imports E2's copies of the engine helpers and C1's own copies of rigs/bigbody.js,
// engine/rock.js and engine/growth.js), its arguments the old settings, its colours the paint refs the data file names,
// so the data file sprites/<id>.json keeps every control, clip and colour and draws what the code drew, pixel for pixel
// (tests/fixtures/redraw-pixels/<id>.json). The Motion sliders (Flap, Bob, Float, Wobble, Hop height, Step size,
// Bounce, Tail wag) are arguments of the port, so they move what the code moved, as far as it moved it.
//
// Three of the six had attach points that move with the clip, the frame and the settings (the crow's claws, the spore
// hopper's neck and vent, the golem's fists, head, back, feet and core). A pictures body's points are fixed on its nodes,
// so each of those creatures has a motion here as well, creature.<id>.points@1, which moves one empty node per point
// to where the code's sockets() put it this frame and turns it to the code's angle; the data file names that node in a
// top-level `points` entry, so sprite.sockets() gives what the code gave.
//
// One frame is bigger than a frame's stamp cap: the golem's 96 x 96 (9,216 pixels) against SHAPE_CAPS.stampPixels
// 8,192. As E1's explosion-large, its port gives the pixels inside a 90 x 90 box as stamps (8,100 at most) and those
// round it as one-row whole-pixel rects, which hold no stamp pixels; the same pixels either way.
// Pure: no randomness, no clock, no DOM; runs the same in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, word, share, px, flag, paint } from './args.js';
import { portPhase } from './port-sprite.js';
import { PortSurface, withPaintTable, portTiles, shiftTo } from './port-surface.js';
import { workCost } from './pixels.js';
import { render as batRender } from './ports/c1/bat.js';
import { render as slimeRender } from './ports/c1/slime.js';
import { render as wolfRender } from './ports/c1/wolf.js';
import { render as crowScoutRender, sockets as crowScoutSockets } from './ports/c1/crow-scout.js';
import { render as sporeHopperRender, sockets as sporeHopperSockets } from './ports/c1/spore-hopper.js';
import { render as mossGolemRender, sockets as mossGolemSockets } from './ports/c1/moss-golem.js';

/** The shape tests a pixel of a creature port's frame is priced at (port-sprite.js's default). */
const WORK = 64;

/**
 * Declares a creature port (family creature, version 1), as engine/gen/port-sprite.js portGenerator declares one:
 * it draws `render` (the ported code sprite's render) on a grid of the old frame `size`, in the old frame's pixels,
 * and gives the grid back as stamps moved so the old frame's `origin` is at `at`; `states` are the old clips. Its
 * `picture` says which clip it draws: one by name, or `clip` (the default), the clip the sprite is drawing (ctx.clip),
 * so a data file names it ONCE for all its clips (the pictures layout prices every call of a draw list in every frame,
 * whatever its `clip` list, so one call a clip would price the golem at seven times its work). A clip the port has
 * not got draws its first. The frame within the clip is ctx.frame and the phase the old code read is worked out from
 * it as engine/sprite.js renderFrame worked it out (port-sprite.js portPhase), so a loop always closes.
 * With `stampBox` ([x0, y0, x1, y1) in the old frame's pixels) the pixels inside it come back as stamps and those
 * outside it as one-row whole-pixel rects (a frame bigger than a frame's stamp cap). `units` is the measured work of
 * its heaviest call in cost units of about 0.01 ms (1.5 times what it took, as E1's and E2's ports:
 * tests/unit/gen-creature-c1.test.mjs holds each port's heaviest call to its cost). `names` maps an argument to the old
 * setting it stands for, where a call field holds the old name (glow, as E2's effect ports). Returns the frozen registry entry.
 */
function creaturePort({ id, size, origin, states, about, args, render, stampBox, units, names = {} }) {
  if (!(Number.isInteger(units) && units > 0)) throw new Error(`${id}: a creature port needs its measured units (tests/unit/gen-creature-c1.test.mjs)`);
  const [W, H] = size;
  const settings = (p) => { const out = { ...p }; for (const [arg, old] of Object.entries(names)) { out[old] = p[arg]; delete out[arg]; } return out; };
  const pictures = Object.keys(states);
  const [bx0, by0, bx1, by1] = stampBox ?? [0, 0, W, H], ring = W * H - (bx1 - bx0) * (by1 - by0);
  const inBox = (x, y) => x >= bx0 && x < bx1 && y >= by0 && y < by1;
  return defineGenerator({
    id, v: 1, family: 'creature', about,
    args: {
      at: point({ about: `Where the middle of its ${W} x ${H} picture goes (the old frame's point ${origin[0]}, ${origin[1]})` }),
      picture: word(['clip', ...pictures], { default: 'clip', about: 'Which of its pictures it draws: clip (the clip being drawn) or a clip by name' }),
      ...args,
    },
    // the stamps of its box's tiles, a rect for every pixel round the box at most, and the shape tests of its frame or
    // its measured work, whichever is more (as portGenerator)
    cost: () => portTiles(bx1 - bx0, by1 - by0) + ring + Math.max(workCost(W * H * WORK), units),
    run(a, ctx) {
      const clip = a.picture !== 'clip' ? a.picture : pictures.includes(ctx.clip) ? ctx.clip : pictures[0];
      const st = states[clip], frames = st.frames, loop = st.loop !== false;
      const frame = Number.isInteger(ctx.frame) ? Math.max(0, Math.min(frames - 1, ctx.frame)) : 0;
      return withPaintTable(() => {
        const g = new PortSurface(W, H);
        render(g, { clip, frame, frames, loop, t: portPhase(frame, frames, loop), p: settings(a) });
        const [dx, dy] = shiftTo(a.at, origin[0], origin[1]);
        if (!stampBox) return g.stamps([dx, dy]);
        // the box's pixels on a grid of their own (the same paint table), given as stamps; the rest as runs of a row
        const mid = g.blank(W, H), rects = [];
        for (let y = 0; y < H; y++) {
          let x = 0;
          while (x < W) {
            const c = g.data[y * W + x];
            if (!c) { x++; continue; }
            if (inBox(x, y)) { mid.data[y * W + x] = c; x++; continue; }
            let e = x + 1;
            while (e < W && g.data[y * W + e] === c && !inBox(e, y)) e++;
            rects.push({ kind: 'rect', at: [x + dx, y + dy], size: [e - x, 1], paint: g.table.ref(c), shade: 0 });
            x = e;
          }
        }
        return [...mid.stamps([dx, dy]), ...rects];
      });
    },
  });
}

/**
 * Declares the attach-point motion of a creature port (see the head of this file): family motion, version 1, its
 * arguments the settings the code's sockets() read; each frame it moves the empty node `<point>` of the data file (at
 * [0, 0], no parent) to the point's place in the old frame's pixels, moved so the old frame's `origin` is at `at`, and
 * turns it so a point on it at angle 0 has the code's angle. A clip the code did not know (a motion's goldens are made
 * at clip "x") is read as the first of `clips`. Returns the frozen registry entry.
 */
function pointsMotion({ id, about, origin, clips, args, sockets }) {
  return defineGenerator({
    id, v: 1, family: 'motion', about,
    args: { at: point({ default: [...origin], about: `Where the old frame's point ${origin[0]}, ${origin[1]} is: the node the picture is drawn on` }), ...args },
    cost: () => 0,
    run(a, ctx) {
      const clip = clips.includes(ctx?.clip) ? ctx.clip : clips[0];
      const t = Number.isFinite(ctx?.t) ? ctx.t : 0;
      const [dx, dy] = [Math.round(a.at[0]) - origin[0], Math.round(a.at[1]) - origin[1]];
      return Object.entries(sockets(clip, t, a)).slice(0, 16).map(([name, s]) => ({
        // nodeFrame (engine/draw-list.js) turns v, a node's down, to [-sin, cos] of its turn, so a point at angle 0 on a
        // node turned by -angle (in degrees) has the rig angle `angle`
        node: name, move: [s.x + dx, s.y + dy], turn: -s.angle * 180 / Math.PI,
      }));
    },
  });
}

// ---- creature.bat@1 (sprites/bat.json) -----------------------------------------------------------------------------------

const BAT_ARGS = {
  size: share({ default: 0.5, about: 'Body size: Small to Chubby' }),
  span: share({ default: 0.5, about: 'Wing span: Stubby to Wide' }),
  wing: word(['classic', 'sharp', 'round'], { default: 'classic', about: 'Wing shape' }),
  ears: share({ default: 0.5, about: 'Ear size: Tiny to Huge' }),
  eyes: word(['glow', 'cute', 'angry', 'one'], { default: 'glow', about: 'Eyes' }),
  fangs: flag({ default: true, about: 'Fangs' }),
  body: paint({ about: 'Body (fur)' }),
  membrane: paint({ about: 'Wings (the skin between the fingers)' }),
  eye: paint({ about: 'Eyes' }),
  flap: share({ default: 0.5, about: 'Flap size: Flutter to Big beats' }),
  bob: share({ default: 0.5, about: 'Bob: Steady to Bouncy' }),
};

/** creature.bat@1: A flapping cave bat: a round furry body between two scalloped wings that beat with a whip, big ears, glowing, cute, angry or one eye, and fangs; it glides, flies, bites, flinches and pops. Port of sprites/bat.js (engine/gen/ports/c1/bat.js), pixel for pixel. */
export const batCreature = creaturePort({
  id: 'creature.bat', units: 170, size: [48, 48], origin: [25, 25],
  states: { idle: { frames: 8 }, fly: { frames: 8 }, attack: { frames: 8, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 8, loop: false } },
  about: 'A flapping cave bat: a furry body between two scalloped wings, big ears, glowing, cute, angry or one eye, and fangs; it glides, flies, bites, flinches and pops.',
  args: BAT_ARGS, render: batRender,
});

// ---- creature.slime@1 (sprites/slime.json) -------------------------------------------------------------------------------

/** creature.slime@1: A squashy slime blob whose width and height trade off as it breathes, hops, lunges, flinches and bursts into a puddle, with a face and something on top. Port of sprites/slime.js (engine/gen/ports/c1/slime.js), pixel for pixel. */
export const slimeCreature = creaturePort({
  id: 'creature.slime', units: 100, size: [48, 48], origin: [22, 42],
  states: { idle: { frames: 8 }, hop: { frames: 8 }, attack: { frames: 8, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 8, loop: false } },
  about: 'A squashy slime blob that breathes, hops, lunges, flinches and bursts into a puddle, with a face and something on top.',
  args: {
    size: share({ default: 0.5, about: 'Size: Tiny to Huge' }),
    shape: share({ default: 0.5, about: 'Shape: Flat to Tall' }),
    eyes: word(['cute', 'dots', 'angry', 'sleepy', 'one'], { default: 'cute', about: 'Eyes' }),
    topping: word(['none', 'crown', 'sprout', 'horns', 'bow'], { default: 'none', about: 'On top' }),
    shine: flag({ default: true, about: 'Shine' }),
    body: paint({ about: 'Colour' }),
    wobble: share({ default: 0.5, about: 'Wobble: Firm to Jelly' }),
    hop: share({ default: 0.5, about: 'Hop height: Low to High' }),
  },
  render: slimeRender,
});

// ---- creature.wolf@1 (sprites/wolf.json) ---------------------------------------------------------------------------------

/** creature.wolf@1: A four-legged canine seen from the side (a wolf, a fox or a husky): one merged body and head, a tail of capsules and four two-bone legs whose paws stay planted; it stands, walks, gallops, bites, flinches and lies down. Port of sprites/wolf.js (engine/gen/ports/c1/wolf.js), pixel for pixel. */
export const wolfCreature = creaturePort({
  id: 'creature.wolf', units: 360, size: [64, 48], origin: [27, 43],
  states: { idle: { frames: 8 }, walk: { frames: 8 }, run: { frames: 8 }, attack: { frames: 8, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 8, loop: false } },
  about: 'A four-legged canine seen from the side (wolf, fox or husky) whose paws stay planted; it stands, walks, gallops, bites, flinches and lies down.',
  args: {
    size: share({ default: 0.55, about: 'Body size: Small to Big' }),
    legs: share({ default: 0.55, about: 'Leg length: Short to Long' }),
    snout: share({ default: 0.55, about: 'Snout: Short to Long' }),
    ears: word(['pointy', 'tall', 'floppy'], { default: 'pointy', about: 'Ears' }),
    tail: word(['hanging', 'brush', 'curled'], { default: 'hanging', about: 'Tail' }),
    fluff: share({ default: 0.6, about: 'Fluffiness: Sleek to Fluffy' }),
    markings: word(['plain', 'belly', 'socks', 'mask'], { default: 'belly', about: 'Markings' }),
    fur: paint({ about: 'Fur' }),
    belly: paint({ about: 'Belly and markings' }),
    eyes: paint({ about: 'Eyes' }),
    stride: share({ default: 0.5, about: 'Step size: Small steps to Big steps' }),
    bounce: share({ default: 0.5, about: 'Bounce: Smooth to Bouncy' }),
    wag: share({ default: 0.4, about: 'Tail wag: Still to Waggy' }),
  },
  render: wolfRender,
});

// ---- creature.crow-scout@1 and creature.crow-scout.points@1 (sprites/crow-scout.json) -----------------------------------
// Its units charge the first frame of a new look, not a warm one: the code fits how high the wings may lift over all 32
// frames of its beating clips once a look (liftOf, kept for the last look), about 3.3 ms against 1.3 ms warm.

const CROW_LOOK = {
  size: share({ default: 0.5, about: 'Size: Small to Big' }),
  span: share({ default: 0.5, about: 'Wings: Short to Wide' }),
  beak: share({ default: 0.5, about: 'Beak: Short to Long' }),
  held: word(['none', 'lantern', 'sack', 'bomb'], { default: 'none', about: 'Carries' }),
  heldSize: px(0.65, 1.35, { default: 1, about: 'Size of what it carries: Small to Big' }),
  flap: share({ default: 0.5, about: 'Flap: Small to Wide' }),
  bob: share({ default: 0.5, about: 'Float: Still to Floaty' }),
};
const CROW_STATES = { idle: { frames: 8 }, fly: { frames: 8 }, attack: { frames: 8, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 8, loop: false } };

/** creature.crow-scout@1: A dark, sharp-beaked bird seen from the side, two feathered wings beating at the shoulder, a fanned tail, a crest and something hanging from its claws; it hovers, flies, dives, flinches and bursts into feathers. Port of sprites/crow-scout.js (engine/gen/ports/c1/crow-scout.js), pixel for pixel. */
export const crowScoutCreature = creaturePort({
  id: 'creature.crow-scout', units: 500, size: [48, 48], origin: [24, 24], states: CROW_STATES,
  about: 'A sharp-beaked bird with feathered wings, a fanned tail, a crest and something in its claws; it hovers, flies, dives, flinches and bursts into feathers.',
  args: {
    ...CROW_LOOK,
    crest: word(['none', 'tuft', 'spiky'], { default: 'none', about: 'Crest' }),
    eyes: word(['dot', 'angry', 'glow'], { default: 'dot', about: 'Eyes' }),
    body: paint({ about: 'Feathers' }),
    accent: paint({ about: 'Beak and feet' }),
  },
  render: crowScoutRender,
});

/** creature.crow-scout.points@1: The crow scout's attach point, `hand` (its claws, turned the way the thing it carries hangs), moved each frame to where sprites/crow-scout.js sockets() put it. */
export const crowScoutPoints = pointsMotion({
  id: 'creature.crow-scout.points', origin: [24, 24], clips: Object.keys(CROW_STATES), args: CROW_LOOK, sockets: crowScoutSockets,
  about: 'Moves the crow scout\'s claws point (hand) each frame to where its code put it, turned the way the thing it carries hangs.',
});

// ---- creature.spore-hopper@1 and creature.spore-hopper.points@1 (sprites/spore-hopper.json) -----------------------------

const SPORE_LOOK = {
  size: share({ default: 0.5, about: 'Size: Small to Big' }),
  bulk: share({ default: 0.5, about: 'Pod: Slim to Plump' }),
  hop: share({ default: 0.5, about: 'Hop height: Low to High' }),
  wobble: share({ default: 0.5, about: 'Wobble: Firm to Wobbly' }),
};
const SPORE_STATES = { idle: { frames: 8 }, hop: { frames: 8 }, attack: { frames: 8, loop: false }, hurt: { frames: 4, loop: false }, die: { frames: 8, loop: false } };

/** creature.spore-hopper@1: A ribbed seed pod hopping on one coiled root, with a collar of leaves, petals or thorns round its neck; it breathes, hops, puffs spores from its vent, flinches and splits open. Port of sprites/spore-hopper.js (engine/gen/ports/c1/spore-hopper.js), pixel for pixel. */
export const sporeHopperCreature = creaturePort({
  id: 'creature.spore-hopper', units: 140, size: [48, 48], origin: [24, 42], states: SPORE_STATES,
  about: 'A ribbed seed pod hopping on one coiled root, with a leafy collar; it breathes, hops, puffs spores from its vent, flinches and splits open.',
  args: {
    ...SPORE_LOOK,
    eyes: word(['round', 'sleepy', 'angry'], { default: 'round', about: 'Eyes' }),
    ribs: flag({ default: true, about: 'Ribs' }),
    ruff: word(['leaves', 'petals', 'thorns', 'none'], { default: 'leaves', about: 'Ruff' }),
    ruffSize: px(0.65, 1.35, { default: 1, about: 'Size of the ruff: Small to Big' }),
    ruffColour: paint({ about: 'Colour of the ruff' }),
    body: paint({ about: 'Pod' }),
    spores: paint({ about: 'Spores (the old setting glow, a call field\'s name)' }),
  },
  names: { spores: 'glow' },
  render: sporeHopperRender,
});

/** creature.spore-hopper.points@1: The spore hopper's attach points, `head` (its neck, where the ruff sits) and `muzzle` (the vent the spores leave by), moved each frame to where sprites/spore-hopper.js sockets() put them. */
export const sporeHopperPoints = pointsMotion({
  id: 'creature.spore-hopper.points', origin: [24, 42], clips: Object.keys(SPORE_STATES), args: SPORE_LOOK, sockets: sporeHopperSockets,
  about: 'Moves the spore hopper\'s neck point (head) and vent point (muzzle) each frame to where its code put them.',
});

// ---- creature.moss-golem@1 and creature.moss-golem.points@1 (sprites/moss-golem.json) -----------------------------------

const GOLEM_LOOK = {
  size: share({ default: 0.5, about: 'Size: Small to Big' }),
  bulk: share({ default: 0.5, about: 'Bulk: Lean to Massive' }),
  arms: share({ default: 0.5, about: 'Arms: Short to Long' }),
  bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy' }),
};
const GOLEM_STATES = { idle: { frames: 8 }, walk: { frames: 8 }, attack: { frames: 12, loop: false }, roar: { frames: 10, loop: false }, hurt: { frames: 4, loop: false }, stagger: { frames: 8, loop: false }, die: { frames: 12, loop: false } };

/** creature.moss-golem@1: A boss: a hunched giant of stacked boulders on a large two-legged frame, a head of three shapes, moss, mushrooms or saplings on its shoulders and a glowing gem, rune or eye in its chest; it stands, walks, slams, roars, flinches, staggers and collapses. Port of sprites/moss-golem.js (engine/gen/ports/c1/moss-golem.js, posed by C1's copy of rigs/bigbody.js), pixel for pixel. */
export const mossGolemCreature = creaturePort({
  id: 'creature.moss-golem', units: 2620, size: [96, 96], origin: [44, 90], states: GOLEM_STATES,
  stampBox: [3, 3, 93, 93],   // its 96 x 96 frame holds more than a frame's 8,192 stamp pixels: the middle 90 x 90 as stamps, the rest as rects
  about: 'A boss: a hunched giant of stacked boulders with growth on its shoulders and a glowing core in its chest; it walks, slams, roars, staggers and collapses.',
  args: {
    ...GOLEM_LOOK,
    shape: word(['boulder', 'slab', 'horned'], { default: 'boulder', about: 'Head' }),
    wear: share({ default: 0.4, about: 'Wear: New to Worn' }),
    growth: word(['moss', 'mushrooms', 'saplings', 'none'], { default: 'moss', about: 'Growth' }),
    growthSize: px(0.65, 1.35, { default: 1, about: 'Size of the growth: Small to Big' }),
    growthColour: paint({ about: 'Colour of the growth' }),
    core: word(['gem', 'rune', 'eye'], { default: 'gem', about: 'Core' }),
    coreSize: px(0.7, 1.3, { default: 1, about: 'Size of the core: Small to Big' }),
    stone: paint({ about: 'Stone' }),
    shine: paint({ about: 'Glow of the eyes and the core (the old setting glow, a call field\'s name)' }),
  },
  names: { shine: 'glow' },
  render: mossGolemRender,
});

/** creature.moss-golem.points@1: The moss golem's attach points, `hand` and `offhand` (its fists), `head`, `back` (where the growth sits), `feet` and `core` (the weak point), moved each frame to where sprites/moss-golem.js sockets() put them. */
export const mossGolemPoints = pointsMotion({
  id: 'creature.moss-golem.points', origin: [44, 90], clips: Object.keys(GOLEM_STATES), args: GOLEM_LOOK, sockets: mossGolemSockets,
  about: 'Moves the moss golem\'s points (hand, offhand, head, back, feet, core) each frame to where its code put them.',
});
