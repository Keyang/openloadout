// Guard robot rig, on a 48x48 canvas: a heavy ground machine drawn in three directions, for the walking enemies of
// top-down games (a security robot, a tank drone, a loader gone wrong). It is built on the top-down creature rig
// (rigs/creature-topdown.js): the same three-quarter view, the same creature space (a forward, b to its own right, c up)
// and the same clip names, and its parts are painted by engine/groundbot.js. The worked example is
// sprites/security-bot.js.
//
// The rig is the code; a sprite on it is choices (Contract 13): its proportions, whether it runs on treads or legs,
// which head, which weapon, what stands on its rear deck, its colours, and which of the poses are its clips. The
// machine is described ONCE, as boxes and rods in its own space, and the rig places it for the direction it faces:
// no direction is drawn by hand, so a new part or pose is right in all three at once.
//
//   clips(speedOf, entries)          the clip table (rigs/creature-topdown.js names the direction clips)
//   frame(clip, t, p, opt)           ONE FRAME, posed once: F.draw(g, look), F.finish(g, look), F.sockets()
//   dims, pose, solve, draw, lights, sockets      what frame() is made of, for a pose of your own
//   DRIVES, HEADS, WEAPONS, PACKS    the names of what it runs on, its heads, its weapons and what it carries
//
//   import * as B from '../rigs/guard-bot.js';
//   const frameOf = (clip, t, p, frame) => B.frame(clip, t, p, { drive: p.legs, head: p.shape, frame,
//     weapon: { kind: p.weapon, length: p.weaponLength }, pack: { kind: p.pack, size: p.packSize } });
//   // in defineSprite:  size: B.SIZE, pivot: B.PIVOT, clips: B.clips((p) => p.speed, ['idle_down', 'walk*', 'attack*', 'shoot*', 'hurt', 'die']),
//   sockets: (clip, t, p) => frameOf(clip, t, p).sockets(),
//   render(g, { clip, t, frame, p }) { const F = frameOf(clip, t, p, frame), look = { body: p.body, accent: p.accent, glow: p.glow }; F.draw(g, look); F.finish(g, look); }
//
// What it is made of, from the floor up: two caterpillar tracks with a dark underbody between them, or four jointed
// legs; a broad armoured hull with a band of hazard stripes and a lamp at each end of it on the wall the camera sees;
// a small head with one lens that looks the way it faces; a weapon on a housing at its right shoulder, pointing
// forward (socket `hand`, its far end `muzzle`); and on the rear deck a siren, two exhaust stacks or nothing (`back`).
//
// The poses (POSES): idle (the engine rumbles, the lens scans, one blink), walk (the tracks turn or the legs trot in
// two pairs; it dips on frames 0 and 4 of 8), attack (a charge: it lowers itself for three frames with its lights
// flashing, rams forward on frames 4 and 5 and brakes), shoot (aim, fire on frame 1, recoil, recover; with a saw or a
// claw the tool is thrust out instead, with no weapon it is a shove), hurt (white recoil), die (it shudders and
// sparks, its lights go out, the hull drops, the head sags forward one way and the weapon hangs: a shutdown slump
// that stays, smoking).
//
// How far a pose travels is in picture pixels along the way it faces, and is scaled down when the frame has less
// room than the pose asks for, so a charge always shows and nothing ever reaches the frame's edge.
// Pure functions: Node and browser, no Math.random. Angles of sockets: 0 = down the picture, PI/2 = right, PI = up.

import * as K from './creature-topdown.js';
import { lerp, clamp, pulse, wave, PI, TAU } from '../engine/motion.js';
import { ramp, farRamp, tone, brightness, INK } from '../engine/color.js';
import { stripesIn } from '../engine/solids.js';
import { armourBlock } from '../engine/warmachine.js';
import { steps, glow, twinkle, puffs, particles, starburst, lamp } from '../engine/fx.js';
import { speedLines } from '../engine/fx-floor.js';
import { boxView, trackPod, botHead, botWeapon, botPack, BOT_HEADS, BOT_WEAPONS, BOT_PACKS } from '../engine/groundbot.js';

/** The frame of a guard robot, [width, height] in pixels (a small top-down creature: style guide, section 1). */
export const SIZE = K.SIZE;
/** The ground line: what it stands on rests on the row above it and the outline lands on it. */
export const GROUND = K.GROUND;
/** The pivot column: the machine is centred on it. */
export const CX = K.CX;
/** Where a game anchors the sprite, [x, y]: the floor under its middle. */
export const PIVOT = K.PIVOT;
/** What it runs on: treads (two caterpillar tracks) or legs (four jointed legs). */
export const DRIVES = Object.freeze(['treads', 'legs']);
/** The heads: dome, block, sensor (drawn by botHead in engine/groundbot.js). */
export const HEADS = BOT_HEADS;
/** The weapons: cannon, saw, claw (drawn by botWeapon in engine/groundbot.js). */
export const WEAPONS = BOT_WEAPONS;
/** What it can carry on its rear deck: siren, exhaust (drawn by botPack in engine/groundbot.js). */
export const PACKS = BOT_PACKS;
/** The poses pose() knows, each an action of a clip: idle, walk, attack, shoot, hurt, die. */
export const POSES = Object.freeze(['idle', 'walk', 'attack', 'shoot', 'hurt', 'die']);

const R = Math.round;
const odd = (v) => 2 * R((v - 1) / 2) + 1;
const WEAPON_LENGTH = { cannon: 8, saw: 8, claw: 8 };
const HEAD_SIZE = { dome: [9, 9, 5], block: [9.4, 7.4, 4.6], sensor: [6.6, 5.4, 7.4] };   // wide, len, tall
/** How far the pieces of the picture are kept from the frame's edge: 2 px, the outline and the empty border. */
const MARGIN = 2;

/**
 * Builds the clip table of a guard robot in the order given, with direction clips named and labelled as the top-down rigs name them.
 * Arguments: speedOf ((p) => the Speed slider, 0..1); entries (a list, as clips() of rigs/creature-topdown.js takes it: 'walk*' is that action in all three directions, 'idle_down' one direction, 'hurt' a clip with no direction, { name, label } another button text).
 */
export const clips = (speedOf = () => 0.5, entries = ['idle_down', 'walk*', 'attack*', 'shoot*', 'hurt', 'die']) => K.clips(speedOf, entries);

// ---- measurements -------------------------------------------------------------------------------

/**
 * Returns the measurements of a guard robot in whole pixels of its own space, from its sliders and the parts it carries.
 * Arguments: p ({ size, bulk } each 0..1, missing = 0.5: the whole machine, light to heavy); opt { drive (one of DRIVES, default 'treads'), head (one of HEADS, default 'block'), weapon: { kind (one of WEAPONS, or 'none'), length (a multiplier, default 1) }, pack: { kind (one of PACKS, or 'none'), size (a multiplier, default 1) } }.
 * Returns { s (the scale, 0.88 to 1.12), drive, wide, len, tall (the hull), rise (how high its underside is carried), tread { wide, len, tall, b (the middle of a track, out from the middle line) }, leg { out (how far the feet stand beyond the hull's side), knee (how high the knees stand), w (thickness), hipA, footA (where hips and feet are along the body) }, head { kind, wide, len, tall, a }, weapon { kind, length, k, mount [a, b, c] }, pack { kind, size, mount [a, b, c] } }.
 */
export function dims(p = {}, opt = {}) {
  const size = clamp(p.size ?? 0.5), bulk = clamp(p.bulk ?? 0.5), s = lerp(0.88, 1.12, size);
  const drive = DRIVES.includes(opt.drive) ? opt.drive : 'treads';
  const wide = odd(lerp(14.4, 19.6, bulk) * s), len = odd(lerp(11.6, 14.4, bulk) * s), tall = R(lerp(5.6, 7.6, bulk) * s), rise = R(4.4 * s);
  const tw = R(lerp(4.8, 6.6, bulk) * s);
  const hk = HEADS.includes(opt.head) ? opt.head : 'block', [hw, hl, ht] = HEAD_SIZE[hk];
  const wk = WEAPONS.includes(opt.weapon?.kind) ? opt.weapon.kind : 'none', pk = PACKS.includes(opt.pack?.kind) ? opt.pack.kind : 'none';
  return {
    s, drive, wide, len, tall, rise,
    tread: { wide: tw, len: len + 2 * R(2.2 * s), tall: rise + 1, b: wide / 2 + tw / 2 - 1 },
    leg: { out: R(lerp(5, 6.4, bulk) * s), knee: rise + R(3.6 * s), w: R(lerp(2.4, 3.4, bulk)), hipA: len * 0.3, footA: len * 0.3 + 2.5 },
    head: { kind: hk, wide: odd(hw * s), len: odd(hl * s), tall: R(ht * s), a: 1 },
    weapon: { kind: wk, length: (WEAPON_LENGTH[wk] ?? 0) * (opt.weapon?.length ?? 1) * s, k: s * lerp(0.92, 1.12, bulk), mount: [0, wide / 2 + 2, rise + 1] },
    pack: { kind: pk, size: (opt.pack?.size ?? 1) * s, mount: [-(len / 2 - 2.5), -(wide / 2 - 3.5), rise + tall] },
  };
}

// ---- poses ----------------------------------------------------------------------------------------

/**
 * Returns the pose of a guard robot at phase t (0..1) of an action, the same for every direction: solve() turns it into a picture for the direction faced.
 * Arguments: action (one of POSES; any other name gives the resting pose); t; m { bounce: 0..1, how much it rumbles }; d (dims()).
 * The pose: x (picture px it has travelled the way it faces; negative: backward), reach (the furthest forward this clip goes: the travel is scaled to the room the frame has), drop (px the hull has sunk on its springs), lift (px the whole machine is thrown up), sway (px the hull has shaken to its right), head ([a, b, c]: the head moved forward, to its right and up, in its own px), look (-1..1: where the lens looks), eye, lamps (0 off, 0.5 dim, 1 lit, 2 flaring), spin (a whole number: the siren's lamp turning), tread (whole px the tracks have turned), feet (four { x, y, out }: each foot forward of its resting spot, off the floor and further out; the right side's front and rear, then the left's), arm { thrust, droop, work, grip (as botWeapon takes them) }, fire (true on the frame the cannon fires), ram (0..1 while it charges, else -1), hit (true on the frame the charge lands), puff (null, or { t, loop, big }: the exhaust), sparks, smoke (0..1 while it sparks and smokes, else -1), dead (its lights are out for good), flash (tint this frame white).
 */
export function pose(action, t, m = {}, d = dims()) {
  const bounce = clamp(m.bounce ?? 0.5), legs = d.drive === 'legs', gun = d.weapon.kind;
  const P = {
    x: 0, reach: 0, drop: 0, lift: 0, sway: 0, head: [0, 0, 0], look: 0, eye: 1, lamps: 1, spin: 0, tread: 0,
    feet: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, out: 0 })), arm: { thrust: 0, droop: 0, work: 0, grip: null },
    fire: false, ram: -1, hit: false, puff: null, sparks: -1, smoke: -1, dead: false, flash: false,
  };
  const each = (fn) => { for (let side = 0; side < 2; side++) for (let i = 0; i < 2; i++) fn(P.feet[side * 2 + i], i, side); };
  const at = (frames) => clamp(R(t * (frames - 1)), 0, frames - 1);
  if (action === 'idle') {
    // the engine turns over: the hull sinks and rises on its springs, a hard-running one shakes; the lens scans and blinks once
    const n = Math.floor(t * 8 + 1e-6);
    P.drop = pulse(t) * lerp(0.8, 2.2, bounce);
    P.sway = bounce > 0.7 && n % 2 ? 1 : 0;
    P.look = wave(t);
    P.eye = t >= 0.74 ? 0.5 : 1;
    P.spin = n; P.arm.work = n;
    P.puff = { t, loop: true };
  } else if (action === 'walk') {
    // the tracks turn a cleat a frame, or the legs trot in two pairs; it comes down on frames 0 and 4 and rides up between
    const n = Math.floor(t * 8 + 1e-6);
    P.tread = n;
    if (legs) each((f, i, side) => Object.assign(f, K.step(t + K.gait(i, side), { stride: 2.6, lift: lerp(1.6, 2.8, bounce) })));
    P.drop = lerp(0.6, 2, bounce) * (0.5 + 0.5 * Math.cos(2 * TAU * t));
    P.sway = legs ? Math.sin(TAU * t) * lerp(0.5, 1.2, bounce) : 0;
    P.head = [0, 0, -(P.drop > 1 ? 0 : n % 4 === 1 ? 1 : 0)];                 // the head comes down a frame after the hull
    P.look = 0.6 * wave(t);
    P.spin = n; P.arm.work = 2 * n;
    P.puff = { t, loop: true };
  } else if (action === 'attack') {
    // the charge, frames of 8: 0 idle, 1 to 3 it lowers itself and draws back, lights flashing (the warning), 4 it rams, 5 the hit
    // (furthest forward), 6 it brakes nose down, 7 idle
    const n = at(8);
    P.x = [0, -1, -2, -3, 4, 8, 3, 0][n]; P.reach = 8;
    P.drop = [0, 1, 2, 2, 1, 0, 2, 0][n];
    P.eye = [1, 2, 0.5, 2, 2, 2, 1, 1][n]; P.lamps = [1, 2, 0.5, 2, 2, 1, 1, 1][n];
    P.tread = [0, -1, -2, -3, 1, 5, 7, 8][n];
    P.head = [[0, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 0]][n];
    P.arm.thrust = [0, -1, -1, -1, 1, 2, 1, 0][n]; P.arm.work = 3 * n; P.spin = 2 * n;
    P.ram = [-1, -1, -1, -1, 0.1, 0.45, 0.85, -1][n];
    P.hit = n === 5;
    P.puff = n >= 2 && n <= 6 ? { t: (n - 2) / 4, loop: false, big: true } : null;
    if (legs) each((f, i) => {
      f.out = [0, 1, 1, 1, 0, 0, 0, 0][n];
      if (n === 4) { f.y = i === 0 ? 2 : 0; f.x = i === 0 ? 2 : -2; }           // the front feet reach out, the rear ones push off
      if (n === 6) f.x = i === 0 ? 2 : 1;                                       // it digs in to stop
    });
  } else if (action === 'shoot') {
    // frames of 6: 0 aim, 1 fire, 2 recoil 2 px, 3 to 4 recover, 5 idle. A saw or a claw is thrust out instead; with no weapon it is a shove
    const n = at(6);
    P.eye = [2, 2, 1, 1, 1, 1][n];
    if (gun === 'cannon') {
      P.x = [0, 0, -2, -1, 0, 0][n]; P.drop = [1, 1, 0, 1, 0, 0][n];
      P.arm.thrust = [1, 2, -2, -1, 0, 0][n];
      P.head = [[1, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]][n];
      P.fire = n === 1; P.lamps = n === 1 ? 2 : 1;
      P.puff = n >= 1 && n <= 4 ? { t: (n - 1) / 3, loop: false } : null;
    } else if (gun === 'saw' || gun === 'claw') {
      P.x = [0, 1, 1, 0, 0, 0][n]; P.reach = 1; P.drop = [1, 1, 0, 0, 0, 0][n];
      P.arm.thrust = [1, 3, 3, 1, 0, 0][n]; P.arm.work = 3 * n;
      P.arm.grip = n < 5 ? [2, 2, 0, 0, 1][n] : null;
    } else {
      P.x = [0, 2, 3, 1, 0, 0][n]; P.reach = 3; P.drop = [1, 0, 0, 1, 0, 0][n];
      P.head = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]][n];
    }
  } else if (action === 'hurt') {
    // frames of 4: 0 knocked back and up, white; 1 it lands and dips; 2 nearly back; 3 idle
    const n = at(4);
    P.flash = n === 0;
    P.x = [-3, -2, -1, 0][n]; P.lift = [1, 0, 0, 0][n]; P.drop = [0, 2, 1, 0][n];
    P.head = [[-1, 0, 1], [-1, 0, 0], [0, 0, 0], [0, 0, 0]][n];
    P.eye = [0.5, 0.5, 1, 1][n]; P.lamps = [0.5, 0.5, 1, 1][n];
    P.arm.thrust = [-1, -1, 0, 0][n];
    if (legs) each((f) => { f.out = [1, 1, 0, 0][n]; });
  } else if (action === 'die') {
    // the shutdown, frames of 8: 0 the hit (white), 1 to 2 it shudders and sparks and the lights flicker, 3 to 4 the hull drops, the
    // head sags forward and to one side (one way only) and the weapon hangs, 5 it settles with a small bounce, 6 to 7 still, dark, smoking
    const n = at(8);
    P.flash = n === 0;
    P.x = [-2, -2, -1, -1, -1, -1, -1, -1][n]; P.lift = [1, 0, 1, 0, 0, 0, 0, 0][n];
    P.drop = [0, 0, 0, 2, 4, 3, 4, 4][n];
    P.head = [[-1, 0, 0], [0, 0, 0], [0, 0, 0], [1, 0, 0], [2, 1, -1], [3, 2, -1], [3, 2, -2], [3, 2, -2]][n];
    P.arm.droop = [0, 0, 1, 2, 4, 6, 6, 6][n]; P.arm.work = Math.min(n, 2); P.arm.grip = n >= 3 ? 2 : null;
    P.eye = [0.5, 1, 0.5, 1, 0.5, 0, 0, 0][n]; P.lamps = [0.5, 1, 0.5, 0.5, 0, 0, 0, 0][n];
    P.spin = Math.min(n, 3);
    P.dead = n >= 5;
    P.sparks = n >= 1 && n <= 5 ? (n - 1) / 4 : -1;
    P.smoke = n >= 4 ? (n - 4) / 3 : -1;
    if (legs) each((f) => { f.out = [0, 0, 0, 1, 2, 2, 2, 2][n]; });
  }
  return P;
}

// ---- joints ---------------------------------------------------------------------------------------

const FORWARD = { down: [0, 1], up: [0, -1], side: [1, 0] };
const RIGHT = { down: [-1, 0], up: [1, 0], side: [0, K.DEPTH] };
const FACE_ANGLE = { down: 0, up: PI, side: PI / 2 };

/**
 * Works out where every piece of a posed guard robot is for the direction it faces, in frame pixels, and keeps the whole machine inside the frame.
 * Arguments: direction ('down', 'up' or 'side'); P (a pose); d (dims()); opt { cx, gy (the pivot: default CX and GROUND) }.
 * Returns J { dir, gy, origin ([x, y]: the floor under its middle at rest), move ([dx, dy]: how far the pose has moved the whole machine), at(a, b, c) (a point of the sprung body, moved with the pose, as [x, y, z]), floor(a, b, c) (a point that stays with the tracks or the floor), hull, belly, treads ([left, right] or null), head (box views, as boxView of engine/groundbot.js returns them), legs ([{ i, side, near, hip, knee, foot, z }] or null), weapon, pack (what botWeapon and botPack measured, or null), box ([x0, y0, x1, y1]: everything it covers) }.
 */
export function solve(direction, P, d, opt = {}) {
  const dir = K.DIRECTIONS.includes(direction) ? direction : 'down', cx = opt.cx ?? CX, gy = opt.gy ?? GROUND;
  const treads = d.drive === 'treads', F = FORWARD[dir], Rt = RIGHT[dir];
  const stand = treads ? [[d.tread.len / 2, d.tread.b + d.tread.wide / 2]] : [[d.leg.footA, d.wide / 2 + d.leg.out]];
  // the floor row: the lowest corner of what it stands on, at rest, is on the row above gy
  let low = -Infinity;
  for (const [a, b] of stand) for (const sa of [-1, 1]) for (const sb of [-1, 1]) low = Math.max(low, K.project(dir, sa * a, sb * b, 0, [0, 0])[1]);
  const origin = [cx + 0.5, gy - low];
  const drop = Math.min(R(P.drop ?? 0), d.rise - 1), sway = R((P.sway ?? 0) * (dir === 'side' ? K.DEPTH : 1));
  const build = (travel, shift) => {
    const base = [R(F[0] * travel) + shift[0], R(F[1] * travel) - R(P.lift ?? 0) + shift[1]];
    const sprungBy = [base[0] + Rt[0] * (dir === 'side' ? 0 : sway), base[1] + (dir === 'side' ? sway : 0) + drop];
    const floor = (a, b, c) => { const q = K.project(dir, a, b, c, origin); return [q[0] + base[0], q[1] + base[1], q[2]]; };
    const at = (a, b, c) => { const q = K.project(dir, a, b, c, origin); return [q[0] + sprungBy[0], q[1] + sprungBy[1], q[2]]; };
    const J = { dir, gy, origin, move: base, at, floor, treads: null, belly: null, legs: null, weapon: null, pack: null };
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const add = (x0, y0, x1, y1) => { box[0] = Math.min(box[0], x0); box[1] = Math.min(box[1], y0); box[2] = Math.max(box[2], x1); box[3] = Math.max(box[3], y1); };
    const view = (V) => { add(V.x0, V.top, V.x1, V.bottom); return V; };
    J.hull = view(boxView(at, { c: d.rise, len: d.len, wide: d.wide, tall: d.tall }));
    if (treads) {
      J.treads = [-1, 1].map((sgn) => view(boxView(floor, { b: sgn * d.tread.b, len: d.tread.len, wide: d.tread.wide, tall: d.tread.tall })));
      J.belly = view(boxView(floor, { c: 1, len: d.len - 4, wide: d.wide - 2, tall: d.rise }));
    } else {
      J.legs = [];
      for (let side = 0; side < 2; side++) for (let i = 0; i < 2; i++) {
        const sgn = side ? -1 : 1, fwd = i ? -1 : 1, f = P.feet?.[side * 2 + i] ?? { x: 0, y: 0, out: 0 };
        const hip = at(fwd * d.leg.hipA, sgn * (d.wide / 2 - 1), d.rise + 1.5);
        const foot = floor(fwd * d.leg.footA + f.x, sgn * (d.wide / 2 + d.leg.out + (f.out ?? 0)), f.y);
        const knee = floor(fwd * (d.leg.hipA + 1) + f.x * 0.5, sgn * (d.wide / 2 + d.leg.out * 0.55 + (f.out ?? 0)), Math.max(2, d.leg.knee - drop * 0.6) + f.y * 0.5);
        J.legs.push({ i, side: side ? 'left' : 'right', near: dir === 'side' && !side, hip: [hip[0], hip[1]], knee: [knee[0], knee[1]], foot: [foot[0], R(foot[1]) - 0.5], z: dir === 'side' ? foot[2] : -Infinity });
        add(Math.floor(Math.min(hip[0], knee[0], foot[0])) - 2, Math.floor(Math.min(hip[1], knee[1])) - 2, Math.ceil(Math.max(hip[0], knee[0], foot[0])) + 3, R(foot[1]));
      }
    }
    const h = P.head ?? [0, 0, 0];
    J.head = boxView(at, { a: d.head.a + h[0], b: h[1], c: d.rise + d.tall + h[2], len: d.head.len, wide: d.head.wide, tall: d.head.tall });
    add(J.head.x0 - 1, J.head.top - 5, J.head.x1 + 1, J.head.bottom);
    if (d.weapon.kind !== 'none') { J.weapon = botWeapon(null, d.weapon.kind, at, weaponOf(dir, P, d)); add(...J.weapon.box); }
    if (d.pack.kind !== 'none') { J.pack = botPack(null, d.pack.kind, at, { mount: d.pack.mount, size: d.pack.size }); add(...J.pack.box); }
    J.box = box;
    return J;
  };
  // how far forward the frame lets it go, measured standing still; a pose that asks for more is scaled to fit
  const rest = build(0, [0, 0]).box, W = opt.width ?? SIZE[0], H = opt.height ?? SIZE[1];
  const room = dir === 'down' ? H - MARGIN - rest[3] : dir === 'up' ? rest[1] - MARGIN : W - MARGIN - rest[2];
  const x = P.x ?? 0, reach = Math.max(P.reach ?? 0, x, 1e-6);
  const travel = x > 0 ? x * Math.min(1, Math.max(0, room) / reach) : x;
  let J = build(travel, [0, 0]);
  // and whatever a pose or a part still pushes past the border moves the whole machine back inside it
  const dx = J.box[0] < MARGIN ? MARGIN - J.box[0] : J.box[2] > W - MARGIN ? W - MARGIN - J.box[2] : 0;
  const dy = J.box[1] < MARGIN ? MARGIN - J.box[1] : J.box[3] > H - MARGIN ? H - MARGIN - J.box[3] : 0;
  if (dx || dy) J = build(travel, [dx, dy]);
  return J;
}

/** What botWeapon is told for a pose and a direction. */
const weaponOf = (dir, P, d, C = {}) => ({
  mount: d.weapon.mount, length: d.weapon.length, facing: dir, k: d.weapon.k,
  thrust: P.arm?.thrust ?? 0, droop: P.arm?.droop ?? 0, work: P.arm?.work ?? 0, ...(P.arm?.grip === null || P.arm?.grip === undefined ? {} : { grip: P.arm.grip }), ...C,
});

// ---- painting -------------------------------------------------------------------------------------

/** The ramps and colour steps of a look: { body, far, K, dark, metal, accent, light (steps), seam }. */
function paints(look = {}) {
  const body = look.body ?? '#6b7896', K0 = ramp(look.dark ?? '#434d6d');
  // bright fittings are kept clear of the armour's own value: on armour as pale as they are, they go darker
  let metal = look.metal ?? '#c2c9d6';
  if (Math.abs(brightness(metal) - brightness(body)) < 0.12) metal = tone(metal, -1.1);
  return {
    body: ramp(body), far: farRamp(body), K: K0, dark: { light: K0.light, base: K0.base, dark: K0.base }, metal: ramp(metal),
    accent: ramp(look.accent ?? '#f2a030'), light: steps(look.glow ?? '#e2473f', { core: look.core ?? '#f0ead8' }), seam: ramp(body).deep,
  };
}

/** The hull: an armour block with a band of hazard stripes on the wall the camera sees, and a lamp at each end of the band (one, at the front end, seen from the side). */
function drawHull(g, J, P, d, C) {
  const V = J.hull, B = armourBlock(g, { ...V, inset: 1, cut: [1, 1], paint: C.body, shade: 2, seam: C.seam });
  // seen from the side, the near track hides the foot of the wall
  const seen = (J.dir === 'side' && J.treads ? Math.min(V.bottom, J.treads[1].top) : V.bottom) - V.face;
  const y0 = V.face + 1, bh = clamp(seen - 2, 2, 4), lw = 2;
  const band = (px, py) => B.front(px, py) && py >= y0 && py < y0 + bh && px >= V.x0 + 1 && px < V.x1 - 1;
  g.fill(V.x0, y0, V.x1, y0 + bh, band, C.K.base, { shade: 0 });
  g.fill(V.x0, y0, V.x1, y0 + bh, stripesIn(band, { pitch: 4, slant: 1, duty: 0.5, phase: V.x0 + V.face }), C.accent.base, { shade: 0 });
  const level = P.lamps ?? 1, lens = level >= 1.5 ? C.light[1] : level >= 0.75 ? C.light[3] : level >= 0.25 ? C.light[4] : C.K.dark;
  J.lamps = (J.dir === 'side' ? [V.x1 - 2 - lw] : [V.x0 + 2, V.x1 - 2 - lw]).map((x) => ({ x, y: y0, w: lw, h: bh }));
  for (const Lm of J.lamps) {
    g.rect(Lm.x - 1, Lm.y, Lm.w + 2, Lm.h, C.K.base);
    g.rect(Lm.x, Lm.y, Lm.w, Lm.h, lens);
    if (level >= 0.75 && level < 1.5) g.dot(Lm.x + Lm.w - 1, Lm.y, C.light[2]);
  }
  // a plate line across the deck, and the hatch the head stands on
  if (V.face - V.top >= 5) g.fill(V.x0, V.top, V.x1, V.face, (px, py) => B.top(px, py) && Math.floor(py) === V.face - 2, C.body.base, { shade: 0 });
}

/** One leg: a thick thigh up to a knee cap in the hazard colour, a steel shin down to a dark foot pad. */
function drawLeg(g, Lg, d, C, far) {
  K.drawLegs(g, { legs: [Lg] }, far ? C.far : C.body, { width: d.leg.w, toe: C.metal.base });
  g.limb(Lg.knee[0], Lg.knee[1], Lg.foot[0], Lg.foot[1] - 1, Math.max(2, d.leg.w - 1), C.metal, { shade: 1 });
  g.rect(Math.floor(Lg.knee[0]) - 1, Math.floor(Lg.knee[1]) - 1, 2, 2, C.accent.base);
  const fx = Math.floor(Lg.foot[0]), fy = R(Lg.foot[1] + 0.5);
  g.rect(fx - 2, fy - 2, 5, 2, C.dark, { shade: 0 });
  g.rect(fx - 1, fy - 2, 3, 1, C.K.light);
}

/**
 * Paints a posed guard robot for the direction it faces, far things first, without its outline and its lights (lights() adds those after g.outline). Returns the joints J with J.eye, J.lamps, J.tip, J.vents and J.siren added.
 * Arguments: g (the Surface); J (from solve()); P (the pose); d (dims()); look { body (the armour), accent (hazard stripes, knee caps, bands), glow (the lens and the lamps), metal (barrels, blades, wheels, stacks: default steel), dark (tracks, joints, fittings: default plate), core (the white-hot middle of the lights: default cream) } as '#rrggbb'.
 */
export function draw(g, J, P, d, look = {}) {
  const C = paints(look), dir = J.dir, low = [];
  if (J.belly) low.push([J.belly.z - 0.01, () => { const V = J.belly; g.rect(V.x0, V.top, V.x1 - V.x0, V.bottom - V.top, C.K.base); g.rect(V.x0, V.bottom - 1, V.x1 - V.x0, 1, C.K.dark); }]);
  for (const V of J.treads ?? []) low.push([V.z, () => trackPod(g, V, { along: dir === 'side' ? 'across' : 'depth', phase: dir === 'up' ? -(P.tread ?? 0) : P.tread ?? 0, paint: C.K, wheel: C.metal, seam: C.seam })]);
  for (const Lg of J.legs ?? []) low.push([Lg.z, () => drawLeg(g, Lg, d, C, dir === 'side' && !Lg.near)]);
  low.push([J.hull.z, () => drawHull(g, J, P, d, C)]);
  low.sort((p, q) => p[0] - q[0]).forEach(([, paint]) => paint());
  const up = [];
  up.push([J.head.z, () => {
    const Hd = botHead(g, d.head.kind, J.head, { facing: dir, body: C.body, metal: C.metal, dark: C.K, colours: C.light, level: P.eye ?? 1, look: P.look ?? 0, seam: C.seam });
    J.eye = Hd.eye;
  }]);
  if (J.weapon) up.push([J.weapon.z, () => { J.tip = botWeapon(g, d.weapon.kind, J.at, weaponOf(dir, P, d, { body: C.body, metal: C.metal, dark: C.K, accent: C.accent, seam: C.seam })).tip; }]);
  if (J.pack) up.push([J.pack.z, () => {
    const lit = P.dead ? 0 : (P.lamps ?? 1) >= 2 ? 2 : (P.lamps ?? 1) < 0.75 ? 0.5 : R(P.spin ?? 0) % 4 === 3 ? 0.5 : 1;
    const Pk = botPack(g, d.pack.kind, J.at, { mount: d.pack.mount, size: d.pack.size, level: lit, spin: P.spin ?? 0, hot: !!P.puff?.big, metal: C.metal, dark: C.K, colours: C.light, seam: C.seam });
    J.vents = Pk.vents; J.siren = Pk.lamp && lit >= 2 ? Pk.lamp : null;
  }]);
  up.sort((p, q) => p[0] - q[0]).forEach(([, paint]) => paint());
  return J;
}

/**
 * Adds the lights and loose effects of a guard robot; call it AFTER g.outline(): the flare of its lens, lamps and siren, the muzzle flash, the speed lines and the spark of a charge, exhaust smoke, and the sparks and smoke of a shutdown. Light is never inked. Nothing is drawn on the outermost two rows or columns.
 * Arguments: g; J (what draw() returned); P (the pose); d (dims()); look { glow, core (as draw()), fire (sparks and the spark of the hit: default amber), smoke (default the dark fittings' colour) }.
 */
export function lights(g, J, P, d, look = {}) {
  const C = paints(look), L = C.light, box = [MARGIN, MARGIN, g.w - MARGIN, g.h - MARGIN];
  const fire = steps(look.fire ?? '#f2a030', { core: look.core ?? '#f0ead8' });
  const grey = look.smoke ?? look.dark ?? '#434d6d', fumes = [tone(grey, 1.6), tone(grey, 0.8), grey];
  const F = FORWARD[J.dir], V = J.hull, mid = [(V.x0 + V.x1) / 2, (V.top + V.bottom) / 2];
  // exhaust: a thin thread of smoke while the engine runs, a burst when it works hard
  if (P.puff && J.vents?.length && !P.dead) for (const [i, [vx, vy]] of J.vents.entries()) {
    puffs(g, { t: P.puff.loop ? P.puff.t + i * 0.5 : P.puff.t, x: vx, y: vy, count: P.puff.big ? 3 : 2, seed: 11 + i, loop: !!P.puff.loop, angle: PI, arc: 0.7, dist: P.puff.big ? 6 : 4, rise: 3, size: P.puff.big ? 3 : 2, shape: 'round', colours: fumes, box });
  }
  if ((P.eye ?? 1) >= 2 && J.eye) twinkle(g, J.eye[0], J.eye[1], 1, L[2], { core: L[0], box });
  if ((P.lamps ?? 1) >= 2) for (const Lm of J.lamps ?? []) lamp(g, Lm.x, Lm.y, Lm.w, Lm.h, L[3], 2, { box });
  if (J.siren) twinkle(g, J.siren[0], J.siren[1], 2, L[2], { core: L[0], box });
  // the charge: lines of speed streaming off behind it, and a burst of sparks where it lands
  if (P.ram >= 0) {
    const back = [mid[0] - F[0] * (V.x1 - V.x0) * 0.5, (J.dir === 'down' ? V.top : J.dir === 'up' ? V.bottom : mid[1])];
    speedLines(g, { t: P.ram, x: back[0], y: back[1], count: 4, length: 7, spread: J.dir === 'side' ? 7 : 10, reach: 4, angle: FACE_ANGLE[J.dir] + PI, stagger: 0.2, colours: [tone(grey, 2.2), tone(grey, 1.4), tone(grey, 0.6)], seed: 3, box });
  }
  if (P.hit) {
    const hx = J.dir === 'side' ? V.x1 + 1 : mid[0], hy = J.dir === 'down' ? V.bottom + 1 : J.dir === 'up' ? V.top - 2 : V.face + 2;
    starburst(g, { x: Math.floor(hx) + 0.5, y: Math.floor(hy) + 0.5, count: 6, r0: 1, r1: 5 * d.s, width: 1.4, turn: FACE_ANGLE[J.dir], colour: fire[1], rim: fire[3], box });
  }
  if (P.fire && J.tip) {
    const mx = J.tip[0] + F[0] * 2, my = J.tip[1] + F[1] * 2;
    starburst(g, { x: Math.floor(mx) + 0.5, y: Math.floor(my) + 0.5, count: 4, r0: 2, r1: 5.5 * d.s, width: 1.2, turn: FACE_ANGLE[J.dir], colour: L[2], rim: L[4], box });
    glow(g, Math.floor(mx) + 0.5, Math.floor(my) + 0.5, 3 * d.s, L, { box });
  }
  // the shutdown: sparks from its joints, then smoke from the dead machine
  if (P.sparks >= 0 && P.sparks < 1) particles(g, { t: P.sparks, x: mid[0] + 3, y: V.face, count: 7, seed: 9, loop: false, stagger: 0.5, angle: PI, arc: 4, dist: 11, gravity: 8, size: 2.4, colours: fire, box: [box[0], box[1], box[2], J.gy] });
  if (P.smoke >= 0) puffs(g, { t: clamp(0.1 + P.smoke * 0.7), x: mid[0] - 2, y: V.top + 1, count: 3, seed: 21, loop: false, stagger: 0.5, angle: PI, arc: 0.8, dist: 9, rise: 5, size: 3.4, shape: 'round', lobes: 2, colours: [tone(grey, 0.9), grey, tone(grey, -0.8)], box });
  return g;
}

/**
 * Named attach points of a solved guard robot, { name: { x, y, angle } } in frame pixels: hand (the top of the weapon's housing, or the shoulder it would stand on), muzzle (the far end of the weapon; with no weapon, the front of the shoulder), head (its top), back (the rear deck, where the pack stands; angle: up), feet (the floor under it).
 * Arguments: J (from solve() or draw()); P (the pose); d (dims()). hand and muzzle point the way the machine faces.
 */
export function sockets(J, P, d) {
  const face = FACE_ANGLE[J.dir], [ma, mb, mc] = d.weapon.mount;
  const hand = J.weapon ? J.weapon.hand : J.at(ma, mb, mc + 4), tip = J.weapon ? J.weapon.tip : J.at(ma + 3, mb, mc + 2.5);
  const back = J.at(...d.pack.mount);
  return {
    hand: { x: hand[0], y: hand[1], angle: face },
    muzzle: { x: tip[0], y: tip[1], angle: face },
    head: { x: (J.head.x0 + J.head.x1) / 2, y: J.head.top, angle: PI },
    back: { x: back[0], y: back[1], angle: PI },
    feet: { x: J.origin[0] + J.move[0], y: J.gy, angle: 0 },
  };
}

/**
 * Builds one frame of a guard robot, posed once, so the picture and the exported attach points cannot disagree.
 * Arguments: clip (a clip name: an action of POSES with or without a direction, as 'walk_side' or 'die'; no direction is drawn facing down); t (0..1); p (the sprite's values: size, bulk and bounce are read from it); opt { drive: one of DRIVES, head: one of HEADS, weapon: { kind: one of WEAPONS or 'none', length }, pack: { kind: one of PACKS or 'none', size } }.
 * Returns F = { clip, action, direction, d, P, J, draw(g, look) (paints it and returns the joints), finish(g, look) (the white of a hit, the outline, then the lights), sockets() }; look is draw()'s and lights()'s.
 */
export function frame(clip, t, p = {}, opt = {}) {
  const { action, direction } = K.parseClip(clip), d = dims(p, opt), P = pose(action, t, { bounce: p.bounce }, d);
  const J = solve(direction, P, d, opt);
  let drawn = false;
  return {
    clip, action, direction, d, P, J,
    sockets: () => sockets(J, P, d),
    draw(g, look) { drawn = true; return draw(g, J, P, d, look); },
    finish(g, look = {}) {
      if (!drawn) draw(g, J, P, d, look);
      if (P.flash) g.tint('#ffffff');
      g.outline(look.outline ?? INK);
      lights(g, J, P, d, look);
      return g;
    },
  };
}
