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
import { bandTone } from '../engine/tones.js';

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
      P.armF.f = -A * Math.cos(TAU * t) * (m.carry === 'upright' ? 0.25 : m.carry === 'ready' ? 0.35 : m.armed ? 0.8 : 1);      // a staff is carried steady, and so is a gun at the ready
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
      P.armF.f = (front ? 3 : 4) * aim - 2.4 * kick; P.armF.u = (front ? 3.5 : 2.5) * aim + 0.6 * kick; P.armF.o = side ? 0 : (up ? 5.5 : -3.5) * aim;
      P.armB.f = (side ? 4.5 : 1.5) * aim - 1 * kick; P.armB.u = (front ? 3 : side ? 2.5 : 1.5) * aim; P.armB.o = side ? 0 : (front ? -3 : -1) * aim;      // side: the other hand comes forward under the barrel
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
      // the held thing goes down with the body in one path: as the knees give way it is swung out to the weapon side,
      // level with the ground, which is where it lies once the body is down (facing away it is let fall beside the legs)
      const aside = up ? CARRY.low.up : -PI / 2 - 0.3;
      P.armF.u = 2.5 * h * (1 - knees) + (up ? 0 : 4 * knees); P.armF.o = 2 * h + (up ? 0 : 1.5 * knees); P.armF.f = -1 * h;
      P.armB.u = 3 * h * (1 - knees); P.armB.o = 2.2 * h; P.armB.f = -1 * h;
      P.footF.o = 1 * h; P.footB.o = 1 * h;
      P.item = turn(rest + (side ? 0.8 : up ? -0.6 : 0.6) * h, aside, knees);
      P.sway = -h;
      P.flash = t < 0.1;
      P.eyes = 'shut';
      if (t > 0.5) {
        // lying: the same body, seen from the front or back, laid on its side with the head to the right
        const down = keys(t, [[0.571, 2], [0.714, 0], [0.857, 1], [1, 0]]);
        Object.assign(P, { lie: 1, tilt: 0, lunge: 0, lean: 0, headDy: 0, bob: 0, tuck: 0, lift: down, rootX: 0 });
        const flop = keys(t, [[0.571, 1], [0.714, 0.3], [0.857, 0.7], [1, 0]]);
        P.armF = { f: 0, u: up ? 1 + 3 * flop : flop, o: 1.5 + flop }; P.armB = { f: 0, u: 2 * flop, o: 1 + flop };
        P.footF = { f: 0, u: 0, o: 0.6 + 0.8 * flop }; P.footB = { f: 0, u: 0, o: 0.4 };
        P.item = up ? 0.12 * (1 + 2 * flop) : -0.3 * (1 + 0.4 * flop);   // beside the body on the weapon side, pointing at the feet: the way it was swung out, turned with the body
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
 * A lying body with something big on it (a pack, a shield: frame()'s `far`) is moved to stay inside the frame when the pose
 * is fitted, so the picture and these points agree whichever is asked for first.
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
  const [mx, my] = P.lieShift ?? [0, 0];      // set by fit() when the lying body has to be moved to stay in the frame
  for (const sk of Object.values(out)) { [sk.x, sk.y] = map(sk.x, sk.y); sk.x += mx; sk.y += my; sk.angle -= PI / 2; }
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
  // a body on the ground: tall headgear moves the whole body along, something that reaches far to one side (a pack, a
  // shield: frame()'s `far`) moves it up or down the picture; a weapon that still sticks out is drawn shorter.
  // The move up or down is P.lieShift, which draw() and sockets() both use: the layout is settled here, once.
  const J = solve(direction, P, d);
  delete P.lieShift;
  if (points) {
    const at = points(J, P).map(([x, y]) => lieMap(P, d)(x, y)), xs = at.map((q) => q[0]), ys = at.map((q) => q[1]);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    if (hi > SIZE[0] - margin) P.rootX -= Math.ceil(hi - (SIZE[0] - margin));
    else if (lo < margin) P.rootX += Math.ceil(margin - lo);
    const top = Math.min(...ys), bottom = Math.max(...ys), yMax = SIZE[1] - margin;      // far points are outer edges: the last pixel is a row inside them
    const dy = bottom > yMax ? -Math.ceil(bottom - yMax) : top < margin ? Math.ceil(margin - top) : 0;
    if (dy) P.lieShift = [0, dy];
  }
  if (item) {
    const [hx, hy0] = lieMap(P, d)(J.armF.hand[0], J.armF.hand[1]), pad = item.pad ?? 1, hy = hy0 + (P.lieShift?.[1] ?? 0);
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
  // where it lies was settled when the pose was fitted (fit(): P.rootX along the body, P.lieShift up or down), so the
  // picture and the sockets agree whichever is asked for first
  const X0 = lieX0(P, d) + (P.lieShift?.[0] ?? 0), Y0 = lieY0(P, d) + (P.lieShift?.[1] ?? 0);
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

/** A belt across the waist, for the `torso` hook, in the tone of its colour that stands clear of the cloth under it: the shadow tone, or a lighter tone of it where that would merge with the tunic (engine/tones.js: bandTone). opt: { colour, buckle (colour, or null for none) }. */
export function belt(g, J, P, d, opt = {}) {
  // what is already drawn on the row the belt will cover: the cloth it has to stand clear of
  const hip = Math.round(J.hip[1]), wide = J.dir === 'side' ? Math.round(d.chestR * 1.7) : Math.floor(d.chestR) * 2 + 1;
  const x0 = J.dir === 'side' ? Math.round(J.hip[0] - wide / 2 + 0.3) : Math.floor(J.bx) - Math.floor(d.chestR), under = [];
  for (let x = x0; x < x0 + wide; x++) under.push(g.get(x, hip - 3));
  band(g, J, d, 3, bandTone(opt.colour ?? '#9a6a3e', under), opt.buckle ?? null);
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
 *        far: (J, P, d) => [[x, y]] the outermost points of what is worn or carried to one side (packFar() for a pack): what
 *             fit() needs to keep a body that lies down in `die` inside the frame with it on;
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
  const high = opt.points ?? (opt.rise ? (J) => [[J.head[0], J.headTop - opt.rise]] : null);
  const points = opt.far ? (J, P) => [...(high ? high(J, P) : []), ...opt.far(J, P, d)] : high;
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

// ---- additions of batch R05 (mage-walker, rogue-walker) -------------------------------------------
// Worn: beard, bandana, mask (the `head` hook); scarf (the `behind` hook) with scarfWrap (the `torso` hook).
// Held: the small kinds wand, orb, dagger and claws (SMALL_ITEMS, smallItemSize, smallItem), and offGrip for a
// character with a thing in each hand. Nothing above this line was changed.
import { polyIn as polyInR05, ellipseIn as ellipseInR05 } from '../engine/surface.js';

/** Draws a beard, for the `head` hook: over the jaw and down the chest facing down, on the front of the chin facing sideways, nothing facing away. opt: { kind: 'long' | 'short', length (a multiplier, 0.65 to 1.35), colour }. */
export function beard(g, J, P, d, opt = {}) {
  const { kind = 'long', length = 1, colour = '#f0ead8' } = opt;
  if (J.dir === 'up') return;
  const c = ramp(colour), cx = J.head[0], rx = d.headW / 2, sway = P.sway ?? 0, inH = headIn(J, d);
  const top = J.brow + 4, chin = J.headTop + d.headH;          // the mouth row (eyes are on brow + 1 and + 2); the first row under the head
  const hang = kind === 'long' ? Math.max(3, Math.round((d.torso - d.chin) * 0.75 * length)) : Math.max(1, Math.round(2 * length));
  const parts = [];
  if (J.dir === 'down') {
    // the jaw from the mouth row down, joined to the hair by a sideburn on each side
    parts.push((px, py) => inH(px, py) && (py >= top || (py >= top - 1 && Math.abs(px - cx) > rx - 2)));
    if (kind === 'long') { const tip = cx + sway * 0.8; parts.push(polyInR05([[cx - rx + 1.5, chin - 1], [cx + rx - 1.5, chin - 1], [tip + 1, chin + hang], [tip - 1, chin + hang]])); }
    else parts.push(ellipseInR05(cx, chin - 0.5, rx - 1.5, hang + 0.5));
  } else {
    parts.push((px, py) => inH(px, py) && py >= top && px > cx - 1.5);
    if (kind === 'long') { const tip = cx + rx * 0.45 - sway * 1.2; parts.push(polyInR05([[cx - 1.5, chin - 1], [cx + rx - 0.4, chin - 1.5], [tip + 1, chin + hang], [tip - 1, chin + hang]])); }
    else parts.push(ellipseInR05(cx + rx * 0.35, chin - 0.5, rx * 0.6, hang + 0.5));
  }
  g.blob(parts, c);
  // the moustache: one row in the shadow tone where the beard meets the face, so a pale beard stays apart from pale skin
  const box = headBox(J, d);
  g.fill(...box, (px, py) => inH(px, py) && py >= top && py < top + 1 && (J.dir === 'down' ? Math.abs(px - cx) < rx - 2 : px > cx - 0.5), c.dark, { shade: 0 });
  if (P.mouth && J.dir === 'down') g.rect(Math.floor(cx), top, 1, 2, c.deep);       // talking: the mouth opens in the beard
}

/** Draws a bandana, for the `head` hook: a band of cloth over the brow with hair showing above it, knotted at the back with two short tails. opt: { colour, size (a deeper band and longer tails; 0.5 to 1.8) }. */
export function bandana(g, J, P, d, opt = {}) {
  const { colour = '#2f8f9d', size = 1 } = opt;
  const c = ramp(colour), [cx] = J.head, rx = d.headW / 2, dir = J.dir, sway = P.sway ?? 0, inH = headIn(J, d);
  const deep = clamp(Math.round(2 * size), 1, 3), y1 = J.brow, y0 = y1 - deep, tail = 2.5 + 2 * size, mid = (y0 + y1) / 2;
  const box = headBox(J, d, 1);
  g.fill(...box, (px, py) => inH(px, py) && py >= y0 && py < y1, c, { shade: 0 });
  if (deep > 1) g.fill(...box, (px, py) => inH(px, py) && py >= y1 - 1 && py < y1, c.dark, { shade: 0 });      // the fold along its lower edge
  if (dir === 'up') {
    // the knot in the middle of the back of the head, the tails down over the hair
    const x0 = Math.floor(cx);
    g.capsule(cx - 0.5, y1, cx - 2 + sway, y1 + tail, 1, 0.7, c);
    g.capsule(cx + 0.5, y1, cx + 2.2 + sway, y1 + tail * 0.75, 1, 0.7, c);
    g.rect(x0 - 1, y0, 3, deep + 1, c.dark, { shade: 0 });
  } else if (dir === 'side') {
    const kx = cx - rx + 0.5;
    g.capsule(kx, mid, kx - 3 - sway * 1.5, mid + tail * 0.7, 1.1, 0.7, c);
    g.capsule(kx, mid, kx - 1.5 - sway, mid + tail, 1.1, 0.7, c);
  } else {
    // facing the camera the knot is behind the head: the tails show past one side of it
    const kx = cx + rx - 0.3;
    g.capsule(kx, mid, kx + 3 + sway, mid + tail * 0.7, 1.1, 0.7, c);
    g.capsule(kx, mid, kx + 1.5 + sway * 0.6, mid + tail, 1.1, 0.7, c);
  }
}

/** Draws a cloth mask over the mouth and chin, for the `head` hook: the eyes stay clear, and from behind only its tie shows. opt: { colour, size (under 0.8 it sits below the nose; over 1 it also hangs over the neck; 0.5 to 1.8) }. */
export function mask(g, J, P, d, opt = {}) {
  const { colour = '#5a5f7a', size = 1 } = opt;
  const c = ramp(colour), [cx] = J.head, rx = d.headW / 2, dir = J.dir, inH = headIn(J, d), box = headBox(J, d, 4);
  const top = J.brow + (size < 0.8 ? 4 : 3), chin = J.headTop + d.headH, drape = Math.max(0, Math.round((size - 1) * 4));
  const x0 = Math.floor(cx);
  if (dir === 'up') {
    g.fill(...box, (px, py) => inH(px, py) && py >= top && py < top + (size > 1.3 ? 2 : 1), c, { shade: 0 });
    g.rect(x0 - 1, top, 3, 2, c.dark, { shade: 0 });                               // the knot
    g.rect(x0 - 2, top + 2, 1, 2, c.base); g.rect(x0 + 2, top + 2, 1, 1 + Math.round(size), c.base);      // its two ends
    return;
  }
  const parts = [];
  if (dir === 'down') {
    parts.push((px, py) => inH(px, py) && py >= top);
    if (drape) parts.push(polyInR05([[cx - rx + 1.5, chin - 1], [cx + rx - 1.5, chin - 1], [cx + 2, chin + drape], [cx - 2, chin + drape]]));
  } else {
    parts.push((px, py) => inH(px, py) && py >= top && px > cx - 1);
    if (drape) parts.push(polyInR05([[cx - 1, chin - 1], [cx + rx - 0.5, chin - 1], [cx + rx - 2, chin + drape], [cx, chin + drape]]));
  }
  g.blob(parts, c);
  if (dir === 'side') {
    // the tie runs back over the hair to a knot behind the head
    g.fill(...box, (px, py) => inH(px, py) && py >= top && py < top + 1 && px <= cx - 1, c.dark, { shade: 0 });
    g.rect(Math.round(cx - rx) - 1, top, 2, 2, c.base, { shade: 0 });
  }
}

/** Draws the tail of a scarf, for the `behind` hook: it streams back from the neck (to the left facing sideways, past one shoulder facing down, down the back facing away) and never leaves the frame. opt: { colour, length (pixels; 0 draws nothing), flow (0 hanging to 1 streaming straight back), wave (list of -1..1 from the neck to the tip: how far each part is thrown sideways; default [P.sway]) }. */
export function scarf(g, J, P, d, opt = {}) {
  const { colour = '#5a5f7a', length = 10, flow = 0.3 } = opt;
  if (!(length > 0)) return;
  const wave = opt.wave && opt.wave.length ? opt.wave : [P.sway ?? 0];
  const c = ramp(colour), dir = J.dir, top = J.shoulderY + d.chin, f = clamp(flow);
  let ax, ay, a;
  if (dir === 'side') { ax = J.neck[0] - d.chestR * 0.6; ay = top + 0.5; a = -lerp(0.3, 1.5, f); }
  else if (dir === 'up') { ax = J.bx + 1; ay = top + 1; a = 0.12; }
  else { ax = J.bx + d.chestR - 1; ay = top + 0.5; a = lerp(1.25, 1.65, f); }      // facing the camera it stays at shoulder height, clear of whatever the hands hold
  const amp = dir === 'up' ? 1.2 + 1.6 * f : 0.8 + 1.8 * f, N = 6, sag = dir === 'up' ? 0 : (1 - f) * (dir === 'side' ? 0.45 : 0.25);      // cloth that is not streaming droops towards its end
  const thrown = (k) => { const u = k * (wave.length - 1), i = Math.min(wave.length - 1, Math.floor(u)), j = Math.min(wave.length - 1, i + 1); return lerp(wave[i], wave[j], u - i); };
  const at = (k, L) => { const off = amp * k * thrown(k); return [ax + Math.sin(a) * L * k + Math.cos(a) * off, ay + Math.cos(a) * L * k - Math.sin(a) * off + sag * L * k * k]; };
  // too long for the room it has: it is drawn shorter
  const fits = (L) => { for (let i = 1; i <= N; i++) { const [x, y] = at(i / N, L); if (x < 3.5 || x > SIZE[0] - 3.5 || y < 3.5 || y > GROUND - 2.5) return false; } return true; };
  let L = length;
  while (L > 2 && !fits(L)) L -= 1;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const [x0, y0] = at(i / N, L), [x1, y1] = at((i + 1) / N, L);
    parts.push(capsuleIn(x0, y0, x1, y1, i ? 1.5 : 1.2, i === N - 1 ? 1.2 : 1.5));      // a ribbon three pixels wide, a little narrower where it is tied and at its loose end
  }
  const keep = (px, py) => px > 2 && px < SIZE[0] - 2 && py > 2 && py < GROUND - 1;
  // a dark cloth carries its form with its light and base tones (its shadow tone is as dark as the outline): style guide section 3, rule 4
  const paint = brightness(colour) < 0.4 ? { isRamp: true, light: c.light, base: c.light, dark: c.base, deep: c.dark } : c;
  g.fill(Math.min(ax, at(1, L)[0]) - 6, Math.min(ay, at(1, L)[1]) - 6, Math.max(ax, at(1, L)[0]) + 6, Math.max(ay, at(1, L)[1]) + 6, (px, py) => keep(px, py) && parts.some((s) => s(px, py)), paint);
}

/** Draws the part of a scarf that goes round the neck, for the `torso` hook: two rows of cloth under the chin, a little wider than the chest. opt: { colour }. */
export function scarfWrap(g, J, P, d, opt = {}) {
  const colour = opt.colour ?? '#5a5f7a', c = ramp(colour), top = J.shoulderY + d.chin;
  const [hi, lo] = brightness(colour) < 0.4 ? [c.light, c.base] : [c.base, c.dark];      // a dark cloth: light and base, as the tail
  if (J.dir === 'side') {
    const wide = Math.round(d.chestR * 1.7) + 1, x = Math.round(J.neck[0] - d.chestR * 0.85) - 1;
    g.rect(x, top - 1, wide, 2, hi); g.rect(x, top + 1, wide, 1, lo);
    return;
  }
  const half = Math.floor(d.chestR) + 1, x = Math.floor(J.bx);
  g.rect(x - half, top - 1, half * 2 + 1, 2, hi);
  g.rect(x - half, top + 1, half * 2 + 1, 1, lo);
}

/** The sizes { length, back, pad } in pixels of the small held kinds smallItem() draws: wand (hand to its lit tip), orb (hand to the middle of a ball that floats over it), dagger, claws. No arguments: a frozen object. */
export const SMALL_ITEMS = Object.freeze({
  wand: Object.freeze({ length: 9, back: 1.5, pad: 1.5 }),
  orb: Object.freeze({ length: 5, back: 0, pad: 3 }),
  dagger: Object.freeze({ length: 7, back: 1.5, pad: 1 }),
  claws: Object.freeze({ length: 5, back: 0, pad: 2.5 }),
});

/** Returns the size { length, back, pad } of a small held kind at a length setting, or itemSize()'s answer for the standard kinds; null for 'none'. kind: a key of SMALL_ITEMS or ITEMS; scale: 1 = standard. */
export const smallItemSize = (kind, scale = 1) => (SMALL_ITEMS[kind] ? { length: SMALL_ITEMS[kind].length * scale, back: SMALL_ITEMS[kind].back, pad: SMALL_ITEMS[kind].pad } : itemSize(kind, scale));

/** Draws a small held thing (wand, orb, dagger, claws) from an attach point, and hands every other kind to heldItem(). direction: 'down' | 'up' | 'side'; at: { x, y, angle, reach }; item: { kind, length, metal, wood, hilt, orb (colours), glow: 0..1 (a bigger orb or wand tip) }. */
export function smallItem(g, direction, at, item) {
  if (!SMALL_ITEMS[item.kind]) return heldItem(g, direction, at, item);
  const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#c2c9d6');
  const wood = item.wood ?? '#9a6a3e', hilt = item.hilt ?? '#f2c230';
  const light = typeof item.orb === 'string' ? ramp(item.orb) : item.orb ?? ramp('#4fd8ee');
  const a = at.angle, len = item.length * (at.reach ?? 1), hx = at.x, hy = at.y;
  const to = (dist, turn = 0, from = [hx, hy]) => reach(from[0], from[1], a + turn, dist);
  if (item.kind === 'wand') {
    const [bx, by] = to(1.5, PI), [tx, ty] = to(len);
    g.line(bx, by, tx, ty, wood);
    const r = 1.4 + (item.glow ?? 0) * 0.6;
    g.ellipse(Math.floor(tx) + 0.5, Math.floor(ty) + 0.5, r, r, light, { light: 1 });
  } else if (item.kind === 'orb') {
    const [tx, ty] = to(len), r = 2.4 + (item.glow ?? 0) * 0.6;
    g.ellipse(Math.round(tx) + 0.5, Math.round(ty) + 0.5, r, r, light, { light: 1 });
  } else if (item.kind === 'dagger') {
    const [gx, gy] = to(1.5), [tx, ty] = to(len);
    g.limb(gx, gy, tx, ty, 2, metal);
    g.dot(tx, ty, metal.light);
    const [ax, ay] = to(1.6, PI / 2, [gx, gy]), [bx, by] = to(1.6, -PI / 2, [gx, gy]);
    g.line(ax, ay, bx, by, hilt);
    const [px, py] = to(1.2, PI);
    g.dot(px, py, hilt);
  } else {
    // claws: three thin blades that fan out from the fist
    for (const i of [-1, 1, 0]) {
      const [sx, sy] = to(1.3 * Math.abs(i), i * PI / 2), [tx, ty] = to(len - Math.abs(i), i * 0.22, [sx, sy]);
      g.line(sx, sy, tx, ty, i ? metal.base : metal.light);
    }
  }
}

/** Returns the attach point { x, y, angle, reach } of a second thing held in the other hand: mirrored across the body facing down or up, parallel to the first facing sideways. J = solve() or the J a hook gets; P: the pose. */
export const offGrip = (J, P) => ({ x: J.armB.hand[0], y: J.armB.hand[1], angle: J.dir === 'side' ? P.item : -P.item, reach: P.reach ?? 1 });

// ---- additions of batch R07 (town-guard, farm-kid) ------------------------------------------------------
// A manner of moving laid over a standard pose (frameWith, MANNERS); more worn parts (tabard, kettleHat, shield,
// hairBow, hairdo); and the things townsfolk hold (TOWN_ITEMS, townItemSize, townItem). All additive: nothing
// above this line reads them.

/**
 * One frame as frame() makes it, with a manner of moving laid over the standard pose and the result fitted again: a child's rocking idle, a guard's barring arm.
 * clip, t, p, opt: as frame(); opt.manner: (P, F, t) => void, or a list of them, each changing the pose P in place (MANNERS has ready-made ones; F.action, F.direction, F.d, F.item and F.carry say what is being posed).
 * Returns the same F as frame(): the picture and the sockets both use the changed pose (the swing arc of an armed attack still follows the standard one).
 */
export function frameWith(clip, t, p = {}, opt = {}) {
  const F = frame(clip, t, p, opt), manners = [].concat(opt.manner ?? []);
  if (!manners.length || F.P.lie) return F;
  const before = JSON.stringify(F.P);
  F.carry = opt.carry;
  for (const manner of manners) manner(F.P, F, t);
  if (JSON.stringify(F.P) === before) return F;                       // no manner had anything to say about this action
  fit(F.direction, F.P, F.d, { item: F.item, points: opt.points ?? (opt.rise ? (J) => [[J.head[0], J.headTop - opt.rise]] : null) });
  return F;
}

/**
 * Ready-made manners for frameWith(), each (P, F, t) and each acting on one action only, so the whole list can be passed for every clip.
 *   rock   idle: rocks from heel to toe with both hands swinging together, and the head tips from side to side: a child who cannot stand still
 *   flail  run: both hands above the shoulders, waving in turn (from the side: thrown out level, ahead and behind); a hand that holds something keeps the run's own swing
 *   bar    block with nothing held: the weapon arm is held out level to bar the way and the other arm hangs; with a pole weapon (carry 'upright'): the pole is brought level across the body
 *   attention  with something held: at rest it is carried twice as close to upright (a guard's pole weapon, standing straight at his side); from the side a quarter closer, so it stays clear of the face
 */
export const MANNERS = {
  rock(P, F, t) {
    if (F.action !== 'idle') return;
    const w = wave(t), side = F.direction === 'side';
    P.lean += (side ? 1.4 : 2.2) * w;
    if (!side) P.headDx += Math.round(0.9 * wave(t, 0.25));
    P.armF.f += 1.6 * w; P.armB.f += 1.6 * w;
    P.sway = wave(t, -0.15);
  },
  flail(P, F, t) {
    if (F.action !== 'run') return;
    const w = wave(t * 2);
    const arms = F.item ? [[P.armB, -1]] : [[P.armF, 1], [P.armB, -1]];          // a hand that holds something keeps the run's own swing
    for (const [A, sg] of arms) {
      if (F.direction === 'side') {
        // from the side the arms are thrown out level, one ahead and one behind, so the near one never crosses the face
        A.u = F.d.arm - 0.5 + sg * w; A.f *= 1.3; A.o = 0;
      } else {
        A.u = F.d.arm + 3 + sg * 1.5 * w; A.f *= 0.3; A.o = 2.5 + sg * 1.5 * wave(t * 2, 0.25);
      }
    }
  },
  bar(P, F, t) {
    if (F.action !== 'block' || (F.item && F.carry !== 'upright')) return;
    const b = keys(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]), side = F.direction === 'side', out = (F.d.arm + 1) * b;
    if (F.item) {
      // a pole weapon is brought level across the body (behind it going up); from the side the guard is the pose's own
      if (side) return;
      P.item = lerp(P.item, F.direction === 'up' ? 1.5 * PI - 0.2 : 0.5 * PI + 0.2, b);
      // level, a long pole is as wide as the frame: it is drawn a little shorter, as if it pointed a little at the camera
      const room = SIZE[0] - 5 - (F.item.pad ?? 1) - (F.item.back ?? 0);
      P.reach = Math.min(P.reach ?? 1, lerp(1, room / F.item.length, b));
      return;
    }
    P.armF.u = F.d.arm * b; P.armF.f = side ? out : 0; P.armF.o = side ? 0 : out;
    P.armB.f = 0; P.armB.u = 0; P.armB.o = 0;
  },
  attention(P, F) {
    if (!F.item) return;
    // only while the thing is at (or near) the angle it rests at, so a swing or a guard is left as the pose has it
    const rest = (CARRY[F.carry] ?? CARRY.up)[F.direction], near = smooth(clamp(1 - Math.abs(P.item - rest) / 0.8));
    P.item += (PI - rest) * (F.direction === 'side' ? 0.25 : 0.5) * near;
  },
};

/** A tabard for the `torso` hook: a sleeveless panel of cloth over the chest and back that hangs from the shoulders to the knee, so the sleeves and legs keep the look's colours. opt: { colour, border (colour of its edges and hem, or null for none), length (0 = to the hip, 1 = to the knee) }. */
export function tabard(g, J, P, d, opt = {}) {
  const { colour = '#3f6fd1', border = null, length = 1 } = opt;
  const c = ramp(colour), side = J.dir === 'side', y0 = J.shoulderY + d.chin - 1, hip = Math.round(J.hip[1]);
  const y1 = Math.min(J.gy - 3, hip + Math.round(d.leg * 0.45 * clamp(length)));          // the hem
  const sw = Math.round((P.sway ?? 0) * 0.8);                                             // the hanging part swings a pixel
  let span;                                                                               // the first and last column of a row
  if (side) {
    const wide = Math.round(d.chestR * 1.7), nx = J.neck[0], hx = J.hip[0];
    span = (row) => { const l = Math.round(lerp(nx, hx, clamp((row + 0.5 - y0) / Math.max(1, hip - y0))) - wide / 2 + 0.3) + (row > hip ? sw : 0); return [l, l + wide - 1]; };
  } else {
    const x = Math.floor(J.bx), half = Math.max(1, Math.floor(d.chestR) - 1);              // between the arms
    span = (row) => [x - half + (row > hip ? sw : 0), x + half + (row > hip ? sw : 0)];
  }
  const inside = (px, py) => { if (py < y0 || py >= y1) return false; const [a, b] = span(Math.floor(py)); return px > a && px < b + 1; };
  const box = [J.bx - 14, y0, J.bx + 14, y1];
  g.fill(...box, inside, c);
  if (!border) return;
  // the border: along the hem and up the edges (from the side: the hem and the front edge)
  g.fill(...box, (px, py) => inside(px, py) && (py >= y1 - 1 || !inside(px + 1, py) || (!side && !inside(px - 1, py))), border, { shade: 0 });
}

/** A kettle hat for the `head` hook (set look.hatted): a round steel bowl with a wide brim all the way round, a tone darker than the metal like the helmet, the face open below it. opt: { size (the brim: 0.5 to 1.8), metal }. */
export function kettleHat(g, J, P, d, opt = {}) {
  const { size = 1 } = opt;
  const m = ramp(opt.metal ?? '#c2c9d6'), steel = { isRamp: true, light: m.base, base: m.dark, dark: m.deep, deep: m.deep };
  const [cx, cy] = J.head, rx = d.headW / 2, ry = d.headH / 2, brim = J.brow - 2, bowl = headIn(J, d, 0.9);
  g.fill(cx - rx - 2, cy - ry - 2, cx + rx + 2, brim, (px, py) => bowl(px, py) && py < brim, steel, { light: 1 });
  g.ellipse(cx, brim + 0.5, rx + 1 + 1.7 * size, 1.6, steel, { shade: 1, light: 1 });       // the brim: three rows, lit along the top
  g.fill(cx - rx - 2, brim - 2, cx + rx + 2, brim, (px, py) => bowl(px, py) && py >= brim - 1 && py < brim, m.deep, { shade: 0 });      // where the bowl meets the brim
}

/** The kinds shield() draws. */
export const SHIELD_KINDS = ['round', 'kite'];

/** A shield on the other arm, for the `offhand` hook: in front of the arm going down, behind the body going up (its inner side, a tone down), and showing ahead of the body from the side. opt: { kind: 'round' | 'kite', size (0.65 to 1.35), metal, boss (colour of the stud or cross on its face, or null for none) }. */
export function shield(g, J, P, d, opt = {}) {
  const { kind = 'round', size = 1, boss = null } = opt;
  const m = ramp(opt.metal ?? '#c2c9d6'), dir = J.dir, [hx, hy] = J.armB.hand, out = -J.s;      // out: the off-hand side on the screen
  // from the side it is held up ahead of the chest, where it shows past the near arm, and is turned half away
  const cx = Math.floor(hx + (dir === 'side' ? 5 : out * (dir === 'up' ? 2 : 1))) + 0.5, cy = Math.floor(hy - (dir === 'side' ? 4 : 2.5)) + 0.5;
  const thin = dir === 'side' ? 0.75 : 1;
  let inside, box;
  if (kind === 'kite') {
    const w = 3.9 * size * thin, top = cy - 4.4 * size, tip = cy + 6.2 * size;
    inside = (px, py) => {
      const ax = Math.abs(px - cx);
      if (py < top || py > tip) return false;
      return py <= cy ? ax <= w && !(py < top + 1 && ax > w - 1) : ax <= w * (tip - py) / (tip - cy);
    };
    box = [cx - w - 1, top - 1, cx + w + 1, tip + 1];
  } else {
    const r = 4.4 * size;
    inside = (px, py) => ((px - cx) / (r * thin)) ** 2 + ((py - cy) / r) ** 2 <= 1;
    box = [cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1];
  }
  // a rim one pixel wide all round: darker than the face on the front; on the far side (going up and from the side)
  // the face is a tone down, so a blade held in front of it still shows, and the rim catches the light
  const rim = (px, py) => inside(px, py) && !(inside(px + 1, py) && inside(px - 1, py) && inside(px, py + 1) && inside(px, py - 1));
  if (dir !== 'down') { g.fill(...box, inside, dim(m)); g.fill(...box, rim, m.base, { shade: 0 }); return; }
  over(g, inside, box, m, m.deep, { light: 1 });
  g.fill(...box, rim, m.dark, { shade: 0 });
  if (!boss) return;
  const x = Math.floor(cx), y = Math.floor(cy);
  if (kind === 'kite') {
    g.fill(...box, (px, py) => inside(px, py) && inside(px, py + 1.5) && inside(px, py - 1.5) && Math.floor(px) === x, boss, { shade: 0 });
    g.fill(...box, (px, py) => inside(px - 1.5, py) && inside(px + 1.5, py) && Math.floor(py) === y - Math.round(1.4 * size), boss, { shade: 0 });
  } else {
    g.rect(x, y - 1, 1, 3, boss); g.rect(x - 1, y, 3, 1, boss);
  }
}

/** How far a hair bow rises above the top of the head, in pixels, for frame()'s `rise`. size: its Size setting. */
export const hairBowRise = (size = 1) => 1 + Math.ceil(2.2 * Math.sqrt(size));

/** A ribbon bow on top of the head, for the `head` hook: two loops and a knot, a little to one side going down and up, at the back of the crown from the side. opt: { size (0.5 to 1.8), colour }. */
export function hairBow(g, J, P, d, opt = {}) {
  const { size = 1, colour = '#c8553a' } = opt;
  const c = ramp(colour), w = Math.sqrt(size), dir = J.dir;
  const kx = Math.floor(J.head[0] + (dir === 'down' ? 2 : dir === 'up' ? -2 : -1.5)) + 0.5, ky = J.headTop + 0.5;
  const lx = 3.7 * w * (dir === 'side' ? 0.75 : 1), ly = 2.2 * w;
  for (const sg of [-1, 1]) g.poly([[kx, ky - 0.6], [kx + sg * lx, ky - ly], [kx + sg * lx, ky + ly * 0.8], [kx, ky + 0.6]], c);
  g.rect(Math.floor(kx), Math.floor(ky) - 1, 1, 2, c.dark);                                  // the knot
}

/** The styles hairdo() adds over the rig's short hair. */
export const HAIRDOS = ['bowl', 'pigtails'];

/** Two more hair styles, drawn in the `head` hook over look.hairStyle 'short': 'bowl' (a round cap of hair cut straight above the eyes and round the back) and 'pigtails' (a bunch at each ear, which lags the head). Any other style adds nothing. opt: { style, colour (the hair colour), tie (colour of the pigtails' ties, or null for none) }. */
export function hairdo(g, J, P, d, opt = {}) {
  const { style, tie = null } = opt;
  if (!HAIRDOS.includes(style)) return;
  const hair = ramp(opt.colour ?? '#5a3a22'), [cx, cy] = J.head, rx = d.headW / 2, ry = d.headH / 2, dir = J.dir, sway = P.sway ?? 0;
  if (style === 'bowl') {
    const cap = headIn(J, d, 0.8), box = headBox(J, d, 2), nape = cy + ry * 0.75;
    if (dir === 'down') g.fill(...box, (px, py) => cap(px, py) && (py < J.brow + 1 || (Math.abs(px - cx) > rx - 1.6 && py < J.brow + 4)), hair);
    else if (dir === 'up') g.fill(...box, (px, py) => cap(px, py) && py < nape, hair, { shade: 2 });
    else g.fill(...box, (px, py) => cap(px, py) && (py < J.brow + 1 || (px < cx - 0.5 && py < nape)), hair);
    return;
  }
  for (const sg of dir === 'side' ? [-1] : [-1, 1]) {
    const x0 = cx + sg * (rx - (dir === 'side' ? 1.5 : 0.5)), y0 = cy + 0.5;
    g.capsule(x0, y0, cx + sg * (rx + 2.4) + sway * 0.8, cy + 3.6, 1.7, 1.1, hair);
    if (tie) g.rect(Math.floor(x0 + sg * 1.2), Math.floor(y0) - 1, 1, 2, tie);
  }
}

/** The kinds townItem() draws itself; any other kind it passes on to heldItem(). Carry: halberd and pike (a spear taller than its bearer) 'upright'; stick and flower 'up'; basket 'hang'. */
export const TOWN_ITEM_KINDS = ['halberd', 'pike', 'stick', 'basket', 'flower'];

/** The sizes { length, back, pad } of what townsfolk hold, in pixels, read as ITEMS: a halberd's shaft goes 11 px below the hand, so held at the hip it stands on the ground and its blade clears the head. */
export const TOWN_ITEMS = {
  halberd: { length: 24, back: 11, pad: 3 },
  pike: { length: 23, back: 11, pad: 1.5 },
  stick: { length: 9, back: 1.5, pad: 1.5 },
  basket: { length: 7, back: 0, pad: 4 },
  flower: { length: 8, back: 1, pad: 2.5 },
};

/** The size { length, back, pad } of a held kind at a length setting, for frame(), fit() and townItem(): the kinds of TOWN_ITEMS, else whatever itemSize() says. kind: a held kind; scale: 1 = standard. */
export const townItemSize = (kind, scale = 1) => (TOWN_ITEMS[kind] ? { length: TOWN_ITEMS[kind].length * scale, back: TOWN_ITEMS[kind].back, pad: TOWN_ITEMS[kind].pad } : itemSize(kind, scale));

/**
 * Draws what townsfolk hold from an attach point and its own settings, as heldItem() does; a kind that is not in TOWN_ITEMS is passed on to heldItem().
 *   direction: 'down' | 'up' | 'side' (a halberd's blade faces away from the body); at: { x, y, angle, reach }, for example F.hand(J)
 *   item: { kind, length, and per kind: halberd and pike { metal, wood }; stick { wood }; basket { wood (the wicker), fill (colour of what is in it, or null for an empty one) }; flower { stem, petal, heart } }
 */
export function townItem(g, direction, at, item) {
  if (!TOWN_ITEMS[item.kind]) return heldItem(g, direction, at, item);
  const a = at.angle, r = at.reach ?? 1, len = item.length * r, hx = at.x, hy = at.y;
  const to = (dist, turn = 0, from = [hx, hy]) => reach(from[0], from[1], a + turn, dist);
  const wood = item.wood ?? '#9a6a3e';
  if (item.kind === 'halberd') {
    const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#c2c9d6');
    const [bx, by] = to(TOWN_ITEMS.halberd.back * r, PI), [tx, ty] = to(len);
    g.line(bx, by, tx, ty, wood);
    const lead = direction === 'down' ? PI / 2 : -PI / 2;                                   // the blade faces away from the body
    const [mx, my] = to(Math.max(2, len - 5.5)), [ox, oy] = to(1.2, lead, [mx, my]);
    const nx = Math.sin(a + lead), ny = Math.cos(a + lead);
    g.ellipse(ox, oy, 3.4, 3.4, metal, { light: 1, clip: (px, py) => (px - mx) * nx + (py - my) * ny > 0.4 });
    const [kx, ky] = to(2.2, -lead, [mx, my]);
    g.line(mx, my, kx, ky, metal.dark);                                                     // the hook on its back
    const [sx, sy] = to(Math.max(1, len - 3.5));
    g.capsule(sx, sy, tx, ty, 1.4, 0.5, metal);                                             // the spike
  } else if (item.kind === 'pike') {
    const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#c2c9d6');
    const [bx, by] = to(TOWN_ITEMS.pike.back * r, PI), [tx, ty] = to(len), [sx, sy] = to(Math.max(1, len - 4.5)), [cx, cy] = to(Math.max(1, len - 6));
    g.line(bx, by, tx, ty, wood);
    g.capsule(sx, sy, tx, ty, 1.9, 0.5, metal, { light: 1 });                                  // a long leaf-shaped head
    g.dot(cx, cy, metal.dark);                                                              // the socket it sits in
  } else if (item.kind === 'stick') {
    const [bx, by] = to(1.5 * r, PI), [tx, ty] = to(len), [mx, my] = to(len * 0.6), [kx, ky] = to(2.4, direction === 'up' ? -0.9 : 0.9, [mx, my]);
    g.line(bx, by, tx, ty, wood);
    g.line(mx, my, kx, ky, wood);                                                           // a twig
  } else if (item.kind === 'basket') {
    // hangs from the hand by its handle: a rim, a woven tub, a narrower foot
    const wick = typeof wood === 'string' ? ramp(wood) : wood;
    const h = Math.max(3, Math.round(len) - 3), w = len >= 8.5 ? 9 : 7, [lx, ly] = to(3);
    const x = Math.floor(lx) - (w - 1) / 2, y = Math.round(ly);
    g.line(hx, hy, x + 0.5, y + 0.5, wick.dark); g.line(hx, hy, x + w - 0.5, y + 0.5, wick.dark);
    if (item.fill) for (let i = 1; i < w - 1; i++) if (i % 3) g.dot(x + i, y - 1, item.fill);
    g.rect(x, y + 1, w, h - 1, wick.base, { shade: 0 });
    g.rect(x, y + 1 + Math.floor((h - 1) / 2), w, 1, wick.dark);
    g.rect(x, y, w, 1, wick.light);
    g.rect(x + 1, y + h, w - 2, 1, wick.dark);
  } else {
    // a flower: a stem with a leaf, and a round bloom at the far end
    const stem = item.stem ?? '#4f9d57', petal = typeof item.petal === 'string' ? ramp(item.petal) : item.petal ?? ramp('#c8553a');
    const [bx, by] = to(r, PI), [tx, ty] = to(len), [mx, my] = to(len * 0.45), [lx, ly] = to(1.9, direction === 'up' ? -1.2 : 1.2, [mx, my]);
    g.line(bx, by, tx, ty, stem);
    g.line(mx, my, lx, ly, stem);
    const fx = Math.floor(tx) + 0.5, fy = Math.floor(ty) + 0.5;
    g.ellipse(fx, fy, 2.4, 2.4, petal);
    g.dot(fx, fy, item.heart ?? '#f2c230');
  }
}

// ---- additions of batch S04 (void-ranger) ---------------------------------------------------------
// Sci-fi wear and guns for any character on this rig (the ranger, the troopers).
// Worn: visorHelmet and visor (the `head` hook; visorHelmetRise for frame()'s `rise`); pack (the `behind` hook) with
// packStraps (the `torso` hook) and packRise; stripe and spine (the `torso` hook); gloves and suitLights, which are called from
// more than one hook and told which with `layer`. Held: the gun kinds blaster, scatter and beam (GUNS, gunSize, heldGun).
// After the outline: muzzleFlare (the light of an energy shot) and dashStreaks (the afterimages of a dodge). Carry: 'ready'
// (CARRY_READY), a gun held at the hip. The sections further down marked S04 are part of this batch.
// Three lines above this one were changed, all for a body that holds a gun (hero-walker and the rig's tests are unchanged):
// in pose() `shoot`, aimed at the camera the hands are a row lower (the chest shows above them), facing away the hand comes
// two pixels further out (a gun clears a helmet), and from the side the other hand comes forward under the barrel; in
// `walk`, the weapon arm swings less under carry 'ready'.
import { capsuleIn as capsuleInS04 } from '../engine/surface.js';
import { tone as toneS04 } from '../engine/color.js';

/** Returns how far a visorHelmet() of a Size setting stands off the skull all round, in pixels: pass it as frame()'s `rise`. size: 0.5 (a snug cap) to 1.8 (a big bubble). */
export const visorHelmetRise = (size = 1) => 0.3 + 0.9 * size;

/** Draws a closed helmet with a lit visor over the eyes and the jaw left open, for the `head` hook (set look.hatted): the whole back of the head facing away, with a small light. opt: { size (0.5 to 1.8: how far it stands off the skull), shell (colour), visor (colour of the glass), light (colour of the light on the back, default the visor's; null for none) }. */
export function visorHelmet(g, J, P, d, opt = {}) {
  const { size = 1 } = opt;
  const c = ramp(opt.shell ?? '#e8ecf2'), v = ramp(opt.visor ?? '#5fe0f0'), light = opt.light === undefined ? v.base : opt.light;
  const [cx, cy] = J.head, rx = d.headW / 2, ry = d.headH / 2, dir = J.dir, x0 = Math.floor(cx);
  const out = headIn(J, d, visorHelmetRise(size)), box = [cx - rx - 4, cy - ry - 4, cx + rx + 4, cy + ry + 4];
  const brow = J.brow, low = brow + 3, foot = Math.round(cy + ry * 0.5);       // the glass: three rows from the brow; the shell ends at `foot`, the jaw shows below
  const front = dir === 'down' ? (px) => Math.abs(px - cx) < rx - 1 : dir === 'side' ? (px) => px > cx - 1.5 : () => false;
  const shell = (px, py) => out(px, py) && py < foot + (dir === 'down' ? 0 : 1) && !(py >= brow && front(px));
  const glass = (px, py) => out(px, py) && py >= brow && py < low && front(px);
  g.fill(...box, shell, c, { light: 1 });
  g.fill(...box, (px, py) => shell(px, py) && !shell(px, py + 1), c.dark, { shade: 0 });        // the rim, and the brow over the glass
  if (dir === 'up') {
    g.rect(x0 - 2, Math.round(cy), 5, 1, c.dark);                                            // a seam across the back, with the light under it
    if (light) g.rect(x0 - 1, Math.round(cy) + 1, 3, 1, light);
    return;
  }
  g.fill(...box, glass, v.base, { shade: 0 });
  g.fill(...box, (px, py) => glass(px, py) && py > brow + 1, v.dark, { shade: 0 });         // lit along its top, dark below: it stays a band in a look with no hue
  const gx = dir === 'side' ? Math.floor(cx + rx) - 2 : x0 + 2;
  g.rect(gx, brow, 2, 1, v.light);                                                           // the glint, on the side the light comes from
}

/** Draws a visor (a band of lit glass over the eyes, on a strap), for the `head` hook: hair shows above it, and from behind only the strap. opt: { size (0.5 to 1.8: two to four rows deep, and wider), colour (the glass), strap (colour) }. */
export function visor(g, J, P, d, opt = {}) {
  const { size = 1, strap = '#434d6d' } = opt;
  const v = ramp(opt.colour ?? '#5fe0f0'), [cx] = J.head, rx = d.headW / 2, dir = J.dir;
  const rows = size < 0.8 ? 2 : size < 1.4 ? 3 : 4, y0 = J.brow + (rows === 2 ? 1 : 0), y1 = y0 + rows;
  const inH = headIn(J, d), out = headIn(J, d, 0.2 + 0.5 * size), box = headBox(J, d, 3);
  const band = rows > 2 ? 2 : 1;
  if (dir === 'up') { g.fill(...box, (px, py) => inH(px, py) && py >= J.brow + 1 && py < J.brow + 1 + band, strap, { shade: 0 }); return; }
  const front = dir === 'side' ? (px) => px > cx - 1.5 : () => true;
  const glass = (px, py) => out(px, py) && py >= y0 && py < y1 && front(px);
  if (dir === 'side') g.fill(...box, (px, py) => inH(px, py) && py >= J.brow + 1 && py < J.brow + 1 + band && !front(px), strap, { shade: 0 });
  g.fill(...box, glass, v.base, { shade: 0 });
  g.fill(...box, (px, py) => glass(px, py) && py > y0 + 1, v.dark, { shade: 0 });
  g.rect(dir === 'side' ? Math.floor(cx + rx) - 2 : Math.floor(cx) + 2, y0, 2, 1, v.light);
}

/** The kinds pack() can draw: a tank slung across the back, a radio with a whip antenna, a jet pack with a pod behind each shoulder. */
export const PACK_KINDS = ['tank', 'antenna', 'jet'];

/** Returns how far a pack rises above the top of the head, in pixels, for frame()'s `rise` (only the antenna does). kind: one of PACK_KINDS; size: its Size setting. */
export const packRise = (kind, size = 1) => (kind === 'antenna' ? 1 + 3 * size : 0);

/** Draws a pack on the back, for the `behind` hook: over the back facing away, behind the body facing down and sideways, where the part that reaches past the shoulders still shows. opt: { kind: one of PACK_KINDS, size (0.65 to 1.35), colour (its casing), glow (colour of its light and flame), thrust (0..1: the flame of a jet) }. */
export function pack(g, J, P, d, opt = {}) {
  const { kind = 'tank', size = 1, thrust = 0 } = opt;
  const c = ramp(opt.colour ?? '#9aa6c0'), glow = ramp(opt.glow ?? '#5fe0f0');
  const dir = J.dir, bx = J.bx, x0 = Math.floor(bx), top = J.shoulderY + d.chin, sway = P.sway ?? 0;
  const off = -J.s;                                         // the side of the free hand on the screen: the tank's top and the antenna are over that shoulder
  const back = J.neck[0] - d.chestR * 0.85;                 // side clips: the column of the back
  const floor = J.gy - 1;                                   // nothing of a pack hangs below the feet, however far the body is tucked
  const flame = (x, y, w) => { const n = Math.min(1 + Math.round(2 * clamp(thrust)), floor - y); for (let i = 0; i < n; i++) g.rect(x + (i > 1 ? 1 : 0), y + i, i > 1 ? Math.max(1, w - 2) : w, 1, i ? glow.base : glow.light); };
  if (kind === 'tank') {
    const r = 1.9 + 0.9 * size;
    const [fx, fy, hx, hy] = dir === 'side'
      ? [back - 0.5, top + 3 + 5 * size, back - 2 - size, top - 1]
      : [bx - off * 1.5, top + 3 + 5 * size, bx + off * (d.headR + 0.6 + 0.9 * size), top - 1];
    over(g, capsuleInS04(fx, fy, hx, hy, r, r), [Math.min(fx, hx) - r - 1, Math.min(fy, hy) - r - 1, Math.max(fx, hx) + r + 1, Math.max(fy, hy) + r + 1], c, dir === 'up' ? c.deep : null, { light: 1, clip: (px, py) => py < floor });
    const mx = Math.round((fx + hx) / 2 - 0.5), my = Math.round((fy + hy) / 2);
    g.rect(mx - 1, my, 3, 1, c.dark);                                                        // a band round its middle
    g.rect(Math.round(hx - 0.5), Math.round(hy - 0.5) - 1, 1, 2, glow.base);                 // the valve light at its top
  } else if (kind === 'antenna') {
    const h = Math.min(Math.max(3, Math.round(5 * size)), floor - top), rise = packRise(kind, size);
    const tipY = J.headTop - rise + 0.5;
    if (dir === 'side') {
      g.rect(Math.round(back) - 3, top, 4, h, c);
      g.line(back - 2, top, back - 4 - size - sway * 1.5, tipY, c.dark);
      g.rect(Math.floor(back - 4 - size - sway * 1.5), Math.floor(tipY) - 1, 1, 2, glow.base);
      g.dot(Math.round(back) - 2, top + 1, glow.base);
      return;
    }
    over(g, (px, py) => Math.abs(px - bx) < 3.5 && py >= top && py < top + h, [bx - 4, top, bx + 4, top + h], c, dir === 'up' ? c.deep : null);
    g.rect(x0 - 2, top + h - 2, 5, 1, c.dark);
    g.rect(x0 + off * 2, top + 1, 1, 1, glow.base);
    const tx = bx + off * (d.headR + 2 + size) + sway * 1.2;
    g.line(bx + off * 3, top, tx, tipY, c.dark);
    g.rect(Math.floor(tx), Math.floor(tipY) - 1, 1, 2, glow.base);
  } else if (kind === 'jet') {
    const pw = size < 0.85 ? 2 : size < 1.2 ? 3 : 4, y0 = top - 2, h = Math.max(2, Math.min(Math.round(6 * size), floor - 2 - y0));
    if (dir === 'side') {
      const x = Math.round(back) - pw - 1;
      g.rect(x, y0 + 1, pw + 2, h - 1, c, { light: 1 });
      g.rect(x + 1, y0, pw, 1, c.base);
      g.rect(x, y0 + h, pw, 1, c.deep);
      flame(x, y0 + h + 1, pw);
      g.rect(x + 1, y0 + 2, 1, 2, glow.base);
      return;
    }
    if (dir === 'up') {
      // the housing between the pods, over the back
      const hh = Math.max(3, Math.round(4 * size));
      over(g, (px, py) => Math.abs(px - bx) < 3.5 && py >= top && py < top + hh, [bx - 4, top, bx + 4, top + hh], c, c.deep);
      g.rect(x0 - 1, top + 1, 3, 1, glow.base);
    }
    const e = d.chestR + d.armW - 1;
    for (const sg of [-1, 1]) {
      const x = sg < 0 ? Math.round(bx - e) - pw : Math.round(bx + e);
      g.rect(x, y0 + 1, pw, h - 1, c, { light: 1 });
      g.rect(x + (pw > 2 ? 1 : 0), y0, pw > 2 ? pw - 2 : pw, 1, c.base);                       // a rounded top
      g.rect(x, y0 + h, pw, 1, c.deep);
      flame(x, y0 + h + 1, pw);
    }
  }
}

/** Draws the straps of a pack over the chest, for the `torso` hook: two down the front, one seen from the side, nothing from behind. opt: { colour }. */
export function packStraps(g, J, P, d, opt = {}) {
  const colour = opt.colour ?? '#6b7896', top = J.shoulderY + d.chin, len = Math.max(2, Math.round(J.hip[1]) - 3 - top);
  if (J.dir === 'up') return;
  if (J.dir === 'side') { g.rect(Math.round(J.neck[0] - Math.round(d.chestR * 1.7) / 2 + 0.3), top, 1, len, colour); return; }      // along the back, clear of the near arm
  const x = Math.floor(J.bx), half = Math.floor(d.chestR) - 1;
  g.rect(x - half, top, 1, len, colour); g.rect(x + half, top, 1, len, colour);
}

/** Draws one row of colour across the body, for the `torso` hook: a belt in its own colour, a stripe across the chest. opt: { colour, up (rows above the hip: 2 is a belt), mark (colour of a buckle or badge in its middle, or null) }. */
export function stripe(g, J, P, d, opt = {}) {
  band(g, J, d, opt.up ?? 2, opt.colour ?? '#3f6fd1', opt.mark ?? null);
}

/** Paints gloves over the hands; call it from the `offhand`, `torso` and `front` hooks with that hook's name as `layer`, and it paints the hands that are on top at that depth for the direction. opt: { colour, layer: 'offhand' | 'torso' | 'front' }. */
export function gloves(g, J, P, d, opt = {}) {
  const { colour = '#3f6fd1', layer = 'front' } = opt;
  const hand = (A, paint) => { const w = d.armW, x = w % 2 ? Math.floor(A.hand[0]) - (w - 1) / 2 : Math.round(A.hand[0]) - w / 2; g.rect(x, Math.round(A.hand[1]) - 1, w, 2, paint, { shade: 0 }); };
  if (J.dir === 'side') {
    if (layer === 'offhand') hand(J.armB, toneS04(colour, -0.6));
    if (layer === 'front') hand(J.armF, colour);
  } else if (layer === (J.dir === 'up' ? 'torso' : 'front')) { hand(J.armB, colour); hand(J.armF, colour); }
}

/** Draws the small lights of a suit or armour: one on the chest (not from behind) and one on each shoulder; call it from the `torso` hook and again from the `front` hook with `layer: 'front'` (the near shoulder of a side clip is drawn there). opt: { colour, layer: 'torso' | 'front', chest: false for none, shoulders: false for none }. */
export function suitLights(g, J, P, d, opt = {}) {
  const { layer = 'torso', chest = true, shoulders = true } = opt;
  const c = ramp(opt.colour ?? '#5fe0f0'), top = J.shoulderY + d.chin, dir = J.dir;
  if (dir === 'side') {
    if (layer === 'front') { if (shoulders) g.rect(Math.floor(J.armF.shoulder[0]) - 1, Math.round(J.armF.shoulder[1] - 0.5) - 1, 2, 1, c.base); return; }
    if (chest) { const x = Math.round(J.neck[0] - Math.round(d.chestR * 1.7) / 2 + 0.3) + Math.round(d.chestR * 1.7) - 2; g.rect(x, top + 1, 2, 2, c.base); g.dot(x + 1, top + 1, c.light); }
    return;
  }
  if (layer !== 'torso') return;
  if (shoulders) for (const [A, sg] of [[J.armF, J.s], [J.armB, -J.s]]) { const x = Math.floor(A.shoulder[0]); g.rect(Math.min(x, x + sg), Math.round(A.shoulder[1] - 0.5), 2, 1, c.base); }
  if (chest && dir === 'down') { const x = Math.floor(J.bx); g.rect(x - 1, top + 1, 3, 2, c.base); g.dot(x + 1, top + 1, c.light); }
}

/** The gun kinds heldGun() draws: blaster (a chunky sidearm with a lit cell), scatter (a wide double barrel on a stock), beam (a long emitter with rings and a lit tip). All are carried 'low'. */
export const GUN_KINDS = ['blaster', 'scatter', 'beam'];

/** The sizes { length, back, pad } in pixels of the gun kinds, as ITEMS has them for the standard kinds: length = hand to muzzle. No arguments: a frozen object. */
export const GUNS = Object.freeze({
  blaster: Object.freeze({ length: 8, back: 2, pad: 3 }),
  scatter: Object.freeze({ length: 9, back: 3, pad: 3.5 }),
  beam: Object.freeze({ length: 13, back: 3, pad: 3 }),
});

/** Returns the size { length, back, pad } of a gun kind at a length setting, or itemSize()'s answer for the standard kinds; null for 'none'. kind: a key of GUNS or ITEMS; scale: 1 = standard. */
export const gunSize = (kind, scale = 1) => (GUNS[kind] ? { length: GUNS[kind].length * scale, back: GUNS[kind].back, pad: GUNS[kind].pad } : itemSize(kind, scale));

/** Draws a held gun (blaster, scatter, beam) from an attach point, and hands every other kind to heldItem(). direction: 'down' | 'up' | 'side'; at: { x, y, angle, reach }; item: { kind, length, metal (colour or ramp), glow (colour of its lit cell and of a beam's tip, or none) }. */
export function heldGun(g, direction, at, item) {
  if (!GUNS[item.kind]) return heldItem(g, direction, at, item);
  const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#9aa6c0');
  const a = at.angle, r = at.reach ?? 1, len = item.length * r, hx = at.x, hy = at.y;
  const to = (dist, turn = 0, from = [hx, hy]) => reach(from[0], from[1], a + turn, dist);
  const under = direction === 'up' ? PI / 2 : -PI / 2;                 // the side the grip is on: away from the body
  const lit = typeof item.glow === 'string' ? item.glow : null;
  if (r < 0.7 && direction === 'down' && Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) > 0) {
    // pointing at the camera: seen end on, a short thick block with the muzzle in its face
    const wide = item.kind === 'scatter' ? 5 : item.kind === 'beam' ? 3 : 4, end = Math.max(len, 4.5), [tx, ty] = to(end), [ex, ey] = to(end - 0.5);
    // ringed with the outline colour where it lies over the body, so it stands out from a chest of any colour
    over(g, limbIn(hx, hy, tx, ty, wide), [Math.min(hx, tx) - wide, Math.min(hy, ty) - wide, Math.max(hx, tx) + wide, Math.max(hy, ty) + wide], metal, INK, { shade: 0 });
    const bore = (x, y, c) => { const [qx, qy] = to(1, PI, [x, y]); g.dot(x, y, c); g.dot(qx, qy, c); };      // two pixels deep
    if (item.kind === 'scatter') { for (const k of [-1, 1]) bore(...to(1.3, k * PI / 2, [ex, ey]), metal.deep); }
    else { const [qx, qy] = to(0.5, -PI / 2, [ex, ey]), [px, py] = to(0.5, PI / 2, [ex, ey]); bore(qx, qy, item.kind === 'beam' && lit ? lit : metal.deep); bore(px, py, item.kind === 'beam' && lit ? lit : metal.deep); }
    if (lit && item.kind !== 'beam') { const [lx, ly] = to(end - 3); g.dot(lx, ly, lit); }
    return;
  }
  if (item.kind === 'blaster') {
    const [bx, by] = to(2 * r, PI), [mx, my] = to(Math.max(2, len - 2.5)), [tx, ty] = to(len), [ux, uy] = to(2.6, under);
    g.limb(hx, hy, ux, uy, 2, metal.dark);                              // the grip
    g.limb(mx, my, tx, ty, 2, metal.dark);                              // the muzzle, with a bright tip
    g.dot(tx, ty, metal.light);
    g.limb(bx, by, mx, my, 3, metal);
    if (lit) { const [lx, ly] = to(len * 0.25), [kx, ky] = to(len * 0.25 + 1); g.dot(lx, ly, lit); g.dot(kx, ky, lit); }
  } else if (item.kind === 'scatter') {
    const [sx, sy] = to(3 * r, PI), [bx, by] = to(0.5, PI), [mx, my] = to(len * 0.4), [tx, ty] = to(len);
    g.limb(sx, sy, bx, by, 2, metal.dark);                              // the stock
    g.limb(mx, my, tx, ty, 3, { isRamp: true, light: metal.light, base: metal.light, dark: metal.base, deep: metal.dark });
    g.line(mx, my, tx, ty, metal.deep);                                 // the gap between its two barrels
    g.limb(bx, by, mx, my, 3, metal);
    const [px, py] = to(len * 0.62), [qx, qy] = to(2, under, [px, py]);
    g.line(px, py, qx, qy, metal.dark);                                 // the pump under the barrels
    if (lit) { const [lx, ly] = to(len * 0.18); g.dot(lx, ly, lit); }
  } else {
    const [sx, sy] = to(3 * r, PI), [mx, my] = to(len * 0.36), [tx, ty] = to(len), [ux, uy] = to(2.4, under, to(len * 0.12));
    g.limb(...to(len * 0.12), ux, uy, 2, metal.dark);                   // the grip
    g.limb(sx, sy, hx, hy, 2, metal.dark);
    g.line(mx, my, tx, ty, metal.light);                                // the emitter rod
    for (const k of [0.56, 0.78]) { const [ax, ay] = to(1.2, PI / 2, to(len * k)), [cx, cy] = to(1.2, -PI / 2, to(len * k)); g.line(ax, ay, cx, cy, metal.base); }      // its rings
    g.limb(hx, hy, mx, my, 3, metal);
    if (lit) { const [lx, ly] = to(len * 0.2); g.dot(lx, ly, lit); g.dot(tx, ty, lit); }
  }
}

/** How far a peaked cap rises above the top of the head, in pixels, for frame()'s `rise`. size: its Size setting. */
export const peakedCapRise = (size = 1) => Math.ceil(0.2 + 0.7 * size);

/** A soft cap with a peak, for the `head` hook (set look.hatted): a crown that puffs up with size, a peak over the brow going down and out in front from the side, a band round the back going up. opt: { size (0.5 to 1.8), colour }. */
export function peakedCap(g, J, P, d, opt = {}) {
  const { size = 1, colour = '#c8553a' } = opt;
  const c = ramp(colour), [cx, cy] = J.head, rx = d.headW / 2, ry = d.headH / 2, dir = J.dir, brim = J.brow - 1, x0 = Math.floor(cx);
  const crown = headIn(J, d, 0.2 + 0.7 * size), peak = 1 + Math.round(1.6 * size), box = [cx - rx - 3, cy - ry - 3, cx + rx + 3, brim];
  g.fill(...box, (px, py) => crown(px, py) && py < brim, c);
  if (dir === 'down') g.rect(x0 - 1 - peak, brim, 3 + 2 * peak, 1, c.dark);
  else if (dir === 'side') g.rect(Math.floor(cx + rx) - 2, brim - 1, 2 + peak, 2, c.dark, { shade: 0 });
  else g.fill(...box, (px, py) => crown(px, py) && py >= brim - 1 && py < brim, c.dark, { shade: 0 });
}

// ---- additions of batch S04 (void-ranger), continued ------------------------------------------------

/** Draws the flare of an energy shot at a muzzle: a four-point star with a hot centre and, when `ray` is set, a ray the way the gun points; call it AFTER the outline on the frame where the pose says `fire`, in place of muzzleFlash (give frame().finish `flash: false`). at: { x, y, angle }, the `muzzle` socket; opt: { size (the star's arms in pixels, default 2), colour, core (the colour of its centre), ray (false when the gun points at the camera) }. Never touches the frame edge. */
export function muzzleFlare(g, at, opt = {}) {
  const { size = 2, colour = '#5fe0f0', core = '#ffffff', ray = true } = opt;
  const put = (x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (x >= 1 && y >= 1 && x <= SIZE[0] - 2 && y <= SIZE[1] - 2) g.dot(x, y, c); };
  const ux = Math.sin(at.angle), uy = Math.cos(at.angle);
  const cx = Math.floor(at.x + ux * 1.5) + 0.5, cy = Math.floor(at.y + uy * 1.5) + 0.5;          // just beyond the muzzle
  if (ray) for (let r = 1; r <= size * 2 + 1; r += 0.5) put(cx + ux * r, cy + uy * r, colour);
  for (let i = size; i >= 1; i--) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(cx + dx * i, cy + dy * i, i === 1 ? core : colour);
  put(cx, cy, core);
}

// ---- additions of batch R05 (mage-walker, rogue-walker), continued: two manners for frameWith() -------

/** A manner for frameWith(): turns `run` into a low, leaning dash, the body dropped and tipped forward, both arms swept back and whatever the hands hold trailing behind. Arguments: P (the pose, changed in place), F (the frame: its action and direction), t (the clip phase, 0..1). */
export function dashManner(P, F, t) {
  if (F.action !== 'run') return;
  const c = Math.cos(TAU * t), side = F.direction === 'side';
  P.bob += 2; P.lean += 1; P.headDy += 1;
  P.armF = { f: -3.2 - 0.9 * c, u: 1.5, o: side ? 0 : 1.2 };
  P.armB = { f: -3.2 + 0.9 * c, u: 1.5, o: side ? 0 : 1.2 };
  P.item = side ? -0.95 + 0.12 * c : (F.direction === 'up' ? 1 : -1) * (0.95 + 0.1 * c);
}

/** A manner for frameWith(): in `walk`, a thing carried upright (a staff) is used as a walking stick, lifted with one step and planted with the next. Arguments: P (the pose, changed in place), F (the frame: its action, item and carry), t (the clip phase, 0..1). */
export function walkingStickManner(P, F, t) {
  if (F.action !== 'walk' || !F.item || F.carry !== 'upright') return;
  P.armF.u += 1.8 * Math.max(0, Math.sin(TAU * t));
}

/**
 * Adds the carry 'ready' to CARRY: a gun held at the hip, pointing ahead and a little down (side: 1.2, nearly level, with the hand
 * held forward; down and up: tip down and out). Pass carry: 'ready' to frame() or as m.carry to pose();
 * the weapon arm then swings less in `walk`, so the gun is carried steady. No arguments: a constant, the angles of the new carry.
 */
export const CARRY_READY = Object.freeze({ down: -0.6, up: 0.6, side: 1.2 });
CARRY.ready = CARRY_READY;
CARRY_HAND.ready = { side: { f: 2.5 } };

/** Draws the afterimage streaks of a dash: two bars that trail from a tucked body, opposite the way it faces (up the screen behind a body dashing at the camera, to the left in a side clip); call it AFTER the outline while the pose is tucked. J = what draw() returned; opt: { colour, core (the colour of the end nearest the body), length (pixels, default 8), fade (0..1: how far the dash has run; the bars shorten to nothing), rise (pixels the headgear stands above the head) }. Never touches the frame edge. */
export function dashStreaks(g, J, P, d, opt = {}) {
  const { colour = '#5fe0f0', core = '#ffffff', length = 8, fade = 0, rise = 0 } = opt;
  const len = Math.round(length * (1 - clamp(fade)));
  if (len < 1) return;
  const put = (x, y, c) => { if (x >= 1 && y >= 1 && x <= SIZE[0] - 2 && y <= SIZE[1] - 2) g.dot(x, y, c); };
  const at = (k) => (k < Math.max(1, len * 0.3) ? core : k >= len - 1 && len > 2 ? toneS04(colour, -1) : colour);
  const x0 = Math.floor(J.bx), far = Math.max(2, Math.floor(d.headR) - 2);
  for (const [i, sg] of [[0, -1], [1, 1]]) {
    const n = Math.max(1, len - i * 2);                                  // the second bar is a little shorter
    for (let k = 0; k < n; k++) for (const w of [0, 1]) {
      if (J.dir === 'side') put(Math.floor(J.neck[0] - d.chestR) - 3 - k, Math.round(J.shoulderY + d.chin) + (sg < 0 ? 0 : 5) + w, at(k));
      else if (J.dir === 'up') put(x0 + sg * far + (sg < 0 ? -w : w), J.gy + 2 + k, at(k));
      else put(x0 + sg * far + (sg < 0 ? -w : w), Math.floor(J.headTop - rise) - 2 - k, at(k));
    }
  }
}

// ---- additions of batch R06 (village-elder, merchant) ---------------------------------------------
// A frame with a pose or a body of its own: poseFrame (frameWith() plus a pose function and other measurements),
// gesture ('wave', 'count'), and two things to do in a manner: stoop (an old back; hunch draws it) and plantStick
// (a walking stick whose tip stands on the ground). Worn: baldingHair, circlet, turban (turbanRise for frame()'s
// `rise`), spectacles (the `head` hook); neck, apron (the `torso` hook); travelPack (the `behind` hook; packStraps
// goes with it); fingers (the `front` hook, with gesture 'count'); waveArm (the `front` hook, with gesture 'wave':
// the raised forearm and hand; waveHand says where they are; both are at the end of the file). Held: purse and
// scale (TRADE_ITEMS, tradeItemSize, tradeItem). Nothing above this line was changed.
import { ellipseIn as ellipseInR06, rectIn as rectInR06 } from '../engine/surface.js';

/**
 * Builds one frame like frameWith(), for a character with a pose or a body shape of its own: an action the standard table lacks, or other measurements.
 * clip, t, p and opt.item, rise, points, carry, tall, muzzle: as frame(). opt.pose: (action, direction, u, m, d) => P, or nothing for the standard pose (gesture() goes here);
 * opt.dims: (d) => d changes the measurements (longer arms); opt.manner: (P, F, u) => void or a list of them, as frameWith() (F: { action, direction, d, item }), applied before the one fit().
 * Returns the same F as frame(): { clip, action, direction, d, P, item, poseAt(u), sockets(), hand(J), draw(g, look, hooks), finish(g, { trail, flash, outline }) }.
 */
export function poseFrame(clip, t, p = {}, opt = {}) {
  const { action, direction } = parseClip(clip);
  let d = dims(p, { tall: opt.tall });
  if (opt.dims) d = opt.dims(d) ?? d;
  const item = opt.item && opt.item.length > 0 ? opt.item : null;
  const m = { bounce: p.bounce, stride: p.stride, armed: !!item, carry: opt.carry };
  const points = opt.points ?? (opt.rise ? (J) => [[J.head[0], J.headTop - opt.rise]] : null), manners = [].concat(opt.manner ?? []);
  const poseAt = (u) => {
    const P = opt.pose?.(action, direction, u, m, d) ?? pose(!item && action === 'attack' ? 'punch' : action, direction, u, m, d);
    for (const manner of manners) manner(P, { clip, action, direction, d, item }, u);
    return fit(direction, P, d, { item, points });
  };
  const P = poseAt(t);
  return {
    clip, action, direction, d, P, item, poseAt,
    sockets: () => {
      const J = solve(direction, P, d), out = sockets(J, P, d, { muzzle: opt.muzzle ?? item?.length }), H = waveHand(J, P, d);
      // a waving arm bends at the elbow: the off hand is the raised hand, not the end of the rig's arm
      if (H) { const x = H.x + H.w / 2, y = H.y + H.h / 2; out.offhand = { x, y, angle: Math.atan2(x - H.elbow[0], y - H.elbow[1]) }; }
      return out;
    },
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

/** The gestures gesture() can pose: 'wave' (a one-shot of 8 frames) and 'count' (a loop of 8 frames). */
export const GESTURES = ['wave', 'count'];

/**
 * Returns the pose of a gesture the standard actions lack, in pose()'s terms: 'wave' raises the free arm high, bent at the elbow, and swings the hand twice beside the head (it starts and ends standing; it sets P.wave, and waveArm() in the `front` hook draws the forearm and the hand); 'count' holds the free hand up and ticks off one, two, three fingers (P.count, drawn by fingers()).
 * action: one of GESTURES; direction, t (0..1), m, d: as pose(). Pass it as poseFrame()'s opt.pose for the clips that use it.
 */
export function gesture(action, direction, t, m = {}, d = dims()) {
  if (!GESTURES.includes(action)) throw new Error(`topdown rig: no gesture "${action}" (${GESTURES.join(', ')})`);
  const side = direction === 'side';
  const P = pose('idle', direction, 0, m, d);                 // standing: the frame every one-shot starts from and ends on
  P.blink = false;
  if (action === 'wave') {
    // 0 standing, 1 the arm goes up, 2 to 5 out, in, out, in, 6 it comes down, 7 standing
    const up = keys(t, [[0, 0], [0.286, 1], [0.714, 1], [1, 0]]);
    const swing = keys(t, [[0.143, 0], [0.286, 1], [0.429, -1], [0.571, 1], [0.714, -1], [0.857, 0]], (x) => x);
    // A straight arm cannot reach past a head this big without crossing the face, so the arm bends: the rig's own arm
    // is the upper arm, out beside the shoulder to the elbow (ahead of the chest seen from the side), and the forearm
    // and the open hand stand up from there, beside the head (P.wave; waveHand() places them, waveArm() draws them)
    const reach = d.headW / 2 + 5 - (side ? 0 : d.chestR + d.armW / 2 - 1);      // the elbow is under the hand's swing
    P.armB.u += (d.arm + 1.5) * up;
    if (side) P.armB.f = reach * up; else P.armB.o = reach * up;
    P.wave = { raise: up, swing };
    P.headDy = up > 0.5 ? -1 : 0;                             // the chin comes up
    P.mouth = up > 0.9 && swing > 0.5;                        // calling out on the two outward swings
    P.sway = swing * up;
  } else {
    // four beats: one, two, three fingers go up, then the hand closes; the mouth moves on frames 2 and 6
    const beat = Math.floor(fract(t) * 4 + 1e-6), early = fract(t * 4 + 1e-6) < 0.5, talk = fract(t * 2);
    P.count = (beat + 1) % 4;
    P.armB.u = d.arm - 1.5 + (P.count ? (early ? 1.5 : 0.5) : -0.5);      // the hand jerks up as each finger goes out
    P.armB.o = 4.5;
    P.armB.f = side ? 3 : 0;
    P.mouth = talk >= 0.5 && talk < 0.75;
    P.headDy = P.mouth ? 1 : 0;
    P.blink = t >= 0.5 && t < 0.62;
    P.sway = 0.5 * wave(fract(t));
  }
  if (m.carry === 'hang') { P.item = 0.12 * P.sway; P.reach = 1; }
  return P;
}

/**
 * Bends a pose forward into an old person's stoop: the shoulders tip forward, the knees give a little and the head sinks towards the chest. Call it from a manner (frameWith(), poseFrame()); hunch() draws the rounded back that goes with it.
 * P: the pose (changed in place and returned); direction: 'down' | 'up' | 'side'; amount: 0 (upright) to 1 (bent low). Sets P.stoop to the amount.
 */
export function stoop(P, direction, amount = 0.5) {
  const a = clamp(amount);
  if (P.lie || a <= 0) return P;
  if (direction === 'side') { P.lean += 3.2 * a; P.headDx = (P.headDx ?? 0) + 1.6 * a; P.headDy = (P.headDy ?? 0) + 2.2 * a; P.bob += 1.4 * a; }
  else { P.headDy = (P.headDy ?? 0) + 3 * a; P.bob += 2 * a; }
  P.stoop = a;
  return P;
}

/**
 * Draws the rounded back of a stooped body: a hump behind the neck seen from the side (the `torso` hook), and shoulders that rise over the bottom of the head seen from behind (the `front` hook). Nothing facing down.
 * g, J, P, d: as a hook gets them; opt: { colour (the cloth of the back), amount (0..1; default P.stoop), front: true when called from the `front` hook (it then draws only the view from behind; without it only the side view) }.
 */
export function hunch(g, J, P, d, opt = {}) {
  const a = clamp(opt.amount ?? P.stoop ?? 0);
  if (a < 0.15 || J.dir === 'down' || (J.dir === 'up') !== !!opt.front) return;
  const c = ramp(opt.colour ?? '#a8a4a0'), top = J.shoulderY + d.chin;
  if (J.dir === 'side') {
    const wide = Math.round(d.chestR * 1.7), x = J.neck[0] - wide / 2 + 0.6, rx = 1.2 + 1.6 * a, ry = 2.2 + 1.4 * a;
    g.ellipse(x, top + 1.6, rx, ry, c);
    return;
  }
  // the shoulders, rounded, up over the bottom of the head, and the back below them down to where the head ends
  const rx = d.chestR + d.armW - 0.6, ry = 0.8 + 2.6 * a, round = ellipseInR06(J.bx, top + 1, rx, ry), low = J.headTop + d.headH + 1;
  g.fill(J.bx - rx - 1, top - ry - 1, J.bx + rx + 1, low, (px, py) => (py < top + 1 ? round(px, py) : Math.abs(px - J.bx) < d.headW / 2 + 0.5), c.base, { shade: 0 });
}

/**
 * Plants a walking stick: puts the weapon hand on top of a stick whose tip stands on the ground beside the body, and in a walk lifts and plants it between the footfalls (in the air on frames 1 and 5 of 8, down on 2 and 6). A stick too short for the hand bends the knees. Call it from a manner (frameWith(), poseFrame()), after stoop().
 * P: the pose (changed in place and returned: armF, item, reach, bob); direction; d: dims; opt: { action, t (the frame's phase), length (the stick, hand to tip, in pixels), step (how far the tip travels each way, default 2), lift (how high it is lifted, default 2) }.
 */
export function plantStick(P, direction, d, opt = {}) {
  if (P.lie) return P;
  const { action = 'idle', t = 0, length = 11, step = 2, lift = 2 } = opt;
  const side = direction === 'side', up = direction === 'up';
  // the tip is a third foot that steps twice as often as the feet
  let f = 0, air = 0, far = 0;
  if (action === 'walk' || action === 'run') {
    const u = fract(2 * t);
    if (u < 0.5) { f = lerp(-step, step, smooth(u * 2)); air = lift * Math.sin(PI * u * 2); } else f = lerp(step, -step, (u - 0.5) * 2);
    far = K * (up ? step + f : step - f);                     // facing down or up, a tip that is further from the camera is higher on the screen
  }
  // the hand: out to its side (ahead of the body seen from the side), and still while the other arm swings
  const out = side ? 5 : 2;
  P.armF.o = side ? 0 : out; P.armF.f = side ? out : 0;
  const place = () => {
    P.armF.u = 0;
    const J = solve(direction, P, d), [sx, sy] = J.armF.shoulder, hx = J.armF.hand[0];
    const tip = side ? [sx + out + 1.5 + f, J.gy - 0.5 - air] : [sx + J.s * (out + 1.5), J.gy - 0.5 - air - far];
    const handY = tip[1] - Math.sqrt(Math.max(1, length * length - (tip[0] - hx) ** 2));      // where the hand must be for the stick to reach the ground
    const low = sy + Math.sqrt(Math.max(1, (d.arm + 1.2) ** 2 - out * out));                   // the lowest the hand can go
    P.armF.u = sy + d.arm - Math.min(handY, low);
    return { tip, short: handY - low };
  };
  let at = place();
  if (at.short > 0.5) { P.bob += Math.min(3, Math.round(at.short)); at = place(); }              // a short stick: the body comes down to it
  const [hx, hy] = solve(direction, P, d).armF.hand;
  P.item = Math.atan2(at.tip[0] - hx, at.tip[1] - hy);
  P.reach = Math.hypot(at.tip[0] - hx, at.tip[1] - hy) / length;
  return P;
}

/** Draws a bald crown ringed with hair, for the `head` hook (set look.hairStyle 'bald'): hair at the temples with a tuft over each ear facing down, a band round the back of the head facing away. opt: { colour }. */
export function baldingHair(g, J, P, d, opt = {}) {
  const c = ramp(opt.colour ?? '#f0ead8'), [cx, cy] = J.head, rx = d.headW / 2, ry = d.headH / 2, inH = headIn(J, d), box = headBox(J, d, 3);
  const top = J.brow - 2, bottom = J.brow + 3;
  if (J.dir === 'side') {
    g.fill(...box, (px, py) => inH(px, py) && py >= top + 1 && py < bottom + 1 && px < cx - rx * 0.4, c);
    g.ellipse(cx - rx + 0.2, J.brow + 1.5, 1.6, 2.1, c);
    return;
  }
  if (J.dir === 'up') g.fill(...box, (px, py) => inH(px, py) && py >= cy - 1.5 && py < cy + ry * 0.55, c);
  else g.fill(...box, (px, py) => inH(px, py) && py >= top && py < bottom && Math.abs(px - cx) > rx - 2.2, c);
  for (const sg of [-1, 1]) g.ellipse(cx + sg * (rx - 0.2), J.brow + 0.5, 1.6, 2.1, c);
}

/** Draws a circlet, for the `head` hook: a thin band of metal round the brow with a stone at the front, hair or skin showing above it. opt: { size (0.5 to 1.8: a deeper band and a bigger stone), metal, gem (colour, or null for none) }. */
export function circlet(g, J, P, d, opt = {}) {
  const { size = 1, gem = null } = opt;
  const m = ramp(opt.metal ?? '#f2c230'), [cx] = J.head, rx = d.headW / 2, dir = J.dir, inH = headIn(J, d, 0.6), box = headBox(J, d, 2);
  const deep = size >= 1.25 ? 2 : 1, y1 = J.brow - 1, y0 = y1 - deep;
  g.fill(...box, (px, py) => inH(px, py) && py >= y0 && py < y1, m.base, { shade: 0 });
  if (deep > 1) g.fill(...box, (px, py) => inH(px, py) && py >= y1 - 1 && py < y1, m.dark, { shade: 0 });
  g.fill(...box, (px, py) => inH(px, py) && py >= y0 && py < y0 + 1 && px > cx + rx * 0.2, m.light, { shade: 0 });      // lit from the top right
  if (!gem || dir === 'up') return;
  const w = size < 0.8 ? 1 : size < 1.5 ? 2 : 3, h = deep + (w > 1 ? 1 : 0);
  const x = dir === 'side' ? Math.floor(cx + rx) - w : Math.floor(cx) - Math.floor((w - 1) / 2);
  g.rect(x, y1 - h, w, h, gem, { shade: 0 });
}

/** Returns how far a turban() rises above the top of the head, in pixels, for frame()'s `rise`. size: its Size setting. */
export const turbanRise = (size = 1) => 2 + 2 * size;

/** Draws a turban, for the `head` hook (set look.hatted): wound cloth that bulges wider than the head, with the lines of its folds, a jewel at the front and a short loose end behind (seen from the side). opt: { size (0.5 to 1.8: taller and wider), colour, band (colour of the cap that shows along its lower edge, or null), jewel (colour, or null for none) }. */
export function turban(g, J, P, d, opt = {}) {
  const { size = 1, colour = '#f0ead8', band: under = null, jewel = '#f2c230' } = opt;
  const c = ramp(colour), [cx, cy] = J.head, rx = d.headW / 2, dir = J.dir, sway = P.sway ?? 0;
  const edge = dir === 'up' ? Math.round(cy) + 1 : J.brow - 1, top = J.headTop - Math.round(turbanRise(size));
  const wide = rx + 0.7 + 0.5 * size, my = (top + edge) / 2 + 0.3, ry = edge - my + 0.6, shell = headIn(J, d, 0.5);
  const body = (px, py) => py < edge && py >= top && (shell(px, py) || Math.abs((px - cx) / wide) ** 2.4 + Math.abs((py - my) / ry) ** 2.4 <= 1);
  const box = [cx - wide - 4, top - 1, cx + wide + 3, edge + 8];
  // the loose end first, so the wound cloth lies over where it is tucked in
  const tail = 1.5 + 1.5 * size;
  if (dir === 'side') g.capsule(cx - wide + 1.2, edge - 1.5, cx - wide + 0.2 - sway, edge + tail, 1.3, 0.9, c);
  g.fill(...box, body, c, { shade: 2 });
  // the folds: the cloth is wound in layers round its knot (at the middle of the brow; at the crown, seen from behind)
  const [kx, ky] = dir === 'side' ? [cx + wide - 1.5, edge - 1] : dir === 'up' ? [cx, top + 0.5] : [cx, edge - 1];
  const fold = (px, py) => { const v = Math.hypot((px - kx) / 1.5, py - ky); return Math.abs(v - 2.6) < 0.5 || Math.abs(v - 5.2) < 0.5; };
  g.fill(...box, (px, py) => body(px, py) && body(px, py - 1) && body(px - 1, py) && body(px + 1, py) && fold(px, py), c.dark, { shade: 0 });
  if (under) g.fill(...box, (px, py) => body(px, py) && !body(px, py + 1), under, { shade: 0 });
  if (!jewel || dir === 'up') return;
  const w = size > 1.3 ? 3 : 1;
  if (dir === 'side') g.rect(Math.floor(cx + wide) - 2, edge - 3, 2, 2, jewel, { shade: 0 });
  else g.rect(Math.floor(cx) - (w - 1) / 2, edge - 3, w, 2, jewel, { shade: 0 });
}

/** Draws round spectacles, for the `head` hook: two rings joined across the nose facing down (9 to 11 px across), one ring and its arm facing sideways, nothing facing away. opt: { frame (colour of the wire), lens (colour of the glint on each glass) }. */
export function spectacles(g, J, P, d, opt = {}) {
  const { frame: wire = '#5a5f7a', lens = '#f0ead8' } = opt;
  if (J.dir === 'up') return;
  const col0 = Math.floor(J.head[0]), ex = d.headW >= 13 ? 3 : 2, ey = J.brow + 1;
  // one glass: the eye keeps its column, the glint is on the column outside it (sg: which way is outside)
  const glass = (x, sg) => {
    const x0 = Math.min(x, x + sg);
    g.rect(x0, ey - 1, 2, 1, wire); g.rect(x0, ey + 2, 2, 1, wire);
    g.rect(x0 - 1, ey, 1, 2, wire); g.rect(x0 + 2, ey, 1, 2, wire);
    g.dot(x + sg, ey, lens);
  };
  if (J.dir === 'side') {
    glass(col0 + ex, 1);
    g.rect(col0 - 2, ey, ex + 1, 1, wire);                     // the arm, back to the ear
    return;
  }
  glass(col0 - ex, -1); glass(col0 + ex, 1);
  g.rect(col0 - ex + 2, ey, 2 * ex - 3, 1, wire);              // the bridge
}

/** Draws the neck of a head carried high, for the `torso` hook: skin in the chin's shadow from under the head to the collar. Raise the head first (P.headDy below 0, in a manner); with no gap it draws nothing. opt: { skin }. */
export function neck(g, J, P, d, opt = {}) {
  const c = ramp(opt.skin ?? '#f6d3b0'), y0 = J.headTop + d.headH, y1 = J.shoulderY + d.chin - 1;
  if (y1 <= y0) return;
  g.rect(Math.floor(J.dir === 'side' ? J.neck[0] + 0.5 : J.bx) - 1, y0 - 1, 3, y1 - y0 + 2, c.dark, { shade: 0 });
}

/** Draws an apron, for the `torso` hook: a bib on the chest and a panel down the legs, narrower than the body, with a tie at the waist and a pocket facing down; its front edge facing sideways; only its strings and bow facing away. opt: { colour, length (0..1: how far down the legs it comes; default 0.7) }. */
export function apron(g, J, P, d, opt = {}) {
  const { colour = '#c8553a', length = 0.7 } = opt;
  const c = ramp(colour), dir = J.dir, hip = Math.round(J.hip[1]), top = J.shoulderY + d.chin + 1, waist = hip - 3;
  const hemY = Math.max(hip + 1, Math.min(J.gy - 3, hip + Math.round((J.gy - hip) * clamp(length))));
  const x = Math.floor(J.bx), half = Math.floor(d.chestR);
  if (dir === 'side') {
    const wide = Math.round(d.chestR * 1.7), y0 = J.shoulderY + d.chin - 1;
    const front = (py) => Math.round(lerp(J.neck[0], J.hip[0], clamp((py - y0) / (hip - y0))) - wide / 2 + 0.3) + wide;      // the first column in front of the chest
    g.fill(J.bx - 10, top, J.bx + 12, hemY, (px, py) => py >= top && py < hemY && px >= front(Math.min(py, hip)) - 2 && px < front(Math.min(py, hip)) + 1, c);
    const back = front(waist) - wide;
    g.rect(back, waist, wide - 2, 1, c.dark, { shade: 0 });
    g.rect(back - 1, waist, 1, 2, c.base, { shade: 0 });                 // the bow, behind
    return;
  }
  if (dir === 'up') {
    g.rect(x - half, waist, 2 * half + 1, 1, c.base, { shade: 0 });      // the strings
    g.rect(x - 1, waist, 3, 1, c.dark, { shade: 0 });                    // the bow and its two ends
    g.rect(x - 1, waist + 1, 1, 2, c.base, { shade: 0 }); g.rect(x + 1, waist + 1, 1, 2, c.base, { shade: 0 });
    return;
  }
  const bib = Math.max(2, half - 2), skirt = Math.max(bib, half - 1);
  g.blob([rectInR06(x - bib, top, 2 * bib + 1, waist - top), rectInR06(x - skirt, waist, 2 * skirt + 1, hemY - waist)], c);
  g.rect(x - bib, top - 1, 1, 1, c.base, { shade: 0 }); g.rect(x + bib, top - 1, 1, 1, c.base, { shade: 0 });      // the straps over the shoulders
  g.rect(x - skirt, waist, 2 * skirt + 1, 1, c.dark, { shade: 0 });      // the tie
  if (hemY - waist > 5) g.rect(x, waist + 3, 3, 1, c.dark, { shade: 0 });      // a pocket
}

/** The kinds travelPack() can draw: a framed backpack, a wooden crate, a tied sack. */
export const TRAVEL_PACK_KINDS = ['backpack', 'crate', 'sack'];

/**
 * Draws a traveller's pack carried on the back over the shoulder of the weapon hand, for the `behind` hook (packStraps() draws its straps): beside the head facing down, over the back facing away, behind the body facing sideways; never taller than the head. A rolled rug can lie across its top and a lantern hang from it.
 * g, J, P, d: as a hook gets them; opt: { kind: one of TRAVEL_PACK_KINDS, size (0.65 to 1.35), colour (the cloth of a backpack or sack), wood (the frame or the crate, and the lantern's fittings), rug (colour of the roll, or null), lantern (colour of its light, or null) }.
 */
export function travelPack(g, J, P, d, opt = {}) {
  const { kind = 'backpack', size = 1, colour = '#c9a06a', wood = '#9a6a3e', rug = null, lantern = null } = opt;
  if (!TRAVEL_PACK_KINDS.includes(kind)) return;
  const c = ramp(colour), w = ramp(wood), dir = J.dir, sway = P.sway ?? 0;
  const shoulder = J.shoulderY + d.chin, bottom = Math.round(J.hip[1]);
  const top = Math.max(J.headTop + 4, shoulder - Math.round((kind === 'crate' ? 2 : 4) * size));      // a crate is squat; the others reach the ears
  // the box the pack fills, in whole pixels: [x0, x1) by [top, bottom); `outer` is its free side (-1 left, 1 right)
  let x0, x1, outer;
  if (dir === 'side') { x1 = Math.round(J.neck[0] - d.chestR * 0.85) + 1; x0 = x1 - Math.round(5 + 2 * size); outer = -1; }
  else { outer = J.s; const mid = Math.floor(J.bx) + outer * 4, wide = Math.round(9 + 3 * size); x0 = mid - Math.floor(wide / 2); x1 = x0 + wide; }
  const W = x1 - x0, H = bottom - top, mx = (x0 + x1) / 2;
  if (kind === 'crate') {
    g.rect(x0, top, W, H, w, { shade: 2 });
    g.rect(x0, top, W, 1, w.dark, { shade: 0 }); g.rect(x0, bottom - 1, W, 1, w.dark, { shade: 0 });
    g.rect(x0, top, 1, H, w.dark, { shade: 0 }); g.rect(x1 - 1, top, 1, H, w.dark, { shade: 0 });
    for (let y = top + 3; y < bottom - 2; y += 3) g.rect(x0 + 1, y, W - 2, 1, w.dark, { shade: 0 });      // the planks
  } else if (kind === 'sack') {
    g.blob([ellipseInR06(mx, top + H * 0.56, W / 2, H * 0.48), rectInR06(Math.floor(mx) - 1, top - 1, 3, 3)], c, { shade: 2 });
    g.rect(Math.floor(mx) - 1, top + 1, 3, 1, w.dark, { shade: 0 });                                       // the cord round its neck
    g.rect(x0 + 2, top + Math.round(H * 0.55), 2, 2, c.dark, { shade: 0 });                                // a patch
  } else {
    // a bag on a wooden frame whose two poles stand above it
    g.rect(x0, top - 2, 1, H + 2, w.dark, { shade: 0 }); g.rect(x1 - 1, top - 2, 1, H + 2, w.dark, { shade: 0 });
    g.rect(x0 + 1, top, W - 2, H, c, { shade: 2 });
    const flap = top + Math.max(2, Math.round(H * 0.35));
    g.rect(x0 + 1, flap, W - 2, 1, c.dark, { shade: 0 });
    g.dot(Math.floor(mx), flap + 1, w.dark);                                                               // the buckle
  }
  if (rug) {
    // a roll lying across the top (seen end-on from the side), a ring of its darker tone at each end
    const r = ramp(rug), ry = top - (kind === 'sack' ? 0.5 : 1.5);
    if (dir === 'side') { g.ellipse(mx, ry, 2.4, 2.4, r.base, { shade: 0 }); g.dot(Math.floor(mx), Math.floor(ry), r.dark); }
    else {
      const a = x0 - (outer < 0 ? 1.5 : 0) + 1.5, b = x1 + (outer > 0 ? 1.5 : 0) - 1.5;
      g.capsule(a, ry, b, ry, 2.1, 2.1, r.base, { shade: 0 });
      for (let sx = Math.round(a) + 1; sx < b; sx += 3) g.rect(sx, Math.round(ry - 2), 1, 4, r.dark, { shade: 0 });
    }
  }
  if (lantern) {
    // a small lantern on a hook at the pack's free side
    const lx = (outer > 0 ? x1 : x0 - 1) + Math.round(sway * 0.6) * (dir === 'side' ? -1 : 1), ly = top + 3, light = ramp(lantern);
    g.rect(outer > 0 ? x1 - 1 : x0 - 1, top + 1, 2, 1, w.dark, { shade: 0 });
    g.rect(lx, top + 1, 1, 2, w.dark, { shade: 0 });
    g.rect(lx - 1, ly, 3, 1, w.dark, { shade: 0 });
    g.rect(lx - 1, ly + 1, 3, 2, light.base, { shade: 0 });
    g.rect(lx - 1, ly + 3, 3, 1, w.dark, { shade: 0 });
  }
}

/** Draws the raised fingers of the free hand, for the `front` hook: one to three thin fingers above the fist, a pixel apart so they can be counted. opt: { skin, count (default P.count, which gesture('count') sets) }. */
export function fingers(g, J, P, d, opt = {}) {
  const n = Math.min(3, Math.round(opt.count ?? P.count ?? 0));
  if (!(n > 0) || P.lie) return;
  const c = ramp(opt.skin ?? '#f6d3b0'), A = J.armB, w = d.armW;
  const x = w % 2 ? Math.floor(A.hand[0]) - (w - 1) / 2 : Math.round(A.hand[0]) - w / 2, y = Math.round(A.hand[1]) - 1;      // the fist, as the rig draws it
  const mid = x + Math.floor((w - 1) / 2), tone = J.dir === 'side' ? c.dark : c.base;
  for (let i = 0; i < n; i++) g.rect(mid - 2 + 2 * i, y - 2, 1, 2, tone, { shade: 0 });
}

/** The sizes { length, back, pad, hangs } in pixels of the trade goods tradeItem() draws, both hanging from the hand: purse (hand to the bottom of the bag) and scale (hand to its pans). No arguments: a frozen object. */
export const TRADE_ITEMS = Object.freeze({
  purse: Object.freeze({ length: 7, back: 0, pad: 3, hangs: true }),
  scale: Object.freeze({ length: 8, back: 0, pad: 5.5, hangs: true }),
});

/** Returns the size { length, back, pad, hangs } of a trade good at a size setting, or smallItemSize()'s answer for every other kind; null for 'none'. kind: a key of TRADE_ITEMS, SMALL_ITEMS or ITEMS; scale: 1 = standard. */
export const tradeItemSize = (kind, scale = 1) => (TRADE_ITEMS[kind] ? { length: TRADE_ITEMS[kind].length * scale, back: 0, pad: TRADE_ITEMS[kind].pad * scale, hangs: true } : smallItemSize(kind, scale));

/** Draws a trade good hanging from the hand (a coin purse, or a balance scale whose beam tips as it swings), and hands every other kind to smallItem(). direction: 'down' | 'up' | 'side'; at: { x, y, angle, reach }; item: { kind, length, metal (the scale), wood (the purse's leather), hilt (the coins) }. */
export function tradeItem(g, direction, at, item) {
  if (!TRADE_ITEMS[item.kind]) return smallItem(g, direction, at, item);
  const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#f2c230');
  const len = item.length * (at.reach ?? 1), x = Math.floor(at.x), y = Math.round(at.y), lean = Math.sin(at.angle);
  if (item.kind === 'purse') {
    const leather = ramp(item.wood ?? '#9a6a3e'), r = Math.max(1.9, len * 0.36), cx = x + 0.5 + Math.round(lean * len), cy = at.y + len - r;
    g.line(at.x, at.y, cx, cy - r, leather.dark);                                         // the drawstring
    g.ellipse(cx, cy, r, r, leather, { light: 1 });
    g.rect(Math.floor(cx) - 1, Math.round(cy - r) - 1, 3, 1, item.hilt ?? '#f2c230', { shade: 0 });      // coins at its mouth
    g.rect(Math.floor(cx) - 1, Math.round(cy - r), 3, 1, leather.dark, { shade: 0 });     // the gathered neck
    return;
  }
  // scale: a ring in the hand, a beam under it, a pan on two strings at each end
  // it never hangs level: one pan is a pixel or two lower, and they change places as it swings
  const half = Math.max(3, Math.round(len * 0.55)), drop = Math.max(2, Math.round(len * 0.5) - 2), tip = lean < -0.03 ? -1 : 1;
  g.rect(x, y, 1, 2, metal.dark, { shade: 0 });
  g.line(x - half + 0.5, y + 2.5 - tip, x + half + 0.5, y + 2.5 + tip, metal.base);
  for (const sg of [-1, 1]) {
    const ex = x + sg * half, ey = y + 2 + sg * tip;
    g.rect(ex, ey + 1, 1, drop, metal.dark, { shade: 0 });
    g.rect(ex - 2, ey + 1 + drop, 5, 1, metal.base, { shade: 0 });
    g.rect(ex - 1, ey + 2 + drop, 3, 1, metal.dark, { shade: 0 });
  }
}

/** Draws a stripe down the middle of the back, for the `torso` hook: from the collar to the belt, seen only from behind (a pack drawn by the `behind` hook covers it). opt: { colour, wide (pixels across: 1 or 3, default 1) }. */
export function spine(g, J, P, d, opt = {}) {
  if (J.dir !== 'up') return;
  const top = J.shoulderY + d.chin, wide = opt.wide === 3 ? 3 : 1;
  g.rect(Math.floor(J.bx) - (wide - 1) / 2, top, wide, Math.max(2, Math.round(J.hip[1]) - 2 - top), opt.colour ?? '#3f6fd1');
}

// ---- additions of batch R06, continued: the bent arm of gesture('wave') ------------------------------

/**
 * Returns where the raised forearm and the open hand of a waving free arm are, in frame pixels, or null when the pose is not waving: the rig's own arm ends at the elbow, the forearm stands up from there, and the hand is held beside the head with its top above the eyes and at least one free column between it and the head (seen from the side: in front of the face).
 * J: the solved joints; P: a pose with P.wave = { raise (0 hanging to 1 up), swing (-1 in to 1 out), clear (optional: more columns to stay out from the head, for a hat with a wide brim; a manner sets it) }, as gesture('wave') sets it; d: dims. Placed from the head as it is in J, so a head a manner has lifted is followed.
 * Returns { elbow: [x, y], wrist: [x, y], x, y, w, h (the hand: left column, top row, width and height, whole pixels), out (-1 | 1: which way on the screen the hand swings out) }.
 */
export function waveHand(J, P, d) {
  const wv = P.wave;
  if (!wv || !(wv.raise > 0) || P.lie) return null;
  const r = clamp(wv.raise), swing = clamp(wv.swing ?? 0, -1, 1), out = J.dir === 'side' ? 1 : -J.s;
  const [ex, ey] = J.armB.hand, w = 3, h = 3;
  // fully raised: 'in' the hand is 3 columns clear of the head (room for a ponytail or a hat's edge and the outline), 'out' 3 more;
  // its top is a row above the brow coming in and on the brow going out, so it is never below the eyes
  const cx1 = J.head[0] + out * (d.headW / 2 + 6 + 1.5 * swing + Math.max(0, Math.round(wv.clear ?? 0))), top1 = J.brow - 1 + (swing > 0 ? 1 : 0);
  // on the way up and down the hand is part of the way from the end of the arm to there
  const x = Math.floor(lerp(ex, cx1, r)) - 1, y = Math.round(lerp(ey - 2, top1, r));
  return { elbow: [ex, ey], wrist: [x + w / 2, y + h + 0.5], x, y, w, h, out };
}

/**
 * Draws the raised forearm and the open hand of a waving free arm, for the `front` hook (it is what gesture('wave') needs drawn): the fist the rig drew at the end of its arm becomes the elbow, a sleeve stands up from it, and a 3 x 3 hand tops it with the cuff under it on the wrist. Nothing when the pose is not waving. Seen from the side it is the far arm, a tone down.
 * g, J, P, d: as a hook gets them; opt: { sleeve (colour of the arm's cloth: look.top), skin, cuff (colour of the band at the wrist, as look.cuffs, or nothing for none) }.
 */
export function waveArm(g, J, P, d, opt = {}) {
  const H = waveHand(J, P, d);
  if (!H) return;
  const far = J.dir === 'side', aw = d.armW;
  const sleeve = far ? dim(ramp(opt.sleeve ?? '#3f6fd1')) : ramp(opt.sleeve ?? '#3f6fd1'), skin = far ? dim(ramp(opt.skin ?? '#f6d3b0')) : ramp(opt.skin ?? '#f6d3b0');
  const cuff = opt.cuff ? ramp(opt.cuff) : null, [ex, ey] = H.elbow, [wx, wy] = H.wrist;
  // the fist (and the cuff above it) at the end of the rig's arm, as fist() places it: now cloth
  const fx = aw % 2 ? Math.floor(ex) - (aw - 1) / 2 : Math.round(ex) - aw / 2, fy = Math.round(ey) - 1;
  g.rect(fx, fy - 1, aw, 3, sleeve.base, { shade: 0 });
  g.fill(Math.min(ex, wx) - 3, Math.min(ey, wy) - 3, Math.max(ex, wx) + 3, Math.max(ey, wy) + 3, limbIn(ex, ey, wx, wy, aw), sleeve);
  g.rect(H.x, H.y + H.h, H.w, 1, cuff ? (far ? cuff.dark : cuff.base) : sleeve.base, { shade: 0 });
  g.rect(H.x, H.y, H.w, H.h, skin.base, { shade: 0 });
}

// ---- additions of batch S04 (void-ranger), fix round 1: a long gun carried in both hands -------------
// The carry 'braced' (CARRY_BRACED); holdWith, which puts the free hand on what the weapon hand holds; bracedManner,
// the manner that does it for every standing action; bracedFrame, the one call a sprite makes (its F.grip(J) is where
// the free hand is when the body hides its arm); handAt, a gloved hand at a point; backOver, for a body seen from
// behind whose arms reach in front of it; and drawOver, which rims a thing where it lies over the body. Nothing above
// this line was changed: the carry 'ready' is still the one-handed hip carry (for a body whose other hand holds a shield).

/**
 * The angles of the carry 'braced', added to CARRY: a long gun held in both hands, pointing the way the body faces. No arguments: a constant.
 * down: across the belly, tip down and towards the free side; up: tip up and out, beside the weapon shoulder; side: level, a little down.
 * Pass carry: 'braced' with bracedManner to frameWith(), or call bracedFrame(), which does both.
 */
export const CARRY_BRACED = Object.freeze({ down: -0.7, up: PI - 0.5, side: PI / 2 - 0.15 });
CARRY.braced = CARRY_BRACED;

/**
 * Puts the free hand on what the weapon hand holds: sets P.armB so that hand lands on the held thing, and where the arm is too short the weapon hand brings the thing across the body until it reaches.
 * P: the pose (changed in place); direction: 'down' | 'up' | 'side'; d: dims.
 * opt: { along (pixels from the weapon hand along the thing to where the free hand grips, default 3; negative = behind the hand),
 *        beside (pixels to the free hand's side of the thing's centre line, default 0), slack (how far from that point the free hand may stay, default 1),
 *        give (the most the weapon hand may move for it, default 4; 0 = the free arm only reaches as far as it can) }.
 * Returns the distance left between the free hand and the point it was to grip, in pixels (0 for a body lying down, which is left alone).
 */
export function holdWith(P, direction, d, opt = {}) {
  const { along = 3, beside = 0, slack = 1, give = 4 } = opt;
  if (P.lie) return 0;
  const side = direction === 'side';
  let gap = 0, moved = 0;
  for (let i = 0; i < 8; i++) {
    const J = solve(direction, P, d), r = P.reach ?? 1, [hx, hy] = J.armF.hand, [sx, sy] = J.armB.shoulder;
    const ux = Math.sin(P.item), uy = Math.cos(P.item);
    let nx = uy, ny = -ux;                                              // across the thing, towards the free shoulder
    if ((sx - hx) * nx + (sy - hy) * ny < 0) { nx = -nx; ny = -ny; }
    const tx = hx + ux * along * r + nx * beside, ty = hy + uy * along * r + ny * beside;
    P.armB = side ? { f: tx - sx, u: d.arm - (ty - sy), o: 0 } : { f: 0, u: d.arm - (ty - sy), o: -J.s * (tx - sx) };
    const [bx, by] = solve(direction, P, d).armB.hand, gx = bx - tx, gy = by - ty;
    gap = Math.hypot(gx, gy);
    if (gap <= slack || moved >= give - 0.01) break;
    const k = Math.min(gap - slack * 0.7, give - moved) / gap;          // the weapon hand gives way by what is missing
    const [wx, wy] = J.armF.hand;
    if (side) P.armF.f += gx * k; else P.armF.o += J.s * gx * k;
    P.armF.u -= gy * k;
    const [vx, vy] = solve(direction, P, d).armF.hand, went = Math.hypot(vx - wx, vy - wy);
    // at the end of its own reach the weapon arm cannot give sideways: both hands come up instead, where arms reach further across
    if (went < 0.5 * gap * k) { P.armF.u += 1; moved += 1; } else moved += went;
  }
  return gap;
}

/**
 * A manner for frameWith() and poseFrame(), for a long gun under carry 'braced': in idle, walk, run, shoot, dodge and talk both hands stay on the gun, and `hurt` ends back in that hold.
 * The weapon hand holds the grip and the free hand the fore-end; a shot is aimed from that hold and returns to it, so no frame turns the gun far. Other actions are left as the pose has them.
 * Facing away the gun is beside the body and the free arm goes round the front of it, out of sight: the pose then carries P.grip = { along, beside }, the place on the gun
 * where that hand is (bracedFrame() reports it as the `offhand` socket and backOver() hides the arm).
 * Arguments: P (the pose, changed in place), F (the frame: its action, direction, d and item), t (the clip phase, 0..1).
 */
export function bracedManner(P, F, t) {
  const a = F.action, dir = F.direction;
  if (!F.item || P.lie || !['idle', 'walk', 'run', 'shoot', 'dodge', 'hurt', 'talk'].includes(a)) return;
  const side = dir === 'side', up = dir === 'up', d = F.d, len = F.item.length;
  // where the weapon hand holds the grip at rest, from hanging: the elbow bent, the hand in front of its own hip (from behind: out beside it)
  const home = side ? { f: 2.5, u: 0.35 * d.arm, o: 0 } : up ? { f: 1.5, u: 0.25 * d.arm, o: 2.5 } : { f: 1, u: 0.4, o: -2.5 };
  const near = side || up ? 1 : 0.9;                                    // pointing a little at the camera, it looks shorter
  const aim = a === 'shoot' ? keys(t, [[0, 1], [0.7, 1], [1, 0]]) : 0;
  const part = a === 'idle' || a === 'shoot' ? 1 : a === 'hurt' ? 0.4 : a === 'dodge' ? 0.5 : 0.25;      // how much of the pose's own arm movement is kept
  const own = P.armF, ownB = P.armB, w = 1 - aim;
  P.armF = { f: home.f * w + own.f * part, u: home.u * w + own.u * part, o: home.o * w + own.o * part };
  if (a === 'dodge') P.item = CARRY_BRACED[dir];                       // clutched through the roll
  P.reach = (P.reach ?? 1) * lerp(near, 1, aim);
  if (up) {
    // the free arm reaches round the front of the body as far as it goes; its hand is on the fore-end, past what the body hides
    P.grip = { along: Math.min(0.45 * len, 4), beside: 0 };
    holdWith(P, dir, d, { along: P.grip.along, give: 0 });
  } else if (side) holdWith(P, dir, d, { along: Math.min(0.5 * len, 4.5) });
  // aimed at the camera the gun is seen end on and the free hand is beside it
  else holdWith(P, dir, d, { along: lerp(-0.7 * (F.item.back ?? 2), 1.5, aim), beside: 1.5, slack: 0.4 });
  if (a === 'hurt') {
    // the blow knocks the free hand off and throws both arms out, as the pose has them; they come back to the hold as it ends
    const loose = keys(t, [[0, 0.7], [0.33, 1], [1, 0]]), mixArm = (A, B) => ({ f: lerp(A.f, B.f, loose), u: lerp(A.u, B.u, loose), o: lerp(A.o, B.o, loose) });
    P.armF = mixArm(P.armF, own); P.armB = mixArm(P.armB, ownB);
    if (P.grip && loose > 0.5) delete P.grip;
  }
}

/**
 * One frame of a character who carries a long gun in both hands: frameWith() under the carry 'braced' with bracedManner, so a sprite makes one call.
 * clip, t, p, opt: as frame() (opt.item: gunSize(kind, scale); opt.manner: further manners, applied after). With nothing held, and in `die`
 * (the gun is let go), it is the one-handed frame under opt.carry (default 'ready').
 * Returns the same F as frame(), and F.grip(J): inside a hook, the point { x, y, angle } where the free hand holds the gun when its arm is hidden by the body
 * (facing away), or null when the hand is where the arm puts it. F.sockets().offhand is that same point.
 */
export function bracedFrame(clip, t, p = {}, opt = {}) {
  const held = opt.item && opt.item.length > 0 && parseClip(clip).action !== 'die';
  if (!held) return Object.assign(frameWith(clip, t, p, { ...opt, carry: opt.carry ?? 'ready' }), { grip: () => null });
  const F = frameWith(clip, t, p, { ...opt, carry: 'braced', manner: [bracedManner, ...[].concat(opt.manner ?? [])] });
  const at = (hand) => {
    const G = F.P.grip;
    if (!G || F.P.lie) return null;
    const r = hand.reach ?? 1, ux = Math.sin(hand.angle), uy = Math.cos(hand.angle);
    return { x: hand.x + ux * G.along * r + uy * G.beside, y: hand.y + uy * G.along * r - ux * G.beside, angle: hand.angle };
  };
  const plain = F.sockets;
  F.grip = (J) => at(F.hand(J));
  F.sockets = () => { const out = plain(), g = at(out.hand); if (g) out.offhand = g; return out; };
  return F;
}

/** Paints a hand at a point, the block the rig draws for a fist: for a hand that is not at the end of a drawn arm (bracedFrame()'s F.grip(J)). g: the surface; at: { x, y }; d: dims; opt: { colour (a glove, or the skin) }. */
export function handAt(g, at, d, opt = {}) {
  const w = d.armW, x = w % 2 ? Math.floor(at.x) - (w - 1) / 2 : Math.round(at.x) - w / 2;
  g.rect(x, Math.round(at.y) - 1, w, 2, opt.colour ?? '#f6d3b0', { shade: 0 });
}

/**
 * Hides what a body seen from behind holds in front of itself: repaints the middle of the back over the arms and hands drawn on it. For the `torso` hook,
 * called before anything else that hook draws on the back (belts, stripes, lights); it does nothing facing down or sideways.
 * g, J, P, d: as a hook gets them; opt: { colour (the top, as look.top), inset (pixels at each edge of the back left as drawn, where a hanging arm lies; default 2) }.
 */
export function backOver(g, J, P, d, opt = {}) {
  if (J.dir !== 'up') return;
  const tmp = new Surface(g.w, g.h), half = d.chestR - (opt.inset ?? 2);
  tmp.shadow = g.shadow;
  torsoFront(tmp, J, d, ramp(opt.colour ?? '#e8ecf2'));
  for (let y = 0; y < tmp.h; y++) for (let x = 0; x < tmp.w; x++) {
    const v = tmp.data[y * tmp.w + x];
    if (v && Math.abs(x + 0.5 - J.bx) <= half) g.data[y * g.w + x] = v;
  }
}

/**
 * Draws a thing over what is already on the surface, with a 1 px rim wherever it lies over pixels already drawn: what keeps a gun held across the chest apart from the suit under it.
 * g: the surface; draw: (s) => void, which draws the thing on the surface it is given; rim: a colour ('#rrggbb'), or null for no rim.
 */
export function drawOver(g, draw, rim = INK) {
  const tmp = new Surface(g.w, g.h), w = g.w, h = g.h;
  tmp.shadow = g.shadow;
  draw(tmp);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tmp.data[y * w + x] !== 0;
  const edge = [];
  if (rim) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g.data[y * w + x] !== 0 && !on(x, y) && (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1))) edge.push([x, y]);
  }
  for (const [x, y] of edge) g.dot(x, y, rim);
  for (let i = 0; i < tmp.data.length; i++) if (tmp.data[i]) g.data[i] = tmp.data[i];
}


// ---- additions of W3-H3 (the rig), fall fix 2: what reaches far to one side, for frame()'s `far` ------

/** Returns the `far` of a pack for frame(): a function (J, P, d) giving the outermost points of the pack pack() draws, so a body that lies down in `die` with it on stays inside the frame. kind: one of PACK_KINDS (anything else: no points); size: its Size setting. */
export function packFar(kind, size = 1) {
  return (J, P, d) => {
    if (J.dir === 'side' || !PACK_KINDS.includes(kind)) return [];
    const bx = J.bx, top = J.shoulderY + d.chin, off = -J.s;
    if (kind === 'tank') {
      const r = 2.9 + 0.9 * size, hx = bx + off * (d.headR + 0.6 + 0.9 * size), fx = bx - off * 1.5, fy = top + 3 + 5 * size;
      return [[hx + off * r, top - 1], [hx, top - 1 - r], [fx - off * r, fy], [fx, fy + r]];
    }
    if (kind === 'antenna') return [[bx + off * (d.headR + 4.2 + size), J.headTop - packRise(kind, size) - 0.5], [bx - off * 4, top]];
    const e = d.chestR + d.armW - 1, pw = size < 0.85 ? 2 : size < 1.2 ? 3 : 4, y0 = top - 2, h = Math.round(6 * size);
    return [[bx - e - pw - 1, y0], [bx + e + pw + 1, y0], [bx - e - pw - 1, y0 + h + 4], [bx + e + pw + 1, y0 + h + 4]];
  };
}
