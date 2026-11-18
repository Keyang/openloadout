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
//   bowGrip(J, P, len)       where a bow is held and which way it stands (upright in the far hand; flat on the ground when lying)
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
//             too, at bowGrip(J, P): the far hand holds it, in front of the body
//   front     last, over the near arm: sleeves, anything nearest the viewer
// J = { gy, hip, neck, head, shoulder, legF, legB: { hip, knee, ankle, lifted }, armF, armB: { shoulder, elbow, hand, angle } },
// every point as [x, y]; gy is the ground row under the feet. P also carries flags (see pose()): flash, lie, headTurn,
// mouth, fire, pull.

import { lerp, clamp, wave, pulse, keys, ik2, smooth, reach, fract, TAU, PI } from '../engine/motion.js';
import { ramp, farRamp, mix, INK } from '../engine/color.js';
import { Surface } from '../engine/surface.js';

/** The frame of every side-view character, [width, height] in pixels. */
export const SIZE = [64, 64];
export const GROUND = 58;        // feet rest on the row above this line
export const CX = 28;            // body centre; left of middle so swings in front have room
/** Where a game anchors the sprite, [x, y]: the ground under the middle of the body. */
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

/** Returns the body measurements in pixels from the Height, Build and Head sliders: { leg, torso, arm, headR, hipR, chestR, armW, legW, foot }. Arguments: p ({ height, build, head }, each 0..1; missing = 0.5). */
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
 *    item hook, at bowGrip(J, P)), the near hand has the string drawn to the chin on frame 0 and lets go on frame 1.
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
 *   offhand – after the far arm (shields, lanterns)
 *   torso – after the body (belts, armour, robes)
 *   head – after hair (hats, helmets, horns, beards), drawn upright; the rig turns it with the head when the pose
 *          says so (P.headTurn). Set look.hairStyle 'bald' to hide hair under a full helmet
 *   item – the thing in the front hand, drawn under the hand (weapons, staffs); a bow too, at bowGrip(J, P)
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

/** Draws a sword in the near hand: a blade along the item angle, a cross-guard and a grip. Arguments: g, J, P, len (hand to tip), metal (a ramp), hilt (a colour). heldItem() draws the same from an attach point. */
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

/** Draws an axe in the near hand: a shaft with a blade at its end. Arguments: g, J, P, len (hand to tip), metal (a ramp), wood (a colour). heldItem() draws the same from an attach point. */
export function axe(g, J, P, len, metal, wood) {
  const [hx, hy] = J.armF.hand;
  const [bx, by] = reach(hx, hy, P.item + PI, 2);
  const [tx, ty] = reach(hx, hy, P.item, len);
  g.line(bx, by, tx, ty, wood);
  const [mx, my] = reach(hx, hy, P.item, len - 2.5);
  const [ox, oy] = reach(mx, my, P.item - PI / 2, 2.2);
  g.ellipse(ox, oy, 3, 3, metal, { clip: (px, py) => (px - mx) * Math.sin(P.item - PI / 2) + (py - my) * Math.cos(P.item - PI / 2) > -0.6 });
}

/** Draws a spear in the near hand: a shaft that reaches behind the hand, with a point. Arguments: g, J, P, len (hand to tip), metal (a ramp), wood (a colour). heldItem() draws the same from an attach point. */
export function spear(g, J, P, len, metal, wood) {
  const [hx, hy] = J.armF.hand;
  const [bx, by] = reach(hx, hy, P.item + PI, 4);
  const [tx, ty] = reach(hx, hy, P.item, len);
  g.line(bx, by, tx, ty, wood);
  const [sx, sy] = reach(hx, hy, P.item, len - 3.5);
  g.capsule(sx, sy, tx, ty, 1.5, 0.5, metal);
}

/** Draws a staff in the near hand: a shaft topped by an orb that grows with glow. Arguments: g, J, P, len (the whole staff: 0.55 of it is below the hand and the orb is 0.45 of it above), wood (a ramp), orb (a ramp), glow (0..1). heldItem() draws the same from an attach point. */
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

/**
 * Where and how a bow is held, as an attach point { x, y, angle } for heldItem: in the far hand, standing upright whether
 * carried or aimed, going over with the body in `die` and laid flat on the ground at the end, never in the ground.
 * Arguments: J (joints), P (pose), len (the bow, tip to tip; default the standard bow).
 */
export function bowGrip(J, P, len = 15) {
  const angle = (PI / 2) * (1 - (P.lie || 0));                     // PI/2: the bow stands on end; 0: it lies along the ground
  const half = len / 2, sweep = len * 0.2, s = Math.sin(angle), c = Math.cos(angle);
  const low = Math.max(s * half - c * sweep, -s * half - c * sweep, c * 0.4) + 0.6;    // how far below the grip its lowest pixel is
  const lie = P.lie || 0;                                           // going down, it leaves the height of the hand for the ground
  return { x: J.armB.hand[0], y: Math.min(lie ? lerp(J.armB.hand[1], J.gy, lie) : J.armB.hand[1], J.gy - 1 - low), angle };
}

/** Kinds heldItem() can draw. A bow is held in the far hand: draw it at bowGrip(J, P), in the item hook so it is in front of the body. */
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

// ---- more held items, worn things and face parts (added with the spear goblin) ----------------------------------
// Appended, so everything above is as it was. club and dagger are held like the items above; drawItem() and
// itemSizeOf() take every kind, the standard ones and these. hood and skullcap go in the `head` hook, pointedEar
// and nose after them; thrustTrail is the partner of slashTrail for an attack with the point.

/** Draws a club in the near hand: a thin grip that swells to a knobbly head. Arguments: g, J, P, len (hand to tip), wood (a colour or a ramp). */
export function club(g, J, P, len, wood) {
  const paint = typeof wood === 'string' ? ramp(wood) : wood;
  const [hx, hy] = J.armF.hand;
  const [bx, by] = reach(hx, hy, P.item + PI, 1.5), [mx, my] = reach(hx, hy, P.item, len * 0.45), [tx, ty] = reach(hx, hy, P.item, len - 2.4);
  g.limb(bx, by, mx, my, 2, paint, { shade: 0 });
  g.capsule(mx, my, tx, ty, 1.3, 2.4, paint);
  for (const [k, side] of [[0.62, 1], [0.86, -1]]) {      // two knots on the head
    const [kx, ky] = reach(hx, hy, P.item, len * k), [qx, qy] = reach(kx, ky, P.item + side * PI / 2, 0.9);
    g.dot(qx, qy, paint.dark);
  }
}

/** Draws a dagger in the near hand: a short blade, a cross-guard and a pommel. Arguments: g, J, P, len (hand to tip), metal (a ramp), hilt (a colour). */
export function dagger(g, J, P, len, metal, hilt) {
  const [hx, hy] = J.armF.hand;
  const [gx, gy] = reach(hx, hy, P.item, 1.5), [tx, ty] = reach(hx, hy, P.item, len);
  g.capsule(gx, gy, tx, ty, 1.1, 0.5, metal);
  g.dot(tx, ty, metal.light);
  const [ax, ay] = reach(gx, gy, P.item + PI / 2, 1.8), [bx, by] = reach(gx, gy, P.item - PI / 2, 1.8);
  g.line(ax, ay, bx, by, hilt);
  const [px, py] = reach(hx, hy, P.item + PI, 1.5);
  g.dot(px, py, hilt);
}

/** Sizes of the held items that are not in ITEMS, in pixels, with the same three numbers: length (hand to tip), back, pad. */
export const EXTRA_ITEMS = {
  club: { length: 11, back: 1.5, pad: 3 },
  dagger: { length: 7.5, back: 1.5, pad: 1.5 },
};

/** Returns { length, back, pad } of any held kind at a length setting, the standard kinds of ITEMS and the ones in EXTRA_ITEMS alike; null when nothing is held. Arguments: kind, scale (1 = standard). */
export const itemSizeOf = (kind, scale = 1) => itemSize(kind, scale) ?? (EXTRA_ITEMS[kind] ? { length: EXTRA_ITEMS[kind].length * scale, back: EXTRA_ITEMS[kind].back, pad: EXTRA_ITEMS[kind].pad } : null);

/**
 * Draws any held item from an attach point: a club or a dagger here, every other kind through heldItem().
 * Arguments: g, at ({ x, y, angle }, for example sockets(J, P, d).hand), item ({ kind, length, metal, wood, hilt, ... } as heldItem() takes).
 */
export function drawItem(g, at, item) {
  const J = { armF: { hand: [at.x, at.y] } }, P = { item: at.angle };
  if (item.kind === 'club') club(g, J, P, item.length, item.wood ?? '#8a5a34');
  else if (item.kind === 'dagger') dagger(g, J, P, item.length, typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#c2c9d6'), item.hilt ?? '#8a5a34');
  else heldItem(g, at, item);
}

/**
 * Short white speed lines behind the tip of a thrust (the `thrust` pose, or a punch with len 0), drawn only while the tip is moving fast.
 * Arguments: g, poseAt ((t) => the pose), t, d (dims), len (hand to tip), colour (default white), span (how far back in the clip the lines reach, default 0.16). Call AFTER g.outline(); the lines never touch the frame edge.
 */
export function thrustTrail(g, poseAt, t, d, len, colour = '#ffffff', span = 0.16) {
  const P1 = poseAt(t), P0 = poseAt(Math.max(0, t - span));
  const t1 = itemTip(solve(P1, d), P1, len), t0 = itemTip(solve(P0, d), P0, len);
  const dx = t1[0] - t0[0], dy = t1[1] - t0[1], far = Math.hypot(dx, dy);
  const hand = solve(P1, d).armF.hand[0] - solve(P0, d).armF.hand[0];
  if (far < 4 || dx <= 0 || hand < 2.5) return;        // only while the hand itself drives forward, not while the weapon is levelled
  const ux = dx / far, uy = dy / far;
  const put = (x, y) => { x = Math.floor(x); y = Math.floor(y); if (x > 1 && y > 1 && x < SIZE[0] - 2 && y < SIZE[1] - 2 && !g.get(x, y)) g.dot(x, y, colour); };
  for (const [side, from, to] of [[-2.2, 0.25, 0.85], [2.2, 0.1, 0.7]]) {
    for (let k = from * far; k <= to * far; k += 0.5) put(t0[0] + ux * k - uy * side, t0[1] + uy * k + ux * side);
  }
}

/**
 * A hood for the `head` hook: cloth over the top and back of the head with the face left open, and a point that hangs behind and trails the body.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour (a colour or a ramp), size (1 = standard; bigger makes the point longer) }. Use hoodReach() for fit().
 */
export function hood(g, J, P, d, opt = {}) {
  const paint = typeof opt.colour === 'object' ? opt.colour : ramp(opt.colour ?? '#7a4fc4'), size = opt.size ?? 1;
  const [hx, hy] = J.head, R = d.headR;
  const shell = (px, py) => {
    if (((px - hx) / (R + 1.1)) ** 2 + ((py - hy) / (R + 1.1)) ** 2 > 1) return false;
    if (py < hy - R * 0.42) return true;                   // over the crown, down to the brow
    return px < hx - R * 0.12;                              // round the back of the head and the cheek
  };
  // the point: from the crown back and down, further with Size, swinging a little behind the body
  const tx = hx - R * (0.95 + 0.5 * size) - (P.sway || 0) * 1.2, ty = hy - R * 0.55 + R * 0.5 * size;
  const tail = (px, py) => {
    const x0 = hx - R * 0.45, y0 = hy - R * 0.8, dx = tx - x0, dy = ty - y0, k = clamp(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1e-6));
    const r = lerp(R * 0.5, 0.7, k);
    return (px - x0 - dx * k) ** 2 + (py - y0 - dy * k) ** 2 <= r * r;
  };
  g.fill(hx - 2 * R - 6, hy - R - 3, hx + R + 3, hy + R + 6, (px, py) => shell(px, py) || tail(px, py), paint);
  g.fill(hx - 1, hy - R, hx + R + 2, hy + R + 2, (px, py) => shell(px, py) && !shell(px + 1, py) && py >= hy - R * 0.42, paint.dark, { shade: 0 });      // the rim round the face
}

/** How far behind the middle of the head a hood() of this size reaches, in pixels, for fit(). Arguments: d (dims), size (1 = standard). */
export const hoodReach = (d, size = 1) => d.headR * (0.95 + 0.5 * size) + 2.4;

/**
 * A skullcap for the `head` hook: a close cap over the top of the head with a rim and a small spike.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour (a colour or a ramp), size (1 = standard; bigger sits deeper and has a taller spike) }. It rises 1 + 2 * size pixels above the head.
 */
export function skullcap(g, J, P, d, opt = {}) {
  const paint = typeof opt.colour === 'object' ? opt.colour : ramp(opt.colour ?? '#c2c9d6'), size = opt.size ?? 1;
  const [hx, hy] = J.head, R = d.headR, brim = hy - R * lerp(0.62, 0.3, clamp((size - 0.5) / 1.3));
  const cap = (px, py) => ((px - hx) / (R + 1)) ** 2 + ((py - hy) / (R + 1)) ** 2 <= 1 && py < brim;
  g.fill(hx - R - 2, hy - R - 2, hx + R + 2, hy + 1, cap, paint, { light: 1 });
  g.fill(hx - R - 2, hy - R - 2, hx + R + 2, hy + 1, (px, py) => cap(px, py) && !cap(px, py + 1), paint.dark, { shade: 0 });   // the rim
  const tip = Math.round(2 * size);
  g.rect(Math.floor(hx) - 1, Math.round(hy - R - 1) - tip, 2, tip + 1, paint, { shade: 0 });
  g.dot(Math.floor(hx), Math.round(hy - R - 1) - tip, paint.light);
}

/**
 * A long pointed ear on the side of the head, for the `head` hook (draw it after a hood, so it pokes through).
 * Arguments: g, J, P, d (as the hook receives them), opt { length (pixels from root to tip), angle (the way it points, rig convention; default back and a little up), colour (a colour or a ramp), inner (a colour for the hollow of the ear; left out: none) }. It trails the body by P.sway.
 */
export function pointedEar(g, J, P, d, opt = {}) {
  const paint = typeof opt.colour === 'object' ? opt.colour : ramp(opt.colour ?? '#9bd18a'), len = opt.length ?? 6;
  const [hx, hy] = J.head, R = d.headR;
  const a = (opt.angle ?? -PI / 2 - 0.45) - (P.sway || 0) * 0.22;
  const bx = hx - R * 0.62, by = hy + R * 0.05, w = Math.max(1.7, R * 0.36);
  const ux = Math.sin(a), uy = Math.cos(a);
  const tip = [bx + ux * len, by + uy * len];
  g.poly([[bx - uy * w, by + ux * w], [bx + uy * w, by - ux * w], tip], paint);
  if (opt.inner && len >= 4.5) g.poly([[bx - uy * w * 0.35 + ux, by + ux * w * 0.35 + uy], [bx + uy * w * 0.45 + ux, by - ux * w * 0.45 + uy], [bx + ux * len * 0.62, by + uy * len * 0.62]], opt.inner, { shade: 0 });
}

/** The nose shapes nose() can draw. */
export const NOSES = ['stub', 'long', 'hooked'];

/**
 * A nose that sticks out of the front of the face, for the `head` hook: a round stub, a long point, or a hook that turns down.
 * Arguments: g, J, P, d (as the hook receives them), opt { kind (one of NOSES), colour (a colour or a ramp), size (1 = standard) }. nose reaches at most 5 * size pixels in front of the head.
 */
export function nose(g, J, P, d, opt = {}) {
  const paint = typeof opt.colour === 'object' ? opt.colour : ramp(opt.colour ?? '#9bd18a'), s = (opt.size ?? 1) * d.headR / 5.6;
  const [hx, hy] = J.head, R = d.headR, x = hx + R * 0.88, y = hy + R * 0.22;
  if (opt.kind === 'long') g.capsule(x - 1, y - 0.2, x + 5 * s, y + 0.8 * s, 1.7 * s, 0.6, paint);
  else if (opt.kind === 'hooked') {
    g.capsule(x - 1, y - 0.8 * s, x + 2 * s, y - 0.4 * s, 1.5 * s, 1.9 * s, paint);
    g.capsule(x + 2 * s, y - 0.2 * s, x + 1.6 * s, y + 3.6 * s, 1.8 * s, 0.8, paint);
  } else g.ellipse(Math.round(x) + 0.5, Math.round(y) + 0.5, 1.4 * s + 0.2, 1.4 * s + 0.2, paint);
}

// ---- other bodies on the same joints: a skeleton and an imp; a shield and metal headgear for any body ----
// The worked examples are sprites/bone-soldier.js (drawSkeleton, shield, headgear) and sprites/thicket-imp.js (drawImp).
import { hash as boneHash } from '../engine/motion.js';
import { ellipseIn as ovalIn, polyIn as cornersIn, capsuleIn as stickIn } from '../engine/surface.js';
import { hornIn as curveIn, leafIn as petalIn } from '../engine/creature.js';

// Where each limb bone of a collapsed skeleton comes to rest: [x from the middle of the heap (it scales with the body), height of
// its middle above the ground, screen angle from its first end to its second (0 = pointing right, PI = pointing left)].
const BONE_REST = {
  // the legs fold under the body, knees forward; the arms flop out to either side
  'legF.thigh': [3.5, 2.8, 0.12], 'legF.shin': [3.8, 1, PI], 'legB.thigh': [-1, 2.4, 0.3], 'legB.shin': [-2.5, 1, PI - 0.08],
  'armF.upper': [5.5, 3.6, 0.9], 'armF.fore': [9, 1, 0], 'armB.upper': [-6, 3.4, PI - 0.9], 'armB.fore': [-9, 1, PI],
};

/**
 * Where the bones of a skeleton are for a pose: the rig's joints, with each bone knocked a pixel out of step (the rattle) and, in a collapse, fallen straight down into a heap with the skull on top.
 * Arguments: P (the pose); d (from dims()); opt: { rattle (pixels a bone may be out of place: 0 firm, about 1 loose), beat (the clip phase 0..1 the rattle keeps time with, so a loop closes), fall (0 standing .. 1 a heap at rest; the skull lands at 0.8 and hops once), seed }.
 * Returns the joints of solve() moved to where the bones are (so hooks and sockets() follow them), plus fall and bones: [{ name, a: [x, y], b: [x, y], far, landed }] in painting order (armB.upper, armB.fore, legB.thigh, legB.shin, legF.thigh, legF.shin, spine, skull, armF.upper, armF.fore).
 */
export function skeletonJoints(P, d, opt = {}) {
  const J = solve(P, d);
  const k = clamp(opt.fall ?? 0), loose = (opt.rattle ?? 0) * (1 - k), beat = opt.beat ?? 0, seed = opt.seed ?? 0;
  const head = [Math.round(J.head[0] * 2) / 2, Math.round(J.head[1] * 2) / 2];      // the head is drawn on the half-pixel grid, as in draw()
  const seg = (name, a, b, far) => ({ name, a: [a[0], a[1]], b: [b[0], b[1]], far, landed: false });
  const bones = [
    seg('armB.upper', J.armB.shoulder, J.armB.elbow, true), seg('armB.fore', J.armB.elbow, J.armB.hand, true),
    seg('legB.thigh', J.legB.hip, J.legB.knee, true), seg('legB.shin', J.legB.knee, J.legB.ankle, true),
    seg('legF.thigh', J.legF.hip, J.legF.knee, false), seg('legF.shin', J.legF.knee, J.legF.ankle, false),
    seg('spine', J.hip, J.neck, false), seg('skull', head, head, false),
    seg('armF.upper', J.armF.shoulder, J.armF.elbow, false), seg('armF.fore', J.armF.elbow, J.armF.hand, false),
  ];
  // the rattle: every bone moves by whole pixels on a phase of its own; the shins do not, so the feet stay planted
  if (loose > 0) bones.forEach((B, i) => {
    if (B.name.endsWith('shin')) return;
    const dx = Math.round(loose * Math.sin(TAU * (beat + boneHash(i, seed * 16 + 1)))) || 0;
    const dy = B.name.endsWith('thigh') ? 0 : Math.round(loose * 0.8 * Math.sin(TAU * (2 * beat + boneHash(i, seed * 16 + 2)))) || 0;
    B.a[0] += dx; B.b[0] += dx; B.a[1] += dy; B.b[1] += dy;
  });
  // the collapse: every bone drops under the same gravity (the low ones land first), turns to lie flat and slides to its place
  if (k > 0) {
    const sc = d.leg / 11.5, gy = J.gy, mid = J.hip[0];
    // the rib cage comes to rest on its back, propped up at the neck end, and the skull settles into the top of it
    const rest = { ...BONE_REST, spine: [1.2, d.chestR + 2.4, PI + 0.4], skull: [-1, 2.4 * d.chestR + 2.6 + 0.5 * d.headR, 0] };
    const furthest = Math.max(1, gy - rest.skull[1] - head[1]);                      // the longest drop is the skull's
    for (const B of bones) {
      const [rx, rh, ra] = rest[B.name];
      const dx = B.b[0] - B.a[0], dy = B.b[1] - B.a[1], len = Math.hypot(dx, dy);
      const m0 = [(B.a[0] + B.b[0]) / 2, (B.a[1] + B.b[1]) / 2], a0 = len > 0.01 ? Math.atan2(dy, dx) : 0;
      const m1 = [mid + rx * sc, gy - rh];
      let a1 = ra;
      while (a1 - a0 > PI) a1 -= TAU;
      while (a1 - a0 < -PI) a1 += TAU;
      const land = Math.min(0.8, 0.2 + 0.6 * Math.sqrt(Math.max(0, m1[1] - m0[1]) / furthest));
      const u = clamp(k / land);
      const x = lerp(m0[0], m1[0], smooth(u)), a = lerp(a0, a1, smooth(u));
      let y = lerp(m0[1], m1[1], u * u);
      if (B.name === 'skull' && k > land) y -= 2 * Math.sin(PI * clamp((k - land) / (1 - land)));
      const ex = Math.cos(a) * len / 2, ey = Math.sin(a) * len / 2;
      B.a = [x - ex, y - ey]; B.b = [x + ex, y + ey]; B.landed = u >= 1;
    }
  }
  const by = {};
  for (const B of bones) by[B.name] = B;
  const arm = (A, n) => ({ ...A, shoulder: by[n + '.upper'].a, elbow: by[n + '.upper'].b, hand: by[n + '.fore'].b });
  const leg = (L, n) => ({ ...L, hip: by[n + '.thigh'].a, knee: by[n + '.thigh'].b, ankle: by[n + '.shin'].b });
  return {
    ...J, hip: by.spine.a, neck: by.spine.b, head: by.skull.a, shoulder: by['armF.upper'].a,
    armF: arm(J.armF, 'armF'), armB: arm(J.armB, 'armB'), legF: leg(J.legF, 'legF'), legB: leg(J.legB, 'legB'), bones, fall: k,
  };
}

/** The trunk of a skeleton along its spine bone: a pelvis, a backbone, and a rib cage with three dark gaps that stop short of the breastbone and the back. */
function skeletonTrunk(g, S, d, bone, w, floor) {
  const clip = (px, py) => py < floor;                                                     // lying in a heap, nothing goes into the ground
  const snap = w === 1 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
  const a = [snap(S.a[0]), Math.round(S.a[1])], b = [snap(S.b[0]), Math.round(S.b[1])];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, vx = -uy, vy = ux;      // u runs up the spine, v points to the front
  const neck = L > 9 ? 1 : 0;                                                            // a pixel of neck above the cage when there is room for it
  const cr = d.chestR * (0.9 + 0.1 * w), tall = Math.min(7, L - 1), qc = L - neck - tall / 2 + 0.3, rq = tall / 2 + 0.3, fc = 0.2 * cr, rf = 1.05 * cr;
  const pr = d.hipR + 0.4 + 0.3 * w, column = w === 1 ? 0.6 : 1.1;
  const at = (px, py) => [(px - a[0]) * ux + (py - a[1]) * uy, (px - a[0]) * vx + (py - a[1]) * vy];
  const cage = (q, f) => ((q - qc) / rq) ** 2 + ((f - fc) / rf) ** 2 <= 1;
  const inside = (px, py) => {
    const [q, f] = at(px, py);
    return cage(q, f) || (q >= 0 && q <= L && Math.abs(f) <= column) || ((q - 0.5) / 1.7) ** 2 + ((f - 0.2) / pr) ** 2 <= 1;
  };
  const pad = Math.max(rf, pr) + 3;
  const box = [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad];
  g.fill(...box, inside, bone, { clip });
  g.fill(...box, (px, py) => {
    const [q, f] = at(px, py);
    if (!cage(q, f)) return false;
    const row = Math.floor(L - neck - q);
    if (row !== 1 && row !== 3 && row !== 5) return false;
    const half = rf * Math.sqrt(Math.max(0, 1 - ((q - qc) / rq) ** 2));
    return f > fc - half + 1.3 && f < fc + half - 1.3;
  }, INK, { shade: 0, clip });
}

/** The skull of a skeleton, upright at c: a cranium with a square face, two eye sockets (lit unless o.blink), a nose hole, teeth, and a lower jaw that drops by o.jaw. Returns the middles of the two sockets. */
function skeletonSkull(g, c, d, bone, glow, o) {
  const [cx, cy] = c, R = d.headR, big = R >= 5.2;
  const x0 = Math.round(cx - R * 0.2), x1 = Math.round(cx + R * 0.9), yb = Math.round(cy + R * 0.72);       // the face: cheek to front teeth, down to the upper teeth
  const drop = Math.round(clamp(o.jaw ?? 0) * (big ? 3 : 2));
  // the lower jaw hangs from a hinge at the back; when it drops, the dark of the mouth shows above it
  if (drop) g.poly([[x0 + 1, yb - 0.5], [x1 - 1, yb - 0.5], [x1 - 1, yb + drop + 0.5], [x0 + 1, yb + 0.5]], INK, { shade: 0 });
  g.poly([[x0, yb], [x1 - 1, yb + drop], [x1 - 1, yb + drop + 2], [x0, yb + 2]], bone);
  g.blob([ovalIn(cx - 0.4, cy - 0.6, R, R * 0.88), (px, py) => px >= x0 && px < x1 && py >= cy - 0.5 && py < yb], bone);
  for (let x = x1 - 2; x > x0; x -= 2) g.dot(x, yb - 1, INK);                                                 // the gaps between the upper teeth
  const rows = big ? 3 : 2, sy = Math.floor(cy - R * 0.35), nw = big ? 3 : 2, nx = Math.floor(cx - R * 0.35), fx = nx + nw + 1;
  const fw = fx + 2 <= x1 - 1 ? 2 : 1;
  const socket = (x, w) => {
    for (let j = 0; j < rows; j++) for (let i = 0; i < w; i++) g.dot(x + i, sy + j, j === 0 || o.blink ? bone.deep : j === 1 && i === Math.min(1, w - 1) ? glow.light : glow.base);
  };
  socket(nx, nw); socket(fx, fw);
  g.dot(nx + nw, sy + rows, bone.deep);                                                                       // the nose hole
  const ey = sy + 1 + (rows - 1) / 2;
  return [[nx + nw / 2, ey], [fx + fw / 2, ey]];
}

/**
 * Paints a skeleton on the rig's joints in place of draw()'s body: thin limb bones with knobs at the joints, a rib cage with three dark gaps over a pelvis, and a skull with two lit eye sockets and a jaw that drops open.
 * Arguments: g (the Surface); P (the pose); d (from dims()); look: { bone (colour), glow (colour of the light in the eye sockets), thick (limb width in pixels, 1 to 3, default 2), jaw (0 shut .. 1 wide open), and rattle, beat, fall, seed as skeletonJoints() takes them }; hooks: behind, offhand, torso, head, item, front, called as draw() calls them, with the moved joints.
 * The head is never turned (P.headTurn is ignored): a skeleton goes down with `fall`, not with the lying `die` pose. P.blink puts the eye lights out. Returns the joints, with eyes: [[x, y], [x, y]], the middles of the two sockets.
 */
export function drawSkeleton(g, P, d, look = {}, hooks = {}) {
  const J = skeletonJoints(P, d, look);
  const w = clamp(Math.round(look.thick ?? 2), 1, 3);
  const B = {};
  for (const b of J.bones) B[b.name] = b;
  const down = J.fall > 0.25;
  const bone = ramp(look.bone ?? '#f0ead8'), far = J.fall > 0.6 ? bone : farRamp(look.bone ?? '#f0ead8'), glow = ramp(look.glow ?? '#4fd8ee');      // in a heap no bone is the far one
  const apart = J.fall > 0.6 ? { outline: bone.dark, clip: (px, py) => py < J.gy } : J.fall > 0 ? { clip: (px, py) => py < J.gy } : undefined;      // in a heap a darker line keeps bone from bone; no falling bone goes into the ground
  const stick = (b, paint) => g.limb(b.a[0], b.a[1], b.b[0], b.b[1], w, paint, apart);
  const above = (px, py) => py < J.gy;                                                       // nothing goes into the ground
  const knob = (q, paint, r = w === 3 ? 2.4 : 1.4) => g.ellipse(Math.floor(q[0]) + 0.5, Math.floor(q[1]) + 0.5, r, r, paint, { shade: 0, clip: above });
  const small = w === 3 ? 1.9 : 1.4;                                                         // the knobs of an arm: 3 px across
  const nub = (q, paint) => g.limb(q[0], q[1], q[0], q[1], Math.max(2, w), paint, { shade: 0, clip: above });
  const slim = (b, paint) => g.limb(b.a[0], b.a[1], b.b[0], b.b[1], Math.min(w, 2), paint, apart);      // an arm is never wider than 2 px: it crosses the rib cage
  const armOf = (n, paint) => { slim(B[n + '.upper'], paint); slim(B[n + '.fore'], paint); knob(B[n + '.fore'].a, paint, small); nub(B[n + '.fore'].b, paint); };
  const legOf = (n, L, paint) => {
    const thigh = B[n + '.thigh'], shin = B[n + '.shin'];
    stick(thigh, paint); stick(shin, paint); knob(shin.a, paint);
    const ax = Math.round(shin.b[0]), ay = Math.round(shin.b[1]);
    if (down) nub(shin.b, paint);
    else if (L.lifted) {
      const lean = Math.atan2(shin.b[0] - shin.a[0], shin.b[1] - shin.a[1]);
      const [tx, ty] = reach(ax, ay + 1, PI / 2 + lean * 0.7, 2.2);
      g.limb(ax - 1, ay + 1, tx, ty, 2, paint);
    } else {
      g.rect(ax - 1, ay, 4, d.foot, paint, { shade: 0 });
      g.rect(ax - 1, ay + d.foot - 1, 4, 1, paint.dark);
    }
  };

  hooks.behind?.(g, J, P, d);
  armOf('armB', far);
  hooks.offhand?.(g, J, P, d);
  legOf('legB', J.legB, far);
  legOf('legF', J.legF, bone);
  skeletonTrunk(g, B.spine, d, bone, w, J.gy);
  hooks.torso?.(g, J, P, d);
  J.eyes = skeletonSkull(g, J.head, d, bone, glow, { jaw: look.jaw, blink: P.blink });
  hooks.head?.(g, J, P, d);
  hooks.item?.(g, J, P, d);
  knob(B['armF.upper'].a, bone, small);
  armOf('armF', bone);
  hooks.front?.(g, J, P, d);
  return J;
}

/** The kinds of shield shield() can draw. No arguments: a list. */
export const SHIELD_KINDS = ['round', 'kite', 'broken'];

/** Half the width and half the height in pixels, { rx, ry }, of a shield of a kind at a size setting, for keeping it inside the frame; null when the kind is not a shield. Arguments: kind (one of SHIELD_KINDS), size (1 = standard). */
export const shieldSize = (kind, size = 1) => (SHIELD_KINDS.includes(kind) ? { rx: 4 * size, ry: (kind === 'kite' ? 6.2 : 5.2) * size } : null);

/**
 * Draws a shield seen from the side-front, its middle at an attach point: a dark rim, a lit face and its mark (a boss on a round one, a stripe on a kite, the crack of a broken one).
 * Arguments: g (the Surface); at ({ x, y }: the middle of the shield, for example sockets(J, P, d).offhand); o: { kind (one of SHIELD_KINDS), size (1 = standard), metal (a colour or a ramp) }. Draw it in the offhand hook (carried behind the body) or in the front hook (raised in a block).
 */
export function shield(g, at, o = {}) {
  const kind = o.kind ?? 'round', S = shieldSize(kind, o.size ?? 1);
  if (!S) return;
  const metal = typeof o.metal === 'string' ? ramp(o.metal) : o.metal ?? ramp('#c2c9d6');
  const cx = Math.round(at.x), cy = Math.round(at.y), { rx, ry } = S;
  const plain = kind === 'kite'
    ? cornersIn([[cx - rx, cy - ry * 0.75], [cx - rx * 0.45, cy - ry], [cx + rx * 0.45, cy - ry], [cx + rx, cy - ry * 0.75], [cx + rx, cy - ry * 0.05], [cx, cy + ry], [cx - rx, cy - ry * 0.05]])
    : ovalIn(cx, cy, rx, ry);
  let whole = plain;
  if (kind === 'broken') {
    // a bite out of the top front and a chip out of the lower back
    const bite = cornersIn([[cx + rx * 0.05, cy - ry - 1], [cx + rx + 1, cy - ry - 1], [cx + rx + 1, cy - ry * 0.05], [cx + rx * 0.4, cy - ry * 0.25], [cx + rx * 0.6, cy - ry * 0.55]]);
    const chip = cornersIn([[cx - rx - 1, cy + ry * 0.3], [cx - rx * 0.45, cy + ry * 0.55], [cx - rx - 1, cy + ry * 0.85]]);
    whole = (px, py) => plain(px, py) && !bite(px, py) && !chip(px, py);
  }
  const face = (px, py) => whole(px, py) && whole(px - 1, py) && whole(px + 1, py) && whole(px, py - 1) && whole(px, py + 1);
  const box = [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1];
  g.fill(...box, whole, metal.dark, { shade: 0 });
  g.fill(...box, face, metal, { light: 1 });
  const mark = (x, y, c) => { if (face(x + 0.5, y + 0.5)) g.dot(x, y, c); };
  if (kind === 'round') {
    for (const [i, j] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) mark(cx + i, cy + j, metal.light);
    mark(cx - 1, cy + 1, metal.dark); mark(cx, cy + 1, metal.dark);
  } else if (kind === 'kite') {
    for (let y = Math.ceil(cy - ry) + 1; y < cy + ry - 2; y++) mark(cx - 1, y, metal.light);
  } else {
    const crack = metal.deep ?? metal.dark;
    let x = Math.round(cx + rx * 0.4) - 1, y = Math.round(cy - ry * 0.25);
    for (let i = 0; i < Math.max(3, Math.round(ry * 0.9)); i++) { mark(x, y, crack); y += 1; if (i % 2 === 0) x -= 1; }
  }
}

/** The kinds of metal headgear headgear() can draw. No arguments: a list. */
export const HEADGEAR_KINDS = ['helmet', 'crown', 'horned'];

/** How far headgear of a kind rises above the top of the head, in pixels, for fit()'s `points`; 0 when the kind is not headgear. Arguments: kind (one of HEADGEAR_KINDS), size (1 = standard). */
export function headgearRise(kind, size = 1) {
  if (kind === 'helmet') return 2 + 2.6 * size;
  if (kind === 'crown') return Math.max(1, Math.round(2 * size)) + Math.max(1, Math.round(1.5 * size));
  if (kind === 'horned') return 1 + 3.2 * size;
  return 0;
}

/**
 * Draws metal headgear on the head, upright (call it in the head hook): an open-faced helmet with a crest, a crown, or a cap with two curved horns.
 * Arguments: g (the Surface); J (the joints the hook was given); P (the pose: the crest leans with P.sway); d (from dims()); o: { kind (one of HEADGEAR_KINDS), size (1 = standard: a taller crest, a deeper crown, longer horns), metal (a colour or a ramp), trim (a colour or a ramp for the helmet's crest and the crown's jewel; left out: the metal, and no jewel), horn (a colour or a ramp for the horns; left out: bone) }.
 */
export function headgear(g, J, P, d, o = {}) {
  const [hx, hy] = J.head, R = d.headR, size = o.size ?? 1;
  const paintOf = (c, fallback) => (typeof c === 'string' ? ramp(c) : c ?? fallback);
  const metal = paintOf(o.metal, ramp('#c2c9d6'));
  const box = [hx - R - 2, hy - R - 2, hx + R + 2, hy + R + 2];
  const dome = (px, py) => ((px - hx) / (R + 1)) ** 2 + ((py - hy) / (R + 1)) ** 2 <= 1;
  if (o.kind === 'helmet') {
    // the crest: a spike on the crown (a plume that leans with the sway when it has a trim colour); then the shell over its
    // foot: a dome with a short guard down the back of the neck
    const top = hy - R - 1, tall = 1 + 2.6 * size, foot = 0.8 + 0.8 * size, mid = Math.floor(hx - R * 0.2) + 0.5, lean = o.trim ? (P.sway ?? 0) * 0.8 + 1 : 0;
    g.poly([[mid - foot, top + 1.5], [mid - 0.5 - lean, top - tall], [mid + 0.5 - lean, top - tall], [mid + foot, top + 1.5]], paintOf(o.trim, metal));
    g.fill(...box, (px, py) => dome(px, py) && (py < hy - R * 0.3 || (px < hx - R * 0.5 && py < hy + R * 0.35)), metal, { light: 1 });
    g.rect(Math.round(hx - R * 0.1), Math.round(hy - R * 0.3) - 1, Math.ceil(R * 1.1) + 1, 1, metal.dark);
  } else if (o.kind === 'crown') {
    const band = Math.max(1, Math.round(2 * size)), points = Math.max(1, Math.round(1.5 * size));
    const y = Math.round(hy - R - 1) + 2 - band, x = Math.round(hx - R * 0.6), wide = Math.round(R * 1.3);
    g.rect(x, y, wide, band, metal);
    for (let i = 0; i < wide; i += 2) for (let j = 1; j <= points; j++) g.dot(x + i, y - j, metal.light);
    if (o.trim) g.dot(x + Math.floor(wide / 2), y + Math.floor((band - 1) / 2), paintOf(o.trim).base);
  } else if (o.kind === 'horned') {
    const horn = paintOf(o.horn, ramp('#f0ead8')), len = 3.5 + 4 * size;
    const cap = (px, py) => dome(px, py) && py < hy - R * 0.35;
    const wideBox = [hx - R - len - 2, hy - R - len - 2, hx + R + len + 2, hy + R];
    // the far horn, in shade, then the cap, then the near horn: each sets off sideways and curves up
    g.fill(...wideBox, curveIn(hx + R * 0.55, hy - R * 0.72, PI - 1.35, len * 0.8, { curl: 1.5, width: 2.6, tip: 0.8 }), { light: horn.base, base: horn.dark, dark: horn.deep ?? horn.dark });
    g.fill(...box, cap, metal, { light: 1 });
    g.fill(...box, (px, py) => cap(px, py) && !cap(px, py + 1), metal.dark, { shade: 0 });
    g.fill(...wideBox, curveIn(hx - R * 0.6, hy - R * 0.68, PI + 1.45, len, { curl: -1.7, width: 3, tip: 0.8 }), horn);
  }
}

/** The eye styles drawImp() can draw. No arguments: a list. */
export const IMP_EYES = ['sly', 'wide', 'angry'];

/**
 * Body measurements of an imp for solve() and drawImp(): a small body with short legs, a pot belly and a big head (a goblin, a gremlin, a kobold), about 20 pixels tall.
 * Arguments: o: { size, belly, head }, each 0..1 (default 0.5). Returns the fields dims() returns, plus s, the size multiplier the others were scaled by.
 */
export function impDims(o = {}) {
  const s = lerp(0.85, 1.15, o.size ?? 0.5), b = o.belly ?? 0.5;
  return {
    s, leg: 5.4 * s, torso: 6 * s, arm: 6.6 * s, headR: 5.2 * s * lerp(0.92, 1.08, o.head ?? 0.5),
    hipR: lerp(2.7, 4.4, b) * s, chestR: lerp(2, 2.7, b) * s, armW: 2, legW: 2, foot: 1,
  };
}

/**
 * Paints an imp on the rig's joints in place of draw()'s body: thin limbs with clawed hands, a pot belly with a paler front, and a big head with pointed ears, two lit eyes and a toothy grin.
 * Arguments: g (the Surface); P (the pose; P.blink shuts the eyes, P.mouth opens the mouth, P.sway swings the ears); d (from impDims()); look: { body (colour), accent (colour of the insides of the ears), glow (colour of the eyes), ears (0 small .. 1 huge; above 1 they go on growing), perk (0 the ears are swept back, as when it is left out .. 1 they stand up from the back of the head), earRim (a colour for a line round the far ear where it lies over what is behind it, a wing for one; left out: no line), eyes (one of IMP_EYES), claw (colour of claws and teeth, default bone), rim (colour of the line round the body where it lies over what is behind it, default the outline colour) }; hooks: behind, offhand, torso, head, item, front, called as draw() calls them.
 * The head is never turned (P.headTurn is ignored). Returns the joints.
 */
export function drawImp(g, P, d, look = {}, hooks = {}) {
  const J = solve(P, d);
  const bodyHex = look.body ?? '#4f9d57';
  const body = ramp(bodyHex), far = farRamp(bodyHex), accent = ramp(look.accent ?? bodyHex), accentFar = farRamp(look.accent ?? bodyHex), glow = ramp(look.glow ?? '#f2c230');
  const rim = look.rim ?? INK, crease = body.dark, claw = look.claw ?? '#f0ead8', s = d.s ?? 1, sway = P.sway ?? 0;
  const whole = (v) => Math.round(v);
  const limbIn = (a, b) => stickIn(whole(a[0]), whole(a[1]), whole(b[0]), whole(b[1]), 1);            // 2 px thick, snapped as g.limb snaps it
  const armOf = (A, paint, opt) => {
    g.blob([limbIn(A.shoulder, A.elbow), limbIn(A.elbow, A.hand), ovalIn(Math.floor(A.hand[0]) + 0.5, Math.floor(A.hand[1]) + 0.5, 1.4, 1.4)], paint, opt);
    for (const side of [-0.7, 0.7]) { const [qx, qy] = reach(Math.floor(A.hand[0]) + 0.5, Math.floor(A.hand[1]) + 0.5, A.angle + side, 2.1); g.dot(qx, qy, claw); }
  };
  const legOf = (L, paint, opt) => {
    const lean = Math.atan2(L.ankle[0] - L.knee[0], L.ankle[1] - L.knee[1]);                           // the way the shin points
    const toe = reach(L.ankle[0], L.ankle[1], lean + 0.9, 2.2);                                        // the foot hangs forward of it
    const onGround = (q) => [q[0], Math.min(q[1], J.gy - 1)];                                          // standing, the foot is flat on the ground row
    g.blob([limbIn(L.hip, L.knee), limbIn(L.knee, onGround(L.ankle)), limbIn(onGround(L.ankle), onGround(toe))], paint, opt);
  };

  // a line round a shape only where it lies over something already drawn, so the outline is never doubled at the silhouette
  const rimOver = (tests, colour) => {
    const inside = (px, py) => { for (const f of tests) if (f(px, py)) return true; return false; };
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (g.get(x, y) && !inside(cx, cy) && (inside(cx + 1, cy) || inside(cx - 1, cy) || inside(cx, cy + 1) || inside(cx, cy - 1))) g.dot(x, y, colour);
    }
  };

  hooks.behind?.(g, J, P, d);
  armOf(J.armB, far);
  hooks.offhand?.(g, J, P, d);
  legOf(J.legB, far);
  legOf(J.legF, body);

  // the body: a pot belly and a narrow chest as one shape, with a paler front
  const bc = [lerp(J.hip[0], J.neck[0], 0.3) + 0.8, lerp(J.hip[1], J.neck[1], 0.3)];
  const belly = ovalIn(bc[0], bc[1], d.hipR * 1.1, d.hipR);
  const chest = stickIn(bc[0] - 0.4, bc[1], J.neck[0], J.neck[1] + d.chestR * 0.4, d.hipR * 0.75, d.chestR);
  rimOver([belly, chest], rim);
  g.blob([belly, chest], body, { shade: d.hipR > 3.4 ? 2 : 1 });
  const front = ovalIn(bc[0] + d.hipR * 0.4, bc[1] + d.hipR * 0.1, d.hipR * 0.6, d.hipR * 0.68);
  g.fill(bc[0] - d.hipR - 2, bc[1] - d.hipR - 2, bc[0] + d.hipR + 3, bc[1] + d.hipR + 2, (px, py) => front(px, py) && belly(px + 1, py) && belly(px, py + 1) && belly(px + 1, py + 1), body.light, { shade: 0 });
  hooks.torso?.(g, J, P, d);

  // the head: far ear, skull with a jowl, near ear, face
  const hx = Math.round(J.head[0] * 2) / 2, hy = Math.round(J.head[1] * 2) / 2, R = d.headR;
  J.head = [hx, hy];
  const earLen = lerp(4.5, 10.5, look.ears ?? 0.5) * s, earWide = Math.max(3, earLen * 0.5);
  const earBox = [hx - R - earLen - 2, hy - R - earLen - 2, hx + R + 2, hy + R + 2];
  const earOf = (rx, ry, angle, len) => {
    const [tx, ty] = reach(rx, ry, angle, len);
    return { outer: petalIn(rx, ry, tx, ty, earWide, { belly: 0.35, blunt: 0.7 }), inner: petalIn(lerp(rx, tx, 0.18), lerp(ry, ty, 0.18), lerp(rx, tx, 0.84), lerp(ry, ty, 0.84), earWide * 0.5, { belly: 0.4, blunt: 0.6 }) };
  };
  const perk = clamp(look.perk ?? 0);                                                               // 0: the ears are swept back; 1: they stand up from the back of the head
  const earFar = earOf(hx - R * lerp(0.35, 0.3, perk), hy - R * lerp(0.6, 0.7, perk), PI + lerp(0.75, 0.4, perk) + 0.15 * sway, earLen * 0.85);
  if (look.earRim) rimOver([earFar.outer], look.earRim);
  g.fill(...earBox, earFar.outer, far);
  g.fill(...earBox, earFar.inner, accentFar.base, { shade: 0 });
  const skull = ovalIn(hx, hy, R * 1.06, R * 0.94), jowl = ovalIn(hx + R * 0.5, hy + R * 0.38, R * 0.62, R * 0.52);
  const onHead = (x, y) => skull(x + 0.5, y + 0.5) || jowl(x + 0.5, y + 0.5);
  rimOver([skull, jowl], rim);
  g.blob([skull, jowl], body);
  const earNear = earOf(hx - R * lerp(0.8, 0.7, perk), hy - R * lerp(0.1, 0.45, perk), PI + lerp(1.2, 0.85, perk) + 0.2 * sway, earLen);
  rimOver([earNear.outer], crease);
  g.fill(...earBox, earNear.outer, body);
  g.fill(...earBox, earNear.inner, accent.base, { shade: 0 });

  // the face, three-quarters on: a big near eye, a sliver of the far eye at the front edge, and the grin under them
  const style = IMP_EYES.includes(look.eyes) ? look.eyes : 'wide';
  const ex = Math.floor(hx - R * 0.05), ey = Math.floor(hy - R * 0.4), fx = ex + 4;
  const put = (x, y, c) => { if (onHead(x, y) && onHead(x + 1, y)) g.dot(x, y, c); };
  const white = '#ffffff', lit = mix(glow.light, white, 0.3);                                   // lit eyes: paler than any body they sit on
  if (P.blink) {
    for (let i = 0; i < 3; i++) put(ex + i, ey + 1, INK);
    for (let i = 0; i < 2; i++) put(fx + i, ey + 1, INK);
  } else if (style === 'wide') {
    for (let j = 0; j < 3; j++) { for (let i = 0; i < 3; i++) put(ex + i, ey + j, lit); for (let i = 0; i < 2; i++) put(fx + i, ey + j, lit); }
    put(ex + 2, ey + 1, INK); put(ex, ey, white); put(fx + 1, ey + 1, INK);
  } else if (style === 'sly') {
    // heavy lids: a dark line, slanting up at the back, over half an eye of light with the pupil slid to the front corner
    for (let i = 0; i < 3; i++) { put(ex + i, ey, INK); put(ex + i, ey + 1, lit); put(ex + i, ey + 2, lit); }
    for (let i = 0; i < 2; i++) { put(fx + i, ey, INK); put(fx + i, ey + 1, lit); put(fx + i, ey + 2, lit); }
    put(ex + 2, ey + 1, INK); put(ex - 1, ey - 1, INK); put(fx + 1, ey + 1, INK);
  } else {
    // angry: brows slanting down to the nose over narrowed eyes
    put(ex, ey, INK); put(ex + 1, ey, INK); put(ex + 2, ey + 1, INK); put(fx, ey + 1, INK); put(fx + 1, ey, INK);
    put(ex, ey + 1, lit); put(ex + 1, ey + 1, lit); put(ex, ey + 2, lit); put(ex + 1, ey + 2, lit); put(ex + 2, ey + 2, lit);
    put(fx, ey + 2, lit); put(fx + 1, ey + 1, lit); put(fx + 1, ey + 2, lit); put(ex + 1, ey + 2, INK);
  }
  const my = Math.floor(hy + R * 0.45), m0 = ex - 1, m1 = Math.floor(hx + R * 1.1);
  if (P.mouth) {
    // open: a dark mouth with a row of teeth along the top
    for (let x = m0 + 1; x <= m1; x++) { put(x, my, claw); put(x, my + 1, INK); put(x, my + 2, INK); }
    put(m0, my, INK); put(m0, my + 1, INK);
  } else if (style === 'angry') {
    // a snarl: gritted teeth between two dark lines
    for (let x = m0; x <= m1; x++) { put(x, my, INK); put(x, my + 1, (x - m0) % 2 ? claw : INK); }
  } else {
    // a grin: pointed teeth over a dark line that turns up at the back corner (further up when sly)
    for (let x = m0 + 1; x <= m1; x++) { put(x, my, (x - m0) % 2 ? claw : INK); put(x, my + 1, INK); }
    put(m0, my, INK);
    if (style === 'sly') put(m0 - 1, my - 1, INK);
  }
  hooks.head?.(g, J, P, d);

  hooks.item?.(g, J, P, d);
  armOf(J.armF, body);
  hooks.front?.(g, J, P, d);
  return J;
}

// ---- a ragged tunic with a rope belt, and a bone topknot (added with the spear goblin, fix round 1) ----

/**
 * Draws a tunic skirt below the waist, with a rope belt if asked, for the `torso` hook: it hangs along the spine (down when standing, along the ground toward the feet when lying) and never goes into the ground.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour (the cloth: a colour or a ramp), belt (a colour or a ramp for a two-row rope belt with a knotted end that hangs and swings; left out: no belt), ragged (0 a straight hem .. 1 deep notches, default 1), length (how far it hangs below the hips, as a share of the leg, default 0.4) }.
 */
export function tunic(g, J, P, d, opt = {}) {
  const paintOf = (c) => (typeof c === 'string' ? ramp(c) : c);
  const cloth = paintOf(opt.colour ?? '#7a4f33'), rope = opt.belt ? paintOf(opt.belt) : null, ragged = opt.ragged ?? 1, lie = P.lie || 0;
  const sx = J.hip[0] - J.neck[0], sy = J.hip[1] - J.neck[1], n = Math.hypot(sx, sy) || 1;
  const ux = sx / n, uy = sy / n, px = -uy, py = ux;          // along the spine, and across it (toward the back when standing, the ground when lying)
  const at = (along, across) => { const y = J.hip[1] + uy * along + py * across; return [J.hip[0] + ux * along + px * across, y > J.gy ? J.gy : y]; };   // a point pushed into the ground stays on it
  const above = { clip: (cx, cy) => cy < J.gy };              // rows above the ground line only
  const w = d.hipR + 1, len = d.leg * (opt.length ?? 0.4), sway = -(P.sway || 0) * 0.8 * (1 - lie);
  const hem = [];
  for (let i = 0; i <= 6; i++) hem.push(at(len + (i % 2 ? -1.6 : 0.6) * ragged, lerp(w + 0.8, -w - 0.8, i / 6) + sway));
  g.poly([at(-1.5, -w), at(-1.5, w), ...hem], cloth, above);
  if (!rope) return;
  // the belt: two rows of rope across the waist, and a knotted end hanging from it
  const a = at(-1.4, -w + 0.2), b = at(-1.4, w - 0.2), e = at(1.6 + 0.5 * (P.sway || 0) * (1 - lie), w - 1);
  g.limb(a[0], a[1], b[0], b[1], 2, rope, { shade: 0, ...above });
  g.limb(b[0] - px, b[1] - py, e[0], e[1], 1, rope.light, { shade: 0, ...above });
}

/** Returns how far a boneTopknot() of a size rises above the top of the head, in pixels, for fit()'s `points`. Arguments: size (1 = standard). */
export const boneTopknotRise = (size = 1) => 3.5 + 1.5 * size;

/**
 * Draws a bone tied across a topknot on the crown, for the `head` hook: a small knot with a bone through it, which sits higher and is longer with Size.
 * Arguments: g, J, P, d (as the hook receives them), opt { size (1 = standard), colour (the bone: a colour or a ramp, default bone white), knot (what it is tied with: a colour or a ramp, default the bone's dark tone) }. It rises boneTopknotRise(size) pixels above the head; the rig turns it with the head.
 */
export function boneTopknot(g, J, P, d, opt = {}) {
  const paintOf = (c) => (typeof c === 'string' ? ramp(c) : c);
  const bone = paintOf(opt.colour ?? '#f0ead8'), knot = opt.knot ? paintOf(opt.knot) : bone.dark, size = opt.size ?? 1;
  const [hx, hy] = J.head, R = d.headR;
  const y = Math.round(hy - R - 1.5 * size), half = (2.6 + 2.4 * size) * (R / 6);
  g.rect(Math.floor(hx) - 2, Math.round(hy - R) - 1, 3, 3, knot, { shade: 0 });
  g.limb(hx - half - 0.5, y + 0.6, hx + half - 0.5, y - 0.6, 2, bone, { shade: 0 });
  for (const [x, yy] of [[hx - half - 1, y + 0.6], [hx + half, y - 0.6]]) g.ellipse(Math.round(x), Math.round(yy), 1.5, 1.9, bone);
}

// ---- parts for a creature's body: wings, a tail, horns (drawn from an attach point and their own settings) ----
import { hornPath as curvePath, membraneWing as skinWing } from '../engine/creature.js';
import { placedIn as turnedIn } from '../engine/shapes.js';

/** The kinds of wing wing() can draw. No arguments: a list. */
export const WING_KINDS = ['leaf', 'bat', 'moth'];

/**
 * Draws one wing from its root: a leaf with a leaflet under it, a bat's skin stretched over fingers, or a moth's two lobes with an eye spot.
 * Arguments: g (the Surface); at ({ x, y }: the root, for example the back socket); o: { kind (one of WING_KINDS), length (pixels from the root to the tip), angle (rig angle it points along: 0 down, PI/2 right, PI up; change it for a flap), fold (0 open .. 1 pulled in), paint (a colour or a ramp) }. Draw it in the behind hook; for a pair draw the far wing first, shorter, in farRamp() of the colour.
 */
export function wing(g, at, o = {}) {
  const len = o.length ?? 12, angle = o.angle ?? PI + 1.2, fold = clamp(o.fold ?? 0);
  const paint = typeof o.paint === 'string' ? ramp(o.paint) : o.paint ?? ramp('#7a4fc4');
  const box = [at.x - len - 2, at.y - len - 2, at.x + len + 2, at.y + len + 2];
  const [tx, ty] = reach(at.x, at.y, angle, len);
  if (o.kind === 'leaf') {
    const [ux, uy] = reach(at.x, at.y, angle + 0.8 * (1 - 0.6 * fold), len * 0.62);
    g.fill(...box, petalIn(at.x, at.y, ux, uy, len * 0.34, { belly: 0.5, blunt: 0.25 }), paint);
    g.fill(...box, petalIn(at.x, at.y, tx, ty, len * 0.5, { belly: 0.5, blunt: 0.25 }), paint);
    g.line(at.x, at.y, lerp(at.x, tx, 0.8), lerp(at.y, ty, 0.8), paint.light);                 // the midrib
  } else if (o.kind === 'bat') {
    const skin = skinWing(at.x, at.y, angle, len, { fingers: 3, spread: 1.5, fold: fold * 0.7, scoop: 0.55 });
    g.fill(...box, skin.inside, paint, { shade: 0 });
    for (const [fx, fy] of skin.tips) g.line(skin.wrist[0], skin.wrist[1], fx, fy, paint.dark);
    g.line(at.x, at.y, skin.wrist[0], skin.wrist[1], paint.light);
  } else if (o.kind === 'moth') {
    const lobe = (a, l, wide) => { const [mx, my] = reach(at.x, at.y, a, l * 0.52); return turnedIn(ovalIn(0, 0, l * 0.52, wide), mx, my, { angle: Math.atan2(Math.cos(a), Math.sin(a)) }); };
    g.fill(...box, lobe(angle + 0.95 * (1 - 0.6 * fold), len * 0.62, len * 0.24), paint);
    g.fill(...box, lobe(angle, len, len * 0.34), paint);
    const [sx, sy] = reach(at.x, at.y, angle, len * 0.62);                                      // the eye spot
    g.ellipse(Math.round(sx), Math.round(sy), 2, 2, paint.light, { shade: 0 });
    g.rect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2, paint.dark, { shade: 0 });
  }
}

/** The kinds of tail tail() can draw. No arguments: a list. */
export const TAIL_KINDS = ['thin', 'leafy'];

/**
 * Draws a tail from its root that sets off back and down and curls up at the end: a thin whip with a small leaf for a tip, or a thicker one that ends in a big leaf.
 * Arguments: g (the Surface); at ({ x, y }: the root, at the back of the hip); o: { kind (one of TAIL_KINDS), length (1 = standard), sway (-1..1: it curls further as the body sways; pass P.sway), body (a colour or a ramp for the tail), tip (a colour or a ramp for the leaf at its end) }. Draw it in the behind hook.
 */
export function tail(g, at, o = {}) {
  if (!TAIL_KINDS.includes(o.kind)) return;
  const leafy = o.kind === 'leafy', len = o.length ?? 1, a0 = -PI / 2 + 0.5, curl = -(1.3 + 0.35 * (o.sway ?? 0)), L = (leafy ? 6.5 : 9) * len;
  const paintOf = (c, fallback) => (typeof c === 'string' ? ramp(c) : c ?? ramp(fallback));
  const box = [at.x - L - 10, at.y - L - 10, at.x + 3, at.y + L + 3];
  g.fill(...box, curveIn(at.x, at.y, a0, L, { curl, steps: 6, width: leafy ? 2.6 : 1.8, tip: 1 }), paintOf(o.body, '#4f9d57'), { shade: 0 });
  const pts = curvePath(at.x, at.y, a0, L, { curl, steps: 6 }), [ex, ey] = pts[6], [qx, qy] = pts[5];
  const [tx, ty] = reach(ex, ey, Math.atan2(ex - qx, ey - qy), leafy ? 6 * len : 3.6);
  g.fill(...box, petalIn(ex, ey, tx, ty, leafy ? 4.6 : 3, { belly: 0.45, blunt: 0.3 }), paintOf(o.tip, '#7a4fc4'));
}

/** The kinds of horns horns() can draw. No arguments: a list. */
export const HORN_KINDS = ['nubs', 'curled', 'twig'];

/**
 * Draws a pair of horns on the head, upright (call it in the head hook): two nubs, a ram's tight curl on the side of the head with the far tip showing, or a pair of forked twigs.
 * Arguments: g (the Surface); J, d (the joints and measurements the hook was given); o: { kind (one of HORN_KINDS), length (1 = standard), bone (a colour for nubs and curls, default bone), wood (a colour for twigs, default brown) }.
 */
export function horns(g, J, d, o = {}) {
  const [hx, hy] = J.head, R = d.headR, len = o.length ?? 1, L = 8 * len + 4;
  const box = [hx - R - L, hy - R - L, hx + R + L, hy + R];
  const boneHex = o.bone ?? '#f0ead8', woodHex = o.wood ?? '#9a6a3e';
  const bone = ramp(boneHex), boneFar = farRamp(boneHex), wood = ramp(woodHex), woodFar = farRamp(woodHex);
  if (o.kind === 'nubs') {
    g.fill(...box, curveIn(hx + R * 0.55, hy - R * 0.7, PI - 0.15, 2.4 * len, { width: 2.2, tip: 1 }), boneFar);
    g.fill(...box, curveIn(hx - R * 0.1, hy - R * 0.8, PI + 0.25, 3 * len, { curl: -0.4, width: 2.8, tip: 1 }), bone);
  } else if (o.kind === 'curled') {
    // up, back, round and down in a tight curl on the side of the head, like a ram's; the far one only shows its tip
    g.fill(...box, curveIn(hx + R * 0.35, hy - R * 0.85, PI + 0.9, 2.6 * len, { curl: 0.9, width: 2, tip: 0.9 }), boneFar);
    g.fill(...box, curveIn(hx - R * 0.3, hy - R * 0.55, PI + 0.2, 9 * len, { curl: 3.7, steps: 9, width: 3, tip: 1 }), bone);
  } else if (o.kind === 'twig') {
    g.fill(...box, curveIn(hx + R * 0.5, hy - R * 0.75, PI - 0.3, 4.5 * len, { curl: 0.5, width: 1.5, tip: 1 }), woodFar, { shade: 0 });
    const stem = curvePath(hx - R * 0.1, hy - R * 0.85, PI + 0.3, 6.5 * len, { curl: -0.5, steps: 4 });
    g.fill(...box, curveIn(hx - R * 0.1, hy - R * 0.85, PI + 0.3, 6.5 * len, { curl: -0.5, steps: 4, width: 2, tip: 1 }), wood, { shade: 0 });
    g.fill(...box, curveIn(stem[2][0], stem[2][1], PI - 0.9, 3.2 * len, { width: 1.4, tip: 1 }), wood, { shade: 0 });
    g.fill(...box, curveIn(stem[3][0], stem[3][1], PI + 1.2, 2.4 * len, { width: 1.3, tip: 1 }), wood, { shade: 0 });
  }
}

/**
 * Returns [x, y], the point where a nose() of a kind reaches furthest forward on an upright head (or furthest down), so a pose can keep a held thing clear of the face.
 * Arguments: J (the joints, or { head: [x, y] }), d (dims), opt { kind (one of NOSES, default 'long'), size (1 = standard, as nose() takes it), low (true: the lowest point of the nose instead of the furthest forward) }.
 */
export function noseTip(J, d, opt = {}) {
  const s = (opt.size ?? 1) * d.headR / 5.6, [hx, hy] = J.head, R = d.headR, x = hx + R * 0.88, y = hy + R * 0.22;
  if (opt.kind === 'hooked') return opt.low ? [x + 1.6 * s, y + 3.6 * s + 0.8] : [x + 3.8 * s, y - 0.2 * s];
  if (opt.kind === 'stub') return opt.low ? [Math.round(x) + 0.5, Math.round(y) + 0.7 + 1.4 * s] : [Math.round(x) + 0.7 + 1.4 * s, Math.round(y) + 0.5];
  return opt.low ? [x + 2 * s, y + 0.3 * s + 1.3 * s] : [x + 5 * s + 0.6, y + 0.8 * s];
}

/**
 * Returns the angle for a held item, tipped forward from P.item only as far as it takes (never below level) to pass clear of some points, such as the tip of a nose, so a carried weapon never lies across the face.
 * Arguments: P (the pose; not changed), d (dims), item ({ length, pad } as itemSizeOf() gives), points ([[x, y], ...] in frame pixels, or (J) => such a list, given the solved joints), opt { room (pixels the grip must keep from every point, default 2.2; the far end keeps its own width `pad` more) }.
 */
export function itemClearOf(P, d, item, points, opt = {}) {
  const J = solve(P, d), [hx, hy] = J.armF.hand, wide = Math.max(item.pad ?? 1, 1.5), room = opt.room ?? 2.2;
  const pts = typeof points === 'function' ? points(J) : points;
  // how much room is to spare at an angle: the distance from each point to the item, less what that part of the item needs
  const spare = (a) => Math.min(...pts.map(([nx, ny]) => {
    const along = clamp((nx - hx) * Math.sin(a) + (ny - hy) * Math.cos(a), 0, item.length);
    return Math.hypot(nx - hx - Math.sin(a) * along, ny - hy - Math.cos(a) * along) - room - wide * (along / item.length);
  }));
  let a = Math.max(P.item, PI / 2);
  for (let i = 0; i < 30 && spare(a) < 0; i++) a -= 0.03;
  return Math.max(a, PI / 2);                               // level is as far forward as it goes
}

// ---- added in fix round 1 of batch R13 (the skeleton soldier and the thicket imp): carrying a shield, an item let go on
// ---- the ground, a clip laid over a resting pose of your own, and a rig body placed in a frame of another size ----
import { nudgeInside as moveInside } from '../engine/creature.js';

/**
 * Poses the far arm to carry a shield, changing P in place: the arm is held back so the shield hangs behind the hip, and in `block` it comes up between the body and the blow (frames 1 to 4 of the 6).
 * Arguments: P (the pose from pose()); clip (the clip's name); t (the clip phase 0..1). Returns true while the shield is raised in front of the body (draw it in the front hook), false while it is carried (draw it in the offhand hook).
 */
export function shieldPose(P, clip, t) {
  const up = clip === 'block' ? keys(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]) : 0;
  P.armB.a = lerp(-0.5 + 0.3 * (P.armB.a + 0.15), 1.05, up);
  P.armB.e = lerp(0.4, 1, up);
  return up > 0.5;
}

/**
 * Returns where the middle of a carried shield is, { x, y } for shield(): on the far hand, a pixel behind it when carried and a pixel in front of it when raised, and never in the ground.
 * Arguments: J (the joints); kind (one of SHIELD_KINDS); size (1 = standard); raised (what shieldPose() returned).
 */
export function shieldAt(J, kind, size = 1, raised = false) {
  const S = shieldSize(kind, size);
  return { x: J.armB.hand[0] + (raised ? 1 : -1), y: Math.min(J.armB.hand[1] - 1, J.gy - (S ? S.ry : 0) - 0.5) };
}

/**
 * Returns the rig angle at which an item that has been let go lies on the ground, pointing forward: a sword rests on its cross-guard with the point on the ground, an axe is propped up on its blade, anything else lies flat.
 * Arguments: kind (one of ITEM_KINDS); length (hand to tip in pixels, as itemSize() gives it). Draw the item at itemAboveGround() so its lowest part is on the ground, not in it.
 */
export function itemRest(kind, length) {
  if (kind === 'sword') return PI / 2 - Math.asin(clamp(1.2 / (length - 1.5), 0, 0.95));
  if (kind === 'axe') return PI / 2 + Math.asin(clamp(4.7 / (length - 2.5), 0, 0.95));
  return PI / 2 + 0.04;
}

/**
 * Keeps a held or fallen item out of the ground: returns the attach point moved up by the whole pixels it takes for the item's lowest pixel to be on the row above the ground row (the same point when it already is).
 * Arguments: at ({ x, y, angle }, as heldItem() takes it); gy (the ground row, J.gy); item (the settings heldItem() takes: { kind, length, ... }).
 */
export function itemAboveGround(at, gy, item) {
  const probe = new Surface(SIZE[0], SIZE[1]), fx = at.x - Math.floor(at.x), fy = at.y - Math.floor(at.y);
  heldItem(probe, { x: SIZE[0] / 2 + fx, y: SIZE[1] / 2 + fy, angle: at.angle }, item);      // the same sub-pixel place, in the middle of a spare layer
  const b = probe.bounds();
  if (!b) return at;
  const low = Math.floor(at.y) + (b.y1 - SIZE[1] / 2);                                        // the row its lowest pixel is on
  return low < gy ? at : { ...at, y: at.y - (low - (Math.round(gy) - 1)) };
}

/**
 * Lays the motion of one of the rig's clips over a resting pose of your own (a hover, a swim, a seat), changing `base` in place and returning it: whatever pose(name, u) changes from that clip's own last frame is added to it (rootX, lean, headTilt, lift and both arms), and its sway and flash are copied.
 * Arguments: base (your resting pose, with the fields of pose()); name, u, m, d (the clip, its phase 0..1 and the settings, as pose() takes them); opt: { crouch (a body with no feet on the ground cannot crouch, so the clip's crouch becomes a drop of this many times as much: default 0.5) }. The feet and the blink are left as `base` has them.
 */
export function layerPose(base, name, u, m = {}, d = dims(), opt = {}) {
  const A = pose(name, u, m, d), Z = pose(name, 1, m, d);
  for (const k of ['rootX', 'lean', 'headTilt']) base[k] += A[k] - Z[k];
  base.lift += A.lift - Z.lift - (opt.crouch ?? 0.5) * (A.crouch - Z.crouch);
  for (const arm of ['armF', 'armB']) { base[arm].a += A[arm].a - Z[arm].a; base[arm].e += A[arm].e - Z[arm].e; }
  base.sway = A.sway; base.flash = A.flash;
  return base;
}

/**
 * Fits a body drawn on this rig into a frame of another size (a small creature in a 48x48 frame): the body is painted on a rig-sized layer of its own, and the layer is placed so that the rig's middle column and ground row land on `anchor`, moved by the pixel or two that keeps the biggest looks inside the frame.
 * Arguments: size ([w, h] of the sprite's frame); anchor ([x, y]: where the rig's CX and GROUND go in that frame); margin (pixels kept clear at the frame's edge, default 1).
 * Returns { ox, oy (where the layer's corner sits in the frame), box ([x0, y0, x1, y1]: the frame less its border, in layer pixels: pass it as the `box` of effects drawn on the layer), draw(g, paint) (calls paint(layer), places the layer on g, returns the [dx, dy] it was moved by), sockets(out) (moves a set of sockets from layer pixels to frame pixels, in place, and returns it) }.
 */
export function inFrame(size, anchor, margin = 1) {
  const ox = anchor[0] - CX, oy = anchor[1] - GROUND;
  const box = [Math.max(margin, margin - ox), Math.max(margin, margin - oy), Math.min(SIZE[0] - margin, size[0] - margin - ox), Math.min(SIZE[1] - margin, size[1] - margin - oy)];
  return {
    ox, oy, box,
    draw(g, paint) {
      const layer = new Surface(SIZE[0], SIZE[1]);
      paint(layer);
      const b = layer.bounds();
      const [dx, dy] = b ? moveInside([[b.x0 + ox, b.y0 + oy], [b.x1 + 1 + ox, b.y1 + 1 + oy]], size[0], size[1], margin) : [0, 0];
      g.blit(layer, ox + dx, oy + dy);
      return [dx, dy];
    },
    sockets(out) {
      for (const k in out) { out[k].x += ox; out[k].y += oy; }
      return out;
    },
  };
}

/**
 * Returns [x, y], the middle of a ball of radius r held between the two hands: it touches both, in the crook between them on the side away from the body, and sits right between the hands when they are too far apart to touch it.
 * Arguments: J (the joints); r (the ball's radius in pixels); gap (pixels from the middle of a hand to the ball's rim, default 2).
 */
export function heldBetween(J, r, gap = 2) {
  const [ax, ay] = J.armB.hand, [nx, ny] = J.armF.hand, mx = (ax + nx) / 2, my = (ay + ny) / 2;
  const apart = Math.hypot(nx - ax, ny - ay), out = Math.sqrt(Math.max(0, (r + gap) ** 2 - (apart / 2) ** 2));
  const sx = mx - J.shoulder[0], sy = my - J.shoulder[1], reach = Math.hypot(sx, sy) || 1;
  let ux = sx / reach, uy = sy / reach;                                  // hands in one place: straight on from the shoulder
  if (apart > 1e-6) {
    ux = -(ny - ay) / apart; uy = (nx - ax) / apart;                     // across the line from hand to hand, on the side away from the body
    if (ux * sx + uy * sy < 0) { ux = -ux; uy = -uy; }
  }
  return [mx + ux * out, my + uy * out];
}
