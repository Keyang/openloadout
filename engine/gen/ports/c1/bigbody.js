// PORT (creature batch C1): a copy of rigs/bigbody.js with its import pointed at engine/motion.js, the maths the
// moss golem's port (./moss-golem.js) is posed with. Pure maths (no drawing, no colour). It is the drawing code of the
// creature generator creature.moss-golem@1 (engine/gen/creature-c1.js), so it is NOT temporary: it stays when
// rigs/bigbody.js goes (removal item P4) and goes only with the last generator version that draws with it. Word for word;
// never change what a released generator version draws through it.
// Side-view large two-legged body rig (faces right), on a 96x96 canvas: a hunched giant made of rigid pieces
// (a golem of boulders, an ogre, a troll, a walking machine). The worked example is sprites/moss-golem.js.
//
// Bosses share a skeleton, not a look, so this rig does not paint. It says where every piece of the body is
// in every frame; the sprite paints each piece its own way (a boulder, a plate, a slab of flesh) and adds
// its own head, core and growths at points that turn with the pieces. That is also how a large body is
// animated without redrawing it: the pose moves about twenty numbers, and the pieces follow.
//
//   dims(o)                        body measurements from size / bulk / arms / head, each 0..1
//   clips(speedOf, extra)          the seven boss clips; clipsFor(names, speedOf) any of them, in your order
//   pose(name, t, m, d)            where the body is, for every name in POSES:
//                                  idle / walk / slam (also called attack) / roar / hurt / stagger / die
//   solve(P, d)                    joint positions in pixels (arms and legs use IK; fists stop at the ground and the frame edge)
//   pieces(J, P, d)                the rigid pieces in painting order: [{ name, x, y, rx, ry, angle, far, seed }]
//   onPiece(piece, u, v)           a point on a piece that turns with it: eyes, cracks, a core, things growing on it
//   collapse(pieces, k, opt)       the pieces falling apart from the top into a pile (die): k = 0 standing, 1 at rest
//   sockets(J, P, d, pieces)       hand, offhand, head, back, feet, core
//   chainJoints(x, y, lengths, angles)   joints of a chain of segments (a tail, a neck, a tentacle, a stem): for any large body
//
// A piece is an ellipse-like lump: centre (x, y), half length rx along its own long axis, half thickness ry, and
// `angle`, the turn of that axis in radians, clockwise on screen (0 = lying level, PI/2 = standing on end).
// The boulder painter in engine/fx.js takes these numbers: rock(g, { x: piece.x, y: piece.y, r: piece.rx, squash: piece.ry / piece.rx,
// angle: piece.angle, seed: piece.seed, colour }); seam() in engine/rock.js then draws the dark line where a piece sits on the ones behind it.
// Pose angles use the rig convention: 0 = down, PI/2 = forward (right), PI = up.

import { lerp, clamp, wave, keys, ik2, smooth, reach, fract, hash, TAU, PI } from '../../../motion.js';

/** The frame of a side-view boss, [width, height] in pixels. */
export const SIZE = [96, 96];
/** The ground line: feet rest on the row above it. */
export const GROUND = 90;
/** The x of the body's middle at rest; left of the frame's middle so slams and swings in front have room. */
export const CX = 44;
/** Where a game anchors the boss: [CX, GROUND]. */
export const PIVOT = [CX, GROUND];

/** The boss clips this rig has a pose for: frames, frames per second at the middle speed, loop, button label. */
const CLIP_TABLE = {
  idle: [8, 7, true], walk: [8, 10, true], attack: [12, 11, false, 'Slam'], roar: [10, 10, false],
  hurt: [4, 9, false], stagger: [8, 10, false], die: [12, 10, false],
};

/**
 * Standard clip entries for the named boss clips, in the order given (idle, walk, attack, roar, hurt, stagger, die).
 * Arguments: names (list of clip names), speedOf ((p) => 0..1, the sprite's speed control).
 */
export function clipsFor(names, speedOf = () => 0.5) {
  const out = {};
  for (const name of names) {
    const row = CLIP_TABLE[name];
    if (!row) throw new Error(`rigs/bigbody.js: no standard clip "${name}" (it has: ${Object.keys(CLIP_TABLE).join(', ')})`);
    out[name] = { frames: row[0], fps: (p) => row[1] * lerp(0.65, 1.45, speedOf(p) ?? 0.5), loop: row[2] };
    if (row[3]) out[name].label = row[3];
  }
  return out;
}

/**
 * The seven boss clips in their standard order: idle 8, walk 8, attack 12 (the slam), roar 10, hurt 4, stagger 8, die 12.
 * Arguments: speedOf ((p) => 0..1), extra (more clip entries to add after them).
 */
export function clips(speedOf = () => 0.5, extra = {}) {
  return { ...clipsFor(Object.keys(CLIP_TABLE), speedOf), ...extra };
}

/** Every name pose() knows; `attack` is accepted for `slam`. */
export const POSES = ['idle', 'walk', 'slam', 'roar', 'hurt', 'stagger', 'die'];

/**
 * Body measurements in pixels for a hunched giant, from four sliders.
 * Arguments: o { size (0..1: the whole body), bulk (0..1: lean to massive), arms (0..1: short to long), head (0..1: small to big) }; each defaults to 0.5.
 */
export function dims(o = {}) {
  const size = o.size ?? 0.5, bulk = o.bulk ?? 0.5, arms = o.arms ?? 0.5, head = o.head ?? 0.5;
  const s = lerp(0.86, 1.14, size);
  return {
    s,
    hip: 20 * s,                                                    // hip joint above the ground
    thigh: 8.3 * s, shin: 7.7 * s,                                  // short legs: two lumps and a foot
    thighR: lerp(5.4, 7.2, bulk) * s, shinR: lerp(5, 6.6, bulk) * s,
    footL: 15 * s, footH: lerp(6, 7, bulk) * s,
    stance: 6.5 * s,                                                // each foot this far from the middle
    torso: 19.5 * s,                                                // hip to the middle of the chest
    hunch: 0.42,                                                    // how far it leans forward at rest, radians
    rx: lerp(16, 21.5, bulk) * s, ry: lerp(14.5, 18, bulk) * s,     // the chest
    pelvisRx: lerp(10, 13.5, bulk) * s, pelvisRy: 7.5 * s,
    shoulderR: lerp(9, 12, bulk) * s,
    upper: lerp(12.5, 16.5, arms) * s, fore: lerp(14, 19, arms) * s,
    upperR: lerp(4.8, 6.2, bulk) * s, foreR: lerp(5.6, 7.2, bulk) * s,
    fist: lerp(7, 8.8, bulk) * s,
    headR: lerp(5.4, 7.4, head) * s,
  };
}

// The resting arms: the near one hangs a little behind the body, the far one in front of it, so both show.
const NEAR = -0.16, FAR = 0.3;

/**
 * The pose of a hunched giant for a clip at phase t (0..1): about twenty numbers that solve() turns into joints.
 * Arguments: name (one of POSES, or 'attack' for 'slam'), t (clip phase), m { bounce (0..1: how heavily it moves), stride (0..1: step length) }, d (from dims()).
 * Returns { bx, by (pelvis shift; by > 0 is down), lean (extra forward lean, radians), squash (px the torso is pressed shorter), rise (px the
 * shoulders lift), head ([dx, dy]), jaw (0..1 open), blink (0, 0.5, 1), glow (eyes and core: 1 normal, above 1 flaring, 0 dark),
 * near / far ([angle, reach]: each fist from its shoulder, reach as a share of the arm), nf / ff ([forward, lift]: each foot from where it stands),
 * flash (tint the frame white), impact (0..1 while the dust of a slam spreads, else -1), shout (0..1 while it roars, else -1),
 * kneel (0..1: down on the near knee), stance (how far apart the feet stand, as a share of the resting stance), fall (0..1: how far it has fallen apart) and settle (0..1: how far the pile has sunk in): pass both to collapse() }.
 * slam: frames 1 to 6 of 12 raise both fists (the warning), frame 7 they hit the ground, then it straightens.
 * roar: rears back for three frames, then leans forward with the arms flung wide. stagger: drops to the near knee and holds there.
 * die: starts on the recoil; `fall` runs 0 to 1 by frame 7 of 12, when the last pieces land.
 */
export function pose(name, t, m = {}, d = dims()) {
  const bounce = m.bounce ?? 0.5, stride = m.stride ?? 0.5;
  const P = {
    bx: 0, by: 0, lean: 0, squash: 0, rise: 0,
    head: [0, 0], jaw: 0, blink: 0, glow: 1,
    near: [NEAR, 0.94], far: [FAR, 0.92],
    nf: [0, 0], ff: [0, 0],
    flash: false, impact: -1, shout: -1, kneel: 0, fall: 0, settle: 1, stance: 1,
  };
  if (name === 'attack') name = 'slam';
  const k2 = (ks) => keys(t, ks);

  if (name === 'idle') {
    const br = lerp(0.6, 1.5, bounce);
    // breathing lifts the chest and the shoulders; the legs stand still. The phase puts the two big moves inside the loop, not across its seam
    P.rise = 1 + 0.7 * br * wave(t, -0.19);
    P.near = [NEAR + 0.05 * wave(t, -0.3), 0.94];
    P.far = [FAR + 0.05 * wave(t, -0.42), 0.92];
    P.head = [0, 0.6 * wave(t, -0.15)];
    P.glow = 1 + 0.3 * wave(t, -0.05);
    P.blink = t >= 0.75 && t < 0.87 ? 1 : t >= 0.87 ? 0.5 : 0;
  } else if (name === 'walk') {
    // near foot lands at t = 0 (frame 0 of 8), far foot at t = 0.5 (frame 4); the body drops onto each step
    const s = lerp(5.5, 9, stride) * d.s, up = lerp(3, 6.5, bounce) * d.s;
    P.stance = 0.3;                                                 // walking, both feet tread one line, so the two steps match
    const step = (ph) => {
      const u = fract(t + ph), duty = 0.6;
      if (u < duty) return [lerp(s, -s, u / duty), 0];
      const v = (u - duty) / (1 - duty);
      return [lerp(-s, s, smooth(v)), Math.sin(PI * v) * up];
    };
    P.nf = step(0); P.ff = step(0.5);
    P.by = lerp(1, 3.4, bounce) * (0.5 + 0.5 * Math.cos(TAU * 2 * (t - 0.05)));
    P.bx = 0.8 * wave(t * 2, 0.3);
    P.lean = 0.06 + 0.035 * wave(t * 2, 0.15);
    P.rise = -0.7 * Math.cos(TAU * 2 * (t - 0.12));
    P.near = [NEAR - 0.32 * Math.cos(TAU * t), 0.93];
    P.far = [FAR + 0.32 * Math.cos(TAU * t), 0.91];
    P.head = [0, 0.9 * Math.cos(TAU * 2 * (t - 0.17))];
  } else if (name === 'slam') {
    // frame times of a 12-frame clip: n / 11
    const f = (n) => n / 11;
    const armA = (o) => k2([[0, 0.1 + o], [f(1), -0.3 + o], [f(2), 0.5 + o], [f(3), 1.35 + o], [f(4), 2.15 + o], [f(5), 2.75 + o * 0.5], [f(6), 2.98], [f(6.5), 2.98], [f(7), 0.24 + o * 0.6], [f(8), 0.26 + o * 0.6], [f(10), 0.14 + o], [1, 0.1 + o]]);
    const armR = k2([[0, 0.94], [f(1), 0.86], [f(3), 0.8], [f(5), 0.94], [f(6), 1], [f(6.5), 1], [f(7), 1.5], [f(8), 1.5], [f(9.2), 1.02], [1, 0.94]]);
    // the far arm goes up in front of the body and the near arm behind it, so both show all the way up
    const backA = k2([[0, NEAR], [f(1), NEAR + 0.25], [f(2), -0.75], [f(3), -1.5], [f(4), -2.2], [f(5), -2.8], [f(6), -3.08], [f(6.5), -3.08], [f(7), 0.75], [f(8), 0.7], [f(9), 0.3], [f(10), -0.05], [1, NEAR]]);
    const backR = k2([[0, 0.94], [f(1), 0.9], [f(2), 0.96], [f(6), 1], [f(6.5), 1], [f(7), 1.5], [f(8), 1.5], [f(9.2), 1.02], [1, 0.94]]);
    P.near = [backA, backR]; P.far = [armA(FAR - 0.1), armR - 0.02];
    P.lean = k2([[0, 0], [f(1), 0.1], [f(2), 0], [f(3), -0.12], [f(4), -0.24], [f(5), -0.32], [f(6), -0.36], [f(6.5), -0.36], [f(7), 0.46], [f(8), 0.42], [f(9), 0.24], [f(10), 0.08], [1, 0]]);
    P.by = k2([[0, 0], [f(1), 2], [f(2), 1], [f(3), 0], [f(4), -1], [f(5), -1.6], [f(6), -2], [f(6.5), -2], [f(7), 3.5], [f(8), 3], [f(9), 1.5], [f(10), 0.5], [1, 0]]);
    P.squash = k2([[0, 0], [f(5), -1], [f(6.5), -1], [f(7), 3], [f(8), 1.5], [f(9), 0], [1, 0]]);
    P.rise = k2([[0, 0], [f(4), 1], [f(6.5), 2], [f(7), -1], [f(9), 0], [1, 0]]);
    P.head = [k2([[0, 0], [f(5), -1], [f(6.5), -1.5], [f(7), 1.5], [f(9), 0.5], [1, 0]]), k2([[0, 0], [f(5), -1], [f(6.5), -1.5], [f(7), 1.5], [f(9), 0.5], [1, 0]])];
    P.jaw = k2([[0, 0], [f(3), 0], [f(5), 0.7], [f(6.5), 1], [f(7), 0.3], [f(8), 0], [1, 0]]);
    P.glow = k2([[0, 1], [f(4), 1.3], [f(6.5), 1.6], [f(8), 1.2], [1, 1]]);
    P.impact = t >= f(6.8) && t <= f(10.4) ? (t - f(7)) / (f(10.6) - f(7)) : -1;
    if (P.impact >= 0) P.impact = clamp(P.impact);
  } else if (name === 'roar') {
    // frame times of a 10-frame clip: n / 9
    const f = (n) => n / 9;
    P.lean = k2([[0, 0], [f(1), -0.06], [f(2), -0.14], [f(3), -0.2], [f(4), 0.2], [f(5), 0.24], [f(6), 0.22], [f(7), 0.1], [f(8), 0.03], [1, 0]]);
    P.by = k2([[0, 0], [f(1), 1], [f(2), 0], [f(3), -1.5], [f(4), 2.5], [f(6), 2.5], [f(7), 1], [1, 0]]);
    P.rise = k2([[0, 0], [f(2), 1.5], [f(3), 2.5], [f(4), 0], [1, 0]]);
    // the near arm is flung back and the far arm forward, elbows bent: wide open
    P.near = [k2([[0, NEAR], [f(1), 0], [f(2), 0.2], [f(3), 0.3], [f(4), -0.7], [f(5), -0.95], [f(6), -0.88], [f(7), -0.5], [f(8), -0.25], [1, NEAR]]),
      k2([[0, 0.94], [f(2), 0.72], [f(3), 0.68], [f(4), 0.84], [f(6), 0.88], [f(8), 0.94], [1, 0.94]])];
    P.far = [k2([[0, FAR], [f(1), 0.4], [f(2), 0.5], [f(3), 0.55], [f(4), 0.3], [f(5), 0.22], [f(6), 0.26], [f(7), 0.3], [f(8), 0.3], [1, FAR]]),
      k2([[0, 0.92], [f(2), 0.72], [f(3), 0.68], [f(4), 0.96], [f(6), 1], [f(8), 0.92], [1, 0.92]])];
    P.head = [k2([[0, 0], [f(2), -1], [f(3), -2], [f(4), 3], [f(6), 3], [f(8), 0.5], [1, 0]]), k2([[0, 0], [f(2), -1], [f(3), -2], [f(4), -3], [f(6), -3], [f(7), -1], [1, 0]])];
    P.jaw = k2([[0, 0], [f(2), 0.2], [f(3), 0.5], [f(4), 1], [f(6), 1], [f(7), 0.5], [f(8), 0], [1, 0]]);
    P.glow = k2([[0, 1], [f(3), 1.3], [f(4), 1.8], [f(6), 1.8], [f(8), 1.1], [1, 1]]);
    // it shakes as it roars: one pixel forward and back
    if (t > f(4.5) && t < f(5.5)) P.bx = 1; else if (t > f(5.5) && t < f(6.5)) P.bx = -1;
    P.shout = t >= f(3.8) && t <= f(7.2) ? clamp((t - f(4)) / (f(7) - f(4))) : -1;
  } else if (name === 'hurt') {
    P.flash = t < 0.15;
    P.lean = k2([[0, -0.2], [0.333, -0.34], [0.667, -0.1], [1, 0]]);
    P.bx = k2([[0, -2], [0.333, -4], [0.667, -1.5], [1, 0]]);
    P.by = k2([[0, 0.5], [0.333, 1.5], [0.667, 0.5], [1, 0]]);
    P.near = [k2([[0, 0.05], [0.333, 0.3], [0.667, 0], [1, NEAR]]), k2([[0, 0.9], [0.333, 0.84], [1, 0.94]])];
    P.far = [k2([[0, 0.55], [0.333, 0.8], [0.667, 0.45], [1, FAR]]), k2([[0, 0.86], [0.333, 0.78], [1, 0.92]])];
    P.head = [k2([[0, -1], [0.333, -2], [0.667, -1], [1, 0]]), k2([[0, -1], [0.333, -1], [0.667, 0], [1, 0]])];
    P.jaw = k2([[0, 0.7], [0.333, 0.6], [0.667, 0.2], [1, 0]]);
    P.glow = k2([[0, 0.6], [0.667, 0.8], [1, 1]]);
  } else if (name === 'stagger') {
    // frame times of an 8-frame clip: n / 7. 0 the jolt, 1 it topples, 2 to 5 down on the near knee, 6 it pushes up, 7 idle
    const f = (n) => n / 7;
    const k = k2([[0, 0], [f(1), 0.4], [f(2), 1], [f(5), 1], [f(6), 0.4], [1, 0]]);
    const heave = t > f(1.5) && t < f(5.5) ? wave((t - f(2)) / (f(4) - f(2))) : 0;      // heavy breathing while it is down
    P.kneel = k;
    P.by = 8 * d.s * k + 0.6 * heave;
    P.bx = k2([[0, -2], [f(1), -1], [f(2), 0], [1, 0]]);
    P.nf = [-8.5 * d.s * k, 0];
    P.ff = [2.5 * d.s * k, 0];
    P.lean = k2([[0, -0.22], [f(1), 0.12], [f(2), 0.4], [f(3), 0.46], [f(4), 0.4], [f(5), 0.46], [f(6), 0.2], [1, 0]]);
    P.rise = -0.8 * heave;
    P.near = [k2([[0, 0.3], [f(1), 0.2], [f(2), 0.12], [f(5), 0.12], [f(6), 0], [1, NEAR]]), k2([[0, 0.86], [f(1), 1], [f(2), 1.5], [f(5), 1.5], [f(6), 1.05], [1, 0.94]])];
    P.far = [k2([[0, 0.8], [f(1), 0.7], [f(2), 0.5], [f(5), 0.5], [f(6), 0.4], [1, FAR]]), k2([[0, 0.86], [f(1), 1], [f(2), 1.5], [f(5), 1.5], [f(6), 1.05], [1, 0.92]])];
    P.head = [k2([[0, -1], [f(1), 0], [f(2), 1], [f(5), 1], [1, 0]]), k2([[0, -1], [f(1), 1], [f(2), 2.5], [f(5), 2.5], [f(6), 1], [1, 0]]) + 0.6 * heave];
    P.jaw = k2([[0, 0.6], [f(2), 0.5], [f(5), 0.5], [f(6), 0.2], [1, 0]]);
    P.glow = t > f(1.5) && t < f(5.5) ? (Math.round(t * 7) % 2 ? 1.4 : 2.2) : 1;       // the core flashes while it is down
  } else if (name === 'die') {
    // frame times of a 12-frame clip: n / 11. 0 the hit (white), 1 to 7 it falls apart from the top, 7 the last pieces land, 8 to 11 it settles
    const f = (n) => n / 11;
    P.flash = t < f(0.5);
    P.lean = -0.2; P.bx = -2; P.by = 1;
    P.near = [0.25, 0.9]; P.far = [0.8, 0.88];
    P.head = [-1, -1]; P.jaw = 0.7;
    P.fall = clamp((t - f(0.6)) / (f(7) - f(0.6)));
    P.settle = clamp((t - f(7)) / (f(9) - f(7)));
    P.glow = 1 - smooth((t - f(1)) / (f(5) - f(1)));
  } else {
    throw new Error(`rigs/bigbody.js: no pose "${name}" (it has: ${POSES.join(', ')})`);
  }
  return P;
}

/** Where the core sits on the chest piece, as onPiece(chest, u, v). */
export const CORE_AT = [0.46, 0.08];

const turn = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/**
 * Joint positions in pixels for a pose: pelvis, chest, both shoulders, elbows, fists, hips, knees, ankles and the head.
 * Arguments: P (from pose()), d (from dims()), options { box ([x0, y0, x1, y1] the fists must stay inside; default the frame less 2 px), ground (default GROUND) }.
 * The big lumps sit on whole pixels so their edges do not crawl; a fist that would pass the ground or the box stops there.
 */
export function solve(P, d, { box = [2, 2, SIZE[0] - 2, SIZE[1] - 2], ground = GROUND } = {}) {
  const lean = d.hunch + P.lean;
  const pelvis = [Math.round(CX + P.bx), Math.round(ground - d.hip + P.by)];
  const torso = d.torso - P.squash;
  const up = reach(pelvis[0], pelvis[1], PI - lean, torso);
  const rise = Math.round(P.rise);
  const chest = [Math.round(up[0]), Math.round(up[1]) - Math.round(rise / 2)];
  const rx = d.rx + P.squash * 0.5, ry = d.ry - P.squash * 0.35;
  const tilt = P.lean;                                              // how far the chest has turned from its resting attitude
  const at = (u, v) => { const [x, y] = turn(u * rx, v * ry, tilt); return [chest[0] + x, chest[1] + y]; };
  const sn = at(-0.7, -0.62), sf0 = at(0.5, -0.7);
  const shoulderN = [Math.round(sn[0]), Math.round(sn[1]) - rise], shoulderF = [Math.round(sf0[0]), Math.round(sf0[1]) - rise + 1];
  const hd = at(0.8, -0.46);
  const head = [Math.round(hd[0] + P.head[0]), Math.round(hd[1] + P.head[1])];
  const arm = (sh, [angle, share], r) => {
    const len = (d.upper + d.fore) * share;
    let [hx, hy] = reach(sh[0], sh[1], angle, len);
    hx = clamp(hx, box[0] + r, box[2] - r);
    const down = hy >= ground - r;
    hy = clamp(hy, box[1] + r, ground - r);
    // a fist sent to the ground gets there: the arm gives a little (stones shift), and the fist comes in under the shoulder if it must
    let upper = d.upper, fore = d.fore;
    if (down) {
      const dy = hy - sh[1], give = clamp(Math.hypot(hx - sh[0], dy) / ((upper + fore) * 0.99), 1, 1.18);
      upper *= give; fore *= give;
      const most = (upper + fore) * 0.99;
      if (Math.hypot(hx - sh[0], dy) > most && Math.abs(dy) < most) hx = sh[0] + Math.sign(hx - sh[0] || 1) * Math.sqrt(most * most - dy * dy);
    }
    const k = ik2(sh[0], sh[1], hx, hy, upper, fore, angle > 1.9 || angle < -1.2 ? 1 : -1);        // elbows point back, and the other way once the arm is up
    const hand = [Math.round(k.end[0]), Math.min(Math.round(k.end[1]), Math.floor(ground - r))];
    return { shoulder: sh, elbow: k.mid, hand, angle: Math.atan2(hand[0] - k.mid[0], hand[1] - k.mid[1]) };
  };
  const leg = (hip, restX, [fwd, lift], bend) => {
    const ankle = [Math.round(restX + fwd), Math.round(ground - d.footH - lift)];
    const k = ik2(hip[0], hip[1], ankle[0], ankle[1], d.thigh, d.shin, bend);
    return { hip, knee: k.mid, ankle: [Math.round(k.end[0]), Math.round(k.end[1])], sole: Math.round(ground - lift + (k.end[1] - ankle[1])), lift };
  };
  return {
    pelvis, chest, chestR: [rx, ry], tilt, lean, shoulderN, shoulderF, head, gy: ground,
    armN: arm(shoulderN, P.near, d.fist), armF: arm(shoulderF, P.far, d.fist),
    legN: leg([pelvis[0] - 4 * d.s, pelvis[1] + 2], CX - d.stance * (P.stance ?? 1), P.nf, 1),
    legF: leg([pelvis[0] + 5 * d.s, pelvis[1] + 1], CX + (d.stance + d.s) * (P.stance ?? 1), P.ff, 1),
    core: at(CORE_AT[0], CORE_AT[1]),
  };
}

/**
 * The rigid pieces of the body in painting order (far arm, far leg, far shoulder, pelvis, near leg, chest, head, near shoulder, near arm), each { name, x, y, rx, ry, angle, far, seed, sole }.
 * Arguments: J (from solve()), P (the pose), d (from dims()).
 * Names: armF.upper, armF.fore, fistF, legF.thigh, legF.shin, footF, shoulderF, pelvis, legN.thigh, legN.shin, footN, chest, head, shoulderN, armN.upper, armN.fore, fistN.
 * `far` marks the pieces on the far side (paint them darker); `seed` is a fixed number per piece, so a rock keeps its shape from frame to frame;
 * a foot carries `sole`, the y of its flat underside (clip the foot to above it).
 */
export function pieces(J, P, d) {
  const limb = (name, a, b, r, seed, far) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    return { name, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, rx: len / 2 + r * 0.6, ry: r, angle: Math.atan2(dy, dx), far, seed };
  };
  const lump = (name, c, rx, ry, seed, far, angle = 0) => ({ name, x: c[0], y: c[1], rx, ry, angle, far, seed });
  const foot = (name, L, seed, far) => ({ name, x: L.ankle[0] + d.footL * 0.16, y: L.sole - d.footH * 0.55, rx: d.footL / 2, ry: d.footH * 0.62, angle: 0, far, seed, sole: L.sole });
  const armOf = (A, side, far, seed) => [
    limb(`arm${side}.upper`, A.shoulder, A.elbow, d.upperR, seed, far),
    limb(`arm${side}.fore`, A.elbow, A.hand, d.foreR, seed + 1, far),
    lump(`fist${side}`, A.hand, d.fist, d.fist * 0.94, seed + 2, far, PI / 2 - A.angle),
  ];
  const legOf = (L, side, far, seed) => [
    limb(`leg${side}.thigh`, L.hip, L.knee, d.thighR, seed, far),
    limb(`leg${side}.shin`, L.knee, [L.ankle[0], L.ankle[1] + 1], d.shinR, seed + 1, far),
    foot(`foot${side}`, L, seed + 2, far),
  ];
  return [
    ...armOf(J.armF, 'F', true, 11),
    ...legOf(J.legF, 'F', true, 21),
    lump('shoulderF', J.shoulderF, d.shoulderR * 0.92, d.shoulderR * 0.86, 31, true, J.tilt),
    lump('pelvis', J.pelvis, d.pelvisRx, d.pelvisRy, 41, false),
    ...legOf(J.legN, 'N', false, 51),
    lump('chest', J.chest, J.chestR[0], J.chestR[1], 61, false, J.tilt),
    lump('head', J.head, d.headR * 1.05, d.headR * 0.95, 71, false, J.tilt * 0.6),
    lump('shoulderN', J.shoulderN, d.shoulderR * 1.08, d.shoulderR, 81, false, J.tilt),
    ...armOf(J.armN, 'N', false, 91),
  ];
}

/**
 * A point on a piece that turns with it: u runs along the piece's long axis and v across it, each -1..1 from edge to edge. Returns [x, y].
 * Arguments: piece ({ x, y, rx, ry, angle }), u, v.
 */
export function onPiece(piece, u, v) {
  const [x, y] = turn(u * piece.rx, v * piece.ry, piece.angle);
  return [piece.x + x, piece.y + y];
}

/**
 * The pieces of a body falling apart from the top into a pile: returns copies with x, y and angle moved, and `landed` true once a piece is at rest.
 * Arguments: pieces (from pieces(), or any [{ x, y, rx, ry, angle }]), k (0 = as given, 1 = all at rest), options { ground (default GROUND), cx (the middle the pile spreads from; default the mean x), spread (px the top pieces are thrown sideways, default 16), reachOut (px the pile may reach either side of cx, default 32), settle (0..1: at 0 the stones lying on others sit a pixel or two high, at 1 they have sunk in; default 1), seed, box ([x0, x1] the pile must stay between; default the frame less 2 px) }.
 * The top pieces go first and fall furthest; each drops with gravity, turns to lie flat, lands on the ground or on the pieces under it, and hops once.
 */
export function collapse(pieces, k, { ground = GROUND, cx, spread = 16, reachOut = 32, settle = 1, seed = 0, box = [2, SIZE[0] - 2] } = {}) {
  const n = pieces.length;
  if (!n || k <= 0) return pieces.map((p) => ({ ...p, landed: false }));
  const mid = cx ?? pieces.reduce((s, p) => s + p.x, 0) / n;
  let hi = Infinity, lo = -Infinity;
  for (const p of pieces) { if (p.y < hi) hi = p.y; if (p.y > lo) lo = p.y; }
  const span = lo - hi || 1;
  // where each comes to rest: the lowest are placed first, the others land on them
  const W = Math.ceil(box[1]) + 2;
  const sky = new Float32Array(W).fill(ground);
  const rest = new Array(n);
  // pieces already on the ground stay where they are; then the biggest land first and the small ones settle on and between them
  const onGround = (p) => p.y + Math.min(p.rx, p.ry) >= ground - 2.5;
  const order = pieces.map((_, i) => i).sort((a, b) => onGround(pieces[b]) - onGround(pieces[a]) || Math.min(pieces[b].rx, pieces[b].ry) - Math.min(pieces[a].rx, pieces[a].ry) || a - b);
  const left = Math.max(box[0], mid - reachOut), right = Math.min(box[1], mid + reachOut);
  for (const i of order) {
    const p = pieces[i], h01 = (lo - p.y) / span;
    const hw = Math.max(p.rx, p.ry), hh = Math.min(p.rx, p.ry);
    const side = Math.abs(p.x - mid) < 2 ? (hash(i, seed * 7 + 1) < 0.5 ? -1 : 1) : Math.sign(p.x - mid);
    const x0 = onGround(p) ? p.x : clamp(p.x + side * spread * h01 * (0.6 + 0.8 * hash(i, seed * 7 + 3)), left + hw, right - hw);
    const supportAt = (at) => {
      let top = ground;
      for (let c = Math.max(0, Math.floor(at - hw * 0.25)); c <= Math.min(W - 1, Math.ceil(at + hw * 0.25)); c++) if (sky[c] < top) top = sky[c];
      return top;
    };
    // it rolls to the lowest spot within reach: the further away, the less it is worth
    let x = x0, support = supportAt(x0), best = support;
    for (let j = -8; j <= 8; j++) {
      const at = x0 + j * spread * 0.25;
      if (!j || onGround(p) || at < left + hw || at > right - hw) continue;
      const top = supportAt(at), score = top - 0.6 * Math.abs(at - x0);
      if (score > best) { best = score; x = at; support = top; }
    }
    // a heap has depth: stones lie in front of and behind each other, so each takes up half its width and sinks well into the ones under it
    const y = Math.min(ground - hh, Math.max(p.y, support - hh * 0.3));        // and a stone never ends higher than it started
    for (let c = Math.max(0, Math.floor(x - hw * 0.5)); c <= Math.min(W - 1, Math.ceil(x + hw * 0.5)); c++) if (y - hh * 0.5 < sky[c]) sky[c] = y - hh * 0.5;
    // lying flat: the long axis level, turned the short way round, and a little crooked
    const flat = p.rx >= p.ry ? 0 : PI / 2;
    const angle = flat + PI * Math.round((p.angle - flat) / PI) + (hash(i, seed * 7 + 5) - 0.5) * 0.5;
    rest[i] = { x, y, angle, drop: Math.max(0, y - p.y) };
  }
  return pieces.map((p, i) => {
    const r = rest[i], start = 0.5 * (p.y - hi) / span, dur = 0.5;
    const kk = clamp(k) ** 1.5;                                     // it gives way slowly, then all at once
    const u = clamp((kk - start) / dur);
    const after = (kk - start - dur) / 0.14;
    const hop = after > 0 && after < 1 ? Math.sin(PI * after) * Math.min(2, r.drop / 10) : 0;
    const loose = r.y + Math.min(p.rx, p.ry) < ground - 0.5 ? 1.6 * (1 - clamp(settle)) : 0;      // the ones lying on others sink in last
    return { ...p, x: lerp(p.x, r.x, 1 - (1 - u) ** 2), y: lerp(p.y, r.y - loose, u * u) - hop, angle: lerp(p.angle, r.angle, smooth(u)), landed: u >= 1 };
  });
}

/**
 * Named attach points of a solved pose, { name: { x, y, angle } } in frame pixels: hand (near fist), offhand (far fist), head (top of the head), back (top of the near shoulder), feet (the ground under the body), core (the middle of the chest's front, a boss's weak point).
 * Arguments: J (from solve()), P (the pose), d (from dims()), list (optional: the pieces as painted, for example from collapse(); the points then follow those pieces).
 */
export function sockets(J, P, d, list) {
  const out = {
    hand: { x: J.armN.hand[0], y: J.armN.hand[1], angle: J.armN.angle },
    offhand: { x: J.armF.hand[0], y: J.armF.hand[1], angle: J.armF.angle },
    head: { x: J.head[0], y: J.head[1] - d.headR, angle: PI - J.lean },
    back: { x: J.shoulderN[0], y: J.shoulderN[1] - d.shoulderR, angle: PI - J.lean },
    feet: { x: CX + P.bx, y: J.gy, angle: 0 },
    core: { x: J.core[0], y: J.core[1], angle: PI / 2 },
  };
  if (list) {
    const by = (name) => list.find((p) => p.name === name);
    const put = (key, piece, u, v) => { if (piece) { const [x, y] = onPiece(piece, u, v); out[key] = { ...out[key], x, y }; } };
    put('hand', by('fistN'), 0, 0); put('offhand', by('fistF'), 0, 0);
    put('head', by('head'), 0, -1); put('back', by('shoulderN'), 0, -1); put('core', by('chest'), CORE_AT[0], CORE_AT[1]);
  }
  return out;
}

/**
 * Joints of a chain of segments laid end to end from (x, y): a tail, a neck, a tentacle, a stem, the spine of a long body. Returns [[x, y], ...], one more point than segments.
 * Arguments: x, y (where it starts), lengths (px per segment, or one number for all), angles (the way each segment points: 0 = down, PI/2 = right, PI = up; a list, or a function (i) => angle), count (number of segments when angles is a function and lengths one number).
 */
export function chainJoints(x, y, lengths, angles, count) {
  const n = Array.isArray(lengths) ? lengths.length : Array.isArray(angles) ? angles.length : count ?? 1;
  const pts = [[x, y]];
  for (let i = 0; i < n; i++) {
    const len = Array.isArray(lengths) ? lengths[i] : lengths;
    const a = typeof angles === 'function' ? angles(i) : angles[i];
    pts.push(reach(pts[i][0], pts[i][1], a, len));
  }
  return pts;
}
