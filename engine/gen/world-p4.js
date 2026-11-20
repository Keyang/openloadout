// Prop generators of migration batch P4 (docs/data-sprites.md section 7 and 3.3, family "shape"): the village buildings,
// the two trees, the market stall, the two fires, the checkpoint flag and the acid pool, redrawn as data. Each is a port
// generator (engine/gen/port-sprite.js), as the M9 interface pictures and the E1 and E2 effect ports are: it draws what
// its code sprite drew, pixel for pixel, by running the sprite file's own drawing (engine/gen/ports/p4/<id>.js, word for
// word) on a paint-ref grid. The drawing those props shared lives once, in the ported helpers: the building pieces
// (engine/gen/ports/p4/buildings.js: wall, roof, door, windows, chimney, smoke, sign, layOver), the stall pieces
// (p4/stalls.js), the flag (p4/cloth.js), the puddle and its bubbles (p4/ooze.js), and, from batch E2, the trees'
// crowns, tiers, trunks and falling leaves (e2/foliage.js) and the torch's flame, sparks and halo (e2/fx.js).
//
// Every argument is one of the old sprite's settings (a slider a share, a choice a word, a toggle a flag, a colour a
// paint), under its own name except `glow`, which is a call field (engine/gen/registry.js): the window light, the
// torch's glow and the pool's shine are `glowColour`. `picture` is the clip; `at` is where the old frame's pivot goes.
// Two colours the code worked out from a colour's numbers have no colour rule and are drawn in the nearest rule form
// (HAND CHANGE notes in p4/campfire.js and p4/checkpoint-banner.js); every other pixel is the code's.
// Pure: no randomness, no clock, no DOM; Node and browser.
import { defineGenerator } from './registry.js';
import { point, share, word, flag, paint } from './args.js';
import { portGenerator, portPhase } from './port-sprite.js';
import { PortSurface, withPaintTable, portTiles, shiftTo } from './port-surface.js';
import { workCost } from './pixels.js';
import { render as cottageRender } from './ports/p4/cottage.js';
import { render as innRender } from './ports/p4/inn.js';
import { render as stallRender } from './ports/p4/market-stall.js';
import { render as oakRender } from './ports/p4/tree-oak.js';
import { render as pineRender } from './ports/p4/tree-pine.js';
import { render as campfireRender } from './ports/p4/campfire.js';
import { render as torchRender } from './ports/p4/wall-torch.js';
import { render as bannerRender } from './ports/p4/checkpoint-banner.js';
import { render as poolRender } from './ports/p4/acid-pool.js';

/** The shape tests a pixel of a port's frame is priced at (engine/gen/port-sprite.js's default). */
const WORK = 64;

/**
 * A port generator of this batch: portGenerator (engine/gen/port-sprite.js) with family "shape" and version 1, its old
 * settings named back for the drawing (`names`, { arg: old }: an argument whose old name is a call field). With
 * `stampBox` ([x0, y0, x1, y1) in the old frame's pixels: a frame whose drawing can be bigger than a frame's 8,192 stamp
 * pixels, the inn's) the pixels inside it come back as stamps and those outside it as one-row whole-pixel rects, one a
 * run of a row (no stamp pixels), as build item E1's explosion-large; `reach` (the boxes round it that the drawing
 * outside it stays in at every setting, [[x0, y0, x1, y1), ...], held by tests/unit/gen-p4-props.test.mjs) bounds how
 * many rects there can be: one a pixel of them at most (the schema adds every draw call's cost, whatever its clip, so a
 * loose bound would price the inn's three clips past a frame's budget). `units` is the measured work of
 * its heaviest call in cost units of about 0.01 ms (1.5 times what it took). Returns the frozen registry entry.
 */
function propPort({ id, about, size, origin, states, args, render, units, names = {}, stampBox, reach }) {
  if (!(Number.isInteger(units) && units > 0)) throw new Error(`${id}: a port needs its measured units (tests/unit/gen-p4-props.test.mjs)`);
  const settings = (p) => { const out = { ...p }; for (const [arg, old] of Object.entries(names)) { out[old] = p[arg]; delete out[arg]; } return out; };
  const draw = (g, { clip, t, frame, frames, loop, p }) => render(g, { clip, t, frame, frames, loop, p: settings(p) });
  if (!stampBox) return portGenerator({ id, v: 1, family: 'shape', about, size, origin, states, args, units, work: WORK, draw });
  const [W, H] = size, [bx0, by0, bx1, by1] = stampBox;
  const ring = reach.reduce((n, [x0, y0, x1, y1]) => n + (x1 - x0) * (y1 - y0), 0), names2 = Object.keys(states);
  const inBox = (x, y) => x >= bx0 && x < bx1 && y >= by0 && y < by1;
  return defineGenerator({
    id, v: 1, family: 'shape', about,
    args: {
      at: point({ about: `Where the middle of its ${W} x ${H} picture goes (the old frame's point ${origin[0]}, ${origin[1]})` }),
      picture: word(names2, { default: names2[0], about: 'Which of its pictures it draws: the clip of the same name' }),
      ...args,
    },
    // the stamps of its box's tiles, a rect for every pixel of its reach round the box at most, and the shape tests of
    // its frame or its measured work, whichever is more (as portGenerator)
    cost: () => portTiles(bx1 - bx0, by1 - by0) + ring + Math.max(workCost(W * H * WORK), units),
    run(a, ctx) {
      const st = states[a.picture], frames = st.frames, loop = st.loop !== false;
      const frame = Number.isInteger(ctx.frame) ? Math.max(0, Math.min(frames - 1, ctx.frame)) : 0;
      return withPaintTable(() => {
        const g = new PortSurface(W, H);
        draw(g, { clip: a.picture, frame, frames, loop, t: portPhase(frame, frames, loop), p: a });
        const [dx, dy] = shiftTo(a.at, origin[0], origin[1]);
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

const ROOFS = ['thatch', 'tile', 'slate'];

/** building.cottage@1: A small timber-framed village house seen from the south, its door swinging open and its windows lit at night with chimney smoke. Port of sprites/cottage.js (engine/gen/ports/p4/cottage.js, on the building pieces of p4/buildings.js), pixel for pixel. */
export const cottagePort = propPort({
  id: 'building.cottage', units: 200, size: [96, 96], origin: [48, 92],
  states: { closed: { frames: 1 }, open: { frames: 6, loop: false }, lit: { frames: 8 } },
  about: 'A small timber-framed village house seen from the south: its door swings open, and at night its windows flicker and its chimney smokes.',
  args: {
    width: share({ default: 0.5, about: 'Width: Narrow to Wide' }),
    roof: word(ROOFS, { default: 'thatch', about: 'Roof' }),
    chimney: flag({ default: true, about: 'Chimney' }),
    windows: word(['one', 'two'], { default: 'two', about: 'Windows' }),
    wall: paint({ about: 'Walls' }),
    roofColour: paint({ about: 'Roof colour' }),
    wood: paint({ about: 'Beams and door' }),
    glowColour: paint({ about: 'Window light' }),
  },
  names: { glowColour: 'glow' },
  render: cottageRender,
});

/** building.inn@1: A two-storey village inn seen from the south, its double door swinging open, its windows lit at night and a picture sign that sways. Port of sprites/inn.js (engine/gen/ports/p4/inn.js, on the building pieces of p4/buildings.js), pixel for pixel. */
export const innPort = propPort({
  id: 'building.inn', units: 220, size: [128, 96], origin: [64, 92],
  // up to 108 x 91 drawn, over a frame's 8,192 stamp pixels: the middle 102 x 80 as stamps; the chimney's top and its
  // smoke (drawn within x 77 to 98, y 2 to 11 at every setting) and the eaves' ends (x 10 to 12 and 115 to 117, y 23 to 40) as rects
  stampBox: [13, 12, 115, 92], reach: [[75, 1, 101, 12], [9, 21, 13, 42], [115, 21, 119, 42]],
  states: { closed: { frames: 1 }, open: { frames: 6, loop: false }, lit: { frames: 8 } },
  about: 'A two-storey village inn seen from the south: a double door that swings open, windows that flicker at night, chimney smoke and a hanging picture sign.',
  args: {
    width: share({ default: 0.5, about: 'Width: Narrow to Wide' }),
    roof: word(ROOFS, { default: 'tile', about: 'Roof' }),
    chimney: flag({ default: true, about: 'Chimney' }),
    sign: word(['mug', 'bed', 'moon', 'none'], { default: 'mug', about: 'Sign' }),
    signColour: paint({ about: 'Sign colour' }),
    wall: paint({ about: 'Walls' }),
    roofColour: paint({ about: 'Roof colour' }),
    wood: paint({ about: 'Beams and door' }),
    glowColour: paint({ about: 'Window light' }),
  },
  names: { glowColour: 'glow' },
  render: innRender,
});

/** stall.market@1: A wooden market counter under a cloth awning on four poles, goods laid out on it, its valance flapping. Port of sprites/market-stall.js (engine/gen/ports/p4/market-stall.js, on the stall pieces of p4/stalls.js), pixel for pixel. */
export const stallPort = propPort({
  id: 'stall.market', units: 200, size: [64, 64], origin: [32, 60],
  states: { idle: { frames: 1 }, flap: { frames: 8 } },
  about: 'A wooden market counter under a cloth awning on four poles, with goods laid out on it; the awning\'s valance ripples in the wind.',
  args: {
    style: word(['striped', 'plain', 'scalloped'], { default: 'striped', about: 'Awning style' }),
    shape: word(['fruit', 'potions', 'weapons', 'bread'], { default: 'fruit', about: 'Goods' }),
    width: share({ default: 0.5, about: 'Width: Narrow to Wide' }),
    cloth: paint({ about: 'Cloth' }),
    accent: paint({ about: 'Stripes and edging' }),
    wood: paint({ about: 'Wood' }),
    sway: share({ default: 0.5, about: 'Sway: Still to Swaying' }),
  },
  render: stallRender,
});

/** tree.oak@1: A broad leafy tree seen from the south: crown masses with leafy tufts on a flared trunk, fruit or blossom, a sway and a shake that drops leaves. Port of sprites/tree-oak.js (engine/gen/ports/p4/tree-oak.js, on the foliage of e2/foliage.js), pixel for pixel. */
export const oakPort = propPort({
  id: 'tree.oak', units: 250, size: [64, 80], origin: [32, 76],
  states: { idle: { frames: 1 }, sway: { frames: 8 }, shake: { frames: 6, loop: false } },
  about: 'A broad leafy tree seen from the south: leaf masses with leafy tufts over a flared trunk, apples or blossom, a slow sway and a shake that drops leaves.',
  args: {
    size: share({ default: 0.8, about: 'Size: Small to Big' }),
    shape: word(['round', 'wide', 'layered'], { default: 'round', about: 'Crown shape' }),
    thickness: share({ default: 0.5, about: 'Trunk: Thin to Chunky' }),
    fruit: word(['none', 'apples', 'blossom'], { default: 'none', about: 'Fruit' }),
    fruitColour: paint({ about: 'Fruit colour' }),
    leaf: paint({ about: 'Leaves' }),
    wood: paint({ about: 'Wood' }),
    sway: share({ default: 0.5, about: 'Sway: Still to Swaying' }),
  },
  render: oakRender,
});

/** tree.pine@1: A pointed fir seen from the south: toothed tiers over a short trunk, snow if wanted, leaning from its foot to sway and hopping tier by tier when shaken. Port of sprites/tree-pine.js (engine/gen/ports/p4/tree-pine.js, on the foliage of e2/foliage.js), pixel for pixel. */
export const pinePort = propPort({
  id: 'tree.pine', units: 320, size: [48, 80], origin: [24, 76],
  states: { idle: { frames: 1 }, sway: { frames: 8 }, shake: { frames: 6, loop: false } },
  about: 'A pointed fir seen from the south: toothed tiers over a short trunk, snow on the tiers if wanted; it leans from its foot to sway and its tiers hop when shaken, dropping needles.',
  args: {
    size: share({ default: 0.6, about: 'Size: Small to Big' }),
    shape: word(['short', 'medium', 'tall'], { default: 'medium', about: 'Height: tiers' }),
    width: share({ default: 0.5, about: 'Width: Narrow to Wide' }),
    snowy: flag({ default: false, about: 'Snowy' }),
    leaf: paint({ about: 'Needles' }),
    wood: paint({ about: 'Wood' }),
    sway: share({ default: 0.5, about: 'Sway: Still to Swaying' }),
  },
  render: pineRender,
});

/** fire.camp@1: A crackling campfire: rippling flame tongues in three tones over crossed logs, a tipi, a ring of stones or nothing, embers and rising sparks; it can catch from nothing. Port of sprites/campfire.js (engine/gen/ports/p4/campfire.js), pixel for pixel but for its two hottest tones (HAND CHANGE there). */
export const campfirePort = propPort({
  id: 'fire.camp', units: 280, size: [48, 48], origin: [24, 44],
  states: { burn: { frames: 8 }, ignite: { frames: 8, loop: false } },
  about: 'A crackling campfire: rippling flame tongues in three tones over crossed logs, a tipi, a ring of stones or bare ground, glowing embers and rising sparks; it can catch from nothing.',
  args: {
    height: share({ default: 0.5, about: 'Flame height: Low to Tall' }),
    width: share({ default: 0.5, about: 'Flame width: Thin to Wide' }),
    side: share({ default: 0.6, about: 'Side flames: None to Big' }),
    heat: share({ default: 0.5, about: 'Heat: Cool to White-hot' }),
    base: word(['logs', 'tipi', 'stones', 'none'], { default: 'logs', about: 'Base' }),
    sparks: share({ default: 0.5, about: 'Sparks: None to Lots' }),
    colour: paint({ about: 'Flame colour' }),
    wood: paint({ about: 'Wood' }),
    flicker: share({ default: 0.5, about: 'Flicker: Steady to Wild' }),
    wind: share({ default: 0.15, about: 'Wind: Still to Windy' }),
  },
  render: campfireRender,
});

/** torch.wall@1: A torch burning in a wall bracket (an iron ring, a wooden block or a sconce bowl), with a rippling flame, a halo of glow pixels and sparks; it can be unlit and catch again. Port of sprites/wall-torch.js (engine/gen/ports/p4/wall-torch.js, on e2/fx.js flame and p4/buildings.js layOver), pixel for pixel. */
export const torchPort = propPort({
  id: 'torch.wall', units: 120, size: [32, 48], origin: [16, 34],
  states: { idle: { frames: 8 }, out: { frames: 1 }, ignite: { frames: 6, loop: false } },
  about: 'A torch burning in a wall bracket (an iron ring, a wooden block or a sconce bowl): a rippling flame with a halo of glow pixels and sparks; it can stand unlit and catch again.',
  args: {
    style: word(['iron', 'wood', 'sconce'], { default: 'iron', about: 'Bracket' }),
    height: share({ default: 0.5, about: 'Height: Short to Tall' }),
    halo: flag({ default: true, about: 'Halo' }),
    sparks: flag({ default: true, about: 'Sparks' }),
    glowColour: paint({ about: 'Glow (the flame)' }),
    metal: paint({ about: 'Metal' }),
    flicker: share({ default: 0.5, about: 'Flicker: Steady to Wild' }),
  },
  names: { glowColour: 'glow' },
  render: torchRender,
});

/** flag.checkpoint@1: A checkpoint flag on a pole with a stone foot: limp and dull at the foot of the pole, run up it with a white snap, then flying in travelling folds with its emblem. Port of sprites/checkpoint-banner.js (engine/gen/ports/p4/checkpoint-banner.js, on p4/cloth.js flag), pixel for pixel but for the emblem colour near the cloth's (HAND CHANGE there). */
export const bannerPort = propPort({
  id: 'flag.checkpoint', units: 50, size: [32, 64], origin: [16, 62],
  states: { down: { frames: 1 }, raise: { frames: 8, loop: false }, up: { frames: 8 } },
  about: 'A checkpoint flag on a pole with a stone foot: limp and dull at the foot of the pole, run up it with a white snap, then flying in folds that travel along the cloth, its emblem riding them.',
  args: {
    height: share({ default: 0.5, about: 'Height: Short to Tall' }),
    shape: word(['pennant', 'banner', 'swallowtail'], { default: 'swallowtail', about: 'Cut of the flag' }),
    finial: flag({ default: true, about: 'Ball on top' }),
    emblem: word(['none', 'star', 'skull', 'sun'], { default: 'star', about: 'Emblem' }),
    emblemColour: paint({ about: 'Emblem colour' }),
    cloth: paint({ about: 'Cloth' }),
    wood: paint({ about: 'Wood' }),
    sway: share({ default: 0.5, about: 'Sway: Still to Swaying' }),
  },
  render: bannerRender,
});

/** pool.acid@1: A boiling puddle of acid seen from above: a wobbling edge, a dark rim, sliding streaks, a shine and bubbles that swell and burst; it dries to a stain and spreads again. Port of sprites/acid-pool.js (engine/gen/ports/p4/acid-pool.js, on p4/ooze.js puddleIn and surfaceBubbles), pixel for pixel. */
export const acidPoolPort = propPort({
  id: 'pool.acid', units: 300, size: [48, 32], origin: [24, 16],
  states: { idle: { frames: 8 }, fade: { frames: 8, loop: false }, spawn: { frames: 8, loop: false } },
  about: 'A boiling puddle of acid seen from above: a wobbling edge, a dark rim, sliding streaks, a shine and bubbles that swell and burst; it can dry to a dark stain and spread again.',
  args: {
    size: share({ default: 0.5, about: 'Size: Small to Big' }),
    shape: word(['round', 'splat', 'long'], { default: 'round', about: 'Shape' }),
    pieces: share({ default: 0.5, about: 'Bubbles: Few to Many' }),
    crust: flag({ default: true, about: 'Dark rim' }),
    body: paint({ about: 'Body' }),
    glowColour: paint({ about: 'Shine' }),
    wobble: share({ default: 0.5, about: 'Wobble: Firm to Wobbly' }),
  },
  names: { glowColour: 'glow' },
  render: poolRender,
});
