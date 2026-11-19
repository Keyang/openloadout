// Motion generators (docs/data-sprites.md 2.5d and 3.3, family "motion"): how a picture or one of its nodes moves over
// a clip, as a function of the clip phase only. Added by build item B8. A motion returns NODE MOVES, not primitives
// (engine/data-sprite.js LAYOUTS): [{ node?, move: [dx, dy], turn, scale, args? }]. No node: the call's `node`, else
// the whole picture. `args` (read by the pictures layout of B8, engine/gen/pictures.js) are values for keyable
// arguments of the generators drawn on that node, each named "<generator id>.<argument>" ("token.spin"), so a value
// only ever reaches the generator it was made for: a coin's spin and glint, its collect scale and squash, a crate's
// lean, so whole-pixel art turns and shrinks the way its generator draws it instead of being turned as a bitmap.
// A motion that should drive another generator names it in a new version (MOTION_TARGETS lists what each drives).
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
