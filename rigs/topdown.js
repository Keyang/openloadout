// Top-down two-legged character rig, on a 48x48 canvas: the partner of rigs/humanoid.js for map and room games.
//
// "Top-down" here is the three-quarter view (docs/style-guide.md, section 1): the camera looks from the south, tilted
// down, so a person stands up the screen and you see the top of the head. Three directions are drawn and the game
// mirrors the fourth (section 5):
//
//   down   facing the camera: face with two eyes; the weapon hand is on the LEFT of the picture
//   up     facing away: no face, hair and whatever is on the back; the weapon hand is on the RIGHT, the weapon behind the body
//   side   facing RIGHT: one eye; the weapon hand is the near one, in front of the body
//
//   clips(speedOf, { action, plain, extra })    the section 5 clip table: idle_*, walk_*, <action>_*, then clips with no direction
//   frame(clip, t, p, { item, rise, carry })    ONE FRAME, posed and fitted once: F.draw(), F.sockets(), F.finish(). Start here
//   parseClip, dims, pose, solve, fit, draw, sockets, slashTrail, muzzleFlash      what frame() is made of, for a pose of your own
//   worn parts (called from hooks)              cape, mantle, belt, hem, robe (torso and back); helmet, crown, hood, hat (head);
//                                               look.cuffs; headgearRise(kind, size) for frame()'s `rise`
//   heldItem(g, direction, at, item)            held kinds: sword, axe, spear, staff, lantern, cane, gun, pistol (ITEMS has their sizes,
//                                               CARRY how each rests: 'up', 'upright', 'low', 'hang')
//
// A new top-down character is a look, a few parts and the clip table:
//
//   import * as T from '../rigs/topdown.js';
//   const frameOf = (clip, t, p) => T.frame(clip, t, p, { item: T.itemSize(p.held, p.heldSize), carry: 'hang', rise: T.headgearRise('hood') });
//   // in defineSprite:  size: T.SIZE, pivot: T.PIVOT, preview: 'walk_down',
//   //                   clips: T.clips((p) => p.speed, { action: null, plain: ['talk'] }),
//   sockets: (clip, t, p) => frameOf(clip, t, p).sockets(),
//   render(g, { clip, t, p }) {
//     const F = frameOf(clip, t, p);                              // F.action, F.direction, F.d (dims), F.P (the pose)
//     F.draw(g, { skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: WOOD, hair: p.hair, hairStyle: 'short', hatted: true, cuffs: p.trim }, {
//       torso(g, J, P, d) { T.robe(g, J, P, d, { colour: p.outfit, length: 0.6 }); },
//       head(g, J, P, d)  { T.hood(g, J, P, d, { colour: p.trim }); },
//       item(g, J)        { if (F.item) T.heldItem(g, F.direction, F.hand(J), { kind: 'lantern', length: F.item.length }); },
//     });
//     F.finish(g);                                                // the white hurt frame and the outline
//   }
//
// A part of your own is a function (g, J, P, d, opt) that looks at J.dir; if another character could wear it, add it
// here, not in the sprite file (Contract 11). Useful joints: J.head (centre), J.headTop, J.brow (the forehead row
// under the fringe: eyes are on brow + 1, a brim goes on brow - 2), J.neck, J.shoulderY, J.hip, J.gy, J.armF.hand.
//
// Everything is placed on whole pixels, so a body part never shimmers between frames. Hooks must draw on the `g` they
// are given (in `die` the body is drawn lying down through a second surface).

import { lerp, clamp, wave, pulse, keys, loopKeys, smooth, reach, fract, TAU, PI } from '../engine/motion.js';
import { ramp, farRamp, mix, brightness, INK } from '../engine/color.js';
import { Surface, capsuleIn } from '../engine/surface.js';

/** The frame of every top-down character, [width, height] in pixels. */
export const SIZE = [48, 48];
/** The ground line: feet rest on the row above it and their outline lands on it. */
export const GROUND = 42;
/** The pivot column: the standing body is centred on this pixel column. */
export const CX = 24;
/** Where a game anchors the sprite, [x, y]: the ground under the middle of the body. */
export const PIVOT = [CX, GROUND];
/** The three drawn directions, in clip order; the game mirrors `side` (which faces right) for left. */
export const DIRECTIONS = ['down', 'up', 'side'];

const BX = CX + 0.5;              // the centre line of the body, through the middle of the pivot column
const K = 0.6;                    // a step towards or away from the camera moves a foot this far up or down the screen
const KA = 0.7;                   // the same for a hand

// ---- clips --------------------------------------------------------------------------------------

/** The frames, frames per second at Speed 0.5, and looping of every standard action (style guide, section 4). */
export const STANDARD = {
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

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** The standard clip entry { frames, fps, loop } of one action, for clips()'s `extra`. action: a key of STANDARD; speedOf: (p) => the Speed slider, 0..1. */
export function clipEntry(action, speedOf = () => 0.5) {
  const s = STANDARD[action];
  if (!s) throw new Error(`topdown rig: no standard clip "${action}" (${Object.keys(STANDARD).join(', ')})`);
  return { frames: s.frames, fps: (p) => s.fps * lerp(0.65, 1.45, speedOf(p)), loop: s.loop };
}

/**
 * Builds the clip table of a top-down character, in the order section 5 fixes. speedOf: (p) => the Speed slider, 0..1. The order: idle_down, idle_up, idle_side, walk_*,
 * the directed action, then the clips with no direction (drawn facing down and used for every direction).
 *   action  the directed action: 'attack' (default), 'shoot', 'run' ..., a list of them, or null for none
 *   plain   standard actions with no direction (default ['hurt', 'die']); a "Walker" passes [] or ['talk'], ['cast']
 *   walk    false for someone who never walks (a shopkeeper)
 *   extra   further clip entries, added last: { wave: T.clipEntry('talk', speedOf) }
 */
export function clips(speedOf = () => 0.5, { action = 'attack', plain = ['hurt', 'die'], walk = true, extra = {} } = {}) {
  const out = {};
  const directed = (name) => { for (const dir of DIRECTIONS) out[`${name}_${dir}`] = { ...clipEntry(name, speedOf), label: `${cap(name)} (${dir})` }; };
  directed('idle');
  if (walk) directed('walk');
  for (const a of action === null || action === undefined || action === false ? [] : [].concat(action)) directed(a);
  for (const a of plain) out[a] = clipEntry(a, speedOf);
  return { ...out, ...extra };
}

/** Splits a clip name into { action, direction }: 'walk_side' gives walk and side; a name with no direction ('hurt') is drawn facing down. */
export function parseClip(name) {
  const m = /^(.+)_(down|up|side)$/.exec(name);
  return m ? { action: m[1], direction: m[2] } : { action: name, direction: 'down' };
}

// ---- measurements -------------------------------------------------------------------------------

/**
 * Body measurements in whole pixels, from the Height, Build and Head sliders. p: { height, build, head } each 0..1 (missing = 0.5).
 * opt.tall: [shortest, tallest] body in pixels (default [26, 34]; a child passes [22, 27]).
 * Returns { tall, headW, headH, chin (rows of chest behind the chin), leg, torso (shoulder line to hip), arm, chestR, armW, legW, headR }.
 * At the standard height (30): head 13 x 12, torso 10 (8 show), legs 10.
 */
export function dims(p = {}, opt = {}) {
  const h = p.height ?? 0.5, b = p.build ?? 0.5, hd = p.head ?? 0.5;
  const [lo, hi] = opt.tall ?? [26, 34];
  const tall = Math.round(lerp(lo, hi, h));
  const headW = hd < 0.2 ? 11 : hd < 0.85 ? 13 : 15;          // odd: the head has a centre column
  const headH = Math.round(lerp(10, 14, hd));
  const chin = 2;                                               // rows of the chest hidden behind the chin
  const leg = Math.max(4, Math.round(8 + (tall - 26) / 2));         // hip to sole: half of any extra height goes into the legs
  const torso = Math.max(6, tall - headH - leg + chin);        // shoulder line to hip
  return {
    tall, headW, headH, chin, leg, torso,
    arm: Math.max(4, Math.round((torso - chin) * 0.7)),          // shoulder to the middle of the hand
    chestR: lerp(3.5, 5.45, b),                                  // half the width of the chest: 7, 9 or 11 px across
    armW: b < 0.3 ? 2 : 3,
    legW: b < 0.25 ? 2 : b < 0.75 ? 3 : 4,
    headR: headW / 2,
  };
}

// ---- poses ----------------------------------------------------------------------------------------

/**
 * How a held thing is carried at rest: its frame angle per direction (0 = down the picture, PI/2 = right, PI = up). Pass the name as m.carry to pose().
 *   up       tip up and out, about 40 degrees from upright (down: PI + 0.7, up: PI - 0.7; side: 2.0, forward under the chin): swords, axes, wands
 *   upright  nearly straight up, with the hand held out and the top leaning away so it clears the head (down: PI + 0.3, up: PI - 0.3; side: tipped forward, PI - 0.8): staffs, pole weapons
 *   low      tip down and out (down: -0.45, up: 0.45, side: 0.75): canes, guns at rest
 *   hang     straight down whatever the arm does, with a small swing: lanterns, baskets, buckets
 */
export const CARRY = {
  up: { down: PI + 0.7, up: PI - 0.7, side: 2.0 },
  upright: { down: PI + 0.3, up: PI - 0.3, side: PI - 0.8 },
  low: { down: -0.45, up: 0.45, side: 0.75 },
  hang: { down: 0, up: 0, side: 0 },
};
// where the weapon hand rests for a carry, added to the arm in every action: { o: out to the side, f: forward }
const CARRY_HAND = { upright: { down: { o: 4 }, up: { o: 4 }, side: { f: 4.5 } } };

/** From angle a towards angle b by k (0..1), the short way round. */
const turn = (a, b, k) => a + ((((b - a + PI) % TAU) + TAU) % TAU - PI) * k;

const ACTIONS = ['idle', 'walk', 'run', 'attack', 'punch', 'shoot', 'cast', 'block', 'dodge', 'talk', 'hurt', 'die'];

/**
 * The pose of an action at phase t (0..1), facing `direction` ('down' | 'up' | 'side'); d = dims(p). Returns P, which solve(), fit(), draw() and sockets() take.
 * m: { bounce, stride } 0..1; armed: something is held (the weapon arm swings less when walking);
 *    carry: 'up' | 'upright' | 'low' | 'hang', how the held thing rests (see CARRY; default 'up').
 * `punch` is the unarmed attack: use it in place of `attack` when nothing is held.
 *
 * The pose is written in the body's own terms, so one description serves all three directions:
 *   bob     the upper body comes down this far (the feet stay)        lift   the whole body leaves the ground
 *   lunge   the whole body moves this far the way it faces            lean   the shoulders tip forward (+) or back
 *   tuck    0..1 curled up                                            rootX  sideways on the screen
 *   footF, footB   { f: forward, u: off the ground, o: out to its side }   F = the weapon side (in side clips: the near side)
 *   armF, armB     { f: hand forward, u: hand raised, o: hand out to its side }, all from hanging at rest
 *   item    the screen angle of the held thing (0 = down the picture, PI/2 = right, PI = up)
 *   reach   0.5..1: how long the held thing looks (shorter when it points at the camera)
 *   sway -1..1 (hair, capes), glow 0..1 (cast), blink, flash (draw the frame white), mouth, eyes: 'open' | 'shut',
 *   tilt (die: the body leans this many pixels to the right per row of height), lie: 0 | 1 (die: the body is on the ground), slash (attack: the blade is on its way to the hit), fire (shoot: frame 1)
 */
export function pose(action, direction, t, m = {}, d = dims()) {
  if (!DIRECTIONS.includes(direction)) throw new Error(`topdown rig: no direction "${direction}" (down, up, side; the game mirrors side for left)`);
  if (!ACTIONS.includes(action)) throw new Error(`topdown rig: no pose "${action}" (${ACTIONS.join(', ')})`);
  const bounce = m.bounce ?? 0.5, stride = m.stride ?? 0.5;
  const k = d.leg / 10;
  const rest = (CARRY[m.carry] ?? CARRY.up)[direction];
  const side = direction === 'side', up = direction === 'up';
  const P = {
    rootX: 0, lift: 0, bob: 0, lunge: 0, lean: 0, tuck: 0, headDx: 0, headDy: 0,
    footF: { f: 0, u: 0, o: 0 }, footB: { f: 0, u: 0, o: 0 },
    armF: { f: 0, u: 0, o: 0 }, armB: { f: 0, u: 0, o: 0 },
    item: rest, reach: 1,
    sway: 0, glow: 0, blink: false, flash: false, mouth: false, eyes: 'open', lie: 0, tilt: 0,
  };
  // the screen angle that points the way the body faces, and the turn that swings towards it
  const ahead = side ? PI / 2 : up ? PI : 0;
  switch (action) {
    case 'idle': {
      // breathing in whole pixels: the body is down on frames 2 to 6 and the hands settle one frame after it, so the
      // step from the last frame into the first is a small one (frame 0 is the standing pose every one-shot starts from)
      const deep = bounce < 0.6 ? 1 : 2;
      const level = (u) => Math.round(deep * keys(fract(u), [[0.12, 0], [0.37, 1], [0.75, 1], [0.94, 0]], (x) => x));
      P.bob = level(t);
      P.armF.u = P.armB.u = level(t) - level(t - 0.125);
      P.item = rest + 0.06 * wave(t);
      P.sway = wave(t);
      P.blink = fract(t) >= 0.74;                            // frames 6 and 7
      break;
    }
    case 'walk': {
      const S = lerp(2.2, 4.2, stride) * k, lift = lerp(2, 3.4, bounce);
      const foot = (u) => {
        u = fract(u);
        if (u < 0.5) return { f: lerp(S, -S, u * 2), u: 0, o: 0 };
        const s = (u - 0.5) * 2;
        return { f: lerp(-S, S, smooth(s)), u: lift * Math.sin(PI * s), o: 0 };
      };
      P.footF = foot(t); P.footB = foot(t + 0.5);
      P.bob = lerp(0.6, 1.9, bounce) * (0.5 + 0.5 * Math.cos(2 * TAU * t)) ** 2;      // dips on the two contacts
      P.lean = 0.3 + 0.4 * stride;
      const A = lerp(2.8, 4.8, (bounce + stride) / 2);                 // the hands swing at least 2 px each way, opposite the legs
      P.armF.f = -A * Math.cos(TAU * t) * (m.carry === 'upright' ? 0.25 : m.armed ? 0.8 : 1);      // a staff is carried steady
      P.armB.f = A * Math.cos(TAU * t);
      P.item = rest + 0.1 * Math.cos(TAU * t) * (side ? 1 : 0.6);
      P.sway = wave(t * 2);
      break;
    }
    case 'run': {
      const S = lerp(3, 5, stride) * k, lift = lerp(2, 4, bounce), st = 0.38;
      const foot = (u) => {
        u = fract(u);
        if (u < st) return { f: lerp(S * 0.8, -S, u / st), u: 0, o: 0 };
        const s = (u - st) / (1 - st);
        return { f: lerp(-S, S * 0.8, smooth(s)), u: lift * Math.sin(PI * Math.pow(s, 0.75)), o: 0 };
      };
      P.footF = foot(t); P.footB = foot(t + 0.5);
      P.lift = lerp(1, 2.6, bounce) * pulse(2 * t - 0.4);
      P.bob = 1;
      P.lean = 1.6 + stride;
      P.headDy = 1;
      const A = lerp(3, 5, bounce);
      P.armF.f = -A * Math.cos(TAU * t) * (m.carry === 'upright' ? 0.25 : m.armed ? 0.6 : 1); P.armF.u = 2;
      P.armB.f = A * Math.cos(TAU * t); P.armB.u = 2;
      P.item = rest + 0.2 * Math.cos(TAU * t) * (side ? 1 : 0.6);
      P.sway = 0.6 + 0.4 * wave(t * 2);
      break;
    }
    case 'attack': {
      // a quarter-circle sweep: the blade is drawn back on the weapon side, swung round to the front, and comes to rest beside the body
      const wind = keys(t, [[0, 0], [0.286, 1], [0.37, 1], [0.571, 0], [1, 0]]);
      const hit = keys(t, [[0, 0], [0.37, 0], [0.571, 1], [0.72, 0.9], [1, 0]]);
      // screen angles: at rest, wound up (away from the target), on the hit, at the end of the follow-through
      const A = side ? [rest, 4.35, 1.45, 1.0] : up ? [rest, 1.2, PI - 0.45, PI - 0.2] : [rest, PI + 1.0, TAU - 0.8, TAU - 0.3];
      P.item = keys(t, [[0, A[0]], [0.286, A[1]], [0.37, A[1]], [0.571, A[2]], [0.72, A[3]], [1, A[0]]]);
      P.slash = t > 0.37 && t < (up ? 0.65 : 0.75);                            // the blade is on its way to the hit (slashTrail draws only then)
      // side: the hand goes up and back so the raised blade passes behind the face, then is thrown forward
      P.armF.u = side ? 5 * wind + 1 * hit : 2 * wind + (up ? 3 : 0) * hit;
      P.armF.f = (side ? -3 : -1.5) * wind + (side ? 4 : 3) * hit;
      P.armF.o = side ? 0 : 1.5 * wind + (up ? 2 : 0.5) * hit;       // the blade stays on the weapon side of the body, never across the legs
      P.armB.f = 1.2 * wind - 2 * hit; P.armB.o = 0.8 * hit;
      P.lean = -1 * wind + 1.5 * hit;
      P.lunge = -1 * wind + 2.6 * hit;
      P.bob = 0.4 * wind + 1.4 * hit;
      P.footF.f = 2.2 * hit; P.footF.u = 1.2 * pulse(clamp((t - 0.37) / 0.2));
      P.footB.f = -1.6 * hit;
      // pointing at the camera, a blade looks shorter
      if (!side && !up) P.reach = 1 - 0.18 * Math.max(0, Math.cos(P.item)) ** 2;
      P.sway = keys(t, [[0, 0], [0.37, -1], [0.6, 1], [1, 0]]);
      break;
    }
    case 'punch': {
      // the unarmed attack: the body coils back with the fist at the hip, then throws it straight out the way it faces
      const wind = keys(t, [[0, 0], [0.22, 0.8], [0.4, 1], [0.5, 0.4], [0.571, 0], [1, 0]]);
      const jab = keys(t, [[0, 0], [0.4, 0], [0.571, 1], [0.72, 0.9], [0.86, 0], [1, 0]]);
      P.armF.f = -2 * wind + 5 * jab; P.armF.u = 1.5 * wind + 3 * jab; P.armF.o = side ? 0 : -1 * jab;
      P.armB.f = 1.5 * wind - 2 * jab; P.armB.u = 1.5 * wind + 1 * jab;
      P.lean = -1 * wind + 1.8 * jab;
      P.lunge = -1.2 * wind + 3 * jab;
      P.bob = 0.6 * wind + 1.4 * jab;
      P.footF.f = 2.4 * jab; P.footF.u = 1.2 * pulse(clamp((t - 0.4) / 0.17));
      P.footB.f = -1.6 * jab;
      P.item = ahead;
      P.sway = keys(t, [[0, 0], [0.4, -1], [0.6, 1], [1, 0]]);
      break;
    }
    case 'shoot': {
      // starts aimed (frame 0), fires on frame 1, kicks back on frame 2, recovers, and ends standing
      const aim = keys(t, [[0, 1], [0.7, 1], [1, 0]]);
      const kick = keys(t, [[0, 0], [0.2, 0], [0.4, 1], [0.8, 0.15], [1, 0]]);
      // side: the arm is level. up (facing away): the hand comes out to the side so the whole barrel shows past the head.
      // down (at the camera): both hands bring it in front of the chest and it is drawn short, its muzzle at the hip
      const front = !side && !up;
      P.armF.f = (front ? 3 : 4) * aim - 2.4 * kick; P.armF.u = (front ? 4.5 : 2.5) * aim + 0.6 * kick; P.armF.o = side ? 0 : (up ? 3.5 : -3.5) * aim;
      P.armB.f = 1.5 * aim - 1 * kick; P.armB.u = (front ? 4 : 1.5) * aim; P.armB.o = side ? 0 : (front ? -3 : -1) * aim;
      if (front) P.reach = 1 - 0.6 * aim;
      P.item = turn(rest, ahead, aim) - (side ? 0.25 : 0) * kick;
      P.lunge = -2 * kick;
      P.lean = 0.6 * aim - 1.2 * kick;
      P.bob = 0.6 * aim + 0.6 * kick;
      P.footF.f = 1.2 * aim; P.footB.f = -1.2 * aim;
      P.fire = t > 0.1 && t < 0.3;
      P.sway = -kick;
      break;
    }
    case 'cast': {
      const c = keys(t, [[0, 0], [0.29, 1], [0.72, 1], [1, 0]]);
      // both hands go up; the held thing is lifted until its top is over the head
      P.armF.u = (side ? 4 : 9) * c; P.armF.o = (side ? 1.5 : 2.5) * c; P.armF.f = (side ? 5 : 0) * c;        // side: held out in front, clear of the face
      P.armB.u = (side ? 5 : 6.5) * c; P.armB.o = 2 * c; P.armB.f = (side ? 1 : 0) * c;
      P.item = side ? lerp(rest, 2.35, c) : turn(rest, PI + (up ? -0.12 : 0.12), c);
      P.lean = -0.8 * c; P.bob = 0.8 * c * (1 - pulse(clamp((t - 0.5) / 0.3)));
      P.glow = keys(t, [[0, 0], [0.29, 0.6], [0.571, 1], [0.72, 0.7], [1, 0]]);
      P.sway = c * wave(t * 3);
      break;
    }
    case 'block': {
      const b = keys(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
      const jolt = pulse(clamp((t - 0.3) / 0.3));                       // the blow lands on the held guard
      P.armB.f = 3 * b; P.armB.u = 3 * b; P.armB.o = side ? 0 : -2.5 * b;
      P.armF.f = (side ? 4 : 2) * b; P.armF.u = (side ? 2.5 : up ? 2.5 : 1) * b; P.armF.o = side ? 0 : (up ? 2.5 : -1) * b;
      // the weapon comes across the chest, under the chin; facing away it is raised out to the side, where it still shows
      P.item = lerp(rest, side ? 2.35 : up ? PI - 0.35 : PI - 1.0, b);
      P.bob = 1.2 * b; P.lean = -0.6 * b; P.lunge = -1.2 * b * jolt;
      P.footF.o = 1 * b; P.footB.o = 1 * b;
      if (side) { P.footF.f = 1.5 * b; P.footB.f = -1.5 * b; }
      P.sway = -b * jolt;
      break;
    }
    case 'dodge': {
      // crouch, a tucked dash the way the body faces, rise
      const tuck = keys(t, [[0, 0], [0.143, 0.6], [0.286, 1], [0.714, 1], [0.857, 0.4], [1, 0]]);
      P.tuck = tuck;
      P.bob = d.leg * 0.45 * tuck;
      P.headDy = 2 * tuck;
      P.lunge = keys(t, [[0, 0], [0.143, -3], [0.286, 3], [0.43, 6], [0.571, 7], [0.714, 5], [0.857, 2], [1, 0]]);      // back first, then the dash
      if (side) P.lift = 1.5 * pulse(clamp((t - 0.2) / 0.5));
      P.armF.u = 2 * tuck; P.armF.f = 1.5 * tuck; P.armF.o = side ? 0 : -1 * tuck;
      P.armB.u = 2 * tuck; P.armB.f = 1.5 * tuck; P.armB.o = side ? 0 : -1 * tuck;
      P.footF.f = 1.5 * tuck * Math.cos(TAU * t * 2); P.footB.f = -1.5 * tuck * Math.cos(TAU * t * 2);
      P.item = turn(rest, CARRY.low[direction], tuck);
      P.reach = 1 - 0.3 * tuck;
      P.sway = keys(t, [[0, 0], [0.3, -1], [0.75, -1], [1, 0]]);
      break;
    }
    case 'talk': {
      const beat = fract(t * 2);                                        // two beats a loop: the mouth opens on frames 2 and 6
      P.mouth = beat >= 0.5 && beat < 0.75;
      P.headDy = P.mouth ? 1 : 0;
      P.bob = 0.6 * pulse(t);
      // the free hand gestures (seen from the side it comes out in front of the chest)
      P.armB.u = (side ? 4 : 3) + 1.5 * wave(t * 2, 0.1); P.armB.f = (side ? 4.5 : 2) + 1.2 * wave(t * 2); P.armB.o = 1;
      P.item = rest + 0.05 * wave(t);
      P.sway = 0.5 * wave(t);
      P.blink = t >= 0.5 && t < 0.62;
      break;
    }
    case 'hurt': {
      const h = keys(t, [[0, 0.7], [0.33, 1], [1, 0]]);            // ends back on the standing pose
      P.lunge = -2.6 * h; P.lean = -1.6 * h; P.bob = 1.4 * h; P.headDy = -1 * h;
      P.armF.u = 2.5 * h; P.armF.o = 2 * h; P.armF.f = -1 * h;
      P.armB.u = 3 * h; P.armB.o = 2.2 * h; P.armB.f = -1 * h;
      P.footF.o = 1 * h; P.footB.o = 1 * h;
      if (side) { P.footF.f = 2 * h; P.footB.f = -1 * h; }
      P.item = rest + (side ? 0.8 : up ? -0.6 : 0.6) * h;
      P.sway = -h;
      P.flash = t < 0.2;
      P.eyes = h > 0.5 ? 'shut' : 'open';
      break;
    }
    case 'die': {
      // 0 the white recoil, 1 stagger, 2 to 3 the knees give way, 4 down (still in the air), 5 lands, 6 bounces, 7 lies still
      const h = keys(t, [[0, 0.8], [0.143, 1], [0.43, 1]]);
      const knees = keys(t, [[0, 0], [0.143, 0.15], [0.286, 0.6], [0.43, 1]]);
      P.lunge = -2.6 * h; P.lean = -1.6 * h + 2.4 * knees; P.headDy = -1 * h + 3 * knees;
      P.bob = 1.4 * h + d.leg * 0.5 * knees; P.tuck = 0.5 * knees;
      P.tilt = keys(t, [[0.143, 0], [0.286, 0.22], [0.43, 0.5]]);        // tipping over towards where the head will lie
      P.armF.u = 2.5 * h * (1 - knees); P.armF.o = 2 * h; P.armF.f = -1 * h;
      P.armB.u = 3 * h * (1 - knees); P.armB.o = 2.2 * h; P.armB.f = -1 * h;
      P.footF.o = 1 * h; P.footB.o = 1 * h;
      P.item = turn(rest + (side ? 0.8 : up ? -0.6 : 0.6) * h, CARRY.low[direction], knees);
      P.sway = -h;
      P.flash = t < 0.1;
      P.eyes = 'shut';
      if (t > 0.5) {
        // lying: the same body, seen from the front or back, laid on its side with the head to the right
        const down = keys(t, [[0.571, 2], [0.714, 0], [0.857, 1], [1, 0]]);
        Object.assign(P, { lie: 1, tilt: 0, lunge: 0, lean: 0, headDy: 0, bob: 0, tuck: 0, lift: down, rootX: 0 });
        const flop = keys(t, [[0.571, 1], [0.714, 0.3], [0.857, 0.7], [1, 0]]);
        P.armF = { f: 0, u: 1 + 3 * flop, o: 1.5 + flop }; P.armB = { f: 0, u: 2 * flop, o: 1 + flop };
        P.footF = { f: 0, u: 0, o: 0.6 + 0.8 * flop }; P.footB = { f: 0, u: 0, o: 0.4 };
        P.item = (up ? 0.12 : -0.12) * (1 + 2 * flop);                   // dropped, lying along the legs
        P.sway = flop;
      }
      break;
    }
    default: break;
  }
  const hand = CARRY_HAND[m.carry]?.[direction];
  if (hand && !P.lie) { P.armF.o += hand.o ?? 0; P.armF.f += hand.f ?? 0; }
  if (m.carry === 'hang') { P.item = 0.12 * P.sway; P.reach = 1; }
  return P;
}

// ---- joints ---------------------------------------------------------------------------------------

/**
 * Works out the joint positions of a pose, in frame pixels. direction: 'down' | 'up' | 'side'; P: the pose; d: dims. Same names as the side rig where they mean the same thing:
 *   hip, neck (the middle of the shoulder line), head (its centre), armF / armB { shoulder, hand }, legF / legB, gy (the ground
 *   line under the body this frame). F is the weapon side. Also: dir, bx (the body's centre line), headTop, brow (the first
 *   row of the forehead under the fringe: eyes are on brow + 1; a hat's brim goes on brow - 2 so a row of fringe shows),
 *   s (which way the weapon side is on the screen: -1 left, 1 right).
 */
export function solve(direction, P, d) {
  if (P.lie) { P = standing(P); if (direction === 'side') direction = 'down'; }      // lying: the joints of the standing picture
  const side = direction === 'side', up = direction === 'up';
  const s = side ? 1 : up ? 1 : -1;
  const lunge = P.lunge ?? 0, lean = P.lean ?? 0, tuck = clamp(P.tuck ?? 0);
  const bx = BX + Math.round((P.rootX ?? 0) + (side ? lunge : 0));
  // towards the camera there are only a few rows under the ground line: a lunge that way is at most 4 px
  const gy = GROUND - Math.round(P.lift ?? 0) + (side ? 0 : up ? Math.round(-0.7 * lunge) : Math.min(4, Math.round(0.7 * lunge)));
  let drop = Math.round(P.bob ?? 0);
  if (side) {
    // feet apart bring the hips down, so the legs never stretch
    const far = Math.max(Math.abs(P.footF.f), Math.abs(P.footB.f));
    drop = Math.max(drop, Math.round(d.leg - Math.sqrt(Math.max(4, d.leg ** 2 - far ** 2))));
  }
  const hipY = gy - Math.max(3, d.leg - drop);
  const torso = Math.max(4, Math.round(d.torso * (1 - 0.35 * tuck)));
  const neckX = bx + (side ? Math.round(lean) : 0);
  const shoulderY = hipY - torso + (side ? Math.round(Math.abs(lean) * 0.3) : Math.round((up ? -0.25 : 0.5) * lean));
  const headTop = shoulderY + d.chin - d.headH + Math.round(P.headDy ?? 0) + Math.round(2 * tuck);
  const head = [neckX + Math.round(P.headDx ?? 0) + (side ? 1 : 0), headTop + d.headH / 2];

  const armTop = shoulderY + d.chin;
  const reachOf = d.arm + 1.2;
  const arm = (A, sgn, near) => {
    const shoulder = side ? [neckX + (near ? -0.5 : 1), armTop + (near ? 1 : 0.5)] : [bx + sgn * (d.chestR + d.armW / 2 - 1), armTop + 0.5];
    let dx, dy;
    if (side) { dx = A.f; dy = d.arm - A.u + (near ? K : -K) * A.o; }
    else { dx = sgn * (A.o - 0.25 * Math.max(0, A.f)); dy = d.arm - A.u + (up ? -KA : KA) * A.f; }
    const len = Math.hypot(dx, dy);
    if (len > reachOf) { dx *= reachOf / len; dy *= reachOf / len; }
    if (len < 1.5 && dy >= 0) dy = 1.5;                         // a hand never folds into its own shoulder
    return { shoulder, hand: [shoulder[0] + dx, shoulder[1] + dy], angle: Math.atan2(dx, dy) };
  };

  let legF, legB;
  if (side) {
    // standing, the near leg is a pixel behind the body's centre line and the far leg a pixel ahead of it (and a row
    // up the screen), so two legs show; the offset fades out as the feet move apart, so a stride is the same both ways
    const apart = 1 - clamp(Math.abs(P.footF.f - P.footB.f) / 3);
    const leg = (F, far) => ({ hip: [bx + (far ? 1 : -1), hipY], x: bx + Math.round(F.f + (far ? 1 : -1) * apart), soleY: gy - Math.round(F.u) - (far ? 1 : 0), lifted: F.u > 0.5, far });
    legF = leg(P.footF, false); legB = leg(P.footB, true);
  } else {
    const off = (d.legW + 1) / 2;
    const fmax = Math.max(P.footF.f, P.footB.f), fmin = Math.min(P.footF.f, P.footB.f);
    // the foot nearer the camera stands on the ground line; the other one is further up the screen
    const leg = (F, sgn) => ({ hip: [bx + sgn * off, hipY], x: bx + sgn * (off + Math.round(F.o ?? 0)), soleY: gy - Math.round((up ? K * (F.f - fmin) : K * (fmax - F.f)) + F.u), lifted: F.u > 0.5, far: false });
    legF = leg(P.footF, s); legB = leg(P.footB, -s);
  }
  return {
    dir: direction, s, bx, gy, hip: [bx, hipY], neck: [neckX, shoulderY], shoulderY, head, headTop,
    brow: headTop + Math.round(d.headH * 0.42),
    armF: arm(P.armF, s, true), armB: arm(P.armB, -s, false), legF, legB,
  };
}

// lying down (die): where a point of the standing picture ends up
const lieX0 = (P, d) => CX - Math.floor(d.tall / 2) + Math.round(P.rootX ?? 0);
const lieY0 = (P, d) => GROUND - 1 - Math.ceil(d.chestR + d.armW) - Math.round(P.lift ?? 0);
const lieMap = (P, d) => (x, y) => [lieX0(P, d) + GROUND - y, lieY0(P, d) - CX + x];
const standing = (P) => ({ ...P, lift: 0, rootX: 0 });
// tipping over (die): a point of the standing picture moves sideways by its height, about the middle of the body
const tiltX = (P, d, gy, x, y) => x + P.tilt * (gy - y) - P.tilt * d.tall * 0.35;

/**
 * The named attach points of one solved pose, { name: { x, y, angle } } in frame pixels. J = solve(direction, P, d); opt.muzzle: pixels from hand to muzzle.
 *   hand     the weapon hand; angle = the way a held thing points (P.item). Also `reach` (0.5..1): how long it looks
 *   offhand  the other hand; angle = along its arm
 *   head     the top of the head; angle = up
 *   back     between the shoulders, where a cape or pack hangs; angle = down
 *   feet     the ground under the body
 *   muzzle   the far end of the held thing, opt.muzzle pixels from the hand (default 6): where a shot appears
 * Angles are frame angles (Contract 3): 0 = down the picture, PI/2 = picture-right, PI = up; in side clips picture-right is the facing direction.
 * In `die` the body tips over and ends lying down: asked with solve()'s J (as a sprite's sockets() does), the points are
 * where they are in the frame; asked from inside a hook (with the J the hook was given) they are on the standing picture
 * the hook draws on. A game that mirrors a frame uses x' = 2 * pivotX - x and angle' = -angle.
 */
export function sockets(J, P, d, opt = {}) {
  const r = P.reach ?? 1, len = (opt.muzzle ?? 6) * r;
  const [hx, hy] = J.armF.hand;
  const out = {
    hand: { x: hx, y: hy, angle: P.item, reach: r },
    offhand: { x: J.armB.hand[0], y: J.armB.hand[1], angle: J.armB.angle },
    head: { x: J.head[0], y: J.headTop, angle: PI },
    back: { x: J.neck[0], y: J.shoulderY + d.chin + 1, angle: 0 },
    feet: { x: J.bx, y: J.gy, angle: 0 },
    muzzle: { x: hx + Math.sin(P.item) * len, y: hy + Math.cos(P.item) * len, angle: P.item },
  };
  if (J.inner || !(P.lie || P.tilt)) return out;      // J.inner: asked from inside a hook, which draws on the standing picture
  if (!P.lie) { for (const sk of Object.values(out)) sk.x = tiltX(P, d, J.gy, sk.x, sk.y); return out; }
  const map = lieMap(P, d);
  for (const sk of Object.values(out)) { [sk.x, sk.y] = map(sk.x, sk.y); sk.angle -= PI / 2; }
  out.feet = { x: J.bx, y: GROUND, angle: 0 };
  return out;
}

/**
 * Keeps a pose inside the frame when the body holds something long or wears something tall (frame() calls it). direction, P, d as for solve().
 * Changes P in place and returns it; a pose that already fits is left exactly as it was.
 *   opt.item   { length, back, pad } of the held thing (itemSize()). Too high or too low: it is drawn shorter, as if it
 *              pointed more at the camera, then turned level. Too far to a side: the whole body gives way.
 *   opt.points (J, P) => [[x, y], ...]: other far points (plume, crown, pack). Too high: a lower jump, then a deeper crouch.
 *   opt.margin pixels to keep clear of the frame edge (default 2: one for the outline, one to spare).
 */
export function fit(direction, P, d, opt = {}) {
  const margin = opt.margin ?? 2, item = opt.item && opt.item.length > 0 ? opt.item : null;
  if (P.lie) return fitLying(direction, P, d, item, opt.points, margin);
  const xMax = SIZE[0] - margin, yMax = SIZE[1] - margin;
  let J = solve(direction, P, d);
  if (opt.points) {
    let over = 0;
    for (const [, y] of opt.points(J, P)) over = Math.max(over, margin - y);
    if (over > 0) {
      const cut = Math.min(P.lift, Math.ceil(over));
      P.lift -= cut; P.bob += Math.ceil(over) - cut;
      J = solve(direction, P, d);
    }
  }
  if (item && direction === 'down' && (P.lunge ?? 0) > 0) {
    // a thing held low has no room under a body that lunges at the camera: the lunge is cut short first
    const over = J.armF.hand[1] + Math.cos(P.item) * item.length * 0.5 + (item.pad ?? 1) - yMax;
    if (over > 0) { P.lunge = Math.max(0, P.lunge - Math.ceil(over) / 0.7); J = solve(direction, P, d); }
  }
  if (item) {
    const c = Math.cos(P.item), len = item.length;
    // a thing that hangs (a lantern) is wide across, not along: it ends where its length ends
    const pad = item.hangs ? 2.5 : item.pad ?? 1;
    const roomAt = () => (c < 0 ? J.armF.hand[1] - margin - pad : yMax - pad - J.armF.hand[1]);
    // up and down: draw it shorter, never below half
    if (Math.abs(c) * len * (P.reach ?? 1) > roomAt()) {
      const r = Math.max(0.5, roomAt() / (Math.abs(c) * len));
      if (r < (P.reach ?? 1)) P.reach = r;
      if (item.hangs && c * len * P.reach > roomAt()) {
        // a thing that hangs straight down and still has no room (a lantern over a kneeling body): the hand lifts it
        P.armF.u += Math.ceil(c * len * P.reach - roomAt());
        J = solve(direction, P, d);
      }
      const room = roomAt();
      if (Math.abs(c) * len * P.reach > room) {
        // still too long: turn it towards level, on the side it already leans
        const lim = Math.acos(clamp(room / (len * P.reach), -1, 1));
        const a = ((P.item % TAU) + TAU) % TAU;
        P.item = c < 0 ? (a <= PI ? PI - lim : PI + lim) : (a <= PI ? lim : TAU - lim);
      }
    }
  }
  const far = [];
  if (item) {
    const [hx, hy] = J.armF.hand, sn = Math.sin(P.item), c = Math.cos(P.item), pad = item.pad ?? 1, len = item.length * (P.reach ?? 1);
    far.push([hx + sn * len - pad, hy + c * len], [hx + sn * len + pad, hy + c * len], [hx - sn * (item.back ?? 0), hy - c * (item.back ?? 0)]);
  }
  if (opt.points) far.push(...opt.points(J, P));
  if (far.length) {
    const xs = far.map(([x, y]) => (P.tilt ? tiltX(P, d, J.gy, x, y) : x));      // a body that is tipping over carries them with it
    const lo = Math.min(...xs), hi = Math.max(...xs);
    if (hi > xMax) P.rootX -= Math.ceil(hi - xMax);
    else if (lo < margin) P.rootX += Math.ceil(margin - lo);
  }
  return P;
}

function fitLying(direction, P, d, item, points, margin) {
  // a body on the ground: tall headgear moves the whole body along; a weapon that still sticks out is drawn shorter
  const J = solve(direction, P, d);
  if (points) {
    const xs = points(J, P).map(([x, y]) => lieMap(P, d)(x, y)[0]);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    if (hi > SIZE[0] - margin) P.rootX -= Math.ceil(hi - (SIZE[0] - margin));
    else if (lo < margin) P.rootX += Math.ceil(margin - lo);
  }
  if (item) {
    const [hx, hy] = lieMap(P, d)(J.armF.hand[0], J.armF.hand[1]), pad = item.pad ?? 1;
    const sn = Math.sin(P.item - PI / 2), c = Math.cos(P.item - PI / 2);
    const room = (v, max, dv) => (dv > 0 ? (max - margin - pad - v) / dv : dv < 0 ? (v - margin - pad) / -dv : Infinity);
    const r = Math.min(room(hx, SIZE[0], sn * item.length), room(hy, SIZE[1], c * item.length));
    if (r < (P.reach ?? 1)) P.reach = Math.max(0.3, r);
  }
  return P;
}

// ---- drawing --------------------------------------------------------------------------------------

const limbIn = (x0, y0, x1, y1, w) => {
  const snap = w % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
  return capsuleIn(snap(x0), snap(y0), snap(x1), snap(y1), w / 2, w / 2);
};

/**
 * Paints a shape that lies over the body, with a 1 px rim of `rim` wherever it covers pixels already drawn: what keeps an arm readable against a chest of the same colour.
 * g: the surface; inside: (px, py) => boolean; box: [x0, y0, x1, y1]; paint: a colour or ramp; rim: a colour, or null; opt: as Surface.fill.
 */
export function over(g, inside, box, paint, rim, opt = {}) {
  const [x0, y0, x1, y1] = box;
  if (rim) {
    g.fill(x0 - 1, y0 - 1, x1 + 1, y1 + 1, (px, py) => !inside(px, py) && g.get(Math.floor(px), Math.floor(py)) !== 0
      && (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)), rim, { shade: 0 });
  }
  g.fill(x0, y0, x1, y1, inside, paint, opt);
}

/** The shape test (px, py) => boolean of the head, a rounded block 11 to 15 px across. J = solve(); d = dims; grow: pixels added all round (0.9 = a helmet one pixel bigger than the skull, 1.2 = a hood, -1.5 = the opening for a face). */
export function headIn(J, d, grow = 0) {
  const [cx, cy] = J.head, rx = d.headW / 2 - 0.1 + grow, ry = d.headH / 2 - (d.headH % 2 ? 0.1 : 0) + grow;
  return (px, py) => Math.abs((px - cx) / rx) ** 2.5 + Math.abs((py - cy) / ry) ** 2.5 <= 1;
}
const headBox = (J, d, pad = 0) => [J.head[0] - d.headW / 2 - pad, J.head[1] - d.headH / 2 - pad, J.head[0] + d.headW / 2 + pad, J.head[1] + d.headH / 2 + pad];

/** The hair styles drawHair() knows; 'bald' draws none. */
export const HAIR_STYLES = ['short', 'long', 'spiky', 'ponytail', 'bald'];

/**
 * Draws hair of a style for the direction in J.dir (draw() calls it; a hook may call it again). g, J, P, d as a hook gets them; hair: a ramp. layer 'back' is what hangs behind the head (long hair, a ponytail seen from the
 * front or side) and is drawn before the head; layer 'front' is the hair on the head. draw() calls both; a hook may
 * call it again (for hair that must show over a hood). hatted: nothing rises above the skull (look.hatted), so a hat
 * or helmet drawn by the head hook sits cleanly; what shows below the hat still tells the styles apart.
 */
export function drawHair(g, J, P, d, style, hair, layer = 'front', hatted = false) {
  if (style === 'bald' || !HAIR_STYLES.includes(style)) return;
  const [cx, cy] = J.head, rx = d.headW / 2, ry = d.headH / 2, dir = J.dir;
  const sway = P.sway ?? 0, inH = headIn(J, d), box = headBox(J, d, 4);
  const col0 = Math.floor(cx);                              // the head's centre column
  const spikes = (list) => { for (const [x, y, tx, ty, w = 1.6] of list) g.poly([[x - w, y + 1.5], [x + w, y + 1.5], [tx, ty]], hair, { shade: 0 }); };
  const crest = () => { if (!hatted) spikes([-2, -1, 0, 1, 2].map((i) => [cx + i * 2.6, cy - ry + 1.2 + Math.abs(i) * 0.9, cx + i * 3.3, cy - ry - 2.3 + Math.abs(i) * 1.1])); };
  // spiky hair also sticks out sideways at the temples, which still shows under a hat
  const tufts = (y, sides) => { for (const sg of sides) g.poly([[cx + sg * (rx - 1.5), y - 1.6], [cx + sg * (rx - 1.5), y + 2.2], [cx + sg * (rx + 1.9), y - 0.6]], hair, { shade: 0 }); };

  if (dir === 'down') {
    if (layer === 'back') {
      if (style === 'long') {
        // two locks over the shoulders and down the chest: what tells long hair from short under a hat
        for (const sg of [-1, 1]) g.capsule(cx + sg * (rx - 1.8), cy - 1, cx + sg * (rx - 1.6) + sway * 0.6, cy + ry + 5.5, 2.1, 1.6, hair);
      }
      if (style === 'ponytail') g.capsule(cx + rx - 2.5, cy - ry + 3, cx + rx + 1.6 + sway * 0.8, cy + 2.5, 2, 1.1, hair);
      return;
    }
    // a fringe over the forehead, lower on one side, and hair down both sides of the face
    const line = (px) => {
      const c = Math.floor(px) - col0, edge = rx - Math.abs(px - cx);
      if (edge < 2) return J.brow + 3;
      if (style === 'spiky') return J.brow - 1 + (((c % 2) + 2) % 2 ? 1 : 0) + (Math.abs(c) === 3 ? 1 : 0);
      return J.brow - (c >= 1 && c <= 2 ? 1 : 0);
    };
    g.fill(...box, (px, py) => inH(px, py) && py < line(px), hair);
    if (style === 'spiky') { crest(); tufts(J.brow + 0.5, [-1, 1]); }
    return;
  }

  if (dir === 'up') {
    if (layer === 'back') return;
    const nape = cy + ry * 0.45;
    const jag = (px) => (style === 'spiky' ? ((((Math.floor((Math.floor(px) - col0 + 20) / 2)) % 2) ? 1 : -1)) : 0);      // a ragged edge, in 2 px teeth
    if (style === 'long') g.capsule(cx, cy, cx + sway * 0.8, cy + ry + 1.5, rx - 0.6, rx - 2.2, hair, { shade: 2 });
    g.fill(...box, (px, py) => inH(px, py) && (style === 'long' || py < nape + jag(px)), hair, { shade: style === 'long' ? 0 : 1 });
    if (style === 'spiky') { crest(); tufts(J.brow + 1.5, [-1, 1]); }
    if (style === 'ponytail') {
      const x1 = cx + sway * 1.6, y1 = cy + ry + 4.5;
      over(g, capsuleIn(cx, cy + 0.5, x1, y1, 2.1, 1.2), [cx - 5, cy - 2, cx + 5, y1 + 2], hair, hair.dark);
      g.rect(col0 - 1, Math.round(cy), 3, 1, hair.light);        // the tie
    }
    return;
  }

  // side: the hair covers the top and the back (left) of the head
  if (layer === 'back') {
    if (style === 'long') g.capsule(cx - rx * 0.5, cy, cx - rx * 0.72 - sway, cy + ry + 3.2, 2.6, 1.7, hair);
    if (style === 'ponytail') g.capsule(cx - rx + 1.5, cy - 1.5, cx - rx - 2.8 - sway * 1.5, cy + 3.5, 1.9, 1, hair);
    return;
  }
  const line = (px) => {
    const back = clamp((cx + 0.5 - px) / (rx * 0.45));
    const jag = style === 'spiky' && px > cx ? ((((Math.floor(px) - col0) % 2) + 2) % 2 ? 1 : 0) : 0;
    return J.brow - 1 + jag + back * (d.headH * 0.5);
  };
  g.fill(...box, (px, py) => inH(px, py) && py < line(px), hair);
  if (style === 'spiky') {
    if (!hatted) spikes([0, 1, 2, 3].map((i) => [cx + rx * (0.5 - i * 0.42), cy - ry + 1.2 + Math.abs(i - 1.2) * 0.8, cx + rx * (0.42 - i * 0.6), cy - ry - 2.2 + i * 0.5]));
    tufts(J.brow + 2.5, [-1]);
  }
}

// the far side of a body seen from the side: the same colours one tone down, so a side clip adds no colours of its own
const dim = (r) => ({ isRamp: true, light: r.base, base: r.dark, dark: r.deep, deep: r.deep });

function paints(look) {
  const skin = ramp(look.skin), top = ramp(look.top), bottom = ramp(look.bottom), boots = ramp(look.boots);
  return {
    skin, top, bottom, boots, skinFar: dim(skin), topFar: dim(top), bottomFar: dim(bottom), bootsFar: dim(boots),
    hair: ramp(look.hair ?? '#5a3a22'), cuffs: look.cuffs ? ramp(look.cuffs) : null, eye: INK,
  };
}

// --- seen from the front or the back

function legFront(g, L, d, cloth, boot, back) {
  const w = d.legW, x = Math.round(L.x - w / 2), top = Math.round(L.hip[1]) - 1, bottom = L.soleY;
  const bootH = clamp(bottom - top - 1, 1, back ? 2 : 3);
  if (bottom - bootH > top) g.rect(x, top, w, bottom - bootH - top, cloth);
  g.rect(x, bottom - bootH, w, bootH, boot, { shade: 0 });
  g.rect(x, bottom - 1, w, 1, boot.dark);
}

function torsoFront(g, J, d, top) {
  const bx = J.bx, y0 = J.shoulderY + d.chin - 1, y1 = Math.round(J.hip[1]);
  g.fill(bx - 8, y0, bx + 8, y1, (px, py) => py >= y0 && py < y1 && Math.abs(px - bx) <= (py < y0 + 2 ? d.chestR - 1 : d.chestR), top);
}

function armFront(g, A, d, sleeve, skin, cuff) {
  const [sx, sy] = A.shoulder, [hx, hy] = A.hand, w = d.armW;
  const box = [Math.min(sx, hx) - 3, Math.min(sy, hy) - 3, Math.max(sx, hx) + 3, Math.max(sy, hy) + 3];
  over(g, limbIn(sx, sy, hx, hy, w), box, sleeve, sleeve.dark);
  fist(g, A, d, skin, cuff);
}
// the hand: a block of skin at the end of the sleeve, with the look's cuff (if any) on the row above it
function fist(g, A, d, skin, cuff) {
  const w = d.armW, x = w % 2 ? Math.floor(A.hand[0]) - (w - 1) / 2 : Math.round(A.hand[0]) - w / 2, y = Math.round(A.hand[1]) - 1;
  g.rect(x, y, w, 2, skin, { shade: 0 });
  if (cuff) g.rect(x, y - 1, w, 1, cuff);
}

function faceFront(g, J, P, d, C) {
  const col0 = Math.floor(J.head[0]), ex = d.headW >= 13 ? 3 : 2, ey = J.brow + 1;
  for (const sg of [-1, 1]) {
    const x = col0 + sg * ex;
    if (P.eyes === 'shut') { g.dot(x, ey + 1, C.eye); g.dot(x + sg, ey + 1, C.skin.dark); }
    else if (P.blink) { g.dot(x, ey + 1, C.eye); }
    else { g.dot(x, ey, C.eye); g.dot(x, ey + 1, C.eye); }
  }
  if (P.mouth) g.rect(col0, ey + 3, 1, 2, C.skin.deep);
  else if (P.eyes === 'shut') g.rect(col0 - 1, ey + 4, 3, 1, C.skin.dark);
}

function drawFront(g, J, P, d, look, C, hooks, back) {
  const style = look.hairStyle ?? 'short';
  if (back) { hooks.item?.(g, J, P, d); hooks.offhand?.(g, J, P, d); } else hooks.behind?.(g, J, P, d);
  legFront(g, J.legB, d, C.bottom, C.boots, back);
  legFront(g, J.legF, d, C.bottom, C.boots, back);
  torsoFront(g, J, d, C.top);
  armFront(g, J.armB, d, C.top, C.skin, C.cuffs?.base);
  armFront(g, J.armF, d, C.top, C.skin, C.cuffs?.base);
  hooks.torso?.(g, J, P, d);
  if (back) hooks.behind?.(g, J, P, d);
  drawHair(g, J, P, d, style, C.hair, 'back', look.hatted);
  g.fill(...headBox(J, d), headIn(J, d), C.skin);
  if (!back) faceFront(g, J, P, d, C);
  drawHair(g, J, P, d, style, C.hair, 'front', look.hatted);
  hooks.head?.(g, J, P, d);
  if (!back) {
    hooks.offhand?.(g, J, P, d);
    fist(g, J.armB, d, C.skin, C.cuffs?.base);
    hooks.item?.(g, J, P, d);
    fist(g, J.armF, d, C.skin, C.cuffs?.base);
  }
  hooks.front?.(g, J, P, d);
}

// --- seen from the side

function legSide(g, L, d, cloth, boot) {
  const w = Math.min(3, d.legW), bottom = L.soleY, ankle = bottom - 2;
  g.limb(L.hip[0], L.hip[1], L.x, ankle, w, cloth);
  const x = Math.floor(L.x) - 1;
  if (L.lifted) { g.rect(x, bottom - 2, 4, 2, boot, { shade: 0 }); g.rect(x, bottom - 1, 3, 1, boot.dark); }
  else { g.rect(x, bottom - 2, 5, 2, boot, { shade: 0 }); g.rect(x, bottom - 1, 5, 1, boot.dark); }
}

function armSide(g, A, d, sleeve, skin, rim, cuff) {
  const [sx, sy] = A.shoulder, [hx, hy] = A.hand, w = d.armW;
  const box = [Math.min(sx, hx) - 3, Math.min(sy, hy) - 3, Math.max(sx, hx) + 3, Math.max(sy, hy) + 3];
  over(g, limbIn(sx, sy, hx, hy, w), box, sleeve, rim);
  fist(g, A, d, skin, cuff);
}

function drawSide(g, J, P, d, look, C, hooks) {
  const style = look.hairStyle ?? 'short';
  hooks.behind?.(g, J, P, d);
  armSide(g, J.armB, d, C.topFar, C.skinFar, null, C.cuffs?.dark);
  hooks.offhand?.(g, J, P, d);
  legSide(g, J.legB, d, C.bottomFar, C.bootsFar);
  legSide(g, J.legF, d, C.bottom, C.boots);
  // the body: a little narrower than from the front, and half a pixel forward of the hips
  const wide = Math.round(d.chestR * 1.7), nx = J.neck[0], hx = J.hip[0];
  const y0 = J.shoulderY + d.chin - 1, y1 = Math.round(J.hip[1]);
  const left = (py) => Math.round(lerp(nx, hx, clamp((py - y0) / (y1 - y0))) - wide / 2 + 0.3);
  g.fill(Math.min(nx, hx) - 8, y0, Math.max(nx, hx) + 8, y1, (px, py) => { const l = left(py) + (py < y0 + 1 ? 1 : 0); return py >= y0 && py < y1 && px >= l && px < left(py) + wide - (py < y0 + 1 ? 1 : 0); }, C.top);
  hooks.torso?.(g, J, P, d);
  drawHair(g, J, P, d, style, C.hair, 'back', look.hatted);
  g.fill(...headBox(J, d), headIn(J, d), C.skin);
  const col0 = Math.floor(J.head[0]), ex = col0 + (d.headW >= 13 ? 3 : 2), ey = J.brow + 1;
  if (P.eyes === 'shut') { g.dot(ex, ey + 1, C.eye); g.dot(ex + 1, ey + 1, C.skin.dark); }
  else if (P.blink) g.dot(ex, ey + 1, C.eye);
  else { g.dot(ex, ey, C.eye); g.dot(ex, ey + 1, C.eye); }
  if (P.mouth) g.rect(col0 + Math.floor(d.headW / 2) - 2, ey + 3, 2, 2, C.skin.deep);
  drawHair(g, J, P, d, style, C.hair, 'front', look.hatted);
  hooks.head?.(g, J, P, d);
  hooks.item?.(g, J, P, d);
  armSide(g, J.armF, d, C.top, C.skin, C.top.dark, C.cuffs?.base);
  hooks.front?.(g, J, P, d);
}

/**
 * Paints the character facing `direction` ('down' | 'up' | 'side') in pose P (d = dims), and returns the joints J.
 * look: { skin, top, bottom, boots, hair, hairStyle, hatted, cuffs } (colours as '#rrggbb'; hairStyle one of HAIR_STYLES, 'bald' for none;
 *   hatted: true when the head hook draws a hat, helmet or hood, so no hair rises above the skull; cuffs: a colour for a band on each sleeve, or none)
 * hooks (all optional, each receives (g, J, P, d); J.dir is the direction), named as on the side rig:
 *   behind   what is on the back: capes, packs, wings, tails. down and side: drawn first. up: drawn over the body
 *   offhand  what the other hand holds: shields, lanterns. down: in front. up: behind the body. side: behind the body, on the far arm
 *   torso    belts, armour, robes: after the body
 *   head     hats, helmets, horns, beards: after the hair
 *   item     what the weapon hand holds. down and side: in front of the body, under the hand. up: behind the body
 *   front    drawn last
 */
export function draw(g, direction, P, d, look, hooks = {}) {
  const C = paints(look);
  if (P.lie) return drawLying(g, direction, P, d, look, C, hooks);
  const J = solve(direction, P, d);
  if (P.tilt) return drawTipping(g, J, P, d, look, C, hooks);
  if (direction === 'side') drawSide(g, J, P, d, look, C, hooks);
  else drawFront(g, J, P, d, look, C, hooks, direction === 'up');
  return J;
}

// The body tipping over (die): the standing picture with every row moved sideways by its height.
function drawTipping(g, J, P, d, look, C, hooks) {
  const tmp = new Surface(g.w, g.h);
  J.inner = true;
  if (J.dir === 'side') drawSide(tmp, J, P, d, look, C, hooks); else drawFront(tmp, J, P, d, look, C, hooks, J.dir === 'up');
  for (let y = 0; y < tmp.h; y++) {
    const dx = Math.round(tiltX(P, d, J.gy, 0, y + 0.5));
    for (let x = 0; x < tmp.w; x++) {
      const v = tmp.data[y * tmp.w + x], X = x + dx;
      if (v && X > 1 && X < g.w - 2 && y > 0 && y < g.h - 1) g.data[y * g.w + X] = v;
    }
  }
  return J;
}

// The body lying on its side with the head to the right: the standing picture (front or back) turned a quarter turn.
function drawLying(g, direction, P, d, look, C, hooks) {
  const view = direction === 'up' ? 'up' : 'down';
  const tmp = new Surface(g.w, g.h);
  tmp.shadow = [1, 1];                                     // so that the light still comes from the top right once it is turned
  const J = solve(view, P, d);
  J.inner = true;
  drawFront(tmp, J, P, d, look, C, hooks, view === 'up');
  const X0 = lieX0(P, d), Y0 = lieY0(P, d);
  for (let y = 0; y < tmp.h; y++) for (let x = 0; x < tmp.w; x++) {
    const v = tmp.data[y * tmp.w + x];
    if (!v) continue;
    const X = X0 + GROUND - 1 - y, Y = Y0 + x - CX;
    if (X > 0 && Y > 0 && X < g.w - 1 && Y < g.h - 1) g.data[Y * g.w + X] = v;
  }
  return J;
}

// ---- worn parts -------------------------------------------------------------------------------------
// Each is called from a hook with what the hook was given (g, J, P, d) and its own settings, and draws itself for the
// direction in J.dir. Colours are '#rrggbb'. Which hook: cape -> behind; mantle, belt, hem, robe -> torso;
// helmet, crown, hood, hat -> head (set look.hatted for helmet, hood and hat, so no hair pokes through).

/** A cape on the back, for the `behind` hook: behind the body going down and sideways, over the back going up. opt: { kind: 'plain' | 'tattered', length (1 = to above the knee, 1.8 = to the floor; 0.3 to 1.8), colour }. */
export function cape(g, J, P, d, opt = {}) {
  const { kind = 'plain', length = 1, colour = '#c9423a' } = opt;
  const bx = J.bx, top = J.shoulderY + d.chin, s = P.sway ?? 0;
  const hem = Math.min(J.gy - 1, Math.round(top + (d.torso - d.chin + d.leg * 0.25) * length));      // length 1: to above the knee, so the legs show walking away
  // the bottom edge from x0 to x1: straight, or with bites torn out of it
  const edge = (x0, x1, y0, y1 = y0) => {
    if (kind !== 'tattered') return [[x0, y0], [x1, y1]];
    const at = (k, up) => [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - up];
    const bite = Math.min(3.5, (hem - top) * 0.45);
    return [at(0, 0), at(0.16, 0), at(0.3, bite), at(0.44, 0), at(0.6, 0), at(0.72, bite * 0.8), at(0.86, 0), at(1, 0)];
  };
  const c = ramp(colour);
  if (J.dir === 'side') {
    const back = J.neck[0] - d.chestR * 0.85;
    g.poly([[J.neck[0] + 0.5, top - 0.5], [back - 0.5, top - 0.5], ...edge(back - 3.2 - s * 2, back + 1 - s * 1.2, hem - 1, hem), [back + 2.5, top + 3]], dim(c));
    return;
  }
  const up = J.dir === 'up';
  // from behind the arms show on both sides of it; from the front it shows on both sides of the body and between the legs
  const w0 = d.chestR + (up ? -0.5 : 2.6), w1 = d.chestR + (up ? 2.2 : 2.6) + Math.min(1.2, (hem - top) * 0.08);
  const sh = Math.round(s * 1.2);
  // the hem rides up over a leg that is stepping
  const ride = (L) => (hem > J.hip[1] + 2 ? Math.min(3, Math.round((J.gy - L.soleY) * 0.6)) : 0);
  const [legL, legR] = J.legF.x < J.legB.x ? [J.legF, J.legB] : [J.legB, J.legF];
  g.poly([[bx - w0, top - 1], ...edge(bx - w1 + sh, bx + w1 + sh, hem - ride(legL), hem - ride(legR)), [bx + w0, top - 1]], up ? c : dim(c), { shade: up ? 2 : 1 });
  if (up && hem - top > 5) {
    // two folds, so the back reads as cloth
    const cut = kind === 'tattered' ? 2 : 0;
    g.rect(Math.floor(bx) - 2 + sh, top + 2, 1, hem - top - 3 - cut, c.dark);
    g.rect(Math.floor(bx) + 2 + sh, top + 4, 1, Math.max(1, hem - top - 6 - cut), c.dark);
  }
}

/** The front of a cape, for the `torso` hook: a mantle over the shoulders with a clasp at the neck (nothing shows from behind). opt: { colour, clasp (colour, or null for none) }. */
export function mantle(g, J, P, d, opt = {}) {
  const { colour = '#c9423a', clasp = '#f2c230' } = opt;
  const top = J.shoulderY + d.chin, c = ramp(colour);
  if (J.dir === 'up') return;
  if (J.dir === 'side') { g.rect(Math.round(J.neck[0] - d.chestR * 0.85), top, Math.round(d.chestR * 1.7), 2, c, { shade: 0 }); return; }
  const half = Math.floor(d.chestR), x = Math.floor(J.bx);
  g.rect(x - half, top - 1, half * 2 + 1, 2, c, { shade: 0 });
  g.rect(x - half + 1, top + 1, half * 2 - 1, 1, c.dark);
  if (clasp) g.dot(x, top, clasp);
}

// one row across the tunic, `up` rows above the hip
function band(g, J, d, up, colour, mark) {
  const hip = Math.round(J.hip[1]);
  if (J.dir === 'side') {
    const wide = Math.round(d.chestR * 1.7), x = Math.round(J.hip[0] - wide / 2 + 0.3);
    g.rect(x, hip - up, wide, 1, colour);
    if (mark) g.dot(x + wide - 1, hip - up, mark);
    return;
  }
  const half = Math.floor(d.chestR), x = Math.floor(J.bx);
  g.rect(x - half, hip - up, half * 2 + 1, 1, colour);
  if (mark && J.dir === 'down') g.dot(x, hip - up, mark);
}

/** A belt across the waist, for the `torso` hook. opt: { colour, buckle (colour, or null for none) }. */
export function belt(g, J, P, d, opt = {}) {
  band(g, J, d, 3, ramp(opt.colour ?? '#9a6a3e').dark, opt.buckle ?? null);
}

/** A band of colour along the hem of the tunic, for the `torso` hook. opt: { colour }. */
export function hem(g, J, P, d, opt = {}) {
  band(g, J, d, 1, opt.colour ?? '#c9423a', null);
}

/** A robe or skirt that hides the legs and sways with the step, for the `torso` hook. opt: { colour, length (0 = to the knee, 1 = to the floor), trim (colour of a band along its hem, or null) }. */
export function robe(g, J, P, d, opt = {}) {
  const { colour = '#7a4fc4', length = 1, trim = null } = opt;
  const c = ramp(colour), y0 = Math.round(J.hip[1]) - 1, y1 = J.gy - Math.round((1 - clamp(length)) * d.leg * 0.5);
  const sw = Math.round((P.sway ?? 0) * 1.2);
  let left, right;
  if (J.dir === 'side') {
    const wide = Math.round(d.chestR * 1.7), x = Math.round(J.hip[0] - wide / 2 + 0.3), open = Math.min(2, Math.abs(J.legF.x - J.legB.x) / 3);
    left = (k) => x - k * (1 + open) + k * sw * 0.5; right = (k) => x + wide + k * (1 + open) + k * sw * 0.5;
  } else {
    const half = d.chestR;
    left = (k) => J.bx - half - k * 1.6 + k * sw; right = (k) => J.bx + half + k * 1.6 + k * sw;
  }
  const inside = (px, py) => { if (py < y0 || py >= y1) return false; const k = (py - y0) / Math.max(1, y1 - y0); return px >= Math.round(left(k) - 0.5) + 0.0 && px < Math.round(right(k) + 0.5); };
  g.fill(J.bx - 12, y0, J.bx + 12, y1, inside, c);
  if (trim) g.fill(J.bx - 12, y1 - 1, J.bx + 12, y1, inside, trim, { shade: 0 });
}

/** How far a piece of headgear rises above the top of the head, in pixels, for fit() and frame()'s `rise`. kind: 'helmet' | 'crown' | 'hood' | 'hat-pointed' | 'hat-wide' | 'hat-cap' (anything else: 0); size: its Size setting. */
export function headgearRise(kind, size = 1) {
  if (kind === 'helmet') return 2 + 2 * size + 1.6 * Math.sqrt(size);
  if (kind === 'crown') return Math.max(1, Math.round(size)) + 1;
  if (kind === 'hood') return 2;
  if (kind === 'hat-pointed') return 2 + 4 * size;
  if (kind === 'hat-wide') return 1 + size;
  if (kind === 'hat-cap') return 1;
  return 0;
}

/** An open helmet with a plume, for the `head` hook (set look.hatted): a dome down to the brow, a tone darker than the metal so it stays apart from skin, hair showing below it. opt: { size (the plume, 0.5 to 1.8), metal, plume (colour, or null for none) }. */
export function helmet(g, J, P, d, opt = {}) {
  const { size = 1, plume = '#c9423a' } = opt;
  const m = ramp(opt.metal ?? '#c2c9d6'), steel = { isRamp: true, light: m.base, base: m.dark, dark: m.deep, deep: m.deep };
  const [cx, cy] = J.head, rx = d.headW / 2, ry = d.headH / 2, x0 = Math.floor(cx), dir = J.dir;
  const box = [cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2];
  const shell = headIn(J, d, 0.9), sway = P.sway ?? 0, w = Math.sqrt(size), rise = 0.5 + 2 * size;
  const rim = dir === 'up' ? Math.round(cy) + 1 : J.brow - 1;
  const dome = (px, py) => shell(px, py) && (py < rim || (dir === 'side' && px < cx - rx * 0.25 && py < rim + 2));
  g.fill(...box, dome, steel, { light: 1 });
  g.fill(...box, (px, py) => dome(px, py) && !dome(px, py + 1) && py > cy - ry, m.deep, { shade: 0 });      // the rim
  if (dir === 'down') g.rect(x0, rim, 1, 3, steel.base);                                                    // the nose guard
  if (!plume) return;
  const trim = ramp(plume), tx = cx, ty = J.headTop - 0.5;
  if (dir === 'side') g.capsule(tx - 0.5, ty, tx - rx * 0.75 * size - sway * 1.5, ty - rise * 0.75, 1.7 * w, 0.9 * w, trim);
  else if (dir === 'up') g.capsule(tx + sway * 0.8, ty - rise, tx, cy - 1.5, 1.5 * w, 1.2, trim);
  else g.capsule(tx, ty + 0.5, tx + sway * 0.8, ty - rise, 1.7 * w, 0.9 * w, trim);
}

/** A crown, for the `head` hook: a band of metal with points, and a gem at the front. opt: { size (deeper band, taller points; 0.5 to 1.8), metal, gem (colour, or null for none) }. */
export function crown(g, J, P, d, opt = {}) {
  const { size = 1, gem = null } = opt;
  const m = ramp(opt.metal ?? '#f2c230'), x0 = Math.floor(J.head[0]), dir = J.dir;
  const band_ = Math.max(1, Math.round(2 * size)), points = Math.max(1, Math.round(size));
  const half = Math.floor(d.headW / 2) - 2, y = J.headTop + 1;
  const left = dir === 'side' ? x0 - half + 1 : x0 - half, wide = half * 2 + 1 - (dir === 'side' ? 1 : 0);
  g.rect(left, y, wide, band_, m);
  g.rect(left, y + band_ - 1, wide, 1, m.dark);
  for (let i = 0; i < wide; i += 2) for (let j = 1; j <= points; j++) g.dot(left + i, y - j, m.light);
  if (gem && dir !== 'up') g.dot(dir === 'side' ? left + wide - 2 : x0, y + Math.floor((band_ - 1) / 2), gem);
}

/** A hood, for the `head` hook (set look.hairStyle 'bald' or look.hatted): cloth round the head with the face showing going down and sideways, the whole back of the head going up. opt: { colour, depth (0 = pushed back, 2 = pulled low over the brow) }. */
export function hood(g, J, P, d, opt = {}) {
  const { colour = '#357a4c', depth = 1 } = opt;
  const c = ramp(colour), out = headIn(J, d, 1.2);
  const [cx, cy] = J.head, box = [cx - d.headW / 2 - 3, cy - d.headH / 2 - 3, cx + d.headW / 2 + 3, cy + d.headH / 2 + 5];
  const brow = J.brow - 1 + Math.round(depth);
  // going down it is open from the brow to the chin: cloth on both sides of the face, nothing across it
  if (J.dir === 'down') g.fill(...box, (px, py) => out(px, py) && !(py > brow && Math.abs(px - cx) < d.headW / 2 - 1.5), c);
  else if (J.dir === 'up') { g.fill(...box, out, c, { shade: 2 }); g.capsule(cx, cy + 2, cx + (P.sway ?? 0) * 0.5, cy + d.headH / 2 + 2, 2.5, 1.5, c); }
  else g.fill(...box, (px, py) => out(px, py) && !(px > cx + 1 - Math.round(depth) + 1 && py > brow), c);
}

/** A hat, for the `head` hook (set look.hatted): its brim sits a row above the fringe. opt: { kind: 'pointed' (a wizard's cone) | 'wide' (a straw hat) | 'cap', size (0.5 to 1.8), colour, band (colour of a band above the brim, or null) }. */
export function hat(g, J, P, d, opt = {}) {
  const { kind = 'pointed', size = 1, colour = '#7a4fc4', band: ribbon = null } = opt;
  const c = ramp(colour), [cx, cy] = J.head, rx = d.headW / 2, dir = J.dir, sway = P.sway ?? 0;
  const brim = J.brow - 2, box = [cx - rx - 6, J.headTop - 12, cx + rx + 6, cy + 2];
  const lean = dir === 'side' ? -2 - sway : sway * 1.5;
  if (kind === 'cap') {
    const shell = headIn(J, d, 0.6);
    g.fill(...box, (px, py) => shell(px, py) && py < brim + 1, c);
    if (dir === 'down') g.rect(Math.floor(cx) - 3, brim + 1, 7, 1, c.dark);
    if (dir === 'side') g.rect(Math.floor(cx + rx) - 2, brim, 4, 1, c.dark);
  } else if (kind === 'wide') {
    g.ellipse(cx, brim + 0.5, rx + 2 + size, 2.1, c, { shade: 1 });
    g.ellipse(cx, brim - 1, rx - 2, 2.4 + size, c, { light: 1, clip: (px, py) => py < brim });
  } else {
    g.ellipse(cx, brim + 0.5, rx + 1.5 + size, 1.6, c, { shade: 1 });
    g.poly([[cx - rx + 1.5, brim], [cx + rx - 1.5, brim], [cx + lean, J.headTop - 1 - 4 * size]], c);
  }
  if (ribbon && kind !== 'cap') g.fill(...box, (px, py) => py >= brim - 2 && py < brim - 1 && Math.abs(px - cx) < rx - 2, ribbon, { shade: 0 });
}

/**
 * One frame of a character, posed and fitted once, so the picture and the exported sockets cannot disagree. clip, t: as a sprite's render() and sockets() get them; p: the sprite's values (height, build, head, bounce, stride are read from it).
 * opt: { item: itemSize(kind, scale) of what the weapon hand holds, or null (an `attack` with nothing held becomes a punch);
 *        rise: pixels the headgear rises above the head (headgearRise()); points: (J, P) => [[x, y]] other far points for fit();
 *        carry: 'up' | 'upright' | 'low' | 'hang' (CARRY); tall: [shortest, tallest] body (dims); muzzle: pixels from hand to muzzle (default: the item's length) }.
 * Returns F = { clip, action, direction, d, P, item, poseAt(u), sockets(), hand(J), draw(g, look, hooks), finish(g, { trail, flash, outline }) }:
 *   F.sockets()             what the sprite's sockets(clip, t, p) returns
 *   F.draw(g, look, hooks)  draw() for this pose; inside a hook F.hand(J) is where the held thing attaches
 *   F.finish(g, { trail })  the white hurt frame, the outline, then (trail: a colour) the swing arc of an armed attack, and on the
 *                           fire frame of `shoot` the muzzle flash at the muzzle socket (flash: a colour; false for none)
 */
export function frame(clip, t, p = {}, opt = {}) {
  const { action, direction } = parseClip(clip);
  const d = dims(p, { tall: opt.tall });
  const item = opt.item && opt.item.length > 0 ? opt.item : null;
  const m = { bounce: p.bounce, stride: p.stride, armed: !!item, carry: opt.carry };
  const points = opt.points ?? (opt.rise ? (J) => [[J.head[0], J.headTop - opt.rise]] : null);
  const poseAt = (u) => fit(direction, pose(!item && action === 'attack' ? 'punch' : action, direction, u, m, d), d, { item, points });
  const P = poseAt(t);
  return {
    clip, action, direction, d, P, item, poseAt,
    sockets: () => sockets(solve(direction, P, d), P, d, { muzzle: opt.muzzle ?? item?.length }),
    hand: (J) => sockets(J, P, d).hand,
    draw: (g, look, hooks) => draw(g, direction, P, d, look, hooks),
    finish(g, o = {}) {
      if (P.flash) g.tint('#ffffff');
      g.outline(o.outline ?? INK);
      if (o.trail && action === 'attack' && item) slashTrail(g, direction, poseAt, t, d, item.length, o.trail);
      if (P.fire && item && o.flash !== false) muzzleFlash(g, this.sockets().muzzle, 3, typeof o.flash === 'string' ? o.flash : '#ffffff');
      return g;
    },
  };
}

// ---- held items -----------------------------------------------------------------------------------

/** The kinds heldItem() can draw. Carry: sword, axe, spear 'up'; staff 'upright'; cane, gun (a long gun) and pistol (a sidearm) 'low'; lantern 'hang'. */
export const ITEM_KINDS = ['sword', 'axe', 'spear', 'staff', 'lantern', 'cane', 'gun', 'pistol'];

/**
 * The standard sizes of the held kinds on this body, in pixels, so every top-down character's sword is the same sword.
 * length = hand to tip (a staff: hand to orb; a lantern: hand to its base); back = how far it sticks out behind the hand
 * (a staff's shaft goes 9 px below the hand); pad = how wide its head is.
 */
export const ITEMS = {
  sword: { length: 11, back: 1.5, pad: 1 },
  axe: { length: 10, back: 2, pad: 4.5 },
  spear: { length: 14, back: 4, pad: 1 },
  staff: { length: 12, back: 9, pad: 3 },
  lantern: { length: 10, back: 0, pad: 4.5, hangs: true },
  cane: { length: 11, back: 2, pad: 1.5 },
  gun: { length: 10, back: 3, pad: 3.5 },
  pistol: { length: 5, back: 1, pad: 3 },
};

/** The size { length, back, pad } of a held kind at a length setting, ready for frame(), fit() and heldItem(); null for 'none' or an unknown kind. kind: one of ITEM_KINDS; scale: 1 = standard. */
export const itemSize = (kind, scale = 1) => (ITEMS[kind] ? { length: ITEMS[kind].length * scale, back: ITEMS[kind].back, pad: ITEMS[kind].pad, ...(ITEMS[kind].hangs ? { hangs: true } : {}) } : null);

/** The far end [x, y] of a thing of length len held in the weapon hand. J = solve(), P = the pose. */
export const itemTip = (J, P, len) => reach(J.armF.hand[0], J.armF.hand[1], P.item, len * (P.reach ?? 1));

/**
 * Draws a held thing from an attach point and its own settings only, so the same thing can go on any body.
 *   direction: 'down' | 'up' | 'side': which way the body faces (an axe's edge leads the swing, which turns the other way in side clips)
 *   at:   { x, y, angle, reach }, for example sockets(J, P, d).hand
 *   item: { kind: one of ITEM_KINDS, length, metal, wood, hilt, orb (colours or ramps), glow: 0..1 for a staff's orb, a colour for a lantern's light or a gun's cell, lit: false for a dark lantern }
 */
export function heldItem(g, direction, at, item) {
  const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#c2c9d6');
  const wood = item.wood ?? '#9a6a3e', hilt = item.hilt ?? '#f2c230';
  const a = at.angle, len = item.length * (at.reach ?? 1), hx = at.x, hy = at.y;
  const to = (dist, turn = 0, from = [hx, hy]) => reach(from[0], from[1], a + turn, dist);
  if (item.kind === 'sword') {
    const [gx, gy] = to(1.5), [tx, ty] = to(len);
    g.limb(gx, gy, tx, ty, 2, metal);
    g.dot(tx, ty, metal.light);
    const [ax, ay] = to(2.2, PI / 2, [gx, gy]), [bx, by] = to(2.2, -PI / 2, [gx, gy]);
    g.line(ax, ay, bx, by, hilt);
    const [px, py] = to(1.5, PI);
    g.dot(px, py, hilt);
  } else if (item.kind === 'axe') {
    const [bx, by] = to(2, PI), [tx, ty] = to(len);
    g.line(bx, by, tx, ty, wood);
    const lead = direction === 'side' ? -PI / 2 : PI / 2;          // the cutting edge is on the side the swing travels to
    const [mx, my] = to(len - 2.5), [ox, oy] = to(2, lead, [mx, my]);
    const nx = Math.sin(a + lead), ny = Math.cos(a + lead);
    g.ellipse(ox, oy, 2.9, 2.9, metal, { clip: (px, py) => (px - mx) * nx + (py - my) * ny > -0.6 });
  } else if (item.kind === 'spear') {
    const [bx, by] = to(4 * (at.reach ?? 1), PI), [tx, ty] = to(len);
    g.line(bx, by, tx, ty, wood);
    const [sx, sy] = to(Math.max(1, len - 3.5));
    g.capsule(sx, sy, tx, ty, 1.5, 0.5, metal);
  } else if (item.kind === 'staff') {
    const [bx, by] = to(9 * (at.reach ?? 1), PI), [tx, ty] = to(len);
    g.limb(bx, by, tx, ty, 2, typeof wood === 'string' ? ramp(wood) : wood);
    const orb = typeof item.orb === 'string' ? ramp(item.orb) : item.orb ?? ramp('#4fd8ee'), r = 2.4 + (item.glow ?? 0) * 0.6;
    g.ellipse(Math.round(tx) + 0.5, Math.round(ty) + 0.5, r, r, orb, { light: 1 });
  } else if (item.kind === 'lantern') {
    // hangs from the hand by a ring: a cap, a pane of light between two posts, a base
    const h = Math.max(4, Math.round(len) - 2), w = len >= 10 ? 7 : 5, [lx, ly] = to(2);
    const x = Math.floor(lx) - (w - 1) / 2, y = Math.round(ly), glow = ramp(typeof item.glow === 'string' ? item.glow : '#f4e06a');
    g.line(hx, hy, lx, ly, metal.dark);
    g.rect(x, y + 1, w, h - 2, item.lit === false ? metal.deep : glow.base, { shade: 0 });
    if (item.lit !== false) g.rect(x + (w - 1) / 2, y + 1, 1, h - 2, glow.light, { shade: 0 });
    g.rect(x, y + 1, 1, h - 2, metal.base); g.rect(x + w - 1, y + 1, 1, h - 2, metal.base);
    g.rect(x + 1, y, w - 2, 1, metal.dark); g.rect(x, y + h - 1, w, 1, metal.dark);
  } else if (item.kind === 'cane') {
    const [bx, by] = to(2, PI), [tx, ty] = to(len), [kx, ky] = to(2, direction === 'up' ? -PI / 2 : PI / 2, [bx, by]);
    g.line(bx, by, tx, ty, wood);
    g.line(bx, by, kx, ky, wood);                                    // the crook, over the hand
  } else if (item.kind === 'gun') {
    // a long gun: a stock behind the hand, a thick body with a magazine under it, a thin barrel; item.glow lights a cell
    const r = at.reach ?? 1, [sx, sy] = to(3 * r, PI), [bx, by] = to(0.5, PI), [mx, my] = to(len * 0.5), [tx, ty] = to(len);
    g.line(mx, my, tx, ty, metal.dark);
    g.limb(sx, sy, bx, by, 2, metal.dark);
    g.limb(bx, by, mx, my, 3, metal);
    const [cx, cy] = to(len * 0.3), [ux, uy] = to(3.3, -PI / 2, [cx, cy]);
    g.limb(cx, cy, ux, uy, 2, metal.dark);                              // the magazine, on the under side
    if (typeof item.glow === 'string') { const [lx, ly] = to(len * 0.12); g.dot(lx, ly, item.glow); }
  } else if (item.kind === 'pistol') {
    // a sidearm: a short body with a grip under the hand
    const [bx, by] = to(1, PI), [tx, ty] = to(len), [ux, uy] = to(2.8, -PI / 2);
    g.limb(hx, hy, ux, uy, 2, metal.dark);
    g.limb(bx, by, tx, ty, 2, metal);
    if (typeof item.glow === 'string') { const [lx, ly] = to(len * 0.5); g.dot(lx, ly, item.glow); }
  }
}

/** Draws the light of a shot, a short ray the way the muzzle points with a small cross behind its tip; call it AFTER g.outline() on the frame where the pose says `fire` (frame().finish does). at: { x, y, angle }, the `muzzle` socket; size: the length of the ray in pixels; colour. Never touches the frame edge. */
export function muzzleFlash(g, at, size = 3, colour = '#ffffff') {
  const put = (x, y) => { x = Math.floor(x); y = Math.floor(y); if (x >= 1 && y >= 1 && x <= SIZE[0] - 2 && y <= SIZE[1] - 2) g.dot(x, y, colour); };
  const ux = Math.sin(at.angle), uy = Math.cos(at.angle), arm = Math.max(1, size * 0.5);
  for (let r = 0.5; r <= arm; r += 0.5) for (const k of [-1, 1]) put(at.x + ux - uy * r * k, at.y + uy + ux * r * k);
  for (let r = 0; r <= size; r += 0.5) put(at.x + ux * r, at.y + uy * r);
}

/**
 * Draws the white arc that follows a fast swing; call it AFTER g.outline() so it is not outlined (frame().finish does).
 * poseAt(u) must return the pose at phase u (after fit); t: the frame's phase; d: dims; len: hand to tip; the arc spans the motion since t - span.
 * It is drawn only while the item moves towards the hit (P.slash, which the attack pose sets), never on the frame edge, and in `up` clips only
 * where nothing is drawn yet (the swing is on the far side of the body).
 */
export function slashTrail(g, direction, poseAt, t, d, len, colour = '#ffffff', span = 0.21) {
  const P1 = poseAt(t);
  if (!P1.slash || P1.lie) return;
  const P0 = poseAt(Math.max(0.37, t - span));
  const J1 = solve(direction, P1, d), J0 = solve(direction, P0, d);
  const t1 = itemTip(J1, P1, len), t0 = itemTip(J0, P0, len);
  const [sx, sy] = J1.armF.hand;
  const a1 = Math.atan2(t1[0] - sx, t1[1] - sy);
  // how far the item has turned towards the hit since the earlier pose; side clips swing the other way round
  let sweep = (direction === 'side' ? 1 : -1) * (Math.atan2(t0[0] - sx, t0[1] - sy) - a1);
  sweep = ((sweep + PI) % TAU + TAU) % TAU - PI;
  const turned = (direction === 'side' ? 1 : -1) * (P0.item - P1.item);
  if (sweep < 0 && turned > PI) sweep += TAU;
  if (sweep < 0.6 || turned < 0.3) return;
  sweep = Math.min(sweep, 3.6);
  const r = Math.min(16, (Math.hypot(t1[0] - sx, t1[1] - sy) + Math.hypot(t0[0] - sx, t0[1] - sy)) / 2);      // a long spear's arc is drawn inside its tip, so it stays in the frame
  const free = direction === 'up';
  const clip = (px, py) => px > 1 && py > 1 && px < SIZE[0] - 1 && py < SIZE[1] - 1 && (!free || g.get(Math.floor(px), Math.floor(py)) === 0);
  const from = direction === 'side' ? a1 + 0.1 : a1 - sweep, to = direction === 'side' ? a1 + sweep : a1 - 0.1;
  g.arc(sx, sy, r, from, to, 2, colour, { clip });
  if (sweep > 1.2) g.arc(sx, sy, r - 3, direction === 'side' ? a1 + 0.5 : a1 - sweep * 0.7, direction === 'side' ? a1 + sweep * 0.7 : a1 - 0.5, 1, colour, { clip });
}

export { ramp, farRamp, mix, brightness, INK } from '../engine/color.js';
