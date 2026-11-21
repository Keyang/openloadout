// Creature helpers: the motion cycles and body shapes of things that have no skeleton (hoppers, blobs, plants,
// birds). The motion functions turn the clip phase t into the numbers a body is posed from, on the beats the style
// guide fixes for `hop` and `fly` (docs/style-guide.md section 4); the shape functions return inside(px, py), so
// they go straight into g.fill(...) or g.blob([...]). Nothing here draws or picks a colour. Pure functions: Node
// and browser.
//
//   import { hopArc, squashStretch, bulbIn, springIn, fanIn } from '../engine/creature.js';
//   const H = hopArc(t);                                              // lift 0..1, squash -1..1, legs 0..2
//   const [wide, tall] = squashStretch(0.3 * H.squash);               // area kept
//   const foot = 41 - top * H.lift, base = foot - root * H.legs;
//   g.blob([springIn(24, foot, 24, base, 3, 7, 1)], ramp(P.soil));    // the leg presses flat, then stretches
//   g.blob([bulbIn(24, base, 8 * wide, 16 * tall)], ramp(p.body), { shade: 2 });
//
//   import { flapCycle, featherWing } from '../engine/creature.js';
//   const F = flapCycle(t);                                           // arm 1 (up) .. -1 (down), tip, fold, lift
//   const w = featherWing(sx, sy, -PI / 2 - 1.2 * F.arm, 14, { fold: F.fold, spread: 1.1 * F.arm });
//   g.fill(0, 0, g.w, g.h, w.inside, ramp(p.body));                   // w.tips: the feather tips, w.wrist: the joint
//
// Angles use the rig convention of engine/motion.js: 0 = down, PI/2 = picture-right, PI = up, negative = to the left.

import { clamp, fract, loopKeys, PI } from './motion.js';


// ---- motion -------------------------------------------------------------------

/**
 * The two size multipliers of a squashed or stretched body, [wide, tall], which keep its area the same so it looks like one lump of stuff.
 * Arguments: squash (above 0 flatter and wider, below 0 taller and thinner; usually -0.4 to 0.4); limit (the most it may be either way, default 0.6).
 */
export function squashStretch(squash, limit = 0.6) {
  const wide = 1 + clamp(squash, -limit, limit);
  return [wide, 1 / wide];
}

/**
 * One hop of a looping `hop` clip on the style guide's beats for 8 frames: crouch on frames 0 to 1, leave the ground on 2, top on 4, land and squash on 6, recover on 7.
 * Arguments: t (clip phase 0..1); options { off, land } (the phases at which it leaves and meets the ground, default 0.22 and 0.74).
 * Returns { lift (0 on the ground .. 1 at the top), squash (1 most squashed .. -1 most stretched), legs (how far the legs or spring are out: 0 pressed flat, 1 at rest, 2 at full stretch), air (true off the ground), fall (-1 rising fastest .. 1 falling fastest, 0 on the ground) }.
 */
export function hopArc(t, { off = 0.22, land = 0.74 } = {}) {
  const u = fract(t), mid = (off + land) / 2;
  const air = u > off && u < land;
  const k = air ? (u - off) / (land - off) : 0;
  const squash = loopKeys(u, [[0, 0.3], [off * 0.57, 1], [off + 0.03, -1], [mid, -0.1], [land - 0.08, -0.7], [land + 0.01, 1], [land + 0.135, -0.25]]);
  const legs = loopKeys(u, [[0, 0.75], [off * 0.57, 0], [off + 0.03, 2], [off + 0.155, 1.3], [mid, 1], [land - 0.08, 1.25], [land + 0.01, 0], [land + 0.135, 1.15]]);
  return { lift: air ? Math.sin(PI * k) : 0, squash, legs, air, fall: air ? -Math.cos(PI * k) : 0 };
}

// ---- skin wings -------------------------------------------------------------------


// ---- what is left in the air ------------------------------------------------------


// ---- eyes and feelers (added with the thorn beetle, fix round 1) -------------------
// creatureEye is the one function here that draws: the standard "Eyes" choice of a creature, the same on every body.

