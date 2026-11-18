// Shots: what flies out of a weapon. Light painted in nested bands over any shape (a bolt, a
// pellet, an orb, a ring of plasma), the shapes shots are made of (a drop with a tail, a crescent
// blade), a small missile and the puffs it leaves behind, and the glowing line along a blade's cutting edge. Added with batch S17
// (the station kit's projectiles); it goes with engine/fx.js, which has the particles, rings,
// flames and colour steps these are used with (docs/style-guide.md sections 2, 4 and 14).
//
//   import { lightShape, dropIn, crescentIn, missile, hotEdge } from '../engine/shots.js';
//   const C = steps(p.glow, { core: p.core, white: false });                       // [core, mid, glow, rim]
//   lightShape(g, capsuleIn(8, 8, 22, 8, 2.5), [C[0], C[2], C[3]]);               // a bolt of light: core, glow, rim
//   lightShape(g, dropIn(10, 8, 3, 8), [C[0], C[2], C[3]]);                       // a pellet and its streak, flying right
//   g.blob([spunIn(crescentIn(0, -6, 5, { angle: PI / 2 }), 16, 16, 3, turn)], ramp(p.metal));   // three sickle blades
//   const { nozzle } = missile(g, { x: 10, y: 8, length: 12, width: 4, colour: p.body, stripe: p.accent });
//   g.outline(INK); hotEdge(g, blades, p.glow);                                    // light along the cutting edge
//   trailPuffs(g, { t, x: nozzle[0] - 5, y: 8, count: 3, dist: 9, size: 4, colours: [body.base, body.dark] });   // exhaust smoke
//
// Everything here draws with hard pixel edges, uses no Math.random, draws only through the
// Surface's own calls (g.dot, g.fill: nothing is read back, so it suits any style that has them)
// and stays inside the frame's 1 px empty border, or inside `box` [x0, y0, x1, y1] when one is given.
// Directions use the rig convention of engine/fx.js: 0 = down, PI / 2 = right, PI = up, -PI / 2 = left.
// Light (lightShape, hotEdge) is drawn AFTER g.outline(INK); a missile is a solid thing and is drawn before it.

import { ramp } from './color.js';
import { PI, hash, fract } from './motion.js';

function boxOf(g, box) {
  const b = [1, 1, g.w - 1, g.h - 1];
  if (box) { b[0] = Math.max(b[0], Math.floor(box[0])); b[1] = Math.max(b[1], Math.floor(box[1])); b[2] = Math.min(b[2], Math.floor(box[2])); b[3] = Math.min(b[3], Math.floor(box[3])); }
  return b;
}

/**
 * Paints any shape as light, in nested bands: the last colour is a 1 px rim just outside the shape, the one before it fills the shape, and each hotter colour starts `inset` px further in. Returns the number of pixels in the shape.
 * Arguments: g (the Surface); inside (a shape test); colours (hottest first, as steps() gives them; the last is the rim; one colour paints the shape flat); options { inset (px each band is wide, default 1), rim (false: no rim, every colour is a band), box }. A shape too thin for every band keeps its outer ones.
 */
export function lightShape(g, inside, colours, { box, inset = 1, rim = true } = {}) {
  const B = boxOf(g, box);
  const w = B[2] - B[0], h = B[3] - B[1];
  const list = Array.isArray(colours) ? colours : [colours];
  if (w <= 0 || h <= 0 || !list.length) return 0;
  const hasRim = rim && list.length > 1;
  const body = hasRim ? list.slice(0, -1) : list;
  // how many steps (across or down) each pixel of the shape is from the nearest pixel outside it: 1 on its edge
  const D = new Uint16Array(w * h);
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(B[0] + x + 0.5, B[1] + y + 0.5)) continue;
    n++;
    D[y * w + x] = 1 + Math.min(x > 0 ? D[y * w + x - 1] : 0, y > 0 ? D[(y - 1) * w + x] : 0);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (D[i]) D[i] = Math.min(D[i], 1 + (x < w - 1 ? D[i + 1] : 0), 1 + (y < h - 1 ? D[i + w] : 0));
  }
  const step = Math.max(1, Math.round(inset));
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && D[y * w + x] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = D[y * w + x];
    if (d) g.dot(B[0] + x, B[1] + y, body[body.length - 1 - Math.min(body.length - 1, Math.floor((d - 1) / step))]);
    else if (hasRim && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.dot(B[0] + x, B[1] + y, list[list.length - 1]);
  }
  return n;
}

/**
 * Shape test for a drop: a round head at (cx, cy) whose tail narrows to a point: a comet, a teardrop, a pellet and its streak, a drip falling behind a blob; returns inside(px, py).
 * Arguments: cx, cy (centre of the head); r (its radius); tail (px from the centre to the tip of the tail, default twice r; r or less leaves just the disc); angle (the way the tail points, rig convention; default -PI / 2: to the left, behind something flying right).
 */
export function dropIn(cx, cy, r, tail = 2 * r, angle = -PI / 2) {
  const ux = Math.sin(angle), uy = Math.cos(angle);
  if (!(tail > r)) return (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  // the tail's sides leave the head where they touch it: `at` px along the tail, `half` px out to the side
  const at = (r * r) / tail, half = r * Math.sqrt(1 - (r / tail) ** 2);
  return (px, py) => {
    const dx = px - cx, dy = py - cy;
    if (dx * dx + dy * dy <= r * r) return true;
    const along = dx * ux + dy * uy;
    if (along < at || along > tail) return false;
    return Math.abs(dy * ux - dx * uy) <= (half * (tail - along)) / (tail - at);
  };
}

/**
 * Shape test for a crescent: a disc with a round bite out of one side: a sickle blade, a moon, a claw, a fang; returns inside(px, py).
 * Arguments: cx, cy (centre of the disc); r (its radius); options { bite (radius of the bite as a share of r, default 0.85), shift (how far the bite's centre is pushed from the disc's, as a share of r, default 0.45: less leaves a thinner crescent), angle (the side the bite is on, rig convention; default PI / 2: the right) }.
 */
export function crescentIn(cx, cy, r, { bite = 0.85, shift = 0.45, angle = PI / 2 } = {}) {
  const bx = cx + Math.sin(angle) * r * shift, by = cy + Math.cos(angle) * r * shift, br = r * bite;
  return (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r && (px - bx) ** 2 + (py - by) ** 2 > br * br;
}

/** The noses missile() can draw: round (a dome), pointed (a cone) and flat (a blunt end). No arguments: a frozen list. */
export const MISSILE_NOSES = Object.freeze(['round', 'pointed', 'flat']);
/** The fins missile() can draw: none, small (two stubs at the tail) and swept (two longer fins raked back past the tail). No arguments: a frozen list. */
export const MISSILE_FINS = Object.freeze(['none', 'small', 'swept']);

/**
 * Draws a small missile lying level with its nose to the right: a metal tube lit from the top right, with a nose, tail fins and an optional stripe round it; returns { nozzle: [x, y], tip: [x, y] }, the middle of its tail end and of its nose. Draw it before g.outline.
 * Arguments: g (the Surface); o: { x (its tail end, a whole number), y (its centre line: a whole number for an even width), length (px from tail to nose), width (px across the tube, default 4), nose (one of MISSILE_NOSES, default 'round'), fins (one of MISSILE_FINS, default 'small'), colour (the tube), finColour (default: the tube's), stripe (a colour for a band two px wide round the tube, with a seam of the tube's dark tone behind it; null for none), at (where the stripe sits along the tube, 0 tail to 1 nose, default 0.5), box }.
 */
export function missile(g, o) {
  const { nose = 'round', fins = 'small', colour = '#9aa6c0', stripe = null, at = 0.5 } = o;
  if (!MISSILE_NOSES.includes(nose)) throw new Error(`shots.missile: no nose "${nose}"; noses: ${MISSILE_NOSES.join(', ')}`);
  if (!MISSILE_FINS.includes(fins)) throw new Error(`shots.missile: no fins "${fins}"; fins: ${MISSILE_FINS.join(', ')}`);
  const B = boxOf(g, o.box);
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  const x = Math.round(o.x), L = Math.max(4, Math.round(o.length ?? 12)), W = Math.max(2, Math.round(o.width ?? 4));
  const y = o.y, half = W / 2, top = y - half, x1 = x + L;
  const nl = nose === 'round' ? half : nose === 'pointed' ? W * 0.75 : 0;        // px of nose
  const tube = (px, py) => {
    if (px < x || px >= x1 || py < top || py >= top + W) return false;
    if (px < x1 - nl) return true;
    const dy = Math.abs(py - y);
    if (nose === 'round') return ((px - (x1 - nl)) / nl) ** 2 + (dy / half) ** 2 <= 1;
    return dy <= Math.max(0.5, (half * (x1 - px + 0.5)) / nl);
  };
  // fins: rows of pixels above and below the tail, the outer row set further back when they are swept
  const rows = fins === 'small' ? [[x, 3]] : fins === 'swept' ? [[x - 1, 5], [x - 2, 3]] : [];
  const fin = (px, py) => rows.some(([fx, fw], k) => px >= fx && px < fx + fw && (Math.floor(py) === Math.floor(top) - 1 - k || Math.floor(py) === Math.floor(top + W) + k));
  const R = ramp(colour);
  if (rows.length) g.fill(x - 3, top - 3, x + 6, top + W + 3, fin, ramp(o.finColour ?? colour), { shade: 1, clip });
  g.fill(x, top, x1, top + W, tube, R, { shade: 1, light: 1, clip });
  if (stripe) {
    const sx = x + Math.round((L - nl - 2) * Math.min(1, Math.max(0, at)));
    // a seam of the tube's dark tone behind the band: it still shows where a look turns the stripe into the tube's own colour
    if (sx - 1 > x) g.fill(sx - 1, top, sx, top + W, (px, py) => px >= sx - 1 && px < sx && tube(px, py), R.dark, { clip });
    g.fill(sx, top, sx + 2, top + W, (px, py) => px >= sx && px < sx + 2 && tube(px, py), stripe, { clip });
  }
  return { nozzle: [x, y], tip: [x1, y] };
}

/**
 * Paints the line of light along a blade's cutting edge: the pixels two steps outside a shape, which is one pixel beyond its ink outline; returns how many it painted. Draw it after g.outline.
 * Arguments: g (the Surface); inside (the shape test of the inked thing); colour; options { where (a test (px, py) for the part of the line to paint: the leading side of a tooth, the outside of a disc; default all of it), box }.
 */
export function hotEdge(g, inside, colour, { where = null, box } = {}) {
  const B = boxOf(g, box);
  const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]], FAR = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let n = 0;
  for (let py = B[1] + 0.5; py < B[3]; py++) for (let px = B[0] + 0.5; px < B[2]; px++) {
    if (inside(px, py) || NEAR.some(([dx, dy]) => inside(px + dx, py + dy))) continue;
    if (!FAR.some(([dx, dy]) => inside(px + dx, py + dy))) continue;
    if (where && !where(px, py)) continue;
    g.dot(px, py, colour);
    n++;
  }
  return n;
}

/**
 * Draws the puffs a moving thing leaves behind it: each is born full size at (x, y), falls straight back and shrinks to a pixel before it is gone; rocket exhaust, a steam trail, bubbles, a dust wake. Looping: the puffs are evenly spaced in time, so one is always in view and the loop closes. Draw it after g.outline.
 * Arguments: g (the Surface); o: { t (loop phase 0..1), x, y (where a puff is born), count (how many are in the air, default 3), angle (the way they fall back, rig convention; default -PI / 2: left, behind something flying right), dist (px a puff falls back in its life, default 9), size (px across when born, default 4), spread (px a puff sits to one side or the other of the line, default 0.6), cycles (whole number of lives per loop, default 1), seed, colours (the puff's body colour first; a second colour is its shaded side and its rim; default a grey), box }.
 */
export function trailPuffs(g, o) {
  const { t = 0, x, y, count = 3, angle = -PI / 2, dist = 9, size = 4, spread = 0.6, cycles = 1, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  const C = Array.isArray(o.colours) && o.colours.length ? o.colours : ['#9aa6c0', '#6b7896'];
  const base = C[0], dark = C[1] ?? C[0];
  const ux = Math.sin(angle), uy = Math.cos(angle);
  const list = [];
  for (let i = 0; i < count; i++) {
    const life = fract(Math.max(1, Math.round(cycles)) * t + i / count);
    const side = (i % 2 ? 1 : -1) * spread * (0.5 + hash(i, seed * 64 + 3)) * life;
    list.push({ life, r: (size / 2) * (1 - life ** 1.6), px: x + ux * dist * life - uy * side, py: y + uy * dist * life + ux * side });
  }
  list.sort((a, b) => b.life - a.life);                  // the oldest first, the newborn in front
  for (const P of list) {
    if (P.r < 0.3) continue;
    if (P.r < 0.75) { if (clip(P.px, P.py)) g.dot(P.px, P.py, dark); continue; }
    const cx = Math.round(P.px * 2) / 2, cy = Math.round(P.py * 2) / 2;     // on whole or half pixels, so a small puff stays round
    g.fill(cx - P.r - 1, cy - P.r - 1, cx + P.r + 1, cy + P.r + 1, (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= P.r * P.r, { base, dark, light: base }, { shade: P.r >= 2.5 ? 1 : 0, outline: P.r >= 2 ? dark : null, clip });   // only a big puff has a rim and a shaded side: a small one would be nothing else
  }
}
