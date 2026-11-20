// PORT (migration batch C3): a copy of rigs/creature-topdown.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/c3/surface.js) and the other port copies (engine/gen/ports/e2/, engine/gen/ports/c3/), so it draws paint refs on
// engine/gen/port-surface.js grids. It is the drawing code of migration batch C3's robot ports (engine/gen/robots.js), so it
// is NOT temporary: it stays when rigs/creature-topdown.js goes and goes only with the last generator version that draws with it. A HAND
// CHANGE note below says where it differs from its source; never change what a released generator version draws through it.
// Top-down creature rig, on a 48x48 canvas (any frame size works): the partner of rigs/topdown.js for bodies that are
// not people. Bugs, crabs, spiders, sitting spitters, walking machines and anything that hovers are built on it.
//
// "Top-down" is the three-quarter view (docs/style-guide.md, section 1): the camera looks from the south, tilted
// down. A creature is described ONCE, in its own space, and the rig places it for the direction it faces:
//
//   a   forward, toward the head          b   to the creature's own right          c   up, off the floor
//
//   down   facing the camera: the head is lowest on the picture and drawn last, the tail is behind it
//   up     facing away: the tail is nearest, the head furthest
//   side   facing RIGHT: the whole length shows; the creature's right side is the near one (the game mirrors for left)
//
//   clips(speedOf, entries)         the clip table, with direction clips named as rigs/topdown.js names them
//   project(direction, a, b, c)     one point of the creature's own space on the picture
//   body(o)                         measurements of a body of one or more segments (head first) carried on pairs of legs
//   pose(action, t, m, B)           idle, walk, attack, hurt, die for such a body (POSES); a sprite may change any field
//   solve(direction, P, B)          J: every segment and every leg joint in frame pixels, far things first
//   segmentIn(seg), bodyTests(J)    shape tests of the segments, for g.blob
//   drawLegs(g, J, paint, opt)      paints the legs (all of them, or the far or the near side)
//   sockets(J)                      head, back, tail, feet
//   hover(t, o)                     the float of a body that hovers
//   burrow(g, o), sunk(src, ...)    a hole in the floor with a ring of rubble, and a drawing sinking into it
//
// The rig does not paint a body: every creature has its own look. A sprite asks for the frame's joints and paints
// its shapes on them, far things first:
//
//   import * as K from '../rigs/creature-topdown.js';
//   const B = K.body({ segments: [{ len: 8, wide: 9, tall: 6 }, { len: 12, wide: 12, tall: 8 }], pairs: 3, span: 10 });
//   const { action, direction } = K.parseClip(clip);
//   const J = K.solve(direction, K.pose(action, t, { bounce: p.bounce, stride: p.stride }, B), B);
//   K.drawLegs(g, J, farRamp(p.accent), { side: 'far' });
//   g.blob(K.bodyTests(J), ramp(p.body), { shade: 2 });               // or one J.segs entry at a time, each in its own paint
//   K.drawLegs(g, J, ramp(p.accent), { side: 'near' });
//   // clips: K.clips((p) => p.speed, ['idle_down', 'walk*', 'attack*', 'hurt', 'die'])
//
// Everything is a pure function of its arguments: Node and browser, no Math.random. Angles of sockets use the rig
// convention of engine/motion.js: 0 = down, PI/2 = picture-right, PI = up.

import { lerp, clamp, wave, pulse, keys, smooth, fract, hash, PI, TAU } from '../../../motion.js';
import { ramp } from './colour.js';
import { Surface } from './surface.js';
import { rockIn } from '../e2/fx.js';
// HAND CHANGE (C3): the three names this rig took from rigs/topdown.js (the people's rig, which draws nothing here), copied
// word for word instead of imported: the standard actions' table, the clip-name split and the list of directions.
const STANDARD = {
  idle: { frames: 8, fps: 7, loop: true },
  walk: { frames: 8, fps: 10, loop: true },
  run: { frames: 8, fps: 14, loop: true },
  attack: { frames: 8, fps: 13, loop: false },
  shoot: { frames: 6, fps: 14, loop: false },
  cast: { frames: 8, fps: 10, loop: false },
  block: { frames: 6, fps: 10, loop: false },
  dodge: { frames: 8, fps: 14, loop: false },
  talk: { frames: 8, fps: 7, loop: true },
  hurt: { frames: 4, fps: 9, loop: false },
  die: { frames: 8, fps: 10, loop: false },
};
function parseDirectionClip(name) {
  const m = /^(.+)_(down|up|side)$/.exec(name);
  return m ? { action: m[1], direction: m[2] } : { action: name, direction: 'down' };
}
const TOPDOWN_DIRECTIONS = ['down', 'up', 'side'];

/** The frame of a small top-down creature, [width, height] in pixels (style guide, section 1). */
export const SIZE = [48, 48];
/** The ground line of a small top-down creature: the lowest foot rests on the row above it and its outline lands on it. */
export const GROUND = 42;
/** The pivot column: a standing creature is centred on it. */
export const CX = 24;
/** Where a game anchors a small top-down creature, [x, y]. */
export const PIVOT = [CX, GROUND];
/** The three drawn directions in clip order, the same list rigs/topdown.js uses: down, up, side (side faces right). */
export const DIRECTIONS = TOPDOWN_DIRECTIONS;
/** How far one pixel along the floor, toward or away from the camera, moves a point up or down the picture (0.6). */
export const DEPTH = 0.6;

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---- clips --------------------------------------------------------------------------------------

/**
 * Splits a clip name into { action, direction } exactly as rigs/topdown.js does: 'walk_side' gives walk and side; a name with no direction ('hurt') is drawn facing down.
 * Arguments: name (a clip name).
 */
export const parseClip = (name) => parseDirectionClip(name);

/**
 * Builds the clip table of a top-down creature in the order given, naming direction clips as the top-down character rig does (`walk_down`, `walk_up`, `walk_side`, labelled "Walk (down)" ...).
 * Arguments: speedOf ((p) => the Speed slider, 0..1); entries (a list; each is a name or { name, frames, fps, loop, label }). A name ending in `*` ('walk*') becomes that action in all three directions; a name with a direction ('idle_down') is that one clip; any other name is a clip with no direction. Frames, fps (at Speed 0.5) and loop come from the style guide's table for standard actions (idle, walk, attack, shoot, hurt, die ...) unless the entry gives them; a clip the table does not have must give frames and fps.
 */
export function clips(speedOf = () => 0.5, entries = []) {
  const out = {};
  for (const raw of entries) {
    const e = typeof raw === 'string' ? { name: raw } : raw;
    const every = e.name.endsWith('*'), plain = every ? e.name.slice(0, -1) : e.name;
    const m = /^(.+)_(down|up|side)$/.exec(plain), action = m ? m[1] : plain;
    const std = STANDARD[action] ?? {};
    const frames = e.frames ?? std.frames, base = e.fps ?? std.fps, loop = e.loop ?? std.loop ?? false;
    if (!(frames >= 1) || !(base > 0)) throw new Error(`creature-topdown rig: clip "${e.name}" is not a standard action (${Object.keys(STANDARD).join(', ')}), so give it frames and fps`);
    const entry = () => ({ frames, fps: (p) => base * lerp(0.65, 1.45, speedOf(p) ?? 0.5), loop });
    const word = e.label ?? cap(action);
    if (every) for (const dir of DIRECTIONS) out[`${action}_${dir}`] = { ...entry(), label: `${word} (${dir})` };
    else if (m) out[plain] = { ...entry(), label: `${word} (${m[2]})` };
    else out[plain] = { ...entry(), ...(e.label ? { label: e.label } : {}) };
  }
  return out;
}

// ---- the creature's own space ---------------------------------------------------------------------

/**
 * Places one point of a creature's own space on the picture for the direction it faces; returns [x, y, z], where a bigger z is nearer the camera (draw it later).
 * Arguments: direction ('down', 'up' or 'side'); a (pixels forward, toward the head); b (pixels to the creature's own right); c (pixels up off the floor); origin ([x, y] of the point of the floor under the middle of the creature, default [CX + 0.5, GROUND]: the middle of the pivot column).
 */
export function project(direction, a, b, c, origin = [CX + 0.5, GROUND]) {
  const [ox, oy] = origin;
  if (direction === 'side') return [ox + a, oy + b * DEPTH - c, b];
  if (direction === 'up') return [ox + b, oy - a * DEPTH - c, -a];
  return [ox - b, oy + a * DEPTH - c, a];
}

/**
 * Measurements of a top-down creature's body, in pixels of its own space: one or more rounded segments in a row, head first, carried on pairs of legs.
 * Arguments: o { segments (list, head first, of { len (along the body), wide (across), tall, up (pixels its underside is carried above the belly line, default 0) }; default one 14 x 12 x 8 lump), overlap (the share of the shorter of two neighbours by which they overlap, default 0.3), rise (how high the belly is carried off the floor, default 2), pairs (pairs of legs, default 3; 0 for none), on (the index of the segment the legs grow from, default the longest), span (how far out from the middle line the feet stand, default 0.9 x the widest segment), splay (how far the front and back feet stand beyond their hips, along the body, default 2), fan (how much nearer the middle line the front and back feet stand than the middle pair, as a share of span, so the legs spread like a fan and each one shows; default 0.2), knee (how high the knees stand above the belly line, default 3), legW (leg thickness, default 2) }.
 * Returns B { segs ([{ i, a (its middle along the body), len, wide, tall, c (its middle above the floor) }], head first), len, front, back (the a of the nose and of the tail end), wide, top (the highest point above the floor), rise, pairs, hips and feet (the a of every pair's hip and resting foot, front pair first), hipB, span, spans (how far out each pair's feet stand), knee, legW }.
 */
export function body(o = {}) {
  const list = o.segments?.length ? o.segments : [{ len: 14, wide: 12, tall: 8 }];
  const overlap = o.overlap ?? 0.3, rise = Math.max(0, o.rise ?? 2);
  let total = 0;
  list.forEach((s, i) => { total += s.len - (i ? Math.min(s.len, list[i - 1].len) * overlap : 0); });
  const segs = [];
  let nose = total / 2;
  list.forEach((s, i) => {
    if (i) nose += Math.min(s.len, list[i - 1].len) * overlap;
    segs.push({ i, a: nose - s.len / 2, len: s.len, wide: s.wide, tall: s.tall, c: rise + (s.up ?? 0) + s.tall / 2 });
    nose -= s.len;
  });
  const wide = Math.max(...segs.map((s) => s.wide)), top = Math.max(...segs.map((s) => s.c + s.tall / 2));
  const pairs = Math.max(0, Math.round(o.pairs ?? 3));
  const on = segs[o.on ?? segs.reduce((best, s, i) => (s.len > segs[best].len ? i : best), 0)] ?? segs[0];
  const splay = o.splay ?? 2, span = o.span ?? wide * 0.9, fan = o.fan ?? 0.2, hips = [], feet = [], spans = [];
  for (let i = 0; i < pairs; i++) {
    const k = pairs === 1 ? 0 : 1 - (2 * i) / (pairs - 1);              // 1 at the front pair .. -1 at the back pair
    hips.push(on.a + k * on.len * 0.32);
    feet.push(on.a + k * (on.len * 0.32 + splay));
    spans.push(span * (1 - fan * k * k));
  }
  return { segs, len: total, front: total / 2, back: -total / 2, wide, top, rise, pairs, hips, feet, hipB: on.wide * 0.34, span, spans, knee: o.knee ?? 3, legW: o.legW ?? 2 };
}

/**
 * The share of a walk cycle by which a leg trails the front right leg: neighbours along a side and across the body alternate, so six legs move as two groups of three.
 * Arguments: i (which pair, 0 = front), side (0 the creature's right, 1 its left).
 */
export const gait = (i, side = 0) => ((i + side) % 2 ? 0.5 : 0);

/**
 * The path of one walking foot: it touches down in front at u = 0, slides back along the floor, then lifts and swings forward again.
 * Arguments: u (the leg's own phase; only its fraction counts); options { stride (how far in front of and behind its resting spot it goes, default 2.5), lift (how high it is carried, default 2), duty (the share of the cycle spent on the floor, default 0.55) }.
 * Returns { x (pixels forward of the resting spot), y (pixels off the floor) }.
 */
export function step(u, { stride = 2.5, lift = 2, duty = 0.55 } = {}) {
  u = fract(u);
  if (u < duty) return { x: lerp(stride, -stride, u / duty), y: 0 };
  const s = (u - duty) / (1 - duty);
  return { x: lerp(-stride, stride, smooth(s)), y: lift * Math.sin(PI * s) };
}

/** Every action pose() knows. */
export const POSES = ['idle', 'walk', 'attack', 'hurt', 'die'];

/**
 * The pose of a top-down creature for an action at phase t (0..1), the same in every direction: solve() turns it into a picture for the direction faced.
 * Arguments: action (one of POSES; any other name gives the resting pose, for a sprite to fill in); t; m { bounce, stride (0..1: how lively, how long the steps), swing (scales the lunge of `attack`, default 1) }; B (from body()).
 * Returns { x (body moved forward), drop (body sunk toward the floor), lift (whole creature off the floor), squash (above 0 flatter and wider), sway (body moved to its right), roll (0 upright .. 1 on its back), curl (0..1 loose legs drawn in), tuck (0..1 feet pulled in under the body), jaw (0..1 jaws or mouth open), flash (tint this frame white), blink, feet: one { x (forward of its resting spot), y (off the floor) } per leg, the right side's legs first, each side front to back }.
 * idle: breathes, taps a front foot, blinks on frames 6 to 7 of 8. walk: feet touch down on frames 0 and 4 of 8 in two alternating groups, and the body dips as they land. attack: draws back on frames 1 to 2, lunges on 3, furthest with jaws wide on 4, returns. hurt: knocked back, white on frame 0, ends on idle. die: white on frame 0, thrown up and over, on its back from frame 4, legs kick and then curl in.
 */
export function pose(action, t, m = {}, B = body()) {
  const bounce = m.bounce ?? 0.5, stride = m.stride ?? 0.5, swing = m.swing ?? 1;
  const P = { x: 0, drop: 0, lift: 0, squash: 0, sway: 0, roll: 0, curl: 0, tuck: 0, jaw: 0, flash: false, blink: false, feet: Array.from({ length: B.pairs * 2 }, () => ({ x: 0, y: 0 })) };
  const each = (fn) => { for (let side = 0; side < 2; side++) for (let i = 0; i < B.pairs; i++) fn(P.feet[side * B.pairs + i], i, side); };
  switch (action) {
    case 'idle': {
      P.drop = pulse(t) * lerp(0.7, 1.9, bounce);
      P.blink = t >= 0.74;
      if (B.pairs) P.feet[0].y = 1.8 * Math.sin(PI * clamp((t - 0.3) / 0.22)) ** 2;      // one tap of the front right foot
      break;
    }
    case 'walk': {
      const o = { stride: lerp(1.5, 3.2, stride), lift: lerp(1.4, 2.6, bounce) };
      each((f, i, side) => Object.assign(f, step(t + gait(i, side), o)));
      P.drop = lerp(0.4, 1.6, bounce) * (0.5 + 0.5 * Math.cos(2 * TAU * t));            // dips as each group of feet lands
      P.sway = 0.8 * Math.sin(TAU * t) * lerp(0.4, 1, bounce);
      break;
    }
    case 'attack': {
      const back = keys(t, [[0, 0], [1 / 7, 0.65], [2 / 7, 1], [0.4, 0.3], [0.5, 0], [1, 0]]);
      const jab = keys(t, [[0, 0], [0.3, 0], [3 / 7, 0.6], [4 / 7, 1], [5 / 7, 0.8], [6 / 7, 0.3], [1, 0]]);
      P.x = (-2.5 * back + 6 * jab) * swing;
      P.drop = 1.2 * back;
      P.squash = 0.25 * back - 0.2 * jab;
      P.jaw = keys(t, [[0, 0], [2 / 7, 0.35], [3 / 7, 1], [4 / 7, 1], [5 / 7, 0.3], [1, 0]]);
      each((f, i) => { if (i === 0) { f.x = 3 * jab * swing; f.y = 1.6 * Math.sin(PI * clamp((t - 0.33) / 0.2)); } });
      break;
    }
    case 'hurt': {
      const h = keys(t, [[0, 0.7], [0.33, 1], [1, 0]]);                  // ends back on the idle pose
      P.x = -3 * h;
      P.squash = 0.3 * h;
      each((f, i) => { if (i === 0) f.y = 2 * h; });
      P.flash = t < 0.2;
      P.blink = t < 0.8;
      break;
    }
    case 'die': {
      // 0 the hit (white), 1 knocked up, 2 to 3 it goes over in the air, 4 the back hits the floor, 5 to 6 the legs kick, 7 still, legs curled in
      P.roll = keys(t, [[0, 0], [1 / 7, 0.15], [2 / 7, 0.5], [3 / 7, 0.85], [4 / 7, 1], [1, 1]]);
      P.lift = keys(t, [[0, 0], [1 / 7, 2.5], [2 / 7, 5], [3 / 7, 4], [4 / 7, 0], [5 / 7, 1], [6 / 7, 0], [1, 0]]);
      P.x = keys(t, [[0, -1.5], [1 / 7, -2.5], [4 / 7, -4], [1, -4]]);
      P.squash = keys(t, [[0, 0.3], [2 / 7, -0.1], [4 / 7, 0.3], [5 / 7, 0], [1, 0.1]]);
      P.curl = keys(t, [[0, 0], [4 / 7, 0], [6 / 7, 0.6], [1, 1]]);
      const kick = keys(t, [[0, 0], [2 / 7, 1], [5 / 7, 1], [6 / 7, 0.4], [1, 0]]);
      each((f, i, side) => { f.x = 1.6 * kick * Math.sin(TAU * (2.5 * t + 0.37 * i + 0.21 * side)); });
      P.flash = t < 0.1;
      P.blink = t > 0.2;
      break;
    }
    default: break;
  }
  return P;
}

/**
 * Every segment and leg joint of a top-down creature for one pose and direction, in frame pixels.
 * Arguments: direction ('down', 'up' or 'side'); P (from pose()); B (from body()); options { cx, gy (the pivot: default CX and GROUND) }.
 * Returns J { dir, gy, origin [x, y] (the floor under the middle of the creature at rest; x is the middle of the pivot column, cx + 0.5), flip (0 upright .. 1 on its back), at(a, b, c) (a point of the body, moved with the pose, as [x, y, z]), floor(a, b) (a point of the floor, which does not move with the body), segs ([{ i, x, y, rx, ry, z }] sorted far to near: paint them in this order), legs ([{ i, side ('right' | 'left'), near (true for the legs drawn in front of the body in `side`), hip, knee, foot ([x, y] each), lifted }] sorted far to near), head, tail ([x, y] of the nose and of the tail end), forward ([x, y]: one pixel of forward travel on the picture) }.
 * The creature stands so that at rest its lowest foot (or its belly, with no legs) is on the row above gy.
 */
export function solve(direction, P, B, { cx = CX, gy = GROUND } = {}) {
  const dir = DIRECTIONS.includes(direction) ? direction : 'down';
  const flat = (a, b, c) => project(dir, a, b, c, [0, 0]);
  const wideK = 1 + 0.25 * (P.squash ?? 0), tallK = 1 - 0.25 * (P.squash ?? 0);
  const radii = (s) => (dir === 'side'
    ? [s.len / 2, 0.85 * Math.hypot((s.tall / 2) * tallK, (s.wide / 2) * DEPTH)]
    : [(s.wide / 2) * wideK, 0.85 * Math.hypot((s.tall / 2) * tallK, (s.len / 2) * DEPTH)]);
  // the floor row of the origin: the lowest thing at rest stands on the row above gy
  let low = -Infinity;
  for (const s of B.segs) { const [, y] = flat(s.a, 0, s.c); low = Math.max(low, y + 0.85 * Math.hypot(s.tall / 2, ((dir === 'side' ? s.wide : s.len) / 2) * DEPTH)); }
  for (let i = 0; i < B.pairs; i++) for (const sgn of [1, -1]) low = Math.max(low, flat(B.feet[i], sgn * B.spans[i], 0)[1] + 0.5);
  const origin = [cx + 0.5, gy - low];                            // the middle of the pivot column, so a body is the same on both sides of it
  const lift = P.lift ?? 0, drop = P.drop ?? 0, flip = clamp(P.roll ?? 0);
  const at = (a, b, c) => project(dir, a + (P.x ?? 0), b + (P.sway ?? 0), Math.max(0, c - drop) + lift, origin);
  const floor = (a, b) => project(dir, a, b, 0, origin);
  const segs = B.segs.map((s) => {
    const [x, y, z] = at(s.a, 0, s.c * tallK), [rx, ry] = radii(s);
    return { i: s.i, x, y, rx, ry, z };
  }).sort((p, q) => p.z - q.z);
  const legs = [];
  for (let side = 0; side < 2; side++) for (let i = 0; i < B.pairs; i++) {
    const sgn = side ? -1 : 1, f = P.feet?.[side * B.pairs + i] ?? { x: 0, y: 0 };
    const curl = P.curl ?? 0, tuck = P.tuck ?? 0;
    const hip = at(B.hips[i], sgn * B.hipB, B.rise + 1);
    // planted: on the floor, where the body left it. loose (on its back): in the air above the belly, drawn in as it curls
    let fa = B.feet[i] + f.x, fb = sgn * B.spans[i], fc = f.y + lift;
    const la = B.hips[i] * lerp(1.2, 0.6, curl) + (P.x ?? 0) + f.x, lb = sgn * B.spans[i] * lerp(0.85, 0.3, curl), lc = B.top + lerp(3.5, 1, curl) + lift;
    fa = lerp(fa, la, flip); fb = lerp(fb, lb, flip); fc = lerp(fc, lc, flip);
    // tucked: pulled in under the edge of the body
    fa = lerp(fa, B.hips[i] + (P.x ?? 0), tuck); fb = lerp(fb, sgn * (B.hipB + 1), tuck);
    const foot = project(dir, fa, fb, fc, origin);
    const ka = (B.hips[i] + (P.x ?? 0) + fa) / 2, kb = sgn * lerp(B.hipB, Math.abs(fb), 0.55);
    const knee = project(dir, ka, kb, lerp(Math.max(1, B.rise + B.knee - drop) + lift + f.y * 0.5, lc + 1.5, flip) * lerp(1, 0.5, tuck), origin);
    legs.push({ i, side: side ? 'left' : 'right', near: dir === 'side' && !side, hip: [hip[0], hip[1]], knee: [knee[0], knee[1]], foot: [foot[0], foot[1]], lifted: f.y > 0.5 || flip > 0.5, z: foot[2] });
  }
  legs.sort((p, q) => p.z - q.z);
  const head = at(B.front, 0, B.segs[0].c), tail = at(B.back, 0, B.segs.at(-1).c), f1 = flat(1, 0, 0);
  return { dir, gy, origin, flip, at, floor, segs, legs, head: [head[0], head[1]], tail: [tail[0], tail[1]], forward: [f1[0], f1[1]] };
}

/**
 * Shape test for one solved segment of a top-down creature: the rounded lump it shows on the picture.
 * Arguments: seg (one entry of J.segs from solve()); grow (pixels to add all round, default 0; negative shrinks it).
 */
export function segmentIn(seg, grow = 0) {
  const rx = Math.max(0.5, seg.rx + grow), ry = Math.max(0.5, seg.ry + grow);
  return (px, py) => ((px - seg.x) / rx) ** 2 + ((py - seg.y) / ry) ** 2 <= 1;
}

/**
 * The shape tests of every segment of a solved creature, far ones first: hand the list to g.blob to paint the whole body as one lump.
 * Arguments: J (from solve()); grow (pixels to add round every segment, default 0).
 */
export const bodyTests = (J, grow = 0) => J.segs.map((s) => segmentIn(s, grow));

/**
 * Paints the legs of a solved top-down creature: each a thigh up to a raised knee and a thinner shin down to a toe.
 * Arguments: g (the Surface); J (from solve()); paint (a colour or a ramp); options { side ('all', the default; 'far': the legs behind the body; 'near': the ones in front of it, which only `side` has), width (thigh thickness, default 2), toe (a colour for the toe pixel; default the paint's dark tone) }.
 */
export function drawLegs(g, J, paint, { side = 'all', width = 2, toe } = {}) {
  const dark = toe ?? (typeof paint === 'object' ? paint.dark : paint);
  for (const L of J.legs) {
    if (side !== 'all' && (side === 'near') !== L.near) continue;
    g.limb(L.hip[0], L.hip[1], L.knee[0], L.knee[1], width, paint, { shade: 0 });
    g.limb(L.knee[0], L.knee[1], L.foot[0], L.foot[1], Math.max(1, width - 1), paint, { shade: 0 });
    g.dot(L.foot[0], L.foot[1], dark);
  }
  return g;
}

/**
 * Named attach points for parts on a solved top-down creature: { head, back, tail, feet }, each { x, y, angle } in frame pixels.
 * Arguments: J (from solve()). head is the nose (angle: the way the creature faces), back the top of the frontmost segment (angle: up), tail the tail end (angle: away from the head), feet the floor under the creature.
 */
export function sockets(J) {
  const face = J.dir === 'side' ? PI / 2 : J.dir === 'up' ? PI : 0, away = J.dir === 'side' ? -PI / 2 : J.dir === 'up' ? 0 : PI;
  const front = J.segs.reduce((best, s) => (s.i < best.i ? s : best), J.segs[0]);
  return {
    head: { x: J.head[0], y: J.head[1], angle: face },
    back: { x: front.x, y: front.y - front.ry, angle: PI },
    tail: { x: J.tail[0], y: J.tail[1], angle: away },
    feet: { x: J.origin[0], y: J.gy, angle: 0 },
  };
}

// ---- hovering -----------------------------------------------------------------------------------

/**
 * The float of a hovering body (a drone, a wisp, a floating robot) in a looping clip: a slow rise and fall with a small lean that trails it, closing exactly over the clip.
 * Arguments: t (clip phase 0..1); options { bob (0 nearly still .. 1 floaty, default 0.5), cycles (whole rises and falls per clip, default 1), phase (0..1, to put two floaters out of step) }.
 * Returns { lift (pixels above its resting height, negative below), lean (-1..1: which way it tips, a quarter beat behind the lift), level (0 lowest .. 1 highest) }.
 */
export function hover(t, { bob = 0.5, cycles = 1, phase = 0 } = {}) {
  const n = Math.max(1, Math.round(cycles)), u = t * n + phase;
  return { lift: lerp(0.7, 2.6, clamp(bob)) * wave(u), lean: wave(u, -0.25) * clamp(bob), level: 0.5 + 0.5 * wave(u) };
}

// ---- burrowing ----------------------------------------------------------------------------------

const holeOf = (o) => { const open = clamp(o.open ?? 1); return { rx: Math.max(1.5, (o.rx ?? 10) * lerp(0.35, 1, open)), ry: Math.max(1, (o.ry ?? 4) * lerp(0.35, 1, open)), open }; };

/**
 * Draws one layer of a burrow in the floor seen from the top-down camera: the dark hole, or half of the ring of rubble thrown up round it. Paint 'hole', then 'back', then whatever is in the hole, then 'front', then g.outline.
 * Arguments: g (the Surface); o { layer ('hole', 'back': the rubble behind the hole, or 'front': the rubble on its near rim), x, y (the middle of the hole, on the floor), rx, ry (its radii when fully open, default 10 and 4), open (0 just started .. 1 fully dug, default 1: the hole widens and the rubble piles up), count (chunks in the whole ring, default 9), size (pixels across the biggest chunk, default 5), seed, colour (the rubble), dark (the hole) }.
 */
export function burrow(g, o) {
  const { layer = 'hole', x, y, count = 9, size = 5, seed = 0, colour = '#6b7896', dark = '#141a33' } = o;
  const { rx, ry, open } = holeOf(o);
  if (layer === 'hole') {
    g.ellipse(x, y, rx, ry, dark, { shade: 0 });
    if (rx >= 4 && ry >= 2) g.ellipse(x, y + 1, rx - 2, Math.max(0.6, ry - 1.5), ramp(dark).light, { shade: 0, clip: (px, py) => py > y + ry * 0.35 });   // the lit far wall of the pit
    return g;
  }
  const R = ramp(colour), n = Math.max(3, Math.round(count));
  for (let i = 0; i < n; i++) {
    // chunk i sits at its own place on the rim; the ring fills in from the sides as the hole opens
    const ang = (TAU * (i + 0.5 + 0.5 * (hash(i, seed * 64 + 1) - 0.5))) / n;
    const front = Math.sin(ang) > 0;
    if (front !== (layer === 'front')) continue;
    const born = 0.55 * hash(i, seed * 64 + 2);
    if (open <= born && i > 1) continue;                        // two chunks are there from the first frame on
    const k = i > 1 ? clamp((open - born) / 0.3) : lerp(0.6, 1, open);
    const r = Math.max(1, (size / 2) * lerp(0.55, 1, hash(i, seed * 64 + 3)) * lerp(0.5, 1, k));
    const px = x + Math.cos(ang) * (rx + r * 0.5), py = y + Math.sin(ang) * (ry + r * 0.45) - (front ? 0 : r * 0.3);
    g.fill(px - r - 1, py - r - 1, px + r + 1, py + r + 1, rockIn(px, py, r, { seed: seed * 16 + i, sides: 6, jag: 0.25, squash: 0.8 }), R, { shade: r >= 3 ? 1 : 0 });
  }
  return g;
}

/**
 * Returns a copy of a Surface sunk into a burrow: moved straight down by `depth` pixels, with everything that has gone below the near rim of the hole (and below the floor line beside the hole) cut away.
 * Arguments: src (the Surface to copy, drawn standing at its usual place; it is not changed); depth (pixels sunk, 0 = standing); hole { x, y, rx, ry, open } (the same numbers burrow() is given).
 */
export function sunk(src, depth, hole) {
  const out = new Surface(src.w, src.h);
  out.shadow = src.shadow;
  const { rx, ry } = holeOf(hole), d = Math.round(depth);
  if (d <= 0) { out.data.set(src.data); return out; }           // still standing over the hole: nothing is cut
  for (let yy = 0; yy < src.h; yy++) for (let xx = 0; xx < src.w; xx++) {
    const c = src.get(xx, yy - d);
    if (!c) continue;
    const u = (xx + 0.5 - hole.x) / rx;
    const rim = Math.abs(u) >= 1 ? hole.y : hole.y + ry * Math.sqrt(1 - u * u);
    if (yy + 0.5 < rim) out.data[yy * src.w + xx] = c;
  }
  return out;
}
