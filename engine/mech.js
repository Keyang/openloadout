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

import { ramp } from './color.js';
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

/**
 * Draws a coil spring seen from the side between two end points: the far half of each turn in the wire's dark tone, the near half over it in the lit tones; squeezed short it becomes a stack of bars, pulled long an open zigzag.
 * Arguments: g (the Surface); x0, y0 (one end); x1, y1 (the other end); options { turns (how many coils, default 3), width (px across the coil, default 10), thick (px of wire, default 2), colour (the wire, '#rrggbb') }.
 */
export function coil(g, x0, y0, x1, y1, { turns = 3, width = 10, thick = 2, colour = '#c2c9d6' } = {}) {
  const n = Math.max(1, Math.round(turns));
  const R = ramp(colour);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / len, ny = dx / len;                       // across the coil
  const half = Math.max(0.5, width / 2 - thick / 2);
  const at = (s, side) => [x0 + dx * s + nx * half * side, y0 + dy * s + ny * half * side];
  const near = { base: R.base, light: R.light, dark: R.base };
  for (let i = 0; i < n; i++) {                              // the far half-turns first
    const a = at(i / n, 1), b = at((i + 0.5) / n, -1);
    g.limb(a[0], a[1], b[0], b[1], thick, R.dark);
  }
  for (let i = 0; i < n; i++) {                              // then the near ones, lit along their upper side
    const a = at((i + 0.5) / n, -1), b = at((i + 1) / n, 1);
    g.limb(a[0], a[1], b[0], b[1], thick, near, { shade: 0, light: 1 });
  }
  return g;
}

/**
 * Draws a chain three pixels wide between two points: links seen flat (a small ring) alternate with links seen edge on (a dark bar), and both ends finish on a link's end.
 * Arguments: g (the Surface); x0, y0 (one end); x1, y1 (the other end); options { colour (the metal, '#rrggbb'), link (px length of a flat link, default 4), bow (px the middle hangs out to one side, positive or negative; the ends stay put; default 0) }.
 */
export function chain(g, x0, y0, x1, y1, { colour = '#c2c9d6', link = 4, bow = 0 } = {}) {
  const R = ramp(colour);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.round(len));
  const nx = len ? -dy / len : 1, ny = len ? dx / len : 0;   // across the chain
  const period = Math.max(3, Math.round(link)) + 1;
  const lit = nx - ny > 0 ? 1 : -1;                          // the side of a flat link that faces the light (top right)
  for (let s = 0; s <= steps; s++) {
    const k = s / steps, out = bow * Math.sin(Math.PI * k);
    const cx = x0 + dx * k + nx * out, cy = y0 + dy * k + ny * out;
    const j = s % period;
    const end = s === 0 || s === steps;
    if (!end && j > 0 && j < period - 2) {                   // the two sides of a flat link
      g.dot(Math.round(cx + nx * lit), Math.round(cy + ny * lit), R.light);
      g.dot(Math.round(cx - nx * lit), Math.round(cy - ny * lit), R.base);
    } else g.dot(Math.round(cx), Math.round(cy), !end && j === period - 1 ? R.dark : R.base);   // a link's end, or the link seen edge on
  }
  return g;
}

/**
 * Draws a spinning rotor seen from above at a slant, as a blur: a flat disc with a blade across it, in two alternating pictures so that it flickers when `beat` goes up by one each frame; stopped, it is two crisp blades.
 * Arguments: g (the Surface); x, y (the hub); r (px from the hub to a blade tip); options { beat (a whole number: even and odd give the two pictures, default 0), flat (the disc's height as a share of its width, default 0.4), colour (the blades, '#rrggbb'), hub (the hub's colour, default the blades' dark tone), still (true: stopped, two crisp blades), turn (radians: where the stopped blades point, default 0.5) }.
 */
export function rotor(g, x, y, r, { beat = 0, flat = 0.4, colour = '#c2c9d6', hub, still = false, turn = 0.5 } = {}) {
  const R = ramp(colour), ry = Math.max(1.5, r * flat), cap = hub ?? R.dark;
  if (still) {
    const dx = Math.cos(turn) * r, dy = Math.sin(turn) * r * flat;
    g.limb(x - dx, y - dy, x + dx, y + dy, 2, R, { shade: 0 });
  } else if (Math.round(beat) % 2 === 0) {
    g.ellipse(x, y, r, ry, R.light, { shade: 0 });                       // the wide picture: a pale disc, the blade lying across it
    g.rect(Math.round(x - r + 1), Math.floor(y), Math.round(2 * r - 2), 1, R.base);
  } else {
    g.ellipse(x, y, Math.max(2, r - 1), ry, R.base, { shade: 0 });       // the narrow picture: a darker disc, the blade slanting through it
    g.line(x - r * 0.6, y - ry * 0.7, x + r * 0.6, y + ry * 0.7, R.light);
  }
  g.rect(Math.floor(x) - (r >= 5 ? 1 : 0), Math.floor(y) - (ry >= 2.5 ? 1 : 0), r >= 5 ? 2 : 1, ry >= 2.5 ? 2 : 1, cap);
  return g;
}
