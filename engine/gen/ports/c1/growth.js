// PORT (creature batch C1): a copy of engine/growth.js with its imports pointed at C1's rock.js copy, the port surface
// shim and engine/motion.js, so it draws paint refs on engine/gen/port-surface.js grids (the moss golem's moss, mushrooms
// and saplings, ./moss-golem.js). It is the drawing code of creature.moss-golem@1 (engine/gen/creature-c1.js), so it is
// NOT temporary: it stays when engine/growth.js goes and goes only with the last generator version that draws with it.
// Word for word; never change what a released generator version draws through it.
// Things that grow on other things: a cap of moss (or snow, or icing) lying on a shape, a mushroom and
// a sapling standing on it. For overgrown stone, old ruins, mossy logs, a golem's back, a snowy roof.
// Each is drawn from a point (or a shape) and its own settings, so it can ride on anything that moves:
// give it the point and the way "up" points there, and it turns with its host.
// Pure functions of their arguments; they draw solid things, so call them before g.outline(INK).
//
//   import { mossCap, mushroom, sapling } from '../engine/growth.js';
//   const boulder = rock(g, { x: 24, y: 30, r: 12, colour: p.stone });                    // engine/fx.js: returns its shape test
//   mossCap(g, boulder, [10, 16, 38, 28], ramp(p.growthColour), { under: ramp(p.stone).dark, depth: 3 });
//   mushroom(g, 20, 20, PI, { height: 4, cap: 4, paint: ramp(p.growthColour), stalk: ramp(P.cream) });
//   sapling(g, 28, 19, PI, { length: 12, sway: 0.08 * wave(t), leaf: 3, paint: ramp(p.growthColour), wood: ramp(P.soil) });
//
// Directions use the rig convention: 0 = down, PI/2 = right, PI = up. A thing that would leave its
// box (default: the frame less 2 px) is drawn smaller, and left out if it still does not fit.

import { capIn } from './rock.js';
import { ellipseIn } from './surface.js';
import { reach, dir, PI } from '../../../motion.js';

const boxOf = (g, box) => box ?? [2, 2, g.w - 2, g.h - 2];
const fits = (B, x, y, r) => x - r >= B[0] && x + r <= B[2] && y - r >= B[1] && y + r <= B[3];

/**
 * Draws a layer lying on top of a shape (moss, snow, icing): a ragged cap in three tones with a light top row, and a line of shadow on the shape just under its lower edge so the two stay apart in any colours.
 * Arguments: g (the Surface), inside (the shape test it lies on), box ([x0, y0, x1, y1]: the columns to cover, and the rows the shape's top edge must be in), paint (the layer's ramp), options { under (colour of the shadow line on the shape; leave out for none), depth, rise, ragged, seed (as capIn in engine/rock.js) }.
 */
export function mossCap(g, inside, box, paint, { under, depth = 3, rise = 1, ragged = 2, seed = 0 } = {}) {
  const cap = capIn(inside, box, { depth, rise, ragged, seed });
  const x0 = box[0] - 1, y0 = box[1] - rise - 2, x1 = box[2] + 1, y1 = box[3] + depth + ragged + 2;
  if (under) g.fill(x0, y0, x1, y1, (px, py) => !cap(px, py) && cap(px, py - 1) && inside(px, py), under, { shade: 0 });
  g.fill(x0, y0, x1, y1, cap, paint, { shade: 1 });
  g.fill(x0, y0, x1, y1, (px, py) => cap(px, py) && !cap(px, py - 1), paint.light ?? paint, { shade: 0 });
  return g;
}

/**
 * Draws a small mushroom standing at (x, y): a stalk and a domed cap, pointing the way `up` points; returns false when there was no room for it.
 * Arguments: g (the Surface), x, y (where it is rooted), up (the way it grows: PI = straight up), options { height (px of stalk, default 4), cap (half the cap's width in px, default 4), paint (the cap's ramp or colour), stalk (the stalk's ramp or colour), box ([x0, y0, x1, y1] it must stay inside) }.
 */
export function mushroom(g, x, y, up, { height = 4, cap = 4, paint = '#c9423a', stalk = '#f0ead8', box } = {}) {
  const B = boxOf(g, box);
  let h = height, r = cap, tip = reach(x, y, up, h);
  for (let tries = 0; tries < 3 && !fits(B, tip[0], tip[1], r + 1); tries++) { h *= 0.6; r *= 0.8; tip = reach(x, y, up, h); }
  if (!fits(B, tip[0], tip[1], r + 1)) return false;
  const [ux, uy] = dir(up);
  g.capsule(x, y, tip[0], tip[1], r >= 3 ? 1.1 : 0.75, stalk, { shade: 0 });
  const dome = (px, py) => {
    const dx = px - tip[0], dy = py - tip[1], along = dx * ux + dy * uy, across = dx * uy - dy * ux;
    return along >= -0.7 && (across / r) ** 2 + (along / (r * 0.8)) ** 2 <= 1;
  };
  g.fill(tip[0] - r - 1, tip[1] - r - 1, tip[0] + r + 1, tip[1] + r + 1, dome, paint, { shade: 1 });
  return true;
}

/**
 * Draws a sapling rooted at (x, y): a thin stem of three segments that bends more toward its tip, and three clumps of leaves; returns false when there was no room for it.
 * Arguments: g (the Surface), x, y (the root), up (the way it grows: PI = straight up), options { length (px of stem, default 12), sway (radians each segment bends further than the last; animate it with a wave, default 0), leaf (radius of the top clump in px, default 3), paint (the leaves' ramp or colour), wood (the stem's ramp or colour), box ([x0, y0, x1, y1] it must stay inside) }.
 */
export function sapling(g, x, y, up, { length = 12, sway = 0, leaf = 3, paint = '#3f8a4f', wood = '#7a4f33', box } = {}) {
  const B = boxOf(g, box);
  let len = length, r = leaf, pts;
  const ok = () => fits(B, pts[3][0], pts[3][1], r + 1.5) && fits(B, pts[2][0], pts[2][1], r * 1.7 + 1.5);
  for (let tries = 0; tries < 4; tries++) {
    pts = [[x, y]];
    for (let i = 0; i < 3; i++) pts.push(reach(pts[i][0], pts[i][1], up + sway * (i + 1), len / 3));
    if (ok()) break;
    len *= 0.7; r *= 0.85;
  }
  if (!ok()) return false;
  for (let i = 0; i < 3; i++) g.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1.25 - 0.3 * i, 1 - 0.3 * i, wood, { shade: 0 });
  const [tx, ty] = pts[3], [mx, my] = pts[2], [sx, sy] = dir(up - PI / 2);
  g.blob([
    ellipseIn(tx, ty - r * 0.2, r, r * 0.85),
    ellipseIn(mx + sx * r * 0.95, my + sy * r * 0.95, r * 0.7, r * 0.55),
    ellipseIn(mx - sx * r * 0.9, my - sy * r * 0.9 - 1, r * 0.62, r * 0.5),
  ], paint, { shade: 1, clip: (px, py) => px >= B[0] - 1 && py >= B[1] - 1 && px < B[2] + 1 && py < B[3] });
  return true;
}
