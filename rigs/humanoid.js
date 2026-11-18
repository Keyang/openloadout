// Side-view two-legged character rig (faces right), on a 64x64 canvas.
//
//   dims(p)                  body measurements from the Height / Build / Head sliders
//   clips(speedOf, extra)    the six clips of the first characters; clipsFor(names, speedOf) any standard clips, in your order
//   pose(clip, t, m, d)      where every joint target is, for every name in POSES:
//                            idle / walk / run / jump / attack / punch / thrust / shoot / cast / block / hurt / die / victory / talk
//   solve(P, d)              joint positions in pixels (legs use IK so feet stay planted)
//   draw(g, P, d, look, hooks)   paints the body; hooks add hats, capes, weapons, robes
//   sockets(J, P, d, opt)    named attach points for parts: hand, offhand, head, back, feet (and muzzle when asked for)
//   muzzleFlash(g, at, size) the light of a shot at the muzzle socket, drawn after the outline
//   heldItem(g, at, item)    a held thing drawn from an attach point and its own settings: sword, axe, spear, staff, bow, gun
//   fit(P, d, opt)           keeps a pose with a long weapon or tall headgear inside the frame
//
// A new character is usually ~100 lines: a look, a few hooks, and the shared clips.
//
// The hooks of draw(), in the order they are called. Each is optional and is called as hook(g, J, P, d):
// g the Surface to draw on, J the joints in pixels (below), P the pose, d the body measurements of dims().
//   behind    before anything else: capes, wings, tails, a pack
//   offhand   after the far arm, behind the body: a shield, a lantern (attach to sockets(J, P, d).offhand)
//   torso     after the legs and the body, before the head: belts, armour, the skirt of a robe
//   head      after the head and its hair: hats, helmets, horns, beards. Draw them upright, as if the character stood:
//             when the pose turns the head (P.headTurn, lying down in `die`) the rig turns everything this hook drew
//             with it, and cuts off what ends up under the ground. Here g is a layer of its own and J.head is where
//             the head is on that layer, so use only the J you are given, and draw only what turns with the head
//   item      after the head, under the near hand: the thing held (attach to sockets(J, P, d).hand). A bow is drawn here
//             too, at sockets(J, P, d).offhand: the far hand holds it, in front of the body
//   front     last, over the near arm: sleeves, anything nearest the viewer
// J = { gy, hip, neck, head, shoulder, legF, legB: { hip, knee, ankle, lifted }, armF, armB: { shoulder, elbow, hand, angle } },
// every point as [x, y]; gy is the ground row under the feet. P also carries flags (see pose()): flash, lie, headTurn,
// mouth, fire, pull.

import { lerp, clamp, wave, pulse, keys, ik2, smooth, reach, fract, TAU, PI } from '../engine/motion.js';
import { ramp, farRamp, mix, INK } from '../engine/color.js';
import { Surface } from '../engine/surface.js';

export const SIZE = [64, 64];
export const GROUND = 58;        // feet rest on the row above this line
export const CX = 28;            // body centre; left of middle so swings in front have room
export const PIVOT = [CX, GROUND];

/** Standard clip table. Pass a speed 0..1 to scale playback rate. */
export function clips(speedOf = () => 0.5, extra = {}) {
  const f = (base) => (p) => base * lerp(0.65, 1.45, speedOf(p));
  return {
    idle: { frames: 8, fps: f(7), loop: true },
    walk: { frames: 8, fps: f(10), loop: true },
    run: { frames: 8, fps: f(14), loop: true },
    jump: { frames: 8, fps: f(11), loop: false },
    attack: { frames: 8, fps: f(13), loop: false },
    hurt: { frames: 4, fps: f(9), loop: false },
    ...extra,
  };
}

/** The clips of the style guide, section 4, that this rig has a pose for: frames, frames per second at the middle speed, loop. */
const CLIP_TABLE = {
  idle: [8, 7, true], walk: [8, 10, true], run: [8, 14, true], jump: [8, 11, false], attack: [8, 13, false],
  shoot: [6, 14, false], cast: [8, 10, false], block: [6, 10, false], hurt: [4, 9, false], die: [8, 10, false],
  victory: [8, 8, true], talk: [8, 7, true],
};

/**
 * Standard clip entries for the named clips, in the order given, so a character lists exactly the clips it has:
 *   clips: H.clipsFor(['idle', 'walk', 'run', 'jump', 'attack', 'block', 'hurt', 'die', 'victory'], (p) => p.speed)
 * Each clip is drawn with the pose of the same name. `attack` has three poses to choose from when rendering:
 * 'attack' (a swing), 'thrust' (a lunge with the point) and 'punch' (nothing held).
 */
export function clipsFor(names, speedOf = () => 0.5) {
  const out = {};
  for (const name of names) {
    const row = CLIP_TABLE[name];
    if (!row) throw new Error(`rigs/humanoid.js: no standard clip "${name}" (it has: ${Object.keys(CLIP_TABLE).join(', ')})`);
    out[name] = { frames: row[0], fps: (p) => row[1] * lerp(0.65, 1.45, speedOf(p) ?? 0.5), loop: row[2] };
  }
  return out;
}

/** Every name pose() knows. */
export const POSES = ['idle', 'walk', 'run', 'jump', 'attack', 'punch', 'thrust', 'shoot', 'cast', 'block', 'hurt', 'die', 'victory', 'talk'];

export function dims(p = {}) {
  const h = p.height ?? 0.5, b = p.build ?? 0.5, hd = p.head ?? 0.5;
  return {
    leg: lerp(9, 14, h),            // hip to ankle
    torso: lerp(8, 11, h),          // hip to neck
    arm: lerp(7.5, 10, h),          // shoulder to hand
    headR: lerp(4.6, 6.6, hd),
    hipR: lerp(2.3, 3.8, b),
    chestR: lerp(2.8, 4.8, b),
    armW: b < 0.6 ? 2 : 3,          // limb thickness in whole pixels
    legW: b < 0.3 ? 2 : b < 0.8 ? 3 : 4,
    foot: 2,
  };
}

const WIND_UP_MAX = 5;     // the furthest a wound-up item turns: pointing back and a little down, never hanging behind the legs

/** v moved toward or away from its resting value: k = 1 returns v itself, bit for bit. */
export const scaleFrom = (rest, v, k) => (k === 1 ? v : rest + (v - rest) * k);

/**
 * Pose for a clip at phase t (0..1).
 * m: { bounce, stride } 0..1 — how lively and how long the steps are.
 *    armed: something is held in the near hand (the arm swings less when walking).
 *    hold:  the held item's own angle, in radians, ADDED to the pose's item angle in every clip (default 0).
 *    swing: how far the held item travels in the attack; 1 = the standard swing, 0.5 = a short chop (default 1).
 * `punch` is the unarmed attack: use it in place of `attack` when nothing is held.
 * `thrust` is the attack for a point, not an edge (a spear, a rapier): use it in place of `attack`. The weapon is
 *    levelled and drawn back, then the whole body lunges; it reaches further forward than the swing. `swing` scales the lunge.
 * `block`, `victory` and `talk` start from the idle pose at t = 0 and are back on it at t = 1; `shoot` starts already
 *    raising (the style guide's "0 aim") and ends on the idle pose.
 * `die` starts on the recoil (flash) and ends lying on the ground, where the game holds it.
 * Besides the joint targets the pose carries flags for the sprite to act on:
 *    flash  tint this frame white (hurt and die, frame 0)
 *    lie    0..1: how far the body has gone down in `die` (1 = flat on its back). Hooks use it to lay capes and robes down
 *    headTurn  radians the head is turned back from upright (0 standing, PI/2 lying face up); draw() turns the head, its
 *           hair and everything the head hook draws
 *    mouth  the mouth is open (talk, frames 2 and 6); draw() paints it
 *    fire   the shot leaves on this frame (shoot, frame 1): draw muzzleFlash() at the muzzle socket, after the outline
 *    pull   1 while a bow is drawn (shoot with shot: 'bow', frame 0): run the string to the near hand and show the arrow
 * `shoot` takes m.shot: leave it out for something held out and fired (a gun, a wand, a thrown knife): frame 0 is the arm
 *    half raised, frame 1 it is level and fires. shot: 'bow' is an archer: the far arm holds the bow out (draw it in the
 *    item hook, at the offhand socket), the near hand has the string drawn to the chin on frame 0 and lets go on frame 1.
 * Angles: 0 = down, PI/2 = forward, PI = up. Foot x/y are relative to the
 * ground point under the hips (y negative = lifted).
 */
export function pose(clip, t, m = {}, d = dims()) {
  const bounce = m.bounce ?? 0.5, stride = m.stride ?? 0.5;
  const swing = m.swing ?? 1;
  const k = d.leg / 11.5;
  const P = {
    rootX: 0, lift: 0, crouch: 0, lean: 0, headTilt: 0,
    footF: { x: 1.5, y: 0 }, footB: { x: -1.5, y: 0 },
    armF: { a: 0.15, e: 0.25 }, armB: { a: -0.15, e: 0.2 },
    item: 2.5,      // absolute angle of the thing held in the front hand
    sway: 0,        // -1..1 for hair, capes, tails
    glow: 0,        // 0..1 for spell effects
    blink: false, flash: false,
    lie: 0, headTurn: 0, mouth: false, fire: false, pull: 0,
  };
  // the idle pose at t = 0: where block, victory, talk and shoot start and end
  const restA = 0.12 + 0.05 * wave(0, 0.1), restItem = 2.5 + 0.06 * wave(0, 0.1);
  const fromRest = () => { P.armF.a = restA; P.armB.a = -0.12 - 0.05 * wave(0, 0.1); P.item = restItem; };
  switch (clip) {
    case 'idle': {
      P.crouch = pulse(t) * lerp(0.7, 1.7, bounce);
      P.armF.a = 0.12 + 0.05 * wave(t, 0.1);
      P.armB.a = -0.12 - 0.05 * wave(t, 0.1);
      P.item = 2.5 + 0.06 * wave(t, 0.1);
      P.sway = wave(t);
      P.blink = t >= 0.74 && t < 0.87;
      break;
    }
    case 'walk': {
      const S = lerp(3, 6, stride) * k, up = lerp(1.5, 3, bounce);
      const foot = (u) => {
        u = fract(u);
        if (u < 0.5) return { x: lerp(S, -S, u * 2), y: 0 };
        const s = (u - 0.5) * 2;
        return { x: lerp(-S, S, smooth(s)), y: -up * Math.sin(PI * s) };
      };
      P.footF = foot(t); P.footB = foot(t + 0.5);
      P.crouch = lerp(0.3, 1.8, bounce) * (0.5 + 0.5 * Math.cos(2 * TAU * t));
      P.lean = 0.04 + 0.05 * stride;
      const A = lerp(0.3, 0.8, (bounce + stride) / 2);
      P.armF.a = -A * Math.cos(TAU * t) * (m.armed ? 0.45 : 1);
      P.armB.a = A * Math.cos(TAU * t);
      P.armF.e = P.armB.e = 0.3;
      P.item = 2.5 + 0.1 * Math.cos(TAU * t);
      P.sway = wave(t * 2);
      break;
    }
    case 'run': {
      const S = lerp(5, 8, stride) * k, up = lerp(3, 5.5, bounce), st = 0.38;
      const foot = (u) => {
        u = fract(u);
        if (u < st) return { x: lerp(S * 0.75, -S, u / st), y: 0 };
        const s = (u - st) / (1 - st);
        return { x: lerp(-S, S * 0.75, smooth(s)), y: -up * Math.sin(PI * Math.pow(s, 0.75)) };
      };
      P.footF = foot(t); P.footB = foot(t + 0.5);
      P.lift = lerp(0.8, 3, bounce) * pulse(2 * t - 0.4);
      P.crouch = 0.8;
      P.lean = 0.2 + 0.1 * stride;
      P.headTilt = -0.12;
      const A = lerp(0.8, 1.3, bounce);
      P.armF.a = 0.2 - A * Math.cos(TAU * t) * (m.armed ? 0.6 : 1);
      P.armB.a = 0.2 + A * Math.cos(TAU * t);
      P.armF.e = P.armB.e = 1.4;
      P.item = 2.3 + 0.2 * Math.cos(TAU * t);
      P.sway = 0.6 + 0.4 * wave(t * 2);
      break;
    }
    case 'jump': {
      const top = lerp(4, 8, bounce);
      P.crouch = keys(t, [[0, 0], [0.18, 3.5], [0.34, 0], [0.7, 0], [0.84, 3], [1, 0]]);
      P.lift = keys(t, [[0, 0], [0.2, 0], [0.45, top * 0.9], [0.55, top], [0.68, top * 0.6], [0.8, 0], [1, 0]]);
      const air = keys(t, [[0, 0], [0.25, 0], [0.42, 1], [0.62, 1], [0.8, 0], [1, 0]]);
      P.footF = { x: 1.5 + 2 * air, y: -3.5 * air };
      P.footB = { x: -1.5 - 1.5 * air, y: -1.5 * air };
      P.armF.a = keys(t, [[0, 0.15], [0.18, -0.8], [0.4, 2.3], [0.6, 2.0], [0.84, 0.6], [1, 0.15]]);
      P.armB.a = keys(t, [[0, -0.15], [0.18, -1.0], [0.4, 1.9], [0.6, 1.6], [0.84, 0.4], [1, -0.15]]);
      P.armF.e = 0.4;
      P.lean = keys(t, [[0, 0], [0.18, 0.25], [0.4, -0.05], [0.7, 0.05], [0.84, 0.2], [1, 0]]);
      P.item = keys(t, [[0, 2.5], [0.18, 2.0], [0.4, 3.2], [0.6, 3.0], [0.84, 2.3], [1, 2.5]]);
      P.sway = keys(t, [[0, 0], [0.4, 1], [0.6, -1], [0.84, -0.5], [1, 0]]);
      break;
    }
    case 'attack': {
      // a wider or shorter swing moves the item more or less around its resting angle; the arm follows half as much
      P.armF.a = scaleFrom(0.15, keys(t, [[0, 0.15], [0.28, 3.4], [0.42, 3.6], [0.57, 1.15], [0.72, 0.85], [1, 0.15]]), swing === 1 ? 1 : 1 + (swing - 1) * 0.5);
      P.armF.e = keys(t, [[0, 0.25], [0.3, 0.7], [0.42, 0.8], [0.57, 0.1], [0.72, 0.1], [1, 0.25]]);
      // a wide swing winds up further; the follow-through is never longer than the standard one (it would hit the ground)
      const it = keys(t, [[0, 2.5], [0.28, 4.3], [0.42, 4.6], [0.57, 1.5], [0.72, 1.0], [1, 2.5]]);
      P.item = scaleFrom(2.5, it, it > 2.5 ? swing : Math.min(swing, 1));
      P.armB.a = keys(t, [[0, -0.15], [0.35, 0.6], [0.57, -0.9], [1, -0.15]]);
      P.lean = keys(t, [[0, 0], [0.35, -0.15], [0.57, 0.32], [0.75, 0.28], [1, 0]]);
      P.rootX = keys(t, [[0, 0], [0.35, -1], [0.57, 2.5], [0.75, 2.5], [1, 0]]);
      P.crouch = keys(t, [[0, 0], [0.35, 0.5], [0.57, 2], [0.78, 1.5], [1, 0]]);
      const step = keys(t, [[0, 1.5], [0.38, 1.5], [0.57, 5.5], [0.78, 5.5], [1, 1.5]]);
      P.footF = { x: step - P.rootX, y: -1.5 * pulse(clamp((t - 0.38) / 0.19)) };
      P.footB = { x: -1.5 - P.rootX, y: 0 };
      P.sway = keys(t, [[0, 0], [0.4, -1], [0.6, 1], [1, 0]]);
      break;
    }
    case 'punch': {
      // unarmed attack, posed big enough to read at this size: the body coils back with the fist at the hip,
      // lunges onto the front foot with the arm thrown straight out, then snaps back to a guard before settling
      const wind = keys(t, [[0, 0], [0.22, 0.8], [0.43, 1], [0.5, 0.4], [0.57, 0], [1, 0]]);
      const jab = keys(t, [[0, 0], [0.43, 0], [0.57, 1], [0.71, 0.92], [0.86, 0], [1, 0]]);
      const recoil = keys(t, [[0, 0], [0.71, 0], [0.86, 1], [1, 0]]);
      P.armF.a = 0.15 - 1.0 * wind + 1.4 * jab + 0.3 * recoil;
      P.armF.e = 0.25 + 1.75 * wind - 0.25 * jab + 1.1 * recoil;
      P.armB.a = -0.15 + 1.0 * wind - 0.95 * jab + 0.4 * recoil;
      P.armB.e = 0.2 + 1.2 * wind + 0.5 * jab + 0.9 * recoil;
      P.lean = -0.2 * wind + 0.42 * jab - 0.1 * recoil;
      P.headTilt = 0.12 * wind - 0.1 * jab;
      P.rootX = -2 * wind + 4.5 * jab - 1.2 * recoil;
      P.crouch = 1.0 * wind + 2.6 * jab + 0.6 * recoil;
      P.footF = { x: 1.5 + 5.5 * jab - P.rootX, y: -2 * pulse(clamp((t - 0.43) / 0.14)) };
      P.footB = { x: -1.5 - P.rootX, y: 0 };
      P.item = P.armF.a + P.armF.e;      // nothing is held: the hand points along the forearm
      P.sway = keys(t, [[0, 0], [0.4, -1], [0.6, 1], [0.86, -0.4], [1, 0]]);
      break;
    }
    case 'cast': {
      const c = keys(t, [[0, 0], [0.3, 1], [0.75, 1], [1, 0]]);
      P.armF.a = 0.15 + 1.5 * c; P.armF.e = 0.25 + 0.15 * c;
      P.armB.a = -0.15 + 1.1 * c; P.armB.e = 0.2 + 0.5 * c;
      P.item = lerp(2.5, 2.75, c);
      P.lean = -0.1 * c; P.crouch = 0.8 * c;
      P.glow = keys(t, [[0, 0], [0.3, 0.6], [0.55, 1], [0.8, 0.7], [1, 0]]);
      P.sway = c * wave(t * 3);
      break;
    }
    case 'hurt': {
      const h = keys(t, [[0, 0.6], [0.33, 1], [1, 0]]);   // ends back on the idle pose
      P.rootX = -3 * h; P.lean = -0.35 * h; P.headTilt = -0.25 * h; P.crouch = 1.5 * h;
      P.armF.a = 0.15 + 1.2 * h; P.armF.e = 0.6;
      P.armB.a = -0.15 + 1.4 * h; P.armB.e = 0.5;
      P.footF = { x: 1.5 + 2.4 * h, y: 0 }; P.footB = { x: -1.5 - h, y: 0 };
      P.item = 2.5 + 0.8 * h;
      P.sway = -h;
      P.flash = t < 0.2;
      break;
    }
    case 'thrust': {
      // an attack with the point: level the weapon and draw it back (frames 1 to 2), lunge onto the front foot with the
      // arm thrown straight out (3, landing on 4), hold the reach a moment, then step home
      const wind = keys(t, [[0, 0], [0.143, 0.7], [0.286, 1], [0.43, 0.2], [0.5, 0], [1, 0]]);
      const jab = keys(t, [[0, 0], [0.33, 0], [0.43, 0.55], [0.571, 1], [0.714, 0.9], [0.857, 0.3], [1, 0]]);
      const level = keys(t, [[0, 0], [0.143, 0.65], [0.286, 1], [0.714, 1], [0.857, 0.5], [1, 0]]);
      P.armF.a = 0.15 - 0.85 * wind + (PI / 2 - 0.2) * jab;
      P.armF.e = 0.25 + 1.75 * wind - 0.25 * jab;
      P.armB.a = -0.15 + 0.9 * wind - 0.9 * jab;
      P.armB.e = 0.2 + 0.6 * wind + 0.3 * jab;
      P.item = 2.5 + (PI / 2 - 2.5) * level;
      P.lean = -0.18 * wind + 0.38 * jab;
      P.headTilt = 0.08 * wind - 0.1 * jab;
      P.rootX = (-2 * wind + 6 * jab) * swing;
      P.crouch = 1.0 * wind + 2.4 * jab;
      P.footF = { x: 1.5 + 7 * jab * swing - P.rootX, y: -2 * pulse(clamp((t - 0.38) / 0.19)) };
      P.footB = { x: -1.5 - P.rootX, y: 0 };
      P.sway = keys(t, [[0, 0], [0.3, -1], [0.6, 1], [1, 0]]);
      break;
    }
    case 'shoot': {
      const kick = keys(t, [[0, 0], [0.2, 0], [0.4, 1], [0.6, 0.4], [0.8, 0.1], [1, 0]]);
      fromRest();
      if (m.shot === 'bow') {
        // an archer. 6 frames: 0 the bow is up and drawn (string hand at the chin, elbow out behind), 1 the arrow is loosed,
        // 2 the string hand has flown back and the bow tips forward, 3 to 4 both arms come down, 5 idle
        const up = keys(t, [[0, 1], [0.4, 1], [0.6, 0.8], [0.8, 0.35], [1, 0]]);
        const loose = keys(t, [[0, 0], [0.2, 1], [0.4, 0.8], [0.6, 0.3], [1, 0]]);
        P.armB.a += (PI / 2 + restA) * up - 0.12 * kick;        // the far arm holds the bow straight out
        P.armB.e = 0.2 * (1 - up);
        P.armF.a += (-1.75 - restA) * up - 0.3 * loose * up;    // the near elbow points back, the hand under the chin
        P.armF.e = 0.25 + (PI / 2 + 1.75 - 0.25) * up + 0.55 * loose * up;
        P.item += (PI / 2 - restItem) * up;                     // the near hand points the way the arrow will go
        P.lean = -0.05 * up - 0.05 * kick;
        P.rootX = -1 * kick;
        P.crouch = 0.6 * up;
        P.footF = { x: 1.5 + 1.5 * up - P.rootX, y: 0 };        // side on, feet apart
        P.footB = { x: -1.5 - 1.5 * up - P.rootX, y: 0 };
        P.sway = -kick;
        P.pull = t < 0.1 ? 1 : 0;
      } else {
        // 6 frames: 0 the arm is half raised, 1 it is out level and the shot leaves, 2 the recoil (2 px back, muzzle up),
        // 3 to 4 recover, 5 idle
        const aim = keys(t, [[0, 0.5], [0.2, 1], [0.4, 1], [0.6, 0.85], [0.8, 0.4], [1, 0]]);
        P.armF.a += (PI / 2 - restA) * aim + 0.2 * kick;
        P.armF.e = 0.25 * (1 - aim) + 0.15 * kick;
        P.item += (PI / 2 - restItem) * aim + 0.3 * kick;
        P.armB.a += (1.25 + restA) * aim;                       // the other hand comes up to steady it
        P.armB.e = 0.2 + 0.3 * aim;
        P.lean = -0.04 * aim - 0.1 * kick;
        P.headTilt = 0.06 * aim;
        P.rootX = -2 * kick;
        P.crouch = 0.8 * aim + 0.6 * kick;
        P.footF = { x: 1.5 + aim - P.rootX, y: 0 };             // a wider stance; the feet stay planted through the recoil
        P.footB = { x: -1.5 - aim - P.rootX, y: 0 };
        P.sway = -kick;
      }
      P.fire = t >= 0.15 && t < 0.3;
      break;
    }
    case 'block': {
      // 6 frames: 1 the guard goes up (the blow lands on it: the sound is cued here), 2 to 4 held braced (the body gives on 2 and
      // comes back), 5 idle
      const up = keys(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
      const hit = keys(t, [[0, 0], [0.2, 0], [0.4, 1], [0.6, 0.4], [0.8, 0.1], [1, 0]]);
      fromRest();
      P.armF.a += (1.15 - restA) * up + 0.1 * hit;            // the hand comes up and out in front of the chest, clear of the face
      P.armF.e = 0.25 + 0.5 * up;
      P.armB.a += (1.25 + restA) * up;                        // the other arm braces behind it (a shield goes here)
      P.armB.e = 0.2 + 0.9 * up;
      P.item += (PI + 0.06 - restItem) * up - 0.12 * hit;     // held upright between the body and the blow
      P.lean = 0.03 * up - 0.1 * hit;
      P.headTilt = 0.12 * up;                                 // chin down behind the guard
      P.crouch = 2.2 * up + 0.8 * hit;
      P.rootX = 0.5 * up - 1.6 * hit;
      P.footF = { x: 1.5 + 2 * up - P.rootX, y: 0 };          // feet apart and planted
      P.footB = { x: -1.5 - 2 * up - P.rootX, y: 0 };
      P.sway = 0.6 * up - 1.4 * hit;
      break;
    }
    case 'victory': {
      // a looping cheer: crouch (1), hop with the weapon and the other fist thrown up (2 to 5, top on 4), land and squash (6), settle (7)
      const top = lerp(3, 6, bounce);
      const air = keys(t, [[0, 0], [0.125, 0], [0.25, 0.5], [0.375, 0.92], [0.5, 1], [0.625, 0.62], [0.75, 0], [1, 0]]);
      const up = keys(t, [[0, 0], [0.125, 0.3], [0.25, 0.85], [0.375, 1], [0.625, 1], [0.75, 0.8], [0.875, 0.35], [1, 0]]);
      fromRest();
      P.lift = top * air;
      P.crouch = keys(t, [[0, 0], [0.125, 2.6], [0.25, 0.3], [0.5, 0], [0.625, 0], [0.75, 2.8], [0.875, 1.0], [1, 0]]);
      // The arm is shorter than the head is tall, so a fist cannot be raised past the face without crossing it. The near
      // arm goes out under the chin and its forearm up in front of the face: as high as it can be while staying clear of
      // the head, whatever the build. What is held goes straight up from there, well above the head.
      const sx = -0.8, sy = 0.78 * d.headR + 0.16 * d.torso, half = d.arm / 2;                  // the shoulder, from the middle of the head
      const clear = (x, y, pad) => (x / (d.headR + pad)) ** 2 + (y / (d.headR * 0.95 + pad)) ** 2 > 1;
      let a1 = PI / 2 + 0.05;
      while (a1 > 1.1 && !clear(sx + Math.sin(a1) * half, sy + Math.cos(a1) * half, 1.4)) a1 -= 0.05;
      const ex = sx + Math.sin(a1) * half, ey = sy + Math.cos(a1) * half;
      let a2 = 2.5;
      while (a2 > a1 && !(clear(ex + Math.sin(a2) * half, ey + Math.cos(a2) * half, 2.2) && clear(ex + Math.sin(a2) * half * 0.5, ey + Math.cos(a2) * half * 0.5, 1.6))) a2 -= 0.05;
      P.armF.a += (a1 - restA) * up;
      P.armF.e = 0.25 + (a2 - a1 - 0.25) * up;
      P.armB.a += (-1.9 + restA) * up;                        // the other arm is thrown up and out behind, where it shows
      P.armB.e = 0.2 - 0.3 * up;
      P.item += (PI - 0.08 - restItem) * up;                  // straight up at the top
      P.lean = -0.08 * up;
      P.headTilt = -0.14 * up;                                // head back
      P.footF = { x: 1.5 + 1.5 * air, y: -2.2 * air };
      P.footB = { x: -1.5 - 1.2 * air, y: -1.0 * air };
      P.sway = t < 0.75 ? keys(t, [[0, 0], [0.3, 1], [0.6, -1], [0.75, -1]]) : wave(t);     // ends as idle's sway does, so trailing cloth joins up
      break;
    }
    case 'talk': {
      // a looping chat: two beats (frames 2 and 6); on each the mouth opens, the head nods and the free hand makes a point
      const beat = (c) => { const u = (fract(t - c + 0.5) - 0.5) / 0.42; return Math.abs(u) < 0.5 ? Math.cos(PI * u) ** 2 : 0; };
      const b1 = beat(0.25), b2 = beat(0.75);
      fromRest();
      P.crouch = 0.9 * pulse(2 * t);
      P.headTilt = 0.16 * b1 - 0.12 * b2;                     // a nod down, then a lift of the chin
      P.lean = 0.05 * b1 - 0.03 * b2;
      // the free hand is held out in front, palm up, and goes down again: fully on the first beat, a smaller wave on the second
      P.armB.a += 1.3 * b1 + (m.armed ? 1.0 : 0.3) * b2;
      P.armB.e = 0.2 + 0.6 * b1 + (m.armed ? 0.9 : 0.2) * b2;
      if (m.armed) P.item += 0.05 * (b1 - b2);
      else { P.armF.a += 0.25 * b1 + 1.1 * b2; P.armF.e = 0.25 + 0.2 * b1 + 0.5 * b2; }     // empty hands: the near one makes the second point
      P.sway = wave(t);                                       // as in idle, so cloth that trails the body joins up at the loop
      P.mouth = Math.abs(t - 0.25) < 0.06 || Math.abs(t - 0.75) < 0.06;
      P.blink = t >= 0.47 && t < 0.56;
      break;
    }
    case 'die': {
      // knocked off the feet: 0 the recoil (white), 1 staggering back, 2 the feet shoot out in front, 3 legs in the air,
      // 4 the back hits the ground, 5 a small bounce, 6 the legs and arm drop, 7 lying still (the game holds this frame)
      const fall = keys(t, [[0, 0], [0.143, 0.1], [0.286, 0.42], [0.429, 0.82], [0.571, 1], [1, 1]]);
      const tip = keys(t, [[0, 0], [0.143, 0.12], [0.286, 0.5], [0.429, 0.86], [0.571, 1], [1, 1]]);      // the back goes over a little ahead of the hips
      const rec = keys(t, [[0, 0.7], [0.143, 1], [0.35, 0.3], [0.5, 0], [1, 0]]);
      const bump = keys(t, [[0, 0], [0.571, 0], [0.714, 1], [0.857, 0.15], [1, 0]]);
      // where it ends: hips, chest and head resting on the ground row, on whole pixels so the body sits on the line at every build
      const ankleY = GROUND - d.foot;
      const neckY = Math.floor(GROUND + 0.4 - 1.55 * d.chestR);
      const hipY1 = Math.floor(Math.min(GROUND + 0.4 - 0.8 * d.hipR, (GROUND + 0.9 - d.hipR - 0.12 * neckY) / 0.88, ankleY));
      const headY = Math.floor(GROUND - 0.1 - d.headR) + 0.5;                   // the head lies on its back: its back rests on the ground
      const lean1 = -Math.acos(clamp((hipY1 - neckY) / d.torso, -1, 1));
      const tilt1 = -Math.acos(clamp((neckY - headY) / (d.headR * 0.78), -1, 1)) - lean1;
      // the hips come forward as the head goes back, so that the lying body (with long hair behind it) is inside the frame
      const behind = d.torso + d.headR * 2.28 + 2.7;
      const x1 = Math.max(2, 2 + behind - CX);
      P.rootX = keys(t, [[0, -2.1], [0.143, -3], [0.286, -2 + 0.3 * x1], [0.429, 0.7 * x1], [0.571, x1], [1, x1]]);
      const down = d.leg * 0.97 - (ankleY - hipY1);
      P.crouch = lerp(1.5 * rec, down, fall) - bump * Math.min(1, down);
      P.lean = lerp(-0.35 * rec, lean1, tip) + 0.1 * bump;
      P.headTilt = lerp(-0.25 * rec, tilt1, fall) + 0.35 * keys(t, [[0, 0], [0.286, 0], [0.5, 1], [0.714, 0.2], [1, 0]]);   // the chin comes down as the back lands
      // legs: planted through the stagger, then each swings out from the hip, up into the air, and drops
      const hipY = ankleY - d.leg * 0.97 + P.crouch;
      const swingLeg = (phi, len) => {
        const dy = Math.min(ankleY - hipY, -len * Math.sin(phi));
        return { x: Math.sqrt(Math.max(1, len * len - dy * dy)), y: Math.min(0, hipY + dy - ankleY) };
      };
      const L = d.leg * 0.96;
      const fly = keys(t, [[0, 0], [0.143, 0], [0.286, 1], [1, 1]]);
      const legF = swingLeg(keys(t, [[0, -1.4], [0.143, -1.4], [0.286, -0.5], [0.429, 0.55], [0.571, 0.4], [0.714, 0.1], [0.857, -0.3], [1, -0.3]]), L);
      const legB = swingLeg(keys(t, [[0, -1.4], [0.143, -1.4], [0.286, -0.8], [0.429, 0.3], [0.571, 0.62], [0.714, 0.28], [0.857, 0.02], [1, -0.3]]),
        L * lerp(1, 0.76, keys(t, [[0, 0], [0.571, 0], [0.857, 1], [1, 1]])));                    // the far knee stays bent
      P.footF = { x: lerp(1.5 + 2.4 * rec, legF.x, fly), y: legF.y * fly, up: fly > 0.5 };
      P.footB = { x: lerp(-1.5 - rec, legB.x, fly), y: legB.y * fly, up: fly > 0.5 };
      // arms and the held thing fly up as the body goes over, then drop along the body
      P.armF.a = keys(t, [[0, 1.0], [0.143, 1.6], [0.286, 2.3], [0.429, 2.7], [0.571, 2.2], [0.714, 1.75], [0.857, 1.55], [1, 1.5]]);
      P.armF.e = keys(t, [[0, 0.6], [0.286, 0.3], [0.571, 0.2], [1, 0.15]]);
      P.armB.a = keys(t, [[0, 0.7], [0.143, 1.2], [0.286, 1.9], [0.429, 2.4], [0.571, 2.0], [0.714, 1.85], [1, 1.75]]);
      P.armB.e = keys(t, [[0, 0.5], [0.571, 0.1], [1, -0.3]]);
      P.item = keys(t, [[0, 2.98], [0.143, 3.3], [0.286, 3.6], [0.429, 3.3], [0.571, 2.2], [0.714, 1.62], [0.857, 1.42], [1, 1.5]]);
      P.sway = keys(t, [[0, -0.7], [0.286, -1], [0.571, 0.8], [0.8, 0.2], [1, 0]]);
      P.lie = fall;
      P.headTurn = tip * PI / 2;                              // the head goes over with the back: face up once it is down
      P.flash = t < 0.1;
      P.blink = t > 0.2;
      break;
    }
    default: break;
  }
  if (m.hold) P.item += m.hold;
  if (clip === 'attack' && P.item > WIND_UP_MAX) P.item = WIND_UP_MAX;
  return P;
}

/** Joint positions for a pose. */
export function solve(P, d) {
  const gy = GROUND - P.lift;
  const ankleY = gy - d.foot;
  let H = d.leg * 0.97 - P.crouch;
  for (const f of [P.footF, P.footB]) H = Math.min(H, Math.sqrt(Math.max(9, (d.leg * 0.99) ** 2 - f.x ** 2)) - f.y);
  const hip = [CX + P.rootX, ankleY - H];
  const neck = reach(hip[0], hip[1], PI - P.lean, d.torso);
  const headBase = reach(neck[0], neck[1], PI - P.lean - P.headTilt, d.headR * 0.78);
  const head = [headBase[0] + 0.8, headBase[1]];
  const shoulder = [lerp(neck[0], hip[0], 0.16), lerp(neck[1], hip[1], 0.16)];
  const leg = (f, off) => {
    const h = [hip[0] + off, hip[1]];
    const ankle = [CX + P.rootX + f.x, ankleY + f.y];
    const s = ik2(h[0], h[1], ankle[0], ankle[1], d.leg / 2, d.leg / 2, 1);
    let knee = s.mid;
    if (f.up) {      // a leg lying on the ground or kicked into the air: the knee is on the upper side, never in the ground
      const o = ik2(h[0], h[1], ankle[0], ankle[1], d.leg / 2, d.leg / 2, -1).mid;
      if (o[1] < knee[1]) knee = o;
    }
    return { hip: h, knee, ankle: s.end, lifted: f.y < -0.5 };
  };
  const arm = (A) => {
    const elbow = reach(shoulder[0], shoulder[1], A.a, d.arm / 2);
    const hand = reach(elbow[0], elbow[1], A.a + A.e, d.arm / 2);
    return { shoulder, elbow, hand, angle: A.a + A.e };
  };
  return { gy, hip, neck, head, shoulder, legF: leg(P.footF, 0.6), legB: leg(P.footB, -0.6), armF: arm(P.armF), armB: arm(P.armB) };
}

/**
 * Named attach points for parts, for one solved pose: { name: { x, y, angle } } in frame pixels.
 *   hand     the near hand; angle = the direction a held item points (P.item)
 *   offhand  the far hand; angle = along its forearm
 *   head     the top of the head; angle = the way the head points (up when standing straight)
 *   back     between the shoulders, where a cape or pack hangs; angle = down the spine
 *   feet     the ground under the body
 *   muzzle   only when opt.muzzle is given (the hand-to-tip length of the thing that shoots, 0 for a bare hand):
 *            the tip of the held item, where a projectile and the muzzle flash appear; angle = the way it points.
 *            opt.muzzleAt: 'offhand' measures from the far hand instead (a bow is held there)
 * Angles use the rig convention (0 = down, PI/2 = forward, PI = up). A sprite built on this rig returns
 * these from its own sockets(clip, t, p) so they are exported with every frame.
 */
export function sockets(J, P, d, opt = {}) {
  const hx = Math.round(J.head[0] * 2) / 2, hy = Math.round(J.head[1] * 2) / 2;   // the head is drawn on the half-pixel grid
  const turn = P.headTurn || 0;                                                   // lying down, the top of the head points back
  const out = {
    hand: { x: J.armF.hand[0], y: J.armF.hand[1], angle: P.item },
    offhand: { x: J.armB.hand[0], y: J.armB.hand[1], angle: J.armB.angle },
    head: { x: hx - Math.sin(turn) * d.headR * 0.95, y: hy - Math.cos(turn) * d.headR * 0.95, angle: PI - P.lean - P.headTilt },
    back: { x: J.neck[0], y: J.neck[1] + 1, angle: -P.lean },
    feet: { x: CX + P.rootX, y: J.gy, angle: 0 },
  };
  if (opt.muzzle !== undefined) {
    out.muzzle = opt.muzzleAt === 'offhand'
      ? { x: out.offhand.x + Math.sin(out.offhand.angle) * opt.muzzle, y: out.offhand.y + Math.cos(out.offhand.angle) * opt.muzzle, angle: out.offhand.angle }
      : muzzle(J, P, opt.muzzle);
  }
  return out;
}

/** The muzzle attach point: the tip of a held item of length len (0 = the hand itself), pointing the way the item points. */
export const muzzle = (J, P, len = 0) => ({ x: J.armF.hand[0] + Math.sin(P.item) * len, y: J.armF.hand[1] + Math.cos(P.item) * len, angle: P.item });

/**
 * The light of a shot: a short ray the way the muzzle points with a small cross behind its tip.
 * Call AFTER g.outline() on the frame where the pose says `fire`, so it glows instead of being inked.
 *   at: { x, y, angle }, for example sockets(J, P, d, { muzzle: len }).muzzle;  size: length of the ray in pixels.
 * Never touches the frame edge.
 */
export function muzzleFlash(g, at, size = 3, colour = '#ffffff') {
  const put = (x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (x >= 1 && y >= 1 && x <= SIZE[0] - 2 && y <= SIZE[1] - 2) g.dot(x, y, c); };
  const ux = Math.sin(at.angle), uy = Math.cos(at.angle);
  const arm = Math.max(1, size * 0.5);
  for (let r = 0.5; r <= arm; r += 0.5) for (const k of [-1, 1]) put(at.x + ux - uy * r * k, at.y + uy + ux * r * k, colour);
  for (let r = 0; r <= size; r += 0.5) put(at.x + ux * r, at.y + uy * r, colour);
}

/**
 * Keep a pose inside the frame when the body holds something long or wears something tall. Changes P in place
 * and returns it; a pose that already fits is left exactly as it was. Nothing is resized: the motion is scaled
 * down for the frames that need it.
 *   opt.item   { length, back, pad } of the thing in the near hand: `length` from the hand to its tip, `back` how far
 *              it sticks out behind the hand, `pad` how wide its head is. A tip that would leave the top of the frame
 *              or go into the ground is turned toward level; one that would leave a side shortens the lunge.
 *   opt.points (J, P) => [[x, y], ...]: other far points (plume, crown, horns). Too high: a lower jump, then a deeper crouch.
 *   opt.margin pixels to keep clear of the frame edge (default 2: one for the outline, one to spare).
 */
export function fit(P, d, opt = {}) {
  const margin = opt.margin ?? 2, item = opt.item && opt.item.length > 0 ? opt.item : null;
  const xMax = SIZE[0] - 1 - margin;
  let J = solve(P, d);
  if (opt.points) {
    let over = 0;
    for (const [, y] of opt.points(J, P)) over = Math.max(over, margin - y);
    if (over > 0) {
      const cut = Math.min(P.lift, over);
      P.lift -= cut; P.crouch += over - cut;
      J = solve(P, d);
    }
  }
  if (item) {
    const [hx, hy] = J.armF.hand, pad = item.pad ?? 1, len = item.length;
    // top: the tip may rise at most `room` above the hand
    const room = hy - margin - pad;
    if (Math.cos(P.item) * len < -room) {
      const lim = Math.acos(clamp(room / len, -1, 1));               // how far from straight up it must stay
      const a = ((P.item % TAU) + TAU) % TAU;
      P.item = a < PI + 0.9 ? PI - lim : PI + lim;                   // forward of upright, unless it clearly points back
    }
    // bottom: the tip stays above the ground
    const drop = J.gy - 1 - pad - hy;
    if (Math.cos(P.item) * len > drop) {
      const lim = Math.acos(clamp(drop / len, -1, 1));
      const a = (((P.item + PI) % TAU) + TAU) % TAU - PI;            // -PI..PI, 0 = straight down
      P.item = a >= 0 ? lim : -lim;
    }
  }
  // sides: the whole body gives way (a shorter lunge, a smaller wind-up)
  const xs = [];
  if (item) {
    const [hx] = J.armF.hand, s = Math.sin(P.item), pad = item.pad ?? 1;
    xs.push(hx + s * item.length - pad, hx + s * item.length + pad, hx - s * (item.back ?? 0));
  }
  if (opt.points) for (const [x] of opt.points(J, P)) xs.push(x);
  if (xs.length) {
    const lo = Math.min(...xs), hi = Math.max(...xs);
    if (hi > xMax) P.rootX -= hi - xMax;
    else if (lo < margin) P.rootX += margin - lo;
  }
  return P;
}

function drawLeg(g, L, d, cloth, boot) {
  g.limb(L.hip[0], L.hip[1], L.knee[0], L.knee[1], d.legW, cloth);
  g.limb(L.knee[0], L.knee[1], L.ankle[0], L.ankle[1], Math.max(2, d.legW - 1), cloth);
  const ax = Math.round(L.ankle[0]), ay = Math.round(L.ankle[1]);
  if (L.lifted) {
    const shin = Math.atan2(L.ankle[0] - L.knee[0], L.ankle[1] - L.knee[1]);
    const [tx, ty] = reach(ax, ay + 1, PI / 2 + shin * 0.7, 2.2);
    g.limb(ax - 1, ay + 1, tx, ty, 2, boot);
  } else {
    g.rect(ax - 2, ay, d.legW >= 4 ? 6 : 5, d.foot, boot, { shade: 0 });
    g.rect(ax - 2, ay + d.foot - 1, d.legW >= 4 ? 6 : 5, 1, boot.dark);
  }
}

function drawArm(g, A, d, sleeve, skin, bare) {
  g.limb(A.shoulder[0], A.shoulder[1], A.elbow[0], A.elbow[1], d.armW, sleeve);
  g.limb(A.elbow[0], A.elbow[1], A.hand[0], A.hand[1], d.armW, bare ? skin : sleeve);
  g.limb(A.hand[0], A.hand[1], A.hand[0], A.hand[1], d.armW, skin, { shade: 0 });
}

/** Hair styles drawn over the head. Exported so hooks can reuse or replace them. */
export const HAIR_STYLES = ['short', 'long', 'spiky', 'ponytail', 'bald'];

/** Draws one of HAIR_STYLES over the head. Arguments: g, J (joints), P (pose), d (dims), style, hair (a colour ramp). */
export function drawHair(g, J, P, d, style, hair) {
  if (style === 'bald') return;
  const [hx, hy] = J.head, R = d.headR;
  const cap = (px, py) => {
    if (((px - hx) / (R + 0.8)) ** 2 + ((py - hy) / (R + 0.7)) ** 2 > 1) return false;
    const back = clamp((hx - R * 0.05 - px) / (R * 0.55));
    return py < hy - R * 0.38 + back * R * 1.0;
  };
  if (style === 'long') {
    g.capsule(hx - R * 0.75, hy, hx - R * 0.95 - P.sway * 1.2, hy + R * 1.55, R * 0.5, R * 0.35, hair);
  }
  if (style === 'ponytail') {
    g.capsule(hx - R * 0.95, hy - R * 0.25, hx - R * 1.5 - P.sway * 1.5, hy + R * 0.9, 1.5, 0.8, hair);
  }
  g.fill(hx - R - 2, hy - R - 2, hx + R + 2, hy + R + 2, cap, hair);
  if (style === 'spiky') {
    for (let i = 0; i < 4; i++) {
      const bx = hx + R * (0.55 - i * 0.42), by = hy - R * (0.78 - Math.abs(i - 1.2) * 0.12);
      g.poly([[bx - 1.6, by + 1.5], [bx + 1.4, by + 1.5], [bx - 1.2 - i * 0.5, by - 2.8]], hair, { shade: 0 });
    }
  }
}

/**
 * Paint the character.
 * look: { skin, top, bottom, boots, hair, hairStyle, bareArms }
 * hooks (all optional, each receives (g, J, P, d); the header of this file says what each is given and when):
 *   behind – drawn first (capes, wings, tails)
 *   offhand – after the far arm (shields, lanterns, bows)
 *   torso – after the body (belts, armour, robes)
 *   head – after hair (hats, helmets, horns, beards), drawn upright; the rig turns it with the head when the pose
 *          says so (P.headTurn). Set look.hairStyle 'bald' to hide hair under a full helmet
 *   item – the thing in the front hand, drawn under the hand (weapons, staffs)
 *   front – drawn last
 * Returns the joints J.
 */
export function draw(g, P, d, look, hooks = {}) {
  const J = solve(P, d);
  const skin = ramp(look.skin), skinFar = farRamp(look.skin);
  const top = ramp(look.top), topFar = farRamp(look.top);
  const bottom = ramp(look.bottom), bottomFar = farRamp(look.bottom);
  const boots = ramp(look.boots), bootsFar = farRamp(look.boots);
  const hair = ramp(look.hair);

  hooks.behind?.(g, J, P, d);
  drawArm(g, J.armB, d, topFar, skinFar, look.bareArms);
  hooks.offhand?.(g, J, P, d);
  drawLeg(g, J.legB, d, bottomFar, bootsFar);
  drawLeg(g, J.legF, d, bottom, boots);

  // body: pelvis in trouser colour, then the chest on top
  const hx = Math.round(J.hip[0] * 2) / 2, hy = Math.round(J.hip[1]);
  const nx = Math.round(J.neck[0] * 2) / 2, ny = Math.round(J.neck[1]);
  g.ellipse(hx, hy, d.hipR + 0.3, d.hipR * 0.8, bottom, { shade: 0 });
  g.capsule(lerp(hx, nx, 0.12), lerp(hy, ny, 0.12) - 0.5, nx, ny + d.chestR * 0.55, d.hipR, d.chestR, top);
  hooks.torso?.(g, J, P, d);

  // head
  const [cx, cy] = [Math.round(J.head[0] * 2) / 2, Math.round(J.head[1] * 2) / 2];
  J.head = [cx, cy];
  const turn = P.headTurn || 0;
  if (!turn) drawHead(g, J, P, d, look, skin, hair, hooks);
  else {
    // The head is turned (lying down): it, its hair and whatever the head hook adds are drawn upright on a layer of
    // their own, lit so that the shade still falls down and to the left once turned, and the layer is turned onto the
    // picture about the middle of the head. Nothing lands below the ground.
    const layer = new Surface(HEAD_LAYER, HEAD_LAYER);
    const ox = HEAD_LAYER / 2 - Math.floor(cx), oy = HEAD_LAYER / 2 - Math.floor(cy);      // whole pixels: drawn exactly as it would be in place
    const cos = Math.cos(turn), sin = Math.sin(turn);
    layer.shadow = [Math.round(-cos - sin) || 0, Math.round(cos - sin) || 0];
    drawHead(layer, moveJoints(J, ox, oy), P, d, look, skin, hair, hooks);
    stampTurned(g, layer, [HEAD_LAYER / 2 + 0.5, HEAD_LAYER / 2 + 0.5], [Math.floor(cx) + 0.5, Math.floor(cy) + 0.5], turn, J.gy);
  }

  hooks.item?.(g, J, P, d);
  drawArm(g, J.armF, d, top, skin, look.bareArms);
  hooks.front?.(g, J, P, d);
  return J;
}

const HEAD_LAYER = 96;      // the head's own layer when it is turned: room for the tallest hat and the longest beard

/** The head: skull, eye, mouth, hair, then the head hook. */
function drawHead(g, J, P, d, look, skin, hair, hooks) {
  const [cx, cy] = J.head;
  g.ellipse(cx, cy, d.headR, d.headR * 0.95, skin);
  const ex = Math.floor(cx + d.headR * 0.42), ey = Math.floor(cy - 0.5);
  if (P.blink) { g.dot(ex, ey + 1, INK); g.dot(ex + 1, ey + 1, INK); }
  else { g.dot(ex, ey, INK); g.dot(ex, ey + 1, INK); if (d.headR >= 5.6) { g.dot(ex + 1, ey, INK); g.dot(ex + 1, ey + 1, INK); g.dot(ex + 1, ey, '#ffffff'); } }
  // an open mouth (talk): one or two dark pixels on the lower front of the face, never outside it
  if (P.mouth) for (const mx of d.headR >= 5.6 ? [ex, ex + 1] : [ex]) if (g.get(mx, ey + 3)) g.dot(mx, ey + 3, INK);
  drawHair(g, J, P, d, look.hairStyle ?? 'short', hair);
  hooks.head?.(g, J, P, d);
}

/** A copy of the joints with every point moved by (ox, oy). */
function moveJoints(J, ox, oy) {
  const pt = (q) => [q[0] + ox, q[1] + oy];
  const leg = (L) => ({ ...L, hip: pt(L.hip), knee: pt(L.knee), ankle: pt(L.ankle) });
  const arm = (A) => ({ ...A, shoulder: pt(A.shoulder), elbow: pt(A.elbow), hand: pt(A.hand) });
  return { ...J, gy: J.gy + oy, hip: pt(J.hip), neck: pt(J.neck), head: pt(J.head), shoulder: pt(J.shoulder), legF: leg(J.legF), legB: leg(J.legB), armF: arm(J.armF), armB: arm(J.armB) };
}

/**
 * Copy `layer` onto g turned by `turn` radians (up goes toward the back), `from` on the layer landing on `to` on g.
 * A quarter turn about a pixel centre moves every pixel to exactly one pixel, so nothing is lost or doubled.
 * Rows from `floorY` down are left alone: what would be under the ground is cut off.
 */
function stampTurned(g, layer, from, to, turn, floorY) {
  const quarter = Math.abs(turn - PI / 2) < 1e-9;
  const cos = quarter ? 0 : Math.cos(turn), sin = quarter ? 1 : Math.sin(turn);
  const reachPx = Math.ceil(layer.w * 0.75);
  for (let y = Math.max(0, Math.floor(to[1] - reachPx)); y < Math.min(g.h, floorY, to[1] + reachPx); y++) {
    for (let x = Math.max(0, Math.floor(to[0] - reachPx)); x < Math.min(g.w, to[0] + reachPx); x++) {
      const dx = x + 0.5 - to[0], dy = y + 0.5 - to[1];
      const c = layer.get(Math.floor(from[0] + dx * cos - dy * sin), Math.floor(from[1] + dx * sin + dy * cos));
      if (c) g.data[y * g.w + x] = c;
    }
  }
}

// ---- held items ------------------------------------------------------------

/** Tip position of an item of length len held in the front hand. */
export const itemTip = (J, P, len) => reach(J.armF.hand[0], J.armF.hand[1], P.item, len);

export function sword(g, J, P, len, metal, hilt) {
  const [hx, hy] = J.armF.hand;
  const [gx, gy] = reach(hx, hy, P.item, 1.5);
  const [tx, ty] = reach(hx, hy, P.item, len);
  g.limb(gx, gy, tx, ty, 2, metal);
  g.dot(tx, ty, metal.light);
  const [ax, ay] = reach(gx, gy, P.item + PI / 2, 2.2), [bx, by] = reach(gx, gy, P.item - PI / 2, 2.2);
  g.line(ax, ay, bx, by, hilt);
  const [px, py] = reach(hx, hy, P.item + PI, 1.5);
  g.dot(px, py, hilt);
}

export function axe(g, J, P, len, metal, wood) {
  const [hx, hy] = J.armF.hand;
  const [bx, by] = reach(hx, hy, P.item + PI, 2);
  const [tx, ty] = reach(hx, hy, P.item, len);
  g.line(bx, by, tx, ty, wood);
  const [mx, my] = reach(hx, hy, P.item, len - 2.5);
  const [ox, oy] = reach(mx, my, P.item - PI / 2, 2.2);
  g.ellipse(ox, oy, 3, 3, metal, { clip: (px, py) => (px - mx) * Math.sin(P.item - PI / 2) + (py - my) * Math.cos(P.item - PI / 2) > -0.6 });
}

export function spear(g, J, P, len, metal, wood) {
  const [hx, hy] = J.armF.hand;
  const [bx, by] = reach(hx, hy, P.item + PI, 4);
  const [tx, ty] = reach(hx, hy, P.item, len);
  g.line(bx, by, tx, ty, wood);
  const [sx, sy] = reach(hx, hy, P.item, len - 3.5);
  g.capsule(sx, sy, tx, ty, 1.5, 0.5, metal);
}

export function staff(g, J, P, len, wood, orb, glow = 0) {
  const [hx, hy] = J.armF.hand;
  const [bx, by] = reach(hx, hy, P.item + PI, len * 0.55);
  const [tx, ty] = reach(hx, hy, P.item, len * 0.45);
  g.limb(bx, by, tx, ty, 2, wood);
  g.ellipse(Math.round(tx) + 0.5, Math.round(ty) - 0.5, 2.5 + glow * 0.6, 2.5 + glow * 0.6, orb, { light: 1 });
}

/** Draws a gun in the near hand: a barrel along the item angle, a grip below it. Arguments: g, J, P, len (hand to muzzle), metal (a ramp), grip (a colour). */
export function gun(g, J, P, len, metal, grip) {
  const [hx, hy] = J.armF.hand;
  const [gx, gy] = reach(hx, hy, P.item - PI / 2 - 0.2, 2.6);          // the grip: below the barrel, raked back a little
  g.limb(hx, hy, gx, gy, 2, grip, { shade: 0 });
  const [bx, by] = reach(hx, hy, P.item + PI, 1.5), [tx, ty] = reach(hx, hy, P.item, len - 0.5);
  g.limb(bx, by, tx, ty, 2, metal);
  g.dot(tx, ty, metal.light);
}

/**
 * Draws a bow at an attach point, standing across the way it points. Arguments: g, at ({ x, y, angle }: the grip and the aim),
 * len (tip to tip), wood (a ramp), opt: { nock: { x, y } where the string is drawn back to (left out: a straight string),
 * arrow: true to lay an arrow from the nock across the grip, string, metal }.
 */
export function bow(g, at, len, wood, opt = {}) {
  const ux = Math.sin(at.angle), uy = Math.cos(at.angle);                 // the way the arrow flies
  const px = Math.sin(at.angle + PI / 2), py = Math.cos(at.angle + PI / 2);   // along the bow
  const half = len / 2 - 0.5, sweep = len * (opt.nock ? 0.2 : 0.1);       // the tips sweep back toward the archer; more when it is drawn
  const tips = [1, -1].map((k) => [at.x + px * half * k - ux * sweep, at.y + py * half * k - uy * sweep]);
  const string = opt.string ?? '#f0ead8';
  const nock = opt.nock ? [opt.nock.x, opt.nock.y] : [at.x - ux * sweep, at.y - uy * sweep];
  for (const tip of tips) g.line(tip[0], tip[1], nock[0], nock[1], string);
  if (opt.arrow && opt.nock) {
    const far = [at.x + ux * 3.5, at.y + uy * 3.5];
    g.line(nock[0], nock[1], far[0], far[1], wood.light);
    const metal = opt.metal ?? ramp('#c2c9d6');
    g.dot(far[0], far[1], metal.base); g.dot(far[0] + ux, far[1] + uy, metal.light);
  }
  // the limbs: from the grip out to each tip, bellied forward
  for (const [k, tip] of [[1, tips[0]], [-1, tips[1]]]) {
    const mid = [at.x + px * half * 0.55 * k + ux * 0.4, at.y + py * half * 0.55 * k + uy * 0.4];
    let last = [at.x, at.y];
    for (let i = 1; i <= 6; i++) {
      const v = i / 6, w = 1 - v;
      const q = [w * w * at.x + 2 * w * v * mid[0] + v * v * tip[0], w * w * at.y + 2 * w * v * mid[1] + v * v * tip[1]];
      g.line(last[0], last[1], q[0], q[1], i > 4 ? wood.dark : wood.base);
      last = q;
    }
  }
  g.dot(at.x + ux, at.y + uy, wood.light);                               // the grip
}

/** Kinds heldItem() can draw. A bow is held in the far hand: draw it at sockets().offhand, in the item hook so it is in front of the body. */
export const ITEM_KINDS = ['sword', 'axe', 'spear', 'staff', 'bow', 'gun'];

/**
 * Standard sizes of the held items, in pixels, so every character's sword is the same sword:
 * length = hand to tip; back = how far it sticks out behind the hand; pad = how wide its head is.
 */
export const ITEMS = {
  sword: { length: 13, back: 1.5, pad: 1 },
  axe: { length: 12, back: 2, pad: 4 },
  spear: { length: 15, back: 4, pad: 1 },
  staff: { length: 18, back: 10, pad: 3 },
  bow: { length: 15, back: 5, pad: 8 },       // length = tip to tip; back = how far the string sits behind the grip
  gun: { length: 8, back: 1.5, pad: 2 },      // length = hand to muzzle
};

/** { length, back, pad } of a kind at a length setting (1 = standard), ready for fit() and heldItem(); null when nothing is held. */
export const itemSize = (kind, scale = 1) => (ITEMS[kind] ? { length: ITEMS[kind].length * scale, back: ITEMS[kind].back, pad: ITEMS[kind].pad } : null);

/** A "Hold angle" slider in degrees (positive = tipped forward) as the `hold` that pose() takes: forward is a smaller rig angle. */
export const holdAngle = (degrees) => (degrees ? -degrees * PI / 180 : 0);

/**
 * A held item drawn from an attach point and its own settings only, so the same item can go on any body.
 *   at:   { x, y, angle }, for example sockets(J, P, d).hand
 *   item: { kind: one of ITEM_KINDS, length, metal (a ramp), wood, hilt, orb, glow; for a bow also nock, arrow, string; for a gun grip }
 */
export function heldItem(g, at, item) {
  const J = { armF: { hand: [at.x, at.y] } }, P = { item: at.angle };
  const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#c2c9d6');
  const wood = item.wood ?? '#8a5a34';
  if (item.kind === 'sword') sword(g, J, P, item.length, metal, item.hilt ?? '#e6c545');
  else if (item.kind === 'axe') axe(g, J, P, item.length, metal, wood);
  else if (item.kind === 'spear') spear(g, J, P, item.length, metal, wood);
  else if (item.kind === 'staff') staff(g, J, P, item.length, typeof wood === 'string' ? ramp(wood) : wood, item.orb ?? ramp('#4fd8ee'), item.glow ?? 0);
  else if (item.kind === 'bow') bow(g, at, item.length, typeof wood === 'string' ? ramp(wood) : wood, { nock: item.nock, arrow: item.arrow, string: item.string, metal: item.metal ? metal : undefined });
  else if (item.kind === 'gun') gun(g, J, P, item.length, item.metal ? metal : ramp('#5d6475'), item.grip ?? wood);
}

/**
 * White arc that follows a fast swing. Call AFTER g.outline() so it is not outlined.
 * poseAt(t) must return the pose; the trail spans the motion since t - span.
 * The arc never touches the frame edge.
 */
export function slashTrail(g, poseAt, t, d, len, colour = '#ffffff', span = 0.16) {
  const P1 = poseAt(t), P0 = poseAt(Math.max(0, t - span));
  const J1 = solve(P1, d), J0 = solve(P0, d);
  const t1 = itemTip(J1, P1, len), t0 = itemTip(J0, P0, len);
  const [sx, sy] = J1.shoulder;
  const a1 = Math.atan2(t1[0] - sx, t1[1] - sy);
  // signed sweep since the earlier pose, wrapped to -PI..PI; a downward-forward swing is positive
  let sweep = Math.atan2(t0[0] - sx, t0[1] - sy) - a1;
  sweep = ((sweep + PI) % TAU + TAU) % TAU - PI;
  if (sweep < 0 && P0.item - P1.item > PI) sweep += TAU;      // a very wide swing covers more than half a turn
  if (sweep < 0.45) return;
  sweep = Math.min(sweep, 4.4);
  const r = (Math.hypot(t1[0] - sx, t1[1] - sy) + Math.hypot(t0[0] - sx, t0[1] - sy)) / 2;
  const inFrame = { clip: (px, py) => px > 1 && py > 1 && px < SIZE[0] - 1 && py < SIZE[1] - 1 };
  g.arc(sx, sy, r, a1 + 0.1, a1 + sweep, 2, colour, inFrame);
  if (sweep > 1.2) g.arc(sx, sy, r - 3, a1 + 0.5, a1 + sweep * 0.7, 1, colour, inFrame);
}

export { ramp, farRamp, mix, INK };
