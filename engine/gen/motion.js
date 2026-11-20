// Motion generators (docs/data-sprites.md 2.5d and 3.3, family "motion"): how a picture or one of its nodes moves over
// a clip, as a function of the clip phase only. Added by build item B8. A motion returns NODE MOVES, not primitives
// (engine/data-sprite.js LAYOUTS): [{ node?, move: [dx, dy], turn, scale, args? }]. No node: the call's `node`, else
// the whole picture. `args` (read by the pictures layout of B8, engine/gen/pictures.js) are values for keyable
// arguments of the generators drawn on that node, each named "<generator id>.<argument>" ("token.spin"), so a value
// only ever reaches the generator it was made for: a coin's spin and glint, its collect scale and squash, a crate's
// lean, so whole-pixel art turns and shrinks the way its generator draws it instead of being turned as a bitmap.
// A motion that should drive another generator names it in a new version (MOTION_TARGETS lists what each drives).
// Since follow-up F4 a move may also carry `stretch: [sx, sy]` (everything on the node and under it drawn that much
// bigger on each screen axis about its origin, stamps and generator output included; engine/gen/pictures.js rule 4) and
// `hide: true` (nothing on the node or under it drawn this frame; its emitters still are): pickup.collect.whole@1,
// node.size@1, node.hide@1.
// A motion draws nothing, so its cost is 0. Ports of engine/pickups.js pickupPose and of the coin's and crate's clips.
import { defineGenerator } from './registry.js';
import { px, count, share, angle } from './args.js';
import { lerp, wave, keys, fract } from '../motion.js';

const linear = (x) => x;

/** What each motion's `args` drive, "<generator id>.<argument>" (the pictures layout passes nothing else on). */
export const MOTION_TARGETS = Object.freeze({
  'pickup.bob@1': Object.freeze([]),
  'pickup.spin@1': Object.freeze(['token.spin', 'token.sheen']),
  'pickup.collect@1': Object.freeze(['token.scale', 'token.squash', 'token.spin', 'token.sheen', 'token.bare']),
  'prop.rock@1': Object.freeze(['container.lean']),
});

/** What the whole-node motions of follow-up F4 drive (as MOTION_TARGETS for B8's): they squash and size by `stretch`, not by args. */
export const STRETCH_TARGETS = Object.freeze({
  'pickup.collect.whole@1': Object.freeze(['token.spin', 'token.sheen', 'token.bare']),
  'node.size@1': Object.freeze([]),
  'node.hide@1': Object.freeze([]),
});

/** pickup.bob@1: the float of a pickup: the whole picture (or its node) lifted round(height * wave(t)) pixels, one bob a loop. */
export const pickupBob = defineGenerator({
  id: 'pickup.bob', v: 1, family: 'motion',
  about: 'The float of a pickup: it bobs up and down once a loop, by whole pixels.',
  args: { height: px(0, 8, { default: 1, about: 'How many pixels it rises at the top of the bob' }) },
  cost: () => 0,
  run: (a, ctx) => [{ move: [0, 0 - Math.round(a.height * wave(ctx.t))] }],
});

/**
 * pickup.spin@1: a flat pickup turning about its upright axis (sprites/coin.js spin): its node's token@1 calls get `spin`
 * (degrees: 180 x turns over the loop; a coin's two faces match, so half a turn is one loop) and `sheen` (the glint
 * band sliding across, -1.6 to 1.6 once a loop).
 */
export const pickupSpin = defineGenerator({
  id: 'pickup.spin', v: 1, family: 'motion',
  about: 'A flat pickup turning about its upright axis, its glint sliding across as it turns.',
  args: { turns: count(1, 4, { default: 1, about: 'Half turns a loop' }) },
  cost: () => 0,
  run: (a, ctx) => [{ move: [0, 0], args: { 'token.spin': 180 * a.turns * ctx.t, 'token.sheen': lerp(-1.6, 1.6, fract(ctx.t + 0.5)) } }],
});

/**
 * pickup.collect@1: a pickup being collected (sprites/coin.js collect, engine/pickups.js pickupPose): it dips and
 * squashes, stretches as it pops up min(lerp(low, high, pop), room) pixels while it flips (`flip` degrees in all), swells
 * to `swell` at the top, then shrinks to nothing. The node moves; its token@1 calls get scale, squash, spin, sheen (0:
 * no glint) and bare (small details off once it is under 0.9 of its size).
 */
export const pickupCollect = defineGenerator({
  id: 'pickup.collect', v: 1, family: 'motion',
  about: 'A pickup being collected: it dips, pops up while it flips, swells and shrinks to nothing.',
  args: {
    pop: share({ default: 0.5, about: 'How high it pops: low to high' }),
    low: px(0, 16, { default: 3, about: 'The pop at its lowest, in pixels' }),
    high: px(0, 16, { default: 7, about: 'The pop at its highest, in pixels' }),
    room: px(0, 32, { default: 7, about: 'How far it can rise without leaving the frame' }),
    swell: px(1, 1.5, { default: 1.12, about: 'How big it gets at the top' }),
    flip: angle({ default: 180, about: 'How far it turns over while it pops' }),
  },
  cost: () => 0,
  run(a, ctx) {
    const t = ctx.t, top = Math.min(lerp(a.low, a.high, a.pop), a.room);
    const lift = keys(t, [[0, 0], [0.14, -1], [0.45, top], [0.6, top + 1], [1, top + 1]]);
    const squash = keys(t, [[0, 0], [0.14, 0.2], [0.3, -0.18], [0.5, 0], [1, 0]]);
    const scale = keys(t, [[0, 1], [0.5, 1], [0.58, a.swell], [0.75, 0.5], [0.86, 0]]);
    const spin = a.flip * keys(t, [[0.14, 0], [0.29, 0.34], [0.43, 0.5], [0.57, 1]], linear);
    return [{ move: [0, 0 - Math.round(lift)], args: { 'token.scale': scale, 'token.squash': squash, 'token.spin': spin, 'token.sheen': 0, 'token.bare': scale < 0.9 } }];
  },
});

/**
 * pickup.collect.whole@1 (follow-up F4): pickup.collect@1's lift, flip and timing, but the squash, the swell and the shrink go
 * to the WHOLE node as a stretch [sx, sy] (engine/gen/pictures.js rule 4), so shapes, stamps and any generator's output
 * on it squash wide on the dip and stretch tall on the rise, as engine/pickups.js pickupPose squashed a code pickup:
 * sx = scale x (1 + squash x sq), sy = scale x (1 - squash x sq), each held to `wide` and `tall` (the frame's room, as the
 * code's caps were). Under 0.3 of its size the node is hidden (`hide`), as the code's `show` was; its emitters still
 * draw. Its token@1 calls still get spin, sheen (0) and bare; none gets scale or squash, which the stretch does.
 * A generator of its own, not pickup.collect@2: collect@1 stays the better motion for a pickup drawn by token@1 (the coin
 * redraws its token at each size rather than resampling it), and a new version would oblige every library pickup to move
 * to it at once (library-redraws.test.mjs: "naming only the newest version"); a pickup batch moves to this one by choice.
 */
export const pickupCollectWhole = defineGenerator({
  id: 'pickup.collect.whole', v: 1, family: 'motion',
  about: 'A pickup being collected: it squashes, pops up stretched while it flips, swells and shrinks to nothing, all of it together.',
  args: {
    pop: share({ default: 0.5, about: 'How high it pops: low to high' }),
    low: px(0, 16, { default: 3, about: 'The pop at its lowest, in pixels' }),
    high: px(0, 16, { default: 7, about: 'The pop at its highest, in pixels' }),
    room: px(0, 32, { default: 7, about: 'How far it can rise without leaving the frame' }),
    swell: px(1, 1.5, { default: 1.12, about: 'How big it gets at the top' }),
    flip: angle({ default: 180, about: 'How far a token on it turns over while it pops' }),
    squash: share({ default: 1, about: 'How much it squashes and stretches: 0 not at all, 1 the standard pickup squash' }),
    wide: px(1, 4, { default: 4, about: 'The widest it may be drawn, as a share of its width (the room the frame leaves at its sides)' }),
    tall: px(1, 4, { default: 4, about: 'The tallest it may be drawn, as a share of its height (the room above and below it)' }),
  },
  cost: () => 0,
  run(a, ctx) {
    const t = ctx.t, top = Math.min(lerp(a.low, a.high, a.pop), a.room);
    const lift = keys(t, [[0, 0], [0.14, -1], [0.45, top], [0.6, top + 1], [1, top + 1]]);
    const sq = a.squash * keys(t, [[0, 0], [0.14, 0.2], [0.3, -0.18], [0.5, 0], [1, 0]]);
    const scale = keys(t, [[0, 1], [0.5, 1], [0.58, a.swell], [0.75, 0.5], [0.86, 0]]);
    const spin = a.flip * keys(t, [[0.14, 0], [0.29, 0.34], [0.43, 0.5], [0.57, 1]], linear);
    const sx = Math.max(0.01, Math.min(scale * (1 + sq), a.wide)), sy = Math.max(0.01, Math.min(scale * (1 - sq), a.tall));
    const out = { move: [0, 0 - Math.round(lift)], stretch: [sx, sy], args: { 'token.spin': spin, 'token.sheen': 0, 'token.bare': scale < 0.9 } };
    if (scale <= 0.3) out.hide = true;
    return [out];
  },
});

/**
 * node.size@1 (follow-up F4): the size of a node and everything on it, as a stretch (engine/gen/pictures.js rule 4):
 * shapes, stamps, rects and generators' output are all drawn `scale` times as big about the node's origin, times `wide`
 * across and `tall` down (a two-axis size). A node's own `scale` only moves whole-pixel things (released pictures@1), so
 * a stamp or a gem.cut heart on it drifts; size such a node with this instead. Bind `scale` to the Size slider.
 */
export const nodeSize = defineGenerator({
  id: 'node.size', v: 1, family: 'motion',
  about: 'Sizes a node and everything on it, stamps and generator output too, about its origin: one scale, or a width and a height.',
  args: {
    scale: px(0.25, 4, { default: 1, about: 'How big everything on the node is drawn: 1 as written' }),
    wide: px(0.25, 4, { default: 1, about: 'Times this across (a two-axis size)' }),
    tall: px(0.25, 4, { default: 1, about: 'Times this down (a two-axis size)' }),
  },
  cost: () => 0,
  run: (a) => [{ move: [0, 0], stretch: [a.scale * a.wide, a.scale * a.tall] }],
});

/**
 * node.hide@1 (follow-up F4): nothing on its node or under it is drawn (engine/gen/pictures.js rule 4; its emitters still
 * are). It says where by the call's `when` and `clip`: a shape a `when` object cannot pick alone (the pixel heart's size
 * steps, which differ with wings and without) goes on a node this hides where it should not show.
 */
export const nodeHide = defineGenerator({
  id: 'node.hide', v: 1, family: 'motion',
  about: 'Hides a node and everything on it (not its emitters) wherever its `when` and `clip` hold.',
  args: {},
  cost: () => 0,
  run: () => [{ move: [0, 0], hide: true }],
});

/**
 * prop.rock@1: a prop knocked over and rocking back (sprites/crate.js hurt): its node's container@1 calls get `lean` (degrees,
 * + to the right): `lean` at the start, two thirds of it the other way a third of the way through, a third of it back,
 * upright at the end.
 */
export const propRock = defineGenerator({
  id: 'prop.rock', v: 1, family: 'motion',
  about: 'A prop knocked over that rocks back past upright and settles.',
  args: { lean: angle({ default: 8.6, about: 'Degrees it is knocked over to the right (below 0: left)' }) },
  cost: () => 0,
  run: (a, ctx) => [{ move: [0, 0], args: { 'container.lean': a.lean * keys(ctx.t, [[0, 1], [1 / 3, -2 / 3], [2 / 3, 1 / 3], [1, 0]], linear) } }],
});
