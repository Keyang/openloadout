// Hive bug rig: the small bugs of a top-down game, built on the top-down creature rig (rigs/creature-topdown.js),
// which stands a body of segments on pairs of legs and places it for the direction it faces. This rig is the rest:
// what the bugs look like and how they move. Two body plans:
//
//   the crawler   a segmented, six-legged bug the size of a dog, on a 48x48 canvas, drawn in three directions from
//                 ONE description (down: head, jaws and glowing eyes; up: tail and back plates; side: its full length).
//                 Parts: horns (pincers, tusks), tail (stinger, club), a row of back spikes.
//   the mite      a tiny bug drawn for crowds of fifty, on a 32x32 canvas, the same from every side: one strong
//                 shape (round, long or spiky), four, six or eight legs, one, two or many bright eyes.
//
// The rig is the code; a sprite on it is choices (Contract 13): size, proportions, which parts, colours, and which of
// the poses are its clips. One call builds a frame, posed and fitted once, so the picture and the attach points agree
// and nothing leaves the frame at any setting:
//
//   import * as B from '../rigs/hive-bug.js';
//   const frameOf = (clip, t, p) => B.crawler(clip, t, p, { length: p.length, spikes: p.spikes,
//     horns: { kind: p.horns, length: p.hornLength }, tail: { kind: p.tail, length: p.tailLength } });
//   // in defineSprite:  size: B.SIZE, pivot: B.PIVOT, clips: B.clips((p) => p.speed, ['idle_down', 'walk*', 'attack*', 'hurt', 'die']),
//   sockets: (clip, t, p) => frameOf(clip, t, p).sockets(),
//   render(g, { clip, t, p }) { const F = frameOf(clip, t, p), look = { body: p.body, accent: p.accent, glow: p.glow }; F.draw(g, look); F.finish(g, look); }
//
//   const F = B.mite(clip, t, p, { legs: p.legs, shape: p.shape, eyes: p.eyes });     // size: B.MITE_SIZE, pivot: B.MITE_PIVOT
//
//   clips(speedOf, entries)                 the clip table (direction clips named as the top-down rigs name them)
//   crawler(clip, t, p, opt)                ONE FRAME of a crawler: F.draw(g, look), F.finish(g, look), F.sockets()
//   crawlerDims, crawlerPose                what crawler() is made of, for a pose of your own
//   mite(clip, t, p, opt)                   ONE FRAME of a mite: F.draw(g, look), F.finish(g, look)
//   miteDims, mitePose                      what mite() is made of
//   chainIn, rimOn, capIn                   shape tests the bugs are painted with, for any jointed or armoured thing
//   LENGTHS, HORNS, TAILS, MITE_LEGS, MITE_SHAPES, MITE_EYES     the names of the choices
//
// Colours (look): body is the shell, accent the legs and the soft underside (the underside is a tone darker than the
// legs), glow the eyes, bone the horns, spikes, barbs and fangs. Three values that never meet: a pale shell, a dark
// underside with the lit eyes in it, and bone paler than the shell.
// Pure functions: Node and browser, no Math.random. Angles of sockets are frame angles: 0 = down, PI/2 = right, PI = up.

import { lerp, clamp, wave, pulse, keys, hash, PI, TAU } from '../engine/motion.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';
import { capsuleIn, polyIn, ellipseIn } from '../engine/surface.js';
import { anyIn, placedIn } from '../engine/shapes.js';
import { nudgeInside, fanIn } from '../engine/creature.js';
import { splatIn } from '../engine/plating.js';
import { particles, starburst } from '../engine/fx.js';
import * as K from './creature-topdown.js';

/** The frame of a crawler, [width, height] in pixels. */
export const SIZE = [48, 48];
/** The ground line of a crawler: its feet rest on the row above it. Lower than the frame's foot, so a bite toward the camera has room. */
export const GROUND = 40;
/** Where a game anchors a crawler, [x, y]. */
export const PIVOT = [24, GROUND];
/** How long a crawler can be: short (a head and one body segment), medium (three segments), long (four). The options of a "Length" choice. */
export const LENGTHS = ['short', 'medium', 'long'];
/** What a crawler can carry on its head: pincers (two curved jaws that close on the bite), tusks (two straight fangs that splay out and down). */
export const HORNS = ['pincers', 'tusks'];
/** What a crawler can carry behind: stinger (a jointed tail that arches up over the back to a barb), club (a stalk with a knobbed ball). */
export const TAILS = ['stinger', 'club'];
/** The frame of a mite, [width, height] in pixels (the swarm creature of the style guide). */
export const MITE_SIZE = [32, 32];
/** The ground line of a mite. */
export const MITE_GROUND = 28;
/** Where a game anchors a mite, [x, y]. */
export const MITE_PIVOT = [16, MITE_GROUND];
/** How many legs a mite can have: the options of a "Legs" choice. */
export const MITE_LEGS = ['four', 'six', 'eight'];
/** The bodies a mite can have: round (a ball), long (a small head in front of a longer body), spiky (a ball with a ruff of spikes round its back). */
export const MITE_SHAPES = ['round', 'long', 'spiky'];
/** The eyes a mite can have: one (a single big eye), two, many (a cluster). */
export const MITE_EYES = ['one', 'two', 'many'];
/** The poses both bugs know: idle, walk, attack, hurt, die. */
export const POSES = ['idle', 'walk', 'attack', 'hurt', 'die'];

const BONE = '#f0ead8';
const LEG = 1;      // legs are one pixel thick: three pairs fit beside a body a dozen pixels long only as thin lines
const xy = (q) => [q[0], q[1]];

/**
 * Builds the clip table of a hive bug in the order given, exactly as the top-down creature rig does: a name ending in `*` ('walk*') becomes that action in all three directions, a name with a direction ('idle_down') is that one clip, any other name is a clip with no direction.
 * Arguments: speedOf ((p) => the Speed slider, 0..1); entries (a list; each is a pose name or { name, frames, fps, loop, label }: frames, fps and loop default to the style guide's for that action).
 */
export const clips = (speedOf = () => 0.5, entries = POSES) => K.clips(speedOf, entries);

// ---- shape tests ----------------------------------------------------------------------------------

/**
 * Shape test for a jointed, tapering chain through a list of points: a scorpion tail, a mandible, a feeler, a tentacle, a bent finger.
 * Arguments: points ([[x, y], ...], root first, at least two); w0 (pixels across at the root, default 2); w1 (pixels across at the tip, default w0).
 */
export function chainIn(points, w0 = 2, w1 = w0) {
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = at.at(-1) || 1, parts = [];
  for (let i = 1; i < points.length; i++) parts.push(capsuleIn(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], lerp(w0, w1, at[i - 1] / total) / 2, lerp(w0, w1, at[i] / total) / 2));
  return anyIn(parts);
}

/**
 * Shape test for the one-pixel rim of a shape where it lies on another: the dark line that keeps a tail apart from the back it crosses, or a plate apart from the plate under it, without reading any pixel back.
 * Arguments: test (the shape on top); under (the shape it lies on: the rim is only drawn there).
 */
export function rimOn(test, under) {
  return (px, py) => !test(px, py) && under(px, py) && (test(px + 1, py) || test(px - 1, py) || test(px, py + 1) || test(px, py - 1));
}

/**
 * Shape test for the armour on a rounded lump: all of an ellipse except a band along one side, where the soft underside (or a face) shows.
 * Arguments: cx, cy, rx, ry (the lump); nx, ny (the way the open side faces on the picture, any length: 0, 1 leaves a band along the bottom; 1, 0.6 one at the front and below); keep (how much of the lump the armour covers, measured across it along that way: 0 none, 0.5 half, 1 all of it; default 0.75).
 */
export function capIn(cx, cy, rx, ry, nx = 0, ny = 1, keep = 0.75) {
  const n = Math.hypot(nx, ny) || 1, ux = nx / n, uy = ny / n, edge = 2 * clamp(keep) - 1;
  return (px, py) => {
    const dx = (px - cx) / rx, dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1 && dx * ux + dy * uy < edge;
  };
}

// ---- the crawler ------------------------------------------------------------------------------------

// segments, head first: how long, how wide, how tall (pixels at size 1)
const PLANS = {
  short: [{ len: 7, wide: 9, tall: 6.5 }, { len: 11.5, wide: 12, tall: 8.5 }],
  medium: [{ len: 7, wide: 9, tall: 6.5 }, { len: 8, wide: 11, tall: 8 }, { len: 9.5, wide: 11.5, tall: 8 }],
  long: [{ len: 7, wide: 9, tall: 6.5 }, { len: 8, wide: 11, tall: 8 }, { len: 8.5, wide: 11.5, tall: 8 }, { len: 7.5, wide: 9.5, tall: 7 }],
};

/**
 * Measurements of a crawler in pixels, from plain numbers: a body of two to four segments (head first) on three pairs of legs spread along it.
 * Arguments: o { size (0..1: small to big), legs (0..1: short legs carried low and close, to long legs that arch high and stand wide), length (one of LENGTHS, default 'medium'), direction ('down', 'up' or 'side', default 'down': seen from the side the legs are drawn as a profile, feet close under the body, so all six show) }.
 * Returns { k (the scale), legs, length, direction, B (the body, as rigs/creature-topdown.js body() gives it, with its hips and feet spread along the whole body), head, last (the first and last segment of B.segs) }.
 */
export function crawlerDims(o = {}) {
  const k = lerp(0.88, 1.12, clamp(o.size ?? 0.5)), legs = clamp(o.legs ?? 0.5);
  const length = LENGTHS.includes(o.length) ? o.length : 'medium', plan = PLANS[length];
  const direction = K.DIRECTIONS.includes(o.direction) ? o.direction : 'down', profile = direction === 'side';
  const span = lerp(9.6, 13.2, legs) * k * (profile ? 0.3 : 1);
  const B = K.body({
    segments: plan.map((s) => ({ len: s.len * k, wide: s.wide * k, tall: s.tall * k })), overlap: 0.3,
    rise: lerp(1.4, 3.2, legs) * k + (profile ? 1 : 0), pairs: 3, span, knee: lerp(2.6, 5.4, legs) * k * (profile ? 0.7 : 1), legW: 2,
  });
  // the legs grow from under the whole body, front pair behind the head, back pair under the last segment
  const n = B.segs.length, a0 = B.front - B.segs[0].len * 1.05, a1 = B.back + B.segs[n - 1].len * (n > 2 ? 0.75 : 0.42);
  const splay = lerp(1.6, 3, legs) * k * (profile ? 1 : 2.5);      // seen from the front or the back the legs fan out, so each one shows
  for (let i = 0; i < 3; i++) {
    const u = i / 2, side = 1 - 2 * u;                       // 1 at the front pair .. -1 at the back pair
    B.hips[i] = lerp(a0, a1, u);
    B.feet[i] = B.hips[i] + side * splay;
    B.spans[i] = span * (1 - 0.2 * side * side);
  }
  B.hipB = B.wide * (profile ? 0.12 : 0.3);
  return { k, legs, length, direction, B, head: B.segs[0], last: B.segs[n - 1] };
}

/**
 * The pose of a crawler for an action at phase t (0..1): the top-down creature rig's pose (idle, walk, attack, hurt, die: POSES) with what the crawler adds to it.
 * Arguments: action (one of POSES; any other name gives the resting pose); t; m { bounce, stride (0..1), swing (scales the lunge of `attack`, default 1) }; d (from crawlerDims()).
 * Returns the creature rig's pose, plus { open (0..1: the jaws and whatever is on the head spread apart), tail (-1..1: the tail swung to the creature's right), whip (0..1: the tail thrown forward over the back), bend ([pixels], one per segment: each segment moved to the creature's right, so the body snakes as it walks) }.
 * walk: longer legs take longer steps, every foot is carried a little and the body snakes. attack: every foot steps into the lunge (the front pair furthest), the jaws are wide from frame 3 and shut on frame 5, and a tail whips forward. die: thrown over onto its back in one turn, the jaws fall open and the tail drops.
 */
export function crawlerPose(action, t, m = {}, d = crawlerDims()) {
  const B = d.B, n = B.segs.length, bounce = m.bounce ?? 0.5;
  const P = K.pose(action, t, m, B);
  Object.assign(P, { open: 0.2, tail: 0, whip: 0, bend: B.segs.map(() => 0) });
  const each = (fn) => { for (let side = 0; side < 2; side++) for (let i = 0; i < B.pairs; i++) fn(P.feet[side * B.pairs + i], i, side); };
  if (action === 'idle') {
    P.open = 0.2 + 0.35 * pulse(t * 2, 0.1);                 // it chews twice
    P.tail = wave(t, -0.2);
  } else if (action === 'walk') {
    const reach = lerp(0.85, 1.3, d.legs);
    each((f) => { f.x *= reach; });
    const amp = lerp(0.5, 1.3, bounce);
    P.bend = B.segs.map((s, i) => amp * (n > 1 ? i / (n - 1) : 0) * Math.sin(TAU * (t - 0.16 * i)));
    P.tail = wave(t, -0.3);
    P.open = 0.2 + 0.15 * pulse(t * 2);
  } else if (action === 'attack') {
    const lunge = Math.max(0, P.x);
    each((f, i) => { if (i > 0) f.x = lunge * (i === 1 ? 0.5 : 0.3); else f.x = Math.max(f.x, lunge * 0.7); });
    P.open = keys(t, [[0, 0.2], [2 / 7, 0.5], [3 / 7, 1], [4 / 7, 1], [5 / 7, 0], [6 / 7, 0.1], [1, 0.2]]);
    P.whip = keys(t, [[0, 0], [2 / 7, -0.3], [4 / 7, 1], [6 / 7, 0.3], [1, 0]]);
  } else if (action === 'hurt') {
    P.open = keys(t, [[0, 0.8], [0.33, 0.6], [1, 0.2]]);
    P.tail = keys(t, [[0, -1], [0.5, 0.6], [1, 0]]);
  } else if (action === 'die') {
    P.open = keys(t, [[0, 0.6], [3 / 7, 1], [5 / 7, 0.5], [1, 0.35]]);
    P.tail = keys(t, [[0, -1], [3 / 7, 1], [5 / 7, 0.3], [1, 0.4]]);
  }
  return P;
}

const FACING = { down: [0, 1], up: [0, -1], side: [1, 0] };

// Every shape of a crawler for one solved pose, in frame pixels: used by the fit, the painter and the sockets.
function crawlerShapes(dir, P, d, opt, shift = [0, 0]) {
  const B = d.B, k = d.k, n = B.segs.length, head = d.head, last = d.last;
  const roll = clamp(P.roll ?? 0), up = 1 - roll;             // up: 1 standing .. 0 on its back
  // the creature rig plants the legs; going over, they come loose: out to the sides at first, then curled in over the belly
  const J = K.solve(dir, { ...P, roll: 0 }, B, { cx: PIVOT[0] + shift[0], gy: GROUND + shift[1] });
  const bend = P.bend ?? [];
  const at = (i, a, b, c) => J.at(a, b + (bend[i] ?? 0), c);
  const curl = clamp(P.curl ?? 0), loose = roll * roll * (3 - 2 * roll), mixTo = (p, q) => [lerp(p[0], q[0], loose), lerp(p[1], q[1], loose)];
  const legs = J.legs.map((L) => {
    const sgn = L.side === 'right' ? 1 : -1, f = P.feet?.[(sgn > 0 ? 0 : B.pairs) + L.i] ?? { x: 0 }, a = B.hips[L.i] + f.x, half = B.wide / 2, mid = B.top * 0.55, fan = 1 - L.i;
    const hip = at(0, a, sgn * half * 0.7, mid), knee = at(0, a + fan * lerp(2.5, 1.5, curl) * k, sgn * (half + lerp(3, 2, curl) * k), mid + 1.5 * k);
    const foot = at(0, a + fan * lerp(5, 1, curl) * k, sgn * lerp(half + 5.5 * k, half * 0.35, curl), mid + lerp(2.5, 0.5, curl) * k);
    const far = dir === 'side' && !L.near ? 1.5 * up : 0;     // from the side the far legs stand a little forward, so every leg reads
    // standing, the knee is well out from the body, so a leg is a thigh reaching out and a shin coming down
    const elbow = dir === 'side' ? L.knee[0] : lerp(L.hip[0], L.foot[0], 0.62);
    return { ...L, hip: mixTo([L.hip[0] + far, L.hip[1]], hip), knee: mixTo([elbow + far, L.knee[1]], knee), foot: mixTo([L.foot[0] + far, L.foot[1]], foot) };
  });
  // the segments, each moved by the body's snaking, far ones first (side: tail first, so each plate laps the one behind)
  const segs = J.segs.map((s) => { const [ox, oy] = K.project(dir, 0, bend[s.i] ?? 0, 0, [0, 0]); return { ...s, x: s.x + ox, y: s.y + oy }; });
  if (dir === 'side') segs.sort((p, q) => q.i - p.i);
  const hs = segs.find((s) => s.i === 0);
  // horns: each a chain from the side of the head, forward
  const horns = [], hk = opt.horns?.kind, hl = (opt.horns?.length ?? 1) * k, open = P.open ?? 0.2;
  if (hk === 'pincers' || hk === 'tusks') for (const s of [1, -1]) {
    const pts = hk === 'pincers'
      ? [at(0, head.a + head.len * 0.1, s * head.wide * 0.36, head.c - head.tall * 0.2), at(0, B.front + 1.3 * hl, s * (head.wide * 0.5 + 1.5 * hl + 1.4 * open), head.c - head.tall * 0.3), at(0, B.front + 4.8 * hl, s * (0.8 + 3.6 * open * hl), head.c - head.tall * 0.4)]
      : [at(0, head.a + head.len * 0.2, s * head.wide * 0.3, head.c - head.tall * 0.2), at(0, B.front + 3.4 * hl, s * (head.wide * 0.5 + 1.1 * hl + 1.2 * open), Math.max(0.6, head.c - head.tall * 0.3 - 1.9 * hl))];
    horns.push({ side: s, kind: hk, pts: pts.map(xy), w0: hk === 'pincers' ? 2.7 : 3.2, w1: 1, near: dir !== 'side' || s > 0 });
  }
  // tail: a chain from the last segment; it rises less, and lies out behind, as the body goes over
  let tail = null;
  const tk = opt.tail?.kind, tl = (opt.tail?.length ?? 1) * k;
  if (tk === 'stinger' || tk === 'club') {
    const sway = (P.tail ?? 0) * 1.6, whip = P.whip ?? 0, c0 = last.c + last.tall * 0.1;
    const rise = (h) => c0 + h * tl * lerp(0.15, 1, up), out = (a) => B.back - a * tl * lerp(1.5, 1, up);
    // each point of the tail: how far behind the tail end, how high above it, and how far it swings with the rest
    const stalk = tk === 'stinger'
      ? [[-1.5, 0.5, 0], [2.2, 2.7, 0.2], [3.4 - whip, 5.8, 0.45], [2 - whip * 2.5, 8.6, 0.75], [-1 - whip * 4.5, 9.8 - whip * 1.5, 1]]
      : [[-2, 0, 0], [2.8, 1.8, 0.5], [5, 3.4, 1]];
    const pts = stalk.map(([a, h, w]) => xy(at(n - 1, out(a), sway * w + 1.4 * w * w * up, rise(h))));
    tail = { kind: tk, pts, w0: tk === 'stinger' ? 4 : 2.8, w1: tk === 'stinger' ? 3.4 : 2.2 };
    if (tk === 'stinger') tail.barb = [pts.at(-1), xy(at(n - 1, out(-4.4 - whip * 6), sway + 1.4 * up, rise(7.8 - whip * 3)))];
    else {
      const r = 2.5 * Math.sqrt(tl), [bx, by] = pts.at(-1);
      tail.ball = { x: bx, y: by, r, knobs: [-0.9, 0.6, 2.3].map((a) => [bx + Math.cos(a) * (r + 0.6), by - Math.sin(a) * (r + 0.6)]) };
    }
  }
  // spikes: a row along the middle of the back, behind the head; they go over with the body
  const spikes = [];
  if (opt.spikes && roll < 0.5) {
    const a0 = B.front - head.len * 0.9, a1 = B.back + 1.5 * k, count = Math.max(2, Math.round((a0 - a1) / (4.6 * k)));
    const topAt = (a) => Math.max(...B.segs.map((s) => { const u = (a - s.a) / (s.len / 2); return Math.abs(u) < 1 ? s.c + (s.tall / 2) * Math.sqrt(1 - u * u) : 0; }));
    const lean = Math.sin(PI * roll), stand = Math.cos(PI * roll);
    for (let j = 0; j < count; j++) {
      const a = lerp(a0, a1, (j + 0.5) / count), h = (3.2 + 1.4 * Math.sin(PI * (j + 0.5) / count)) * k, top = topAt(a) - 0.6;
      let i = 0; B.segs.forEach((s) => { if (Math.abs(a - s.a) <= s.len / 2 && s.i >= i) i = s.i; });
      const foot = at(i, a, 0, top), tip = at(i, a - 1.2 * k, h * lean, top + h * stand);
      spikes.push({ i, foot: xy(foot), tip: xy(tip) });
    }
  }
  return { dir, J: { ...J, legs }, segs, hs, horns, tail, spikes, roll };
}

// the outermost points of a crawler's shapes, [[x, y, r], ...]
function crawlerMarks(S) {
  const m = [];
  for (const s of S.segs) m.push([s.x - s.rx, s.y], [s.x + s.rx, s.y], [s.x, s.y - s.ry], [s.x, s.y + s.ry]);
  for (const L of S.J.legs) m.push([...L.knee, 1.2], [...L.foot, 1]);
  for (const h of S.horns) h.pts.forEach((q, i) => m.push([...q, i ? 0.8 : 1.4]));
  if (S.tail) {
    S.tail.pts.forEach((q) => m.push([...q, S.tail.w0 / 2 + 0.3]));
    if (S.tail.barb) m.push([...S.tail.barb[1], 0.8]);
    if (S.tail.ball) m.push([S.tail.ball.x, S.tail.ball.y, S.tail.ball.r + 1.4]);
  }
  for (const s of S.spikes) m.push([...s.tip, 0.5]);
  return m;
}

/**
 * Builds one frame of a crawler, posed and fitted once, so the picture and the exported attach points cannot disagree and nothing reaches the frame edge at any setting.
 * Arguments: clip (a pose name from POSES, with or without a direction: 'walk_side', 'attack_up', 'hurt'; no direction is drawn facing down); t (0..1); p (the sprite's values: size, legs, bounce and stride are read from it); opt { length (one of LENGTHS), spikes (true: a row of back spikes), horns: { kind: one of HORNS or 'none', length }, tail: { kind: one of TAILS or 'none', length } }.
 * Returns F = { action, direction, d, P, S (its shapes), draw(g, look) (paints the bug), finish(g, look) (the white flash of a hit, the outline, then the lit eyes), sockets() ({ head, back, tail, feet }) }; look is { body (the shell), accent (legs and underside), glow (the eyes), bone (horns, spikes, barb; default cream) }.
 * How it fits: a bite that would leave the frame is a shorter bite, a throw that would is a lower throw, and whatever still reaches past the border moves the whole bug by whole pixels.
 */
export function crawler(clip, t, p = {}, opt = {}) {
  const { action, direction } = K.parseClip(clip);
  const d = crawlerDims({ size: p.size, legs: p.legs, length: opt.length, direction });
  // at rest the lowest thing (a foot, or jaws that hang in front of the feet) stands within two pixels of the ground line
  const rest = crawlerShapes(direction, crawlerPose('rest', 0, {}, d), d, opt);
  let low = -Infinity;
  for (const [, y, r = 0] of crawlerMarks(rest)) low = Math.max(low, y + r);
  const base = [0, -Math.max(0, Math.ceil(low - (GROUND + 1)))];
  // the lunge is the same length on the picture in every direction: toward or away from the camera it is foreshortened
  const P = crawlerPose(action, t, { bounce: p.bounce, stride: p.stride, swing: direction === 'side' ? 1 : 1.5 }, d);
  let S = crawlerShapes(direction, P, d, opt, base);
  let [dx, dy] = nudgeInside(crawlerMarks(S), SIZE[0], SIZE[1], 2);
  if (dx || dy) {
    const [fx, fy] = K.project(direction, 1, 0, 0, [0, 0]);          // one pixel of forward travel on the picture
    P.x += (dx * fx + dy * fy) / (fx * fx + fy * fy);                // a shorter lunge or knock-back
    if (dy > 0 && P.lift > 0) P.lift = Math.max(0, P.lift - dy);     // a lower throw
    S = crawlerShapes(direction, P, d, opt, base);
    [dx, dy] = nudgeInside(crawlerMarks(S), SIZE[0], SIZE[1], 2);
    if (dx || dy) S = crawlerShapes(direction, P, d, opt, [base[0] + dx, base[1] + dy]);
  }
  return {
    action, direction, d, P, S,
    sockets: () => crawlerSockets(S),
    draw(g, look) { drawCrawler(g, S, P, d, look); return S; },
    finish(g, look = {}) {
      if (P.flash) g.tint('#ffffff');
      g.outline(look.outline ?? INK);
      if (!P.flash) crawlerEyes(g, S, P, d, look);
      return g;
    },
  };
}

// head (the nose: where horns grow and a bite lands), back (the top of the body), tail (the tail end), feet (the floor under it)
function crawlerSockets(S) {
  const face = S.dir === 'side' ? PI / 2 : S.dir === 'up' ? PI : 0, away = S.dir === 'side' ? -PI / 2 : S.dir === 'up' ? 0 : PI;
  const [fx, fy] = FACING[S.dir], hs = S.hs, ls = S.segs.find((s) => s.i === S.segs.length - 1), mid = S.segs.find((s) => s.i === Math.min(1, S.segs.length - 1));
  return {
    head: { x: hs.x + fx * hs.rx, y: hs.y + fy * hs.ry, angle: face },
    back: { x: mid.x, y: mid.y - mid.ry, angle: PI },
    tail: { x: ls.x - fx * ls.rx, y: ls.y - fy * ls.ry, angle: away },
    feet: { x: S.J.origin[0], y: S.J.gy, angle: 0 },
  };
}

const boxOf = (s, pad = 2) => [s.x - s.rx - pad, s.y - s.ry - pad, s.x + s.rx + pad, s.y + s.ry + pad];

// Paints a crawler from its shapes, far things first. Everything is drawn through shape tests: no pixel is read back.
function drawCrawler(g, S, P, d, look = {}) {
  const { dir, J, segs, roll } = S, k = d.k;
  const shell = ramp(look.body ?? '#ca9eda'), soft = ramp(look.accent ?? '#b04a8a'), softFar = farRamp(look.accent ?? '#b04a8a'), bone = ramp(look.bone ?? BONE);
  const under = softFar;                                       // the soft underside and the face: a tone darker than the legs
  const belly = ramp(tone(look.accent ?? '#b04a8a', 0.55));    // what shows when it lies on its back: paler than the legs folded over it
  const over = roll > 0.5;                                     // on its back: the legs are above the belly
  const lumps = segs.map((s) => K.segmentIn(s));
  const whole = anyIn(lumps);

  const paintHorn = (h) => g.fill(0, 0, g.w, g.h, chainIn(h.pts, h.w0, h.w1), bone, { shade: 1 });
  const paintTail = (onBody) => {
    const T = S.tail;
    if (!T) return;
    const paint = over ? under : shell, n = T.pts.length;
    // a stinger is a chain of beads, a club a smooth stalk
    const stalk = T.barb ? anyIn(T.pts.map(([x, y], i) => ellipseIn(x, y, lerp(T.w0, T.w1, i / (n - 1)) / 2, lerp(T.w0, T.w1, i / (n - 1)) / 2)), chainIn(T.pts, 2, 2)) : chainIn(T.pts, T.w0, T.w1);
    if (onBody) g.fill(0, 0, g.w, g.h, rimOn(stalk, whole), over ? soft.base : shell.dark);
    if (T.barb) g.fill(0, 0, g.w, g.h, chainIn(T.barb, 2.4, 0.7), bone, { shade: 0 });
    g.fill(0, 0, g.w, g.h, stalk, paint, { shade: 1 });
    if (T.barb) for (let i = 1; i < n; i++) g.dot((T.pts[i - 1][0] + T.pts[i][0]) / 2, (T.pts[i - 1][1] + T.pts[i][1]) / 2, paint.dark);          // the joints between its beads
    if (T.ball) g.blob([ellipseIn(T.ball.x, T.ball.y, T.ball.r, T.ball.r), ...T.ball.knobs.map(([x, y]) => ellipseIn(x, y, 1.1, 1.1))], bone, { shade: 1 });
  };
  const paintSpikes = (i) => {
    for (const s of S.spikes) {
      if (s.i !== i) continue;
      const vx = s.tip[0] - s.foot[0], vy = s.tip[1] - s.foot[1], n = Math.hypot(vx, vy) || 1, hw = 1.7;
      g.poly([[s.foot[0] + (vy / n) * hw, s.foot[1] - (vx / n) * hw], [s.foot[0] - (vy / n) * hw, s.foot[1] + (vx / n) * hw], s.tip], bone, { shade: 1 });
    }
  };
  const paintSegment = (s, behind) => {
    const lump = K.segmentIn(s), box = boxOf(s), head = s.i === 0;
    // the groove where this plate laps the one behind it
    if (behind) g.fill(...box, rimOn(lump, behind), over ? soft.base : shell.dark);
    g.fill(...box, lump, over ? belly : under, { shade: 1 });      // on its back the pale belly shows; standing, only the dark underside of the rim
    // the armour: all of the lump but its underside; on the head it leaves the face open. It turns away as the body goes over
    const keep = dir === 'up' ? 0.86 : head ? (dir === 'down' ? 0.56 : 0.66) : 0.74;
    const [nx, ny] = head && dir === 'side' ? [0.85, 0.55] : [0, 1];
    const armour = capIn(s.x, s.y, s.rx, s.ry, nx, ny, keep);
    const edge = dir === 'side' ? s.y + s.ry * Math.cos(PI * roll) : s.x + s.rx * Math.cos(PI * roll);
    if (roll < 1) g.fill(...box, roll > 0 ? (px, py) => armour(px, py) && (dir === 'side' ? py < edge : px < edge) : armour, shell, { shade: 1, light: roll < 0.25 ? 1 : 0 });   // glossy: a lit rim along the top of every plate
    if (!over) paintSpikes(s.i);
  };
  // on its back: the edge of the shell shows all round the soft belly
  const paintRim = () => g.fill(0, 0, g.w, g.h, (px, py) => whole(px, py) && !(whole(px + 1, py) && whole(px - 1, py) && whole(px, py + 1) && whole(px, py - 1)), shell.base);
  const paintFace = () => {
    // the mouth, in the open face: it gapes for a bite, with a fang at each corner
    const hs = S.hs, open = P.open ?? 0;
    if (dir === 'up' || open < 0.45) return;
    const [mx, my] = dir === 'down' ? [hs.x, hs.y + hs.ry * 0.72] : [hs.x + hs.rx * 0.72, hs.y + hs.ry * 0.5];
    const w = (dir === 'down' ? 1.5 : 1) + open * 0.8, h = 0.6 + open * 1.1;
    g.ellipse(mx, my, w, h, under.deep, { shade: 0 });
    for (const s of dir === 'down' ? [-1, 1] : [1]) g.dot(mx + s * w * 0.8 - (s < 0 ? 0.5 : 0), my - h * 0.6, bone.base);
  };

  const legs = () => {
    if (dir === 'side' && !over) return K.drawLegs(g, J, softFar, { side: 'far', width: LEG });
    return K.drawLegs(g, J, over ? under : soft, { side: 'all', width: LEG });       // folded over the belly they are the darker of the two
  };
  const body = () => { segs.forEach((s, j) => paintSegment(s, j ? anyIn(lumps.slice(0, j)) : null)); if (roll > 0.97) paintRim(); };

  if (dir === 'up') {
    for (const h of S.horns) paintHorn(h);                    // beyond the head: only what stands out past it shows
    if (!over) legs();
    body();
    paintTail(true);                                          // nearest the camera, across the back
    if (over) legs();
  } else if (dir === 'side') {
    if (!over) legs();
    paintTail(false);
    for (const h of S.horns) if (!h.near) paintHorn(h);
    body();
    paintFace();
    for (const h of S.horns) if (h.near) paintHorn(h);
    if (over) legs(); else K.drawLegs(g, J, soft, { side: 'near', width: LEG });
  } else {
    if (!over) legs();
    paintTail(false);                                         // behind the body, standing up over it
    body();
    paintFace();
    for (const h of S.horns) paintHorn(h);
    if (over) legs();
  }
  return g;
}

// The lit eyes of a crawler: light, so drawn after the outline. Two big and two small facing the camera, one of each from the side, none from behind.
function crawlerEyes(g, S, P, d, look = {}) {
  if (S.dir === 'up') return;
  const hs = S.hs, lit = look.glow ?? '#9fe040', dim = tone(lit, -1);
  const lump = K.segmentIn(hs, -0.5);
  const eye = (x, y, big) => {
    x = Math.floor(x); y = Math.floor(y);
    if (!lump(x + 0.5, y + 0.5)) return;
    if (P.blink) { g.dot(x, y + (big ? 1 : 0), dim); if (big) g.dot(x + 1, y + 1, dim); return; }
    g.dot(x, y, lit);
    if (big) { g.dot(x + 1, y, '#ffffff'); g.dot(x, y + 1, lit); g.dot(x + 1, y + 1, lit); }
  };
  if (S.dir === 'down') {
    const ex = Math.max(2, Math.round(hs.rx * 0.5)), ey = hs.y + hs.ry * 0.28;
    eye(hs.x - ex - 0.5, ey, true); eye(hs.x + ex - 1.5, ey, true);
    if (hs.rx >= 4) { eye(hs.x - ex - 2.5, ey - 1, false); eye(hs.x + ex + 1.5, ey - 1, false); }
  } else {
    eye(hs.x + hs.rx * 0.34, hs.y + hs.ry * 0.05, true);
    eye(hs.x + hs.rx * 0.34 - 2, hs.y + hs.ry * 0.05 - 1, false);
  }
}

// ---- the mite -----------------------------------------------------------------------------------------

// segments, head first: how long, how wide, how tall (pixels at size 1)
const MITE_PLANS = {
  round: [{ len: 12, wide: 13.5, tall: 9.5 }],
  long: [{ len: 7, wide: 9.5, tall: 7.5 }, { len: 12.5, wide: 11.5, tall: 9 }],
  spiky: [{ len: 11, wide: 12, tall: 9 }],
};
const MITE_PAIRS = { four: 2, six: 3, eight: 4 };

/**
 * Measurements of a mite in pixels, from plain numbers: one small body (or a head and a body) on two, three or four pairs of thin legs that fan out all round it.
 * Arguments: o { size (0..1: small to big), shape (one of MITE_SHAPES, default 'round'), legs (one of MITE_LEGS, default 'six') }.
 * Returns { k (the scale), shape, pairs, B (the body, as rigs/creature-topdown.js body() gives it), main (the biggest segment of B.segs) }.
 */
export function miteDims(o = {}) {
  const k = lerp(0.88, 1.16, clamp(o.size ?? 0.5)), shape = MITE_SHAPES.includes(o.shape) ? o.shape : 'round';
  const pairs = MITE_PAIRS[o.legs] ?? 3, plan = MITE_PLANS[shape];
  const wide = Math.max(...plan.map((s) => s.wide)) * k;
  const B = K.body({ segments: plan.map((s) => ({ len: s.len * k, wide: s.wide * k, tall: s.tall * k })), overlap: 0.4, rise: 1.2 * k, pairs, span: wide / 2 + 2.7 * k, knee: 2.4 * k, legW: 1 });
  const main = B.segs.reduce((best, s) => (s.len > best.len ? s : best), B.segs[0]);
  // the legs fan out from under the body: the more of them, the wider the fan
  const reach = lerp(3.4, 5.2, (pairs - 2) / 2) * k;
  for (let i = 0; i < pairs; i++) {
    const side = pairs === 1 ? 0 : 1 - (2 * i) / (pairs - 1);
    B.hips[i] = main.a + side * main.len * 0.22;
    B.feet[i] = main.a + side * (main.len * 0.22 + reach);
    B.spans[i] = B.span * (1 - 0.22 * side * side);
  }
  B.hipB = wide * 0.3;
  return { k, shape, pairs, B, main };
}

/**
 * The pose of a mite at phase t (0..1) of an action: idle (breathes, taps a foot, blinks), walk (a skitter: two quick steps a clip, the body jolting and tilting left and right), attack (a nip: crouch, hop with the fangs wide, land and snap them shut; laid out for 6 frames), hurt, die (a pop: swells for two frames, bursts on frame 3 of 6, and leaves a puddle; laid out for 6 frames).
 * Arguments: name (one of POSES; any other name gives the resting pose); t; m { bounce (0..1: how lively) }; d (from miteDims()).
 * Returns the top-down creature rig's pose, plus { tilt (radians the body leans, clockwise on the picture), open (0..1: fangs apart), swell (the body's size, 1 at rest), burst (-1 until it pops, then 0..1) }.
 */
export function mitePose(name, t, m = {}, d = miteDims()) {
  const bounce = m.bounce ?? 0.5, B = d.B;
  const P = K.pose(name === 'idle' || name === 'hurt' ? name : 'rest', t, { bounce }, B);
  Object.assign(P, { tilt: 0, open: 0.15, swell: 1, burst: -1 });
  const each = (fn) => { for (let side = 0; side < 2; side++) for (let i = 0; i < B.pairs; i++) fn(P.feet[side * B.pairs + i], i, side); };
  if (name === 'idle') {
    P.open = 0.15 + 0.5 * pulse(t * 2, 0.15);
    P.tilt = 0.14 * lerp(0.5, 1, bounce) * Math.sin(TAU * t) * (t > 0.5 ? 1 : 0);        // one twitch to the side and back
  } else if (name === 'walk') {
    const o = { stride: 1.8, lift: lerp(1.2, 2.2, bounce) };
    each((f, i, side) => Object.assign(f, K.step(t * 2 + K.gait(i, side), o)));
    P.drop = lerp(0.5, 1.4, bounce) * (0.5 + 0.5 * Math.cos(4 * TAU * t));               // a jolt on every frame of eight
    P.tilt = lerp(0.14, 0.32, bounce) * Math.sin(TAU * t + 0.4);
    P.sway = 0.9 * Math.sin(TAU * t + 0.4);
  } else if (name === 'attack') {
    // 0 rest, 1 crouch, 2 the hop, fangs wide, 3 it lands and the fangs snap shut, 4 recovers, 5 rest
    P.squash = keys(t, [[0, 0], [0.2, 0.4], [0.4, -0.35], [0.6, 0.35], [0.8, 0.1], [1, 0]]);
    P.lift = keys(t, [[0, 0], [0.2, 0], [0.4, lerp(2.4, 3.6, bounce)], [0.6, 0], [1, 0]]);
    P.x = keys(t, [[0, 0], [0.2, -1.5], [0.4, 1], [0.6, 2.2], [0.8, 1], [1, 0]]);
    P.open = keys(t, [[0, 0.15], [0.2, 0.5], [0.4, 1], [0.6, 0], [0.8, 0.1], [1, 0.15]]);
    each((f) => { f.y = P.lift * 0.6; });
  } else if (name === 'hurt') {
    P.tilt = keys(t, [[0, -0.3], [0.5, 0.15], [1, 0]]);
    P.open = 0.6 * (1 - t);
  } else if (name === 'die') {
    // 0 the hit (white), 1 to 2 it swells, 3 it bursts, 4 the splash falls, 5 a puddle and crumbs
    P.flash = t < 0.1;
    P.blink = false;
    P.swell = keys(t, [[0, 0.92], [0.2, 1.16], [0.4, 1.34], [1, 1.34]]);
    P.squash = keys(t, [[0, 0.35], [0.2, 0], [0.4, -0.15], [1, 0]]);
    P.tilt = keys(t, [[0, -0.25], [0.2, 0.12], [0.4, 0], [1, 0]]);
    P.open = 0.8;
    P.burst = t >= 0.6 - 0.01 ? clamp((t - 0.6) / 0.4) : -1;
  }
  return P;
}

// Every shape of a mite for one pose, in frame pixels.
function miteShapes(P, d, shift = [0, 0]) {
  const B = d.B, k = d.k;
  const J = K.solve('down', P, B, { cx: MITE_PIVOT[0] + shift[0], gy: MITE_GROUND + shift[1] });
  const ms = J.segs.find((s) => s.i === d.main.i), hs = J.segs.find((s) => s.i === 0);
  const cx = ms.x, cy = ms.y, tilt = P.tilt ?? 0, swell = P.swell ?? 1, c = Math.cos(tilt), sn = Math.sin(tilt);
  const turn = (x, y) => [cx + (x - cx) * swell * c - (y - cy) * swell * sn, cy + (x - cx) * swell * sn + (y - cy) * swell * c];      // a point of the upright body, where the pose puts it
  const lumps = J.segs.map((s) => ellipseIn(s.x - cx, s.y - cy, s.rx, s.ry));
  const ruff = d.shape === 'spiky' ? fanIn(0, ms.ry * 0.3, PI - 1.35, PI + 1.35, 5, ms.ry * 1.3 + 3.4 * k, 3.6, { belly: 0.3, blunt: 0.8 }) : null;
  const placed = (tests) => placedIn(tests, cx, cy, { angle: tilt, sx: swell });
  // standing, the knee is well out from the body, so a leg is a thigh reaching out and a shin coming down
  const legs = J.legs.map((L) => ({ ...L, knee: [lerp(L.hip[0], L.foot[0], 0.6), L.knee[1]] }));
  const tips = d.shape === 'spiky' ? [-1.35, -0.675, 0, 0.675, 1.35].map((a) => turn(cx + Math.sin(PI + a) * (ms.ry * 1.3 + 3.4 * k), cy + ms.ry * 0.3 + Math.cos(PI + a) * (ms.ry * 1.3 + 3.4 * k))) : [];
  // the face: on the head, toward the camera
  const face = turn(hs.x, hs.y + hs.ry * 0.2), chin = (dx, dy) => turn(hs.x + dx, hs.y + hs.ry + dy);
  const open = P.open ?? 0, fangs = [-1, 1].map((s) => [chin(s * 1.6 * k, -1.2), chin(s * (1.6 + 1.6 * open) * k, 0.6 + 1.2 * open)]);
  return { J: { ...J, legs }, d, ms, hs, cx, cy, turn, lumps, ruff, placed, tips, face, fangs, swell, tilt };
}

function miteMarks(S) {
  const m = [];
  for (const s of S.J.segs) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) m.push(S.turn(s.x + dx * s.rx, s.y + dy * s.ry));
  for (const L of S.J.legs) m.push([...L.knee, 1], [...L.foot, 1]);
  for (const q of S.tips) m.push([...q, 0.5]);
  for (const f of S.fangs) m.push([...f[1], 0.8]);
  return m;
}

/**
 * Builds one frame of a mite, posed and fitted once, so nothing reaches the frame edge at any setting and no frame is empty.
 * Arguments: clip (a pose name from POSES); t (0..1); p (the sprite's values: size and bounce are read from it); opt { legs (one of MITE_LEGS), shape (one of MITE_SHAPES), eyes (one of MITE_EYES) }.
 * Returns F = { name, d, P, S (its shapes), draw(g, look) (paints the mite; once it has popped, the puddle and the crumbs it leaves), finish(g, look) (the white flash of a hit, the outline, then the lit eyes and the flying splash) }; look is { body, glow (the eyes, and what is inside it), bone (the fangs; default cream) }.
 */
export function mite(clip, t, p = {}, opt = {}) {
  const d = miteDims({ size: p.size, shape: opt.shape, legs: opt.legs });
  const P = mitePose(clip, t, { bounce: p.bounce }, d);
  let S = miteShapes(P, d);
  const [dx, dy] = nudgeInside(miteMarks(S), MITE_SIZE[0], MITE_SIZE[1], 2);
  if (dx || dy) S = miteShapes(P, d, [dx, dy]);
  return {
    name: clip, d, P, S,
    draw(g, look) { drawMite(g, S, P, d, look); return S; },
    finish(g, look = {}) {
      if (P.flash) g.tint('#ffffff');
      g.outline(look.outline ?? INK);
      if (P.burst >= 0) miteSplash(g, S, P, d, look);
      else if (!P.flash) miteEyes(g, S, P, d, look, opt.eyes);
      return g;
    },
  };
}

// the floor under a mite, and the box its splash stays in
const miteFloor = (S) => [S.J.origin[0], S.J.gy - 2.5];
const MITE_BOX = [2, 2, MITE_SIZE[0] - 2, MITE_GROUND + 2];

function drawMite(g, S, P, d, look = {}) {
  const R = ramp(look.body ?? '#b04a8a'), bone = look.bone ?? BONE, lit = look.glow ?? '#9fe040', k = d.k;
  if (P.burst >= 0) {
    // popped: what was inside it spreads into a puddle, and bits of shell lie in it
    const [fx, fy] = miteFloor(S), u = P.burst;
    g.fill(0, 0, g.w, g.h, splatIn(fx, fy, lerp(3.2, 6.2, u) * k, { seed: 3, lobes: 5, drops: 3, squash: 0.5 }), { light: lit, base: lit, dark: tone(lit, -1) }, { shade: 1, clip: (px, py) => px > 2 && px < g.w - 2 && py < MITE_GROUND + 1 });
    for (let i = 0; i < 3; i++) {
      const a = PI * (0.15 + 0.35 * i) + hash(i, 9), far = lerp(2.5, 5.5 + 2 * hash(i, 4), u) * k, hop = 5 * k * Math.sin(PI * clamp(u * 1.4)) * (1 - 0.3 * i);
      g.rect(Math.round(fx + Math.cos(a) * far) - 1, Math.round(fy - 0.5 - hop * (u < 0.72 ? 1 : 0)) - 1, 2, i ? 1 : 2, i === 1 ? R.dark : R.base);
    }
    return g;
  }
  K.drawLegs(g, S.J, R.dark, { side: 'all', width: LEG });
  const all = S.placed([...S.lumps, ...(S.ruff ? [S.ruff] : [])]);
  for (const f of S.fangs) g.fill(0, 0, g.w, g.h, chainIn(f, 1.8, 0.9), bone);
  g.fill(0, 0, g.w, g.h, all, R, { shade: 1, light: 1 });                               // glossy: one lit rim, one shadow
  // a mite with a head: the groove where the head laps the body behind it
  if (S.lumps.length > 1) g.fill(0, 0, g.w, g.h, rimOn(S.placed([S.lumps.at(-1)]), S.placed(S.lumps.slice(0, -1))), R.dark);
  return g;
}

// The lit eyes of a mite: light, so drawn after the outline, each with a rim of a darker tone of its own colour.
function miteEyes(g, S, P, d, look = {}, kind = 'two') {
  const lit = look.glow ?? '#9fe040', dim = tone(lit, -1), k = d.k, [x, y] = S.face;
  const inside = S.placed(S.lumps);
  const dot = (px, py, c) => { if (inside(Math.floor(px) + 0.5, Math.floor(py) + 0.5)) g.dot(px, py, c); };
  const at = (dx, dy) => { const c = Math.cos(S.tilt), s = Math.sin(S.tilt); return [x + (dx * c - dy * s) * S.swell, y + (dx * s + dy * c) * S.swell]; };
  if (kind === 'one') {
    // one big eye: a lit disc with a slit pupil and a glint
    const r = Math.max(2, 2.3 * k * S.swell), ex = Math.floor(x) + 0.5, ey = Math.floor(y) + 0.5;
    if (P.blink) { for (let i = -2; i <= 2; i++) dot(ex + i, ey, dim); return; }
    g.fill(ex - r - 2, ey - r - 2, ex + r + 2, ey + r + 2, (px, py) => inside(px, py) && (px - ex) ** 2 + (py - ey) ** 2 <= (r + 1) ** 2, dim);
    g.fill(ex - r - 1, ey - r - 1, ex + r + 1, ey + r + 1, (px, py) => inside(px, py) && (px - ex) ** 2 + (py - ey) ** 2 <= r * r, lit);
    dot(ex, ey, dim); dot(ex, ey + 1, dim);
    dot(ex + 1, ey - 1, '#ffffff');
  } else if (kind === 'many') {
    // a cluster: two bigger eyes in the middle, four small ones round them
    const spots = [[-1.5, 0.5, 2], [1.5, 0.5, 2], [-4, -0.5, 1], [4, -0.5, 1], [-2.5, -2, 1], [2.5, -2, 1]];
    for (const [dx, dy, n] of spots) {
      const [px, py] = at(dx * k - (n > 1 ? 0.5 : 0), dy * k), ex = Math.floor(px), ey = Math.floor(py);
      if (P.blink) { dot(ex, ey + n - 1, dim); continue; }
      dot(ex, ey, lit);
      if (n > 1) { dot(ex + 1, ey, dx > 0 ? '#ffffff' : lit); dot(ex, ey + 1, lit); dot(ex + 1, ey + 1, lit); } else dot(ex, ey + 1, dim);
    }
  } else {
    for (const s of [-1, 1]) {
      const [px, py] = at(s * 2.6 * k, 0), ex = Math.floor(px - 0.5), ey = Math.floor(py - 0.5);
      if (P.blink) { dot(ex, ey + 1, dim); dot(ex + 1, ey + 1, dim); continue; }
      for (const [dx, dy] of [[-1, 0], [-1, 1], [2, 0], [2, 1], [0, -1], [1, -1], [0, 2], [1, 2]]) dot(ex + dx, ey + dy, dim);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(ex + dx, ey + dy, lit);
      dot(ex + 1, ey, '#ffffff');
    }
  }
}

// What flies when a mite pops: a star of its insides on the first frame, then drops that arc out and fall.
function miteSplash(g, S, P, d, look = {}) {
  const lit = look.glow ?? '#9fe040', dim = tone(lit, -1), k = d.k, u = P.burst;
  const x = Math.floor(S.cx) + 0.5, y = Math.floor(S.cy) + 0.5;
  if (u < 0.05) {
    starburst(g, { x, y, count: 8, r1: Math.min(9.5 * k, y - 3), width: 4.4, turn: PI + 0.25, colour: lit, rim: dim, box: MITE_BOX });
    g.fill(x - 3, y - 3, x + 3, y + 3, (px, py) => (px - x) ** 2 + (py - y) ** 2 <= 5, '#ffffff');
  }
  particles(g, { t: u, x, y, count: 7, seed: 5, loop: false, stagger: 0.1, angle: PI, arc: TAU, dist: 9 * k, gravity: 7, size: 2.4, colours: ['#ffffff', lit, lit, dim], box: MITE_BOX });
}
