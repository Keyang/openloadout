// PORT (migration batch C2): a copy of rigs/crawler.js with its imports pointed at the port shims (engine/gen/ports/c2/colour.js,
// engine/gen/ports/surface.js and migration batch E2's copies in engine/gen/ports/e2/), so it draws paint refs on
// engine/gen/port-surface.js grids. It is the drawing code of migration batch C2's creature generators
// (engine/gen/creatures.js), so it is NOT temporary: it stays when rigs/crawler.js goes and goes only with the last generator
// version that draws with it. A HAND CHANGE note says where it differs from its source; never change what a released
// generator version draws through it.
// Side-view crawler rig (faces right), on a 48x48 canvas: a low body carried close to the ground on several pairs
// of short legs. Beetles, bugs, crabs, lizards and anything else that scuttles are built on it.
//
//   dims(o)                      body measurements from plain numbers: length, height, how high the legs carry it, pairs of legs
//   clipsFor(names, speedOf)     standard clip entries: idle, walk, attack, block, hurt, die
//   gait(i, side), step(u, o)    which legs move together, and the path of one walking foot
//   pose(name, t, m, d)          where the body is and what every foot does, for every name in POSES
//   fit(P, d, opt)               keeps a pose with a long horn or tail inside the frame
//   solve(P, d)                  J: the body's place and turn this frame, and every leg joint in pixels
//   place(J, tests)              shape tests written around the body's own middle, put where the body is this frame
//   drawLegs(g, J, d, side, paint)   paints the legs of the near or the far side
//   sockets(J, P, d)             named attach points for parts: head, back, feet
//   domeHalf, domeIn, domePoint  a domed shell (or any humped back) and points on its surface, for spikes and plates
//
// The rig does not paint a body: every crawler has its own. A sprite writes its shapes around the body's middle
// (x forward, y down, in pixels: the belly is the line y = d.h / 2, the back y = -d.h / 2, the front x = d.len / 2)
// and hands them to place(), which moves and turns them with the body. Because shapes are redrawn, not rotated as
// pictures, a body that tips over (the flip onto its back in `die`) stays clean pixel art and is lit from the top right
// at every angle.
//
//   import * as C from '../rigs/crawler.js';
//   const d = C.dims({ length: 22, height: 11, legs: 4, pairs: 3 });
//   const P = C.fit(C.pose(clip, t, { bounce: p.bounce }, d), d, { front: d.len / 2 + 8 });
//   const J = C.solve(P, d);
//   C.drawLegs(g, J, d, 'far', farRamp(p.accent));
//   C.drawLegs(g, J, d, 'near', ramp(p.accent));
//   g.blob([C.place(J, [C.domeIn(-d.len / 2, d.len / 2, d.h / 2, d.h)])], ramp(p.body), { shade: 2, light: 1 });
//
// Typical order: far legs, head, belly, near legs, shell (its rim hides the tops of the legs), spikes, outline.
// Angles of the pose are in radians. Socket angles use the rig convention of engine/motion.js: 0 = down,
// PI/2 = picture-right, PI = up.

import { lerp, clamp, wave, pulse, keys, ik2, smooth, fract, PI, TAU } from '../../../motion.js';
import { placedIn } from '../e2/shapes.js';

/** The frame of a side-view crawler, [width, height] in pixels. */
export const SIZE = [48, 48];
/** The ground line: feet rest on the row above it. */
export const GROUND = 42;
/** The x a game anchors the crawler at: the middle of the frame. */
export const CX = 24;
/** Where a game anchors the crawler: [CX, GROUND]. */
export const PIVOT = [CX, GROUND];

/** The clips this rig has a pose for: frames, frames per second at the middle speed, loop. */
const CLIP_TABLE = {
  idle: [8, 7, true], walk: [8, 10, true], attack: [8, 13, false], block: [6, 10, false], hurt: [4, 9, false], die: [8, 10, false],
};

/** Every name pose() knows. */
export const POSES = Object.keys(CLIP_TABLE);

/**
 * Standard clip entries for the named crawler clips, in the order given, with the style guide's frame counts and speeds.
 * Arguments: names (list of clip names from POSES), speedOf ((p) => 0..1, the sprite's speed control).
 */
export function clipsFor(names, speedOf = () => 0.5) {
  const out = {};
  for (const name of names) {
    const row = CLIP_TABLE[name];
    if (!row) throw new Error(`rigs/crawler.js: no standard clip "${name}" (it has: ${POSES.join(', ')})`);
    out[name] = { frames: row[0], fps: (p) => row[1] * lerp(0.65, 1.45, speedOf(p) ?? 0.5), loop: row[2] };
  }
  return out;
}

/**
 * Body measurements of a crawler in pixels, from plain numbers.
 * Arguments: o { length (of the body, default 22), height (belly to back, default 11), legs (how high the belly is carried above the ground, default 4), pairs (pairs of legs, default 3), legW (leg thickness, default 2), splay (how far the feet stand out beyond their hips, front and back, default 0.3), cx (the x the middle of the body stands at, default CX) }.
 * Returns { len, h, rise, pairs, legW, bone (the length of each of a leg's two bones), hips and feet (the x of every pair's hip and resting foot from the middle of the body, front pair first), cx }.
 */
export function dims(o = {}) {
  const len = o.length ?? 22, h = o.height ?? 11, rise = Math.max(1, o.legs ?? 4), pairs = Math.max(1, Math.round(o.pairs ?? 3));
  const splay = o.splay ?? 0.3;
  const hips = [], feet = [];
  for (let i = 0; i < pairs; i++) {
    const k = pairs === 1 ? 0 : 1 - (2 * i) / (pairs - 1);          // 1 at the front pair .. -1 at the back pair
    hips.push(k * len * 0.3);
    feet.push(k * len * 0.3 * (1 + splay) + (pairs > 1 && i === 0 ? 0.5 : 0));
  }
  // a leg is a little longer than the drop from hip to ground, so the knee always shows a bend
  const bone = Math.max(1.6, (Math.hypot(rise + 1, len * 0.3 * splay) * 1.16) / 2);
  return { len, h, rise, pairs, legW: o.legW ?? 2, bone, hips, feet, cx: o.cx ?? CX };
}

/**
 * The share of a walk cycle by which a leg trails the front near leg: neighbouring legs alternate, so six legs move as two groups of three.
 * Arguments: i (which pair, 0 = front), side (0 the near side, 1 the far side).
 */
export const gait = (i, side = 0) => ((i + side) % 2 ? 0.5 : 0);

/**
 * The path of one walking foot: it touches down in front at u = 0, slides back along the ground, then lifts and swings forward again.
 * Arguments: u (the leg's own phase, any number; only its fraction counts); options { stride (how far in front of and behind its resting spot it goes, default 2.5), lift (how high it is carried, default 2), duty (the share of the cycle spent on the ground, default 0.55) }.
 * Returns { x (pixels in front of the resting spot), y (pixels off the ground) }.
 */
export function step(u, { stride = 2.5, lift = 2, duty = 0.55 } = {}) {
  u = fract(u);
  if (u < duty) return { x: lerp(stride, -stride, u / duty), y: 0 };
  const s = (u - duty) / (1 - duty);
  return { x: lerp(-stride, stride, smooth(s)), y: lift * Math.sin(PI * s) };
}

/**
 * The pose of a crawler for a clip at phase t (0..1): where the body is, how it is turned, and what every foot does.
 * Arguments: name (one of POSES); t; m { bounce, stride (0..1: how lively, how long the steps), swing (scales the lunge of `attack`, default 1) }; d (from dims()).
 * Returns { x (body moved forward), drop (body sunk toward the ground), lift (whole creature off the ground), pitch (nose down, radians), roll (0 upright .. PI on its back), tuck (0..1 legs folded under the body), hide (0..1 head drawn in), round (0..1 the back hunched up, for `block`), free (0..1 the feet have left the ground and hang from the body), curl (0..1 loose legs drawn in), jab (0..1 the head thrust out), sway (-1..1 for feelers and tails), blink, flash (tint this frame white), feet: one { x, y } per leg (forward of its resting spot, height off the ground), the near side's legs first, each side front to back }.
 * idle: breathes and taps a front foot. walk: feet touch down on frames 0 and 4 of 8, in two alternating groups. attack: draws back with the head low on frames 1 to 2, lunges on 3, furthest on 4. block: folds up on frame 1 of 6, takes the blow on 2, holds, unfolds on 5. hurt: rears back, white on frame 0. die: knocked into the air, draws its head in, goes over backward, lands on its back on frame 4, rocks, and its legs curl in.
 */
export function pose(name, t, m = {}, d = dims()) {
  const bounce = m.bounce ?? 0.5, stride = m.stride ?? 0.5, swing = m.swing ?? 1;
  const P = {
    x: 0, drop: 0, lift: 0, pitch: 0, roll: 0, tuck: 0, hide: 0, round: 0, free: 0, curl: 0, jab: 0, sway: 0,
    blink: false, flash: false,
    feet: Array.from({ length: d.pairs * 2 }, () => ({ x: 0, y: 0 })),
  };
  const foot = (i, side) => P.feet[side * d.pairs + i];
  const each = (fn) => { for (let side = 0; side < 2; side++) for (let i = 0; i < d.pairs; i++) fn(foot(i, side), i, side); };
  switch (name) {
    case 'idle': {
      P.drop = pulse(t) * lerp(0.7, 2, bounce);
      P.sway = wave(t);
      P.blink = t >= 0.74 && t < 0.87;
      foot(0, 0).y = 1.6 * Math.sin(PI * clamp((t - 0.3) / 0.22)) ** 2;       // one tap of the near front foot
      break;
    }
    case 'walk': {
      const o = { stride: lerp(1.6, 3.2, stride) * clamp(d.rise / 4, 0.7, 1.4), lift: lerp(1.3, 2.4, bounce) * clamp(d.rise / 4, 0.7, 1.2) };
      each((f, i, side) => Object.assign(f, step(t + gait(i, side), o)));
      P.drop = lerp(0.4, 1.6, bounce) * (0.5 + 0.5 * Math.cos(2 * TAU * t));      // dips as each group of feet lands
      P.pitch = 0.035 * Math.sin(TAU * t);
      P.sway = wave(t * 2, -0.1);
      break;
    }
    case 'attack': {
      const back = keys(t, [[0, 0], [0.143, 0.65], [0.286, 1], [0.4, 0.3], [0.5, 0], [1, 0]]);
      const jab = keys(t, [[0, 0], [0.3, 0], [0.429, 0.6], [0.571, 1], [0.714, 0.85], [0.857, 0.3], [1, 0]]);
      P.x = (-2.5 * back + 5 * jab) * swing;
      P.pitch = 0.2 * back - 0.24 * jab;                    // head down to wind up, then it rips upward
      P.drop = 1.2 * back + 0.4 * jab;
      P.jab = jab;
      const hop = 1.6 * Math.sin(PI * clamp((t - 0.33) / 0.2));
      each((f, i) => { if (i === 0) { f.x = 3 * jab * swing; f.y = hop; } else if (i === d.pairs - 1) f.x = -0.8 * back; });
      P.sway = keys(t, [[0, 0], [0.286, -1], [0.571, 1], [1, 0]]);
      break;
    }
    case 'block': {
      const up = keys(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
      const hit = keys(t, [[0, 0], [0.2, 0], [0.4, 1], [0.6, 0.35], [0.8, 0], [1, 0]]);
      P.tuck = up; P.hide = up;
      P.round = up - 0.3 * hit;                             // it gives a little under the blow
      P.drop = d.rise * up;                                 // the belly comes down onto the ground
      P.x = -1.4 * hit;
      P.sway = 0.6 * up - 1.4 * hit;
      P.blink = up > 0.5;
      break;
    }
    case 'hurt': {
      const h = keys(t, [[0, 0.7], [0.33, 1], [1, 0]]);     // ends back on the idle pose
      P.x = -3 * h;
      P.pitch = -0.3 * h;                                   // rears up
      each((f, i) => { if (i === 0) f.y = 2.2 * h; });
      P.sway = -h;
      P.flash = t < 0.2;
      P.blink = t < 0.8;
      break;
    }
    case 'die': {
      // 0 the hit (white), 1 knocked up, 2 to 3 it goes over backward in the air, 4 the back hits the ground,
      // 5 to 6 it rocks and the legs kick, 7 still, legs curled in (the game holds this frame)
      P.roll = keys(t, [[0, 0], [0.143, 0.3], [0.286, 1.25], [0.429, 2.45], [0.571, PI], [1, PI]]);
      P.lift = keys(t, [[0, 0], [0.143, 2.5], [0.286, 5.5], [0.429, 4.5], [0.571, 0], [0.714, 1.2], [0.857, 0], [1, 0]]);
      P.x = keys(t, [[0, -1.5], [0.143, -2.5], [0.571, -4], [1, -4]]);
      P.pitch = keys(t, [[0, -0.2], [0.143, -0.1], [0.571, 0], [0.643, 0.16], [0.714, 0.1], [0.786, -0.1], [0.857, -0.06], [0.93, 0.03], [1, 0]]);
      P.free = keys(t, [[0, 0], [0.143, 0.6], [0.286, 1], [1, 1]]);
      P.curl = keys(t, [[0, 0], [0.571, 0.1], [0.714, 0], [0.857, 0.65], [1, 1]]);
      P.hide = keys(t, [[0, 0], [0.143, 0.5], [0.286, 1], [1, 1]]);      // the head is drawn in as it goes over, and stays in
      const kick = keys(t, [[0, 0], [0.286, 1], [0.714, 1], [0.857, 0.4], [1, 0]]);
      each((f, i, side) => { f.x = 1.6 * kick * Math.sin(TAU * (2.5 * t + 0.37 * i + 0.21 * side)); });
      P.sway = keys(t, [[0, -0.7], [0.286, -1], [0.571, 0.8], [0.8, 0.2], [1, 0]]);
      P.flash = t < 0.1;
      P.blink = t > 0.2;
      break;
    }
    default: break;
  }
  return P;
}

/**
 * The body's place and turn for a pose, and every leg joint, in frame pixels.
 * Arguments: P (from pose()), d (from dims()).
 * Returns J { gy (the ground row under the feet), origin [x, y] (the middle of the body), angle (its turn, radians, clockwise on screen), flip (0 upright .. 1 on its back), at(x, y) (a point given from the middle of the body, x forward, y down, as [x, y] in the frame), legs: one { side ('near' | 'far'), i (pair, 0 = front), hip, knee, foot, lifted } per leg }.
 */
export function solve(P, d) {
  const gy = GROUND;
  const flip = clamp(P.roll / PI);
  const angle = P.pitch - P.roll;                           // a flip goes over backward: the nose comes up first
  const c = Math.cos(angle), s = Math.sin(angle);
  // the middle of the body: carried on the legs when upright, lying on its back when flipped
  let oy = gy - lerp(d.rise + d.h / 2 - P.drop, d.h / 2, flip) - P.lift;
  // nothing goes into the ground: the belly's two ends, and the part of the back it lies on when flipped
  let low = -Infinity;
  for (const [x, y] of [[d.len / 2, d.h / 2], [-d.len / 2, d.h / 2], [d.len * 0.3, -d.h / 2], [-d.len * 0.3, -d.h / 2]]) low = Math.max(low, x * s + y * c);
  if (oy + low > gy) oy = gy - low;
  const ox = d.cx + P.x;
  const at = (x, y) => [ox + x * c - y * s, oy + x * s + y * c];
  const legs = [];
  for (let side = 0; side < 2; side++) for (let i = 0; i < d.pairs; i++) {
    const f = P.feet[side * d.pairs + i] ?? { x: 0, y: 0 };
    const off = side ? 1.5 : 0;                             // the far legs stand a little forward, so every leg reads
    const hip = at(d.hips[i] + off, d.h / 2 - 1);
    const planted = [d.cx + d.feet[i] + off + f.x, gy - 0.5 - f.y];
    // a loose leg hangs from the body and turns with it; curled, it is drawn in toward the belly
    const loose = at(lerp(d.feet[i], d.hips[i] * 0.55, P.curl) + off + f.x, d.h / 2 + lerp(d.rise, d.rise * 0.45, P.curl) - 0.5 - f.y);
    const tucked = at(d.hips[i] * 0.85 + off, d.h / 2 - 0.5);
    let tx = lerp(lerp(planted[0], loose[0], P.free), tucked[0], P.tuck), ty = lerp(lerp(planted[1], loose[1], P.free), tucked[1], P.tuck);
    if (ty > gy - 0.5) ty = gy - 0.5;
    // the knee points away from the middle of the body: forward on the front pair, back on the others
    const a = ik2(hip[0], hip[1], tx, ty, d.bone, d.bone, 1), b = ik2(hip[0], hip[1], tx, ty, d.bone, d.bone, -1);
    const along = (q) => (q[0] - ox) * c + (q[1] - oy) * s;
    const front = i === 0 && d.pairs > 1;
    let knee = (along(a.mid) > along(b.mid)) === front ? a.mid : b.mid;
    if (knee[1] > gy - 1) knee = [knee[0], gy - 1];
    legs.push({ side: side ? 'far' : 'near', i, hip, knee, foot: a.end, lifted: f.y > 0.5 || P.free > 0.5 });
  }
  return { gy, origin: [ox, oy], angle, flip, at, legs };
}

/**
 * Shape tests written around the middle of the body (x forward, y down, in pixels), moved and turned to where the body is this frame.
 * Arguments: J (from solve()), tests (one shape test or a list, joined), options { sx, sy (scale across and down, before the turn) }.
 */
export function place(J, tests, opt = {}) {
  return placedIn(tests, J.origin[0], J.origin[1], { ...opt, angle: J.angle });
}

/**
 * Keeps a pose inside the frame when the body carries something long in front or behind: a shorter lunge, a lower hop.
 * Arguments: P (from pose(); changed in place and returned), d (from dims()), options { front (pixels the creature reaches in front of the middle of its body: head, horn), back (the same behind: tail), top (pixels it reaches above the middle of its body), margin (pixels to keep clear of the frame edge, default 2) }.
 */
export function fit(P, d, opt = {}) {
  const margin = opt.margin ?? 2, front = opt.front ?? d.len / 2, back = opt.back ?? d.len / 2, top = opt.top ?? d.h / 2;
  let J = solve(P, d);
  const pts = () => [J.at(front, 0), J.at(-back, 0), J.at(0, -top), J.at(front, -top * 0.6), J.at(-back, -top * 0.6)];
  let lo = Infinity, hi = -Infinity, up = Infinity;
  for (const [x, y] of pts()) { lo = Math.min(lo, x); hi = Math.max(hi, x); up = Math.min(up, y); }
  if (hi > SIZE[0] - 1 - margin) P.x -= hi - (SIZE[0] - 1 - margin);
  else if (lo < margin) P.x += margin - lo;
  if (up < margin) P.lift = Math.max(0, P.lift - (margin - up));
  return P;
}

/**
 * Paints the legs of one side of a crawler: two bones each, a thicker thigh and a thinner shin with a toe.
 * Arguments: g (the Surface), J (from solve()), d (from dims()), side ('near' or 'far'), paint (a colour or a ramp), options { toe (a colour for the toe pixel; default the paint's dark tone) }.
 */
export function drawLegs(g, J, d, side, paint, opt = {}) {
  const dark = opt.toe ?? (typeof paint === 'object' ? paint.dark : paint);
  for (const L of J.legs) {
    if (L.side !== side) continue;
    g.limb(L.hip[0], L.hip[1], L.knee[0], L.knee[1], d.legW, paint, { shade: 0 });
    g.limb(L.knee[0], L.knee[1], L.foot[0], L.foot[1], Math.max(1, d.legW - 1), paint, { shade: 0 });
    g.dot(L.foot[0], L.foot[1], dark);
  }
  return g;
}

/**
 * Named attach points for parts on a crawler, for one solved pose: { name: { x, y, angle } } in frame pixels.
 * Arguments: J (from solve()), P (from pose()), d (from dims()), options { head: [x, y] (where the head socket sits from the middle of the body; default the front, half-way up) }.
 * Returns head (angle: the way the creature faces), back (the top of the back; angle: straight out of it) and feet (the ground under the body). A drawn-in head (P.hide) moves the head socket back.
 */
export function sockets(J, P, d, opt = {}) {
  const [hx, hy] = opt.head ?? [d.len / 2, 0];
  const head = J.at(hx - (P.hide || 0) * d.len * 0.2 + (P.jab || 0) * 1.5, hy), back = J.at(0, -d.h / 2);
  return {
    head: { x: head[0], y: head[1], angle: PI / 2 - J.angle },
    back: { x: back[0], y: back[1], angle: PI - J.angle },
    feet: { x: J.origin[0], y: J.gy, angle: 0 },
  };
}

/**
 * The height of a dome at the share u along its length, as a share of its full height: 0 at both ends, 1 at the peak.
 * Arguments: u (0 at the back end .. 1 at the front end); options { peak (where it is highest, 0..1, default 0.45), full (0 a low pointed arc .. 1 a boxy hump, default 0.5) }.
 */
export function domeHalf(u, { peak = 0.45, full = 0.5 } = {}) {
  if (u <= 0 || u >= 1) return 0;
  const v = u < peak ? 1 - u / peak : (u - peak) / (1 - peak);        // 0 at the peak .. 1 at an end
  const e = lerp(1.7, 3.4, clamp(full));
  return (1 - v ** e) ** (1 / e);
}

/**
 * Shape test for a dome standing on a level base line: a beetle's shell, a turtle's back, a helmet, a burrow mound.
 * Arguments: x0, x1 (its back and front ends), base (the y of its flat underside), height (pixels from the base to the peak), options { peak, full } as domeHalf().
 */
export function domeIn(x0, x1, base, height, opt = {}) {
  const w = x1 - x0 || 1e-6;
  return (px, py) => py <= base && px > x0 && px < x1 && base - py <= height * domeHalf((px - x0) / w, opt);
}

/**
 * A point on the surface of a dome and the way straight out of it there, for standing spikes, plates or bumps along a back.
 * Arguments: x0, x1, base, height (as domeIn()), u (the share along its length, 0 back .. 1 front), options { peak, full } as domeHalf().
 * Returns { x, y, nx, ny } (the point, and a unit vector pointing out of the surface).
 */
export function domePoint(x0, x1, base, height, u, opt = {}) {
  const w = x1 - x0, e = 0.01;
  const y = (v) => base - height * domeHalf(clamp(v, 0.001, 0.999), opt);
  const slope = (y(u + e) - y(u - e)) / (2 * e * w);                  // dy/dx along the surface
  const n = Math.hypot(slope, 1);
  return { x: x0 + w * u, y: y(u), nx: slope / n, ny: -1 / n };
}

/**
 * How far the head of a crawler is moved along its body this frame, in pixels: back when it is drawn in (P.hide), forward when it jabs (P.jab).
 * Arguments: P (from pose()), d (from dims()). sockets() moves the head socket by the same amount, so a sprite that moves its head by this keeps its horns on it.
 */
export const headShift = (P, d) => -(P.hide || 0) * d.len * 0.2 + (P.jab || 0) * 1.5;
