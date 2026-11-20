// PORT (migration batch E2): a copy of engine/creature.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/creature.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
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

import { clamp, lerp, smooth, fract, loopKeys, PI } from '../../../motion.js';
import { capsuleIn } from './surface.js';

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

/**
 * One wing beat of a looping `fly` clip: the down-stroke starts on frame 1 of 8 and is faster than the up-stroke, the wing tip trails the arm, the wing pulls in on the way up, and the body rises as the wings go down.
 * Arguments: t (clip phase 0..1); options { down (the share of the beat spent on the down-stroke, default 0.42), start (the phase at which the down-stroke starts, default 0.1) }.
 * Returns { arm (1 wing fully up .. -1 fully down), tip (the same for the wing tip, a little later), fold (0 stretched out .. 1 pulled in), lift (-1 body lowest .. 1 highest), stroke ('down' or 'up') }.
 */
export function flapCycle(t, { down = 0.42, start = 0.1 } = {}) {
  const d = clamp(down, 0.1, 0.9);
  const at = (x) => { const u = fract(x - start); return u < d ? Math.cos((PI * u) / d) : -Math.cos((PI * (u - d)) / (1 - d)); };
  const u = fract(t - start);
  return { arm: at(t), tip: at(t - 0.09), fold: u < d ? 0 : Math.sin((PI * (u - d)) / (1 - d)) ** 2, lift: -at(t - 0.06), stroke: u < d ? 'down' : 'up' };
}

// ---- shapes -------------------------------------------------------------------

/**
 * Shape test for a pointed leaf, petal or feather from its stem end (x0, y0) to its tip (x1, y1): widest part-way along and sharp at the tip.
 * Arguments: x0, y0 (the stem end); x1, y1 (the tip); width (pixels across at the widest); options { belly (where it is widest: 0 at the stem .. 1 at the tip, default 0.4), blunt (width at the stem end as a share of the widest: 0 a point .. 1 cut square, default 0.3) }.
 */
export function leafIn(x0, y0, x1, y1, width, { belly = 0.4, blunt = 0.3 } = {}) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1e-6, ux = dx / len, uy = dy / len, b = clamp(belly, 0.05, 0.95);
  return (px, py) => {
    const s = ((px - x0) * ux + (py - y0) * uy) / len;
    if (s < 0 || s > 1) return false;
    const d = Math.abs((px - x0) * uy - (py - y0) * ux);
    const k = s < b ? lerp(blunt, 1, Math.sin((PI / 2) * (s / b))) : 1 - ((s - b) / (1 - b)) ** 1.6;
    return d <= (width / 2) * k;
  };
}

const fanAngle = (a0, a1, i, count) => (count > 1 ? lerp(a0, a1, i / (count - 1)) : (a0 + a1) / 2);
const fanLength = (length, i, count) => (Array.isArray(length) ? lerp(length[0], length[1], count > 1 ? i / (count - 1) : 0.5) : length);

/**
 * The tip points of a fan of blades spread from one root, [[x, y], ...] from the first angle to the last: use them for bounds, midribs and highlights of a fanIn shape.
 * Arguments: x, y (the root); a0, a1 (rig angles of the first and last blade: 0 down, PI/2 right, PI up); count (how many blades); length (pixels, or [first, last] to grade it across the fan).
 */
export function fanTips(x, y, a0, a1, count, length) {
  const n = Math.max(1, Math.round(count)), tips = [];
  for (let i = 0; i < n; i++) { const a = fanAngle(a0, a1, i, n), L = fanLength(length, i, n); tips.push([x + Math.sin(a) * L, y + Math.cos(a) * L]); }
  return tips;
}

/**
 * Shape test for a fan of pointed blades spread from one root: a tail fan, a crest, a collar of leaves, a hand of spikes.
 * Arguments: x, y (the root); a0, a1 (rig angles of the first and last blade: 0 down, PI/2 right, PI up); count (how many blades); length (pixels, or [first, last]); width (pixels across each blade); options { belly, blunt } as for leafIn.
 */
export function fanIn(x, y, a0, a1, count, length, width, opt = {}) {
  const blades = fanTips(x, y, a0, a1, count, length).map(([tx, ty]) => leafIn(x, y, tx, ty, width, opt));
  return (px, py) => { for (const f of blades) if (f(px, py)) return true; return false; };
}

/**
 * Half the width of a bulb at height v, as a share of its widest half-width: the outline bulbIn fills, for placing ribs, eyes and bands on its surface.
 * Arguments: v (0 at the bottom .. 1 at the top); options { low (how far up it is widest, default 0.34), neck (half-width at the top as a share of the widest, default 0.3), flat (the same for the bottom: 0 a round bottom .. 1 a flat one, default 0.35) }.
 */
export function bulbHalf(v, { low = 0.34, neck = 0.3, flat = 0.35 } = {}) {
  if (v < 0 || v > 1) return 0;
  if (v <= low) return flat + (1 - flat) * Math.sqrt(Math.max(0, 1 - (1 - v / low) ** 2));
  return neck + (1 - neck) * (1 - smooth((v - low) / (1 - low)));
}

/**
 * Shape test for a bulb standing on a base line: an onion, seed pod, sack, droplet or flask, widest low down and drawn up to a narrow neck.
 * Arguments: cx (x of its middle); base (y of the line it stands on); rx (half its widest width); h (height); options { low, neck, flat } as for bulbHalf, lean (pixels the top is pushed to the right, bending the neck over; default 0).
 */
export function bulbIn(cx, base, rx, h, { low = 0.34, neck = 0.3, flat = 0.35, lean = 0 } = {}) {
  const o = { low, neck, flat };
  return (px, py) => {
    const v = (base - py) / h;
    if (v < 0 || v > 1) return false;
    return Math.abs(px - cx - lean * v * v) <= rx * bulbHalf(v, o);
  };
}

/**
 * Shape test for a coiled spring seen from the side, from (x0, y0) to (x1, y1): a zigzag of bars that packs into a flat slab when the ends come together and opens when they part, as a spring leg, coiled root, tail or tendril does.
 * Arguments: x0, y0, x1, y1 (the two ends, both on the middle line of the coil); turns (how many bars cross the middle line); width (pixels across the coil); r (half the thickness of the wire).
 */
export function springIn(x0, y0, x1, y1, turns, width, r) {
  const n = Math.max(1, Math.round(turns));
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1e-6, nx = -dy / len, ny = dx / len;
  const pts = [[x0, y0]];
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n, side = (i % 2 ? -1 : 1) * width / 2;
    pts.push([x0 + dx * k + nx * side, y0 + dy * k + ny * side]);
  }
  pts.push([x1, y1]);
  const bars = pts.slice(1).map((q, i) => capsuleIn(pts[i][0], pts[i][1], q[0], q[1], r));
  return (px, py) => { for (const f of bars) if (f(px, py)) return true; return false; };
}

/**
 * A feathered wing seen from the side, hinged at the shoulder: an arm with a fan of pointed flight feathers trailing from it, short by the body and long at the tip, so its back edge is ragged.
 * Arguments: sx, sy (the shoulder); angle (rig angle of the arm: 0 down, PI/2 right, PI up, negative to the left); length (pixels from the shoulder to the longest tip); options { chord (pixels across the wing by the body, default length * 0.45), feathers (how many, default 5), spread (radians the innermost feather trails away from the arm; its sign picks the side; default 1.2), fold (0 spread out .. 1 closed against the arm), tip (radians the outer feathers bend, default 0), fingers (0 a smooth wing .. 1 narrow feathers spread evenly with every other one shorter, so the tips stand apart like fingers; default 0) }.
 * Returns { inside (the shape test), tips ([[x, y], ...], innermost feather first), wrist ([x, y], where the long feathers start) }.
 */
export function featherWing(sx, sy, angle, length, { chord = length * 0.45, feathers = 5, spread = 1.2, fold = 0, tip = 0, fingers = 0 } = {}) {
  const n = Math.max(2, Math.round(feathers)), f = clamp(fold), fg = clamp(fingers);
  const ax = Math.sin(angle), ay = Math.cos(angle), armLen = length * 0.42;
  const wrist = [sx + ax * armLen, sy + ay * armLen];
  const tests = [capsuleIn(sx, sy, wrist[0], wrist[1], chord * 0.3, chord * 0.2)];
  const tips = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), k = lerp(0.12, 1, u);
    const rx = sx + ax * armLen * k, ry = sy + ay * armLen * k;
    const a = angle + spread * (1 - 0.85 * f) * (1 - u) ** lerp(1.3, 0.9, fg) + tip * u;
    const L = length * lerp(0.44, 0.58, u) * (1 - 0.2 * f * (1 - u)) * (i % 2 && i < n - 1 ? 1 - 0.14 * fg : 1);
    const tx = rx + Math.sin(a) * L, ty = ry + Math.cos(a) * L;
    tips.push([tx, ty]);
    tests.push(leafIn(rx, ry, tx, ty, chord * lerp(0.62, 0.46, u) * lerp(1, 0.74, fg), { belly: 0.45, blunt: 0.7 }));
  }
  const inside = (px, py) => { for (const t of tests) if (t(px, py)) return true; return false; };
  return { inside, tips, wrist };
}

// ---- staying in the frame -------------------------------------------------------

/**
 * How far to move a drawing, [dx, dy] in whole pixels, so that all of it stays inside the frame: [0, 0] when it already fits, the least that brings it in when it sticks out on one side, and centred when it is too big to fit.
 * Arguments: points (the outermost points of the drawing, [[x, y], ...] or [[x, y, r], ...] with a radius round each); w, h (the frame size); margin (pixels to keep clear at every edge, default 2: one for the outline, one for the empty border).
 */
export function nudgeInside(points, w, h, margin = 2) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, r = 0] of points) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
  if (x1 < x0) return [0, 0];
  const one = (lo, hi, size) => {
    const a = margin - lo, b = size - margin - hi;                // a > 0: sticks out at the start; b < 0: at the end
    return a > 0 && b < 0 ? Math.round((a + b) / 2) : a > 0 ? Math.ceil(a) : b < 0 ? Math.floor(b) : 0;
  };
  return [one(x0, x1, w), one(y0, y1, h)];
}

// ---- horns, tusks and claws -----------------------------------------------------

/**
 * The centre line of a curved horn, tusk, claw or feeler as a list of points from its root to its tip.
 * Arguments: x, y (the root); angle (the way it sets off, rig convention: 0 = down, PI/2 = picture-right, PI = up); length (pixels along the curve); options { curl (radians it turns in all from root to tip; above 0 turns toward up-and-back for a horn that points right), steps (how many straight pieces, default 5) }.
 */
export function hornPath(x, y, angle, length, { curl = 0, steps = 5 } = {}) {
  const n = Math.max(1, Math.round(steps)), pts = [[x, y]];
  for (let i = 0; i < n; i++) {
    const a = angle + curl * ((i + 0.5) / n), q = pts[i];
    pts.push([q[0] + Math.sin(a) * (length / n), q[1] + Math.cos(a) * (length / n)]);
  }
  return pts;
}

/**
 * Shape test for a curved horn, tusk, claw or thorn that tapers from its root to a point.
 * Arguments: x, y, angle, length (as hornPath()); options { curl, steps (as hornPath()), width (pixels across at the root, default 3), tip (pixels across at the tip, default 0.8) }.
 */
export function hornIn(x, y, angle, length, { curl = 0, steps = 5, width = 3, tip = 0.8 } = {}) {
  const pts = hornPath(x, y, angle, length, { curl, steps }), n = pts.length - 1;
  const tests = [];
  for (let i = 0; i < n; i++) tests.push(capsuleIn(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], lerp(width, tip, i / n) / 2, lerp(width, tip, (i + 1) / n) / 2));
  return (px, py) => { for (const t of tests) if (t(px, py)) return true; return false; };
}

// ---- skin wings -------------------------------------------------------------------
import { polyIn as hullIn } from './surface.js';

/**
 * A skin wing seen from the side, hinged at the shoulder: an arm out to a wrist, long fingers fanned from the wrist, and skin stretched between the finger tips with a scooped edge, as on a bat, an imp or a dragon.
 * Arguments: sx, sy (the shoulder); angle (rig angle of the arm: 0 down, PI/2 right, PI up, negative to the left); length (pixels from the shoulder to the tip of the leading finger); options { fingers (how many, default 3), spread (radians from the leading finger to the last one; its sign picks the side the skin hangs on; default 1.5), fold (0 stretched out .. 1 closed), scoop (0 straight edges .. 1 deep scoops between the finger tips, default 0.5), root ([x, y] where the trailing edge of the skin meets the body; default a third of the length from the shoulder, beyond the last finger) }.
 * Returns { inside (the shape test), tips ([[x, y], ...], leading finger first), wrist ([x, y]), root ([x, y]) }.
 */
export function membraneWing(sx, sy, angle, length, { fingers = 3, spread = 1.5, fold = 0, scoop = 0.5, root } = {}) {
  const n = Math.max(2, Math.round(fingers)), f = clamp(fold), open = spread * (1 - 0.8 * f);
  const wrist = [sx + Math.sin(angle) * length * 0.4, sy + Math.cos(angle) * length * 0.4];
  const tips = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), a = angle + open * u, L = length * 0.6 * (1 - 0.18 * u);
    tips.push([wrist[0] + Math.sin(a) * L, wrist[1] + Math.cos(a) * L]);
  }
  const base = root ?? [sx + Math.sin(angle + open * 1.25) * length * 0.33, sy + Math.cos(angle + open * 1.25) * length * 0.33];
  const hull = hullIn([[sx, sy], wrist, ...tips, base]);
  // each scoop is a circle through two neighbouring points of the trailing edge, centred outside the wing
  const bites = [];
  if (scoop > 0) {
    const edge = [...tips, base];
    for (let i = 0; i + 1 < edge.length; i++) {
      const [ax, ay] = edge[i], [bx, by] = edge[i + 1];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, d = Math.hypot(bx - ax, by - ay);
      let nx = mx - wrist[0], ny = my - wrist[1];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const k = lerp(2.2, 0.25, clamp(scoop)) * d;                 // how far outside the centre sits: nearer bites deeper
      bites.push([mx + nx * k, my + ny * k, (d / 2) ** 2 + k * k]);
    }
  }
  const inside = (px, py) => {
    if (!hull(px, py)) return false;
    for (const [x, y, r2] of bites) if ((px - x) ** 2 + (py - y) ** 2 < r2) return false;
    return true;
  };
  return { inside, tips, wrist, root: base };
}

// ---- what is left in the air ------------------------------------------------------
import { wave as flutterWave, hash as flutterHash } from '../../../motion.js';

/**
 * Loose feathers, leaves or petals thrown out from a point and then drifting down, turning as they go and thinning in number: what is left of a bird, a shaken bush or a burst pillow.
 * Arguments: t (0..1 over the burst); x, y (where it starts); options { count (how many at the start, default 8), keep (how many are still in the air at t = 1, default 3, so the last frame is never empty), reach (pixels they are thrown, default 10), fall (pixels they sink by the end, default 7), length, width (pixels, of each blade; default 5 and 2.6), seed, box ([x0, y0, x1, y1] that the middle of every blade stays inside) }.
 * Returns a list of shape tests, one per blade still in the air; a blade keeps its place in the list while it lasts, so colour them by index.
 */
export function flutterIn(t, x, y, { count = 8, keep = 3, reach = 10, fall = 7, length = 5, width = 2.6, seed = 0, box } = {}) {
  const u = clamp(t), total = Math.max(1, Math.round(count)), n = Math.round(lerp(total, Math.min(keep, total), clamp((u - 0.3) / 0.7)));
  const blades = [];
  for (let i = 0; i < n; i++) {
    const a = ((2 * i + 1) * PI) / total + 0.4 * i, out = reach * lerp(0.3, 1, Math.sqrt(u)) * (0.7 + 0.3 * flutterHash(i, seed * 64 + 3));
    let cx = x + Math.sin(a) * out + 1.5 * flutterWave(u + i / 3), cy = y + Math.cos(a) * out * 0.7 + fall * u * u;
    if (box) { cx = clamp(cx, box[0], box[2]); cy = clamp(cy, box[1], box[3]); }
    const turn = a + 1.2 * flutterWave(u * 0.7 + i / 5), half = (length * lerp(1, 0.75, u)) / 2;
    blades.push(leafIn(cx - Math.sin(turn) * half, cy - Math.cos(turn) * half, cx + Math.sin(turn) * half, cy + Math.cos(turn) * half, width, { belly: 0.5, blunt: 0.4 }));
  }
  return blades;
}

// ---- eyes and feelers (added with the thorn beetle, fix round 1) -------------------
// creatureEye is the one function here that draws: the standard "Eyes" choice of a creature, the same on every body.
import { pick as eyePick, tone as eyeTone, INK as EYE_INK } from '../colour.js';

/** The eye styles creatureEye() can draw: the options of the standard "Eyes" choice of a creature. No arguments: a list. */
export const CREATURE_EYES = ['dots', 'angry', 'glow'];

/**
 * Draws one small side-view creature eye in one of CREATURE_EYES, open or blinking, inside the 4x4 pixels round (x, y); it never reads pixels back.
 * Arguments: g (the Surface); x, y (the middle of the eye); opt { style ('dots' a white with a pupil at the front, 'angry' the same under a slanting brow, 'glow' a lit eye with a glint), blink (true: shut), body (the colour it sits on: the white and the pupil are picked to show against it), brow (the colour of the brow and of the shut lid, default the outline colour), glow (the colour of a glowing eye, default gold), rim (false leaves the glowing eye's darker rim off), within (a shape test the rim is kept inside, for example the head's; default everywhere) }.
 * When to call it: 'dots' and 'angry' BEFORE g.outline(), so they are part of the body; 'glow' AFTER it (and not on a frame tinted white), because light is never inked: it gets a rim of a darker tone of its own colour instead.
 * Added later, with everything above drawn as before: opt { style 'sleepy' (one of CREATURE_EYES_MORE: a heavy lid over a slit of eye, drawn BEFORE g.outline(); lid: the colour of the lid, default a darker tone of body), squint (true: squeezed shut in pain, a chevron of three pixels that points forward, whatever the style; BEFORE g.outline()), flip (true: mirrored left to right, for the far eye of a pair seen from the front or for a creature that faces left) }.
 */
export function creatureEye(g, x, y, opt = {}) {
  if (opt.flip || opt.squint || opt.style === 'sleepy') return creatureEyeMore(g, x, y, opt);
  const style = CREATURE_EYES.includes(opt.style) ? opt.style : 'dots';
  const ex = Math.round(x) - 1, ey = Math.round(y) - 1;                     // the top-left pixel of the 2x2 middle of the eye
  if (style === 'glow') {
    const lit = opt.glow ?? '#f2c230', rim = eyeTone(lit, -1);
    if (opt.blink) { g.dot(ex, ey + 1, rim); g.dot(ex + 1, ey + 1, rim); return g; }
    if (opt.rim !== false) {
      for (const [dx, dy] of [[-1, 0], [-1, 1], [2, 0], [2, 1], [0, -1], [1, -1], [0, 2], [1, 2]]) {
        if (!opt.within || opt.within(ex + dx + 0.5, ey + dy + 0.5)) g.dot(ex + dx, ey + dy, rim);
      }
    }
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.dot(ex + dx, ey + dy, lit);
    g.dot(ex + 1, ey, '#ffffff');
    return g;
  }
  // W the white, D the pupil, K the brow or lid; a dot is left alone
  const white = eyePick(opt.body ?? '#808080', '#ffffff', EYE_INK);
  const ink = { W: white, D: eyePick(white, EYE_INK, '#ffffff'), K: opt.brow ?? EYE_INK };
  const stamp = (rows, x0, y0) => rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (ink[row[c]]) g.dot(x0 + c, y0 + r, ink[row[c]]); });
  if (opt.blink) stamp(['KK'], ex, ey + 1);
  else if (style === 'angry') stamp(['K..', 'WKK', 'WWD'], ex - 1, ey - 1);
  else stamp(['WW', 'WD', 'WD'], ex, ey - 1);
  return g;
}

/**
 * Shape test for a thin feeler, antenna or whisker: a line one pixel wide that curves from its root to its tip, with a small knob on the tip if asked.
 * Arguments: x, y (the root); angle (the way it sets off, rig convention: 0 = down, PI/2 = picture-right, PI = up); length (pixels along the curve); options { curl (radians it turns in all from root to tip; below 0 droops forward and down for a feeler that points right), steps (straight pieces, default 4), width (pixels across, default 1.1), knob (radius of a round tip in pixels, default 0: none) }.
 */
export function feelerIn(x, y, angle, length, { curl = 0, steps = 4, width = 1.1, knob = 0 } = {}) {
  const pts = hornPath(x, y, angle, length, { curl, steps }), tests = [];
  for (let i = 0; i + 1 < pts.length; i++) tests.push(capsuleIn(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], width / 2));
  const tip = pts[pts.length - 1];
  if (knob > 0) tests.push((px, py) => (px - tip[0]) ** 2 + (py - tip[1]) ** 2 <= knob * knob);
  return (px, py) => { for (const t of tests) if (t(px, py)) return true; return false; };
}

// ---- ribs on a bulb, fitting a motion to the frame, more eyes (added with the spore hopper and the crow scout, fix round 1) ----

/**
 * Shape test for ribs, seams or stripes that run down a bulb, each keeping its share of the bulb's width at every height, so they bend, squash and lean with the body: the ribs of a seed pod, a gourd, a pumpkin or a paper lantern.
 * Arguments: cx, base, rx, h (the bulb, exactly as given to bulbIn); fractions (where each rib runs, as shares of the half-width: -1 the left edge .. 0 the middle .. 1 the right edge); options { low, neck, flat, lean (the bulb's own, as for bulbIn), from, to (the heights the ribs run between: 0 the bottom .. 1 the top; default 0.08 and 0.88), width (pixels across each rib, default 1: one pixel in every row) }.
 * Paint it over the body and clipped to it: g.fill(0, 0, g.w, g.h, bulbRibsIn(...), colour, { clip: bulbIn(...) }).
 */
export function bulbRibsIn(cx, base, rx, h, fractions, { low = 0.34, neck = 0.3, flat = 0.35, lean = 0, from = 0.08, to = 0.88, width = 1 } = {}) {
  const o = { low, neck, flat }, list = [...fractions], half = width / 2;
  return (px, py) => {
    const v = (base - py) / h;
    if (v < from || v > to) return false;
    const mid = cx + lean * v * v, wide = rx * bulbHalf(v, o);
    for (const f of list) { const d = px - (mid + wide * f); if (d > -half && d <= half) return true; }
    return false;
  };
}

/**
 * The biggest scale, tried from 1 downward, at which a drawing is no wider and no taller than the frame has room for, so that nudgeInside() can then keep all of it in: for scaling a motion down on a big look (a wing lifted less, a lower hop) instead of letting it leave the frame.
 * Arguments: marksAt (a function of the scale k that returns the outermost points of the drawing at that scale, [[x, y], ...] or [[x, y, r], ...]; or a list of such lists, one per frame, when one scale has to fit a whole clip); w, h (the frame size); margin (pixels to keep clear at every edge, default 2, as for nudgeInside); options { least (the smallest scale tried and the answer when nothing fits, default 0.3), step (how much smaller each try is, default 0.1) }.
 */
export function fitScale(marksAt, w, h, margin = 2, { least = 0.3, step = 0.1 } = {}) {
  const fits = (points) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, r = 0] of points) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
    return x1 < x0 || (x1 - x0 <= w - 2 * margin + 1e-6 && y1 - y0 <= h - 2 * margin + 1e-6);
  };
  for (let i = 0; ; i++) {
    const k = Math.round((1 - i * step) * 1e6) / 1e6;
    if (k <= least) return least;
    const marks = marksAt(k), frames = Array.isArray(marks[0]?.[0]) ? marks : [marks];
    if (frames.every(fits)) return k;
  }
}

/** The eye styles creatureEye() can draw besides the standard three of CREATURE_EYES, for an "Eyes" choice that offers them: 'sleepy' (a heavy lid over a slit of eye). No arguments: a list. */
export const CREATURE_EYES_MORE = ['sleepy'];

// What creatureEye() hands over to for the sleepy style, the squeezed-shut eye and the mirrored eye. It draws with g.dot only.
function creatureEyeMore(g, x, y, opt) {
  const ex = Math.round(x) - 1, ey = Math.round(y) - 1;                     // the top-left pixel of the 2x2 middle of the eye
  if (opt.flip) {
    // the same eye drawn through a surface that mirrors every pixel about the middle of the eye
    const mirror = { dot(px, py, c) { g.dot(2 * ex + 1 - px, py, c); return mirror; } };
    creatureEye(mirror, x, y, { ...opt, flip: false, within: opt.within && ((px, py) => opt.within(2 * ex + 2 - px, py)) });
    return g;
  }
  const body = opt.body ?? '#808080', white = eyePick(body, '#ffffff', EYE_INK);
  if (opt.squint) { g.dot(ex, ey - 1, white); g.dot(ex + 1, ey, white); g.dot(ex, ey + 1, white); return g; }   // a chevron that points forward: >
  // sleepy: L the lid, which droops at the back, W the slit of eye under it; shut, the lid covers the slit too
  const ink = { L: opt.lid ?? eyeTone(body, -1), W: white };
  (opt.blink ? ['.LL', 'LLL', '.LL'] : ['.LL', 'LLL', '.WW']).forEach((row, r) => { for (let c = 0; c < 3; c++) if (ink[row[c]]) g.dot(ex - 1 + c, ey - 1 + r, ink[row[c]]); });
  return g;
}

// ---- a horn that stays in the frame (added with the moss golem, fix round 1) ----

/**
 * The longest a horn, tusk or claw can be, up to the asked length, without leaving a box: for a horn on a head that a pose carries close to the edge of the frame, which is then drawn shorter instead of being cut off.
 * Arguments: x, y, angle, length (as hornPath(); length is the most it may be); options { curl, steps, width, tip (as hornIn(): the answer is for a horn drawn with the same ones), box ([x0, y0, x1, y1] the horn must stay inside, for example [2, 2, W - 2, H - 2]; without one the asked length comes back), least (the answer when no length fits, because the root is already at the edge; default 0) }.
 * Returns the length to hand to hornPath() or hornIn(); the root is not moved, so a root outside the box stays outside.
 */
export function hornFit(x, y, angle, length, { curl = 0, steps = 5, width = 3, tip = 0.8, box, least = 0 } = {}) {
  if (!box || !(length > 0)) return length;
  // the points of the centre line move out from the root in step with the length, and the width at each does not change with it
  const unit = hornPath(0, 0, angle, 1, { curl, steps }), n = unit.length - 1;
  let fit = length;
  for (let i = 1; i <= n; i++) {
    const r = lerp(width, tip, i / n) / 2, [ux, uy] = unit[i];
    if (ux > 1e-9) fit = Math.min(fit, (box[2] - r - x) / ux);
    if (ux < -1e-9) fit = Math.min(fit, (box[0] + r - x) / ux);
    if (uy > 1e-9) fit = Math.min(fit, (box[3] - r - y) / uy);
    if (uy < -1e-9) fit = Math.min(fit, (box[1] + r - y) / uy);
  }
  return Math.max(least, fit);
}
