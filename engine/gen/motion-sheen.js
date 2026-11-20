// The motions migration batch M1 (docs/data-sprites.md section 9) needed for its pickups, family "motion":
// pickup.sheen@1, the bright band that sweeps once across a floating pickup early in its idle loop, and pickup.beat@1,
// a heart's beat (below).
// pickup.sheen@1: Port of the glint the code pickups drew in idle
// (engine/pickups.js glint, phase lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6)) in sprites/gem.js, heart.js, ammo-box.js ...).
// A motion moves nothing here: it hands `glint.phase` to the glint@2 calls drawn on its node (engine/gen/pictures.js
// MOTION ARGS), so a glint kept inside a pickup's shape slides across it while the shape stays put. Loops close: the
// phase is read at fract(t), so t = 1 is t = 0.
import { defineGenerator } from './registry.js';
import { px, share } from './args.js';
import { lerp, clamp, fract, keys } from '../motion.js';

// engine/pickups.js heartbeat's table, copied so this module does not keep that drawing helper alive (docs/data-sprites.md section 5)
const BEAT = Object.freeze([[0, 0], [0.125, 1], [0.25, 0.4], [0.375, 0.9], [0.5, 0.35], [0.625, 0.1], [0.75, 0], [1, 0]]);
const heartbeat = (t) => keys(fract(t), BEAT, (x) => x);

/** What pickup.sheen@1 drives, "<generator id>.<argument>" (as MOTION_TARGETS in engine/gen/motion.js lists B8's). */
export const SHEEN_TARGETS = Object.freeze({ 'pickup.sheen@1': Object.freeze(['glint.phase']), 'pickup.beat@1': Object.freeze([]) });

/** pickup.sheen@1: the glint band on a pickup's node slides from `from` to `to` between clip phases `start` and `end`, and waits off the shape the rest of the loop. */
export const pickupSheen = defineGenerator({
  id: 'pickup.sheen', v: 1, family: 'motion',
  about: 'A bright band that sweeps once across a pickup early in its loop: the glint@2 calls on its node slide across.',
  args: {
    from: px(-2, 2, { default: -1.5, about: 'Where the band starts: -1.6 off one side of the shape' }),
    to: px(-2, 2, { default: 1.5, about: 'Where the band ends: 1.6 off the other side' }),
    start: share({ default: 0.1, about: 'The share of the loop the sweep starts at' }),
    end: share({ default: 0.7, about: 'The share of the loop the sweep ends at (after start)' }),
  },
  cost: () => 0,
  run: (a, ctx) => [{ move: [0, 0], args: { 'glint.phase': lerp(a.from, a.to, clamp((fract(ctx.t) - a.start) / Math.max(0.01, a.end - a.start))) } }],
});

/**
 * pickup.beat@1: a beating pickup (a heart): its node swells by 1 + amount * heartbeat(t), two quick swells at 1/8 and
 * 3/8 of the loop and rest after (port of engine/pickups.js heartbeat, which sprites/heart.js and health-cell.js grew by).
 * `amount` may be bound to a slider (how hard it beats).
 */
export const pickupBeat = defineGenerator({
  id: 'pickup.beat', v: 1, family: 'motion',
  about: 'A beating pickup: its node swells twice quickly early in the loop and rests the rest of it, like a heart.',
  args: { amount: share({ default: 0.15, about: 'How much bigger it gets at the strongest beat, as a share of its size' }) },
  cost: () => 0,
  run: (a, ctx) => [{ move: [0, 0], scale: 1 + a.amount * heartbeat(fract(ctx.t)) }],
});
