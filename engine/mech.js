// Machine parts for props and traps: toothed wheels (gears, cogs, saw blades), coil springs and
// chains (docs/style-guide.md section 14). Pure functions of their arguments: they run in Node and
// in the browser, use no Math.random, and draw with hard pixel edges like everything else.
//
//   import { toothedIn, coil, chain } from '../engine/mech.js';
//   const turn = (t * TAU) / teeth;                                          // one tooth per loop: the loop closes
//   g.fill(0, 0, g.w, g.h, toothedIn(24, 24, 15, teeth, 3, turn, 'saw'), ramp(p.metal), { light: 1 });   // a saw blade
//   g.fill(0, 0, g.w, g.h, toothedIn(32, 21, 6, 6, 2, turn), ramp(p.metal));                             // a small gear
//   coil(g, 16, padY, 16, 27, { turns: 3, width: 10, colour: p.metal });     // a spring between a pad and its foot
//   chain(g, 8, 1, 8, 9, { colour: p.metal });                               // a chain hanging from the top of the frame
//
// A wheel turned by a whole number of teeth is the same picture, so a looping clip turns it by
// one tooth (or a whole number of teeth) per loop. Angles here turn clockwise on screen, in radians.
// Draw these before g.outline(INK): they are solid things.


import { TAU } from './motion.js';

/**
 * Shape test for a toothed wheel centred on (cx, cy): a gear or cog with square teeth, or a saw blade with leaning teeth; returns inside(px, py).
 * Arguments: cx, cy (centre); r (radius to the tooth tips); teeth (how many); depth (px from a tip down to the root between teeth); angle (turn in radians, clockwise on screen; default 0); profile ('square': gear teeth, the default, or 'saw': each tooth climbs slowly and drops straight down, its upright cutting face leading when the wheel turns clockwise); duty (square teeth only: the share of each step that is tooth, default 0.5).
 */
export function toothedIn(cx, cy, r, teeth, depth, angle = 0, profile = 'square', duty = 0.5) {
  const n = Math.max(1, Math.round(teeth));
  const root = r - depth;
  return (px, py) => {
    const dx = px - cx, dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= root * root) return true;
    if (d2 > r * r) return false;
    // where we are in the step from one tooth to the next, 0..1; the small push keeps a pixel that sits
    // exactly on a tooth's edge on the same side whichever whole tooth the wheel has turned by
    let u = ((Math.atan2(dy, dx) - angle) * n) / TAU + 1e-7;
    u -= Math.floor(u);
    if (profile === 'saw') return d2 <= (root + depth * u) ** 2;
    return u < duty;
  };
}
