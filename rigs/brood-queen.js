// Top-down brood queen rig, on a 96x96 canvas: a bloated egg-layer that hardly moves and always faces the camera
// (a hive mother, a spider queen, a termite queen, a nest heart with a head). For top-down games, in the
// three-quarter view (docs/style-guide.md, section 1): the small armoured head is nearest the camera and lowest on
// the picture, the thorax behind it, and the huge abdomen rises behind both. No direction clips: a boss that sits
// in the middle of its room looks the same whichever way the player comes from.
//
// The rig is the code; a sprite on it is choices (Contract 13): its size and bulk, how many legs and egg sacs, what
// stands on its head and back, its colours, and which of the poses are its clips. The body is described ONCE
// (dims) and animated by moving its pieces (pose -> solve); nothing is redrawn by hand per frame.
//
//   clips(speedOf, entries)        the clip table for the poses a sprite uses (POSES), with labels of its own
//   frame(clip, t, p, opt)         ONE FRAME, posed and fitted once: F.draw(g, look), F.finish(g, look), F.sockets()
//   dims, pose, solve, draw, lights, sockets      what frame() is made of, for a pose of your own
//   LEGS, HORNS, WINGS             the names of the leg counts and of the parts
//
//   import * as Q from '../rigs/brood-queen.js';
//   const frameOf = (clip, t, p) => Q.frame(clip, t, p, { legs: p.legs, sacs: p.pieces,
//     horns: { kind: p.horns, length: p.hornLength }, wings: { kind: p.wings, span: p.wingSpan } });
//   // in defineSprite:  size: Q.SIZE, pivot: Q.PIVOT, clips: Q.clips((p) => p.speed),
//   sockets: (clip, t, p) => frameOf(clip, t, p).sockets(),
//   render(g, { clip, t, p }) { const F = frameOf(clip, t, p), look = { body: p.body, accent: p.accent, glow: p.glow }; F.draw(g, look); F.finish(g, look); }
//
// What she is made of, far things first: the wings (behind the abdomen: only what stands out past it shows), the
// walking legs (arched, their hips hidden under the abdomen), the abdomen (pale skin with furrows between its
// segments, studded with egg sacs that glow; three big brood sacs sit on its rim), the thorax, the two long
// scythe legs at the front, the horns, and the head with its visor of eyes and its mandibles.
// Three tones come from the one body colour: the skin of the abdomen is that colour, the armour of head, thorax and
// legs a step darker, and the bone of blades, horns and mandibles a step paler, so the three never merge.
//
// Pure functions: Node and browser, no Math.random. Angles are frame angles: 0 = down the picture, PI/2 = right, PI = up.

import { lerp, clamp, wave, pulse, keys, smooth, easeOut, hash, ik2, PI, TAU } from '../engine/motion.js';
import { ramp, tone, mix, INK } from '../engine/color.js';
import { ellipseIn, capsuleIn } from '../engine/surface.js';
import { placedIn, anyIn } from '../engine/shapes.js';
import { hornIn, leafIn } from '../engine/creature.js';
import { splatIn } from '../engine/plating.js';
import { steps, glow as glowDisc, particles, twinkle, starburst, ring } from '../engine/fx.js';
import { discSpots, segmentRingsIn, antlerIn, frillIn, blister, sprayFan } from '../engine/hive.js';

/** The frame of a top-down boss, [width, height] in pixels (style guide, section 1). */
export const SIZE = [96, 96];
/** The ground line: the lowest foot rests on the row above it and its outline lands on it. */
export const GROUND = 88;
/** The x of the body's middle line: the queen is the same on both sides of it. */
export const CX = 48;
/** Where a game anchors the sprite, [x, y]: the floor under the front of the queen. */
export const PIVOT = [CX, GROUND];
/** How many legs she can have, the two scythe legs at the front counted in: the options of a "Legs" choice. */
export const LEGS = ['four', 'six', 'eight'];
/** What can stand on her head: crown (a fan of five spikes, the middle one tallest), antlers (two branching horns). */
export const HORNS = ['crown', 'antlers'];
/** What can stand out behind her abdomen: stubs (two pairs of short wing blades), veil (a scalloped frill of wing skin all round the back). */
export const WINGS = ['stubs', 'veil'];
/** The poses pose() knows: idle (breathing), attack (both scythes raised, then stabbed down in front), shoot (rears and sprays), spawn (squeezes; three brood sacs burst), enrage (rears, shakes, every light flares), hurt, die (bloats, bursts, leaves a puddle and the head shell). */
export const POSES = ['idle', 'attack', 'shoot', 'spawn', 'enrage', 'hurt', 'die'];

const STANDARD = {
  idle: { frames: 8, fps: 7, loop: true }, attack: { frames: 10, fps: 11, loop: false }, shoot: { frames: 12, fps: 11, loop: false },
  spawn: { frames: 10, fps: 10, loop: false }, enrage: { frames: 10, fps: 10, loop: false }, hurt: { frames: 4, fps: 9, loop: false }, die: { frames: 12, fps: 10, loop: false },
};
const half = (v) => Math.round(v * 2) / 2;
// where the three brood sacs sit on the abdomen (shares of its radii): left, right and the far end
const BROOD = [[-0.9, 0.22], [0.9, 0.22], [0, -0.9]];
const MAX_SACS = 14;
// no sac sits where the thorax, the head and its horns cover the abdomen
const SPOTS = discSpots(MAX_SACS, { seed: 5, reach: 0.78, fixed: BROOD, keepOut: (u, v) => v > 0.3 && Math.abs(u) < 0.62, tries: 40 });
// how far out past the abdomen (and how high off the ground) each pair of walking legs stands, front pair first, in body pixels
// the wing stubs stand out at these angles from the top of the abdomen (radians); how much of a stub's reach goes up, and out
const STUB_AT = [0.62, 1.22], STUB_UP = Math.cos(STUB_AT[0]), STUB_OUT = Math.sin(STUB_AT[1]);
const FEET = { 2: [[9, 16]], 3: [[8.5, 11], [9, 27]], 4: [[6.5, 8], [10, 19], [8.5, 32]] };

/**
 * Builds the clip table of a brood queen from pose names, with the frame counts the style guide gives a boss: idle 8 (looping), attack 10, shoot 12, spawn 10, enrage 10, hurt 4, die 12.
 * Arguments: speedOf ((p) => the Speed slider, 0..1); entries (a list, default every pose in order; each is a name from POSES or { name, label } to give the clip a button text of its own).
 */
export function clips(speedOf = () => 0.5, entries = POSES) {
  const out = {};
  for (const raw of entries) {
    const e = typeof raw === 'string' ? { name: raw } : raw, std = STANDARD[e.name];
    if (!std) throw new Error(`rigs/brood-queen.js: no pose "${e.name}" (it has: ${POSES.join(', ')})`);
    out[e.name] = { frames: std.frames, fps: (p) => std.fps * lerp(0.65, 1.45, speedOf(p) ?? 0.5), loop: std.loop, ...(e.label ? { label: e.label } : {}) };
  }
  return out;
}

/**
 * Body measurements of a brood queen in pixels, from plain choices.
 * Arguments: o { size (0..1: the whole queen), bulk (0..1: a lean abdomen to a bloated one), legs (one of LEGS, or the number 4, 6 or 8; default six), sacs (0..1: few egg sacs to many) }; each slider defaults to 0.5.
 * Returns d { k (the scale), rx, ry (the abdomen's radii), waist (how high above the ground the abdomen's front edge is), thorax { up, rx, ry }, head { up, rx, ry }, arm (the scythe legs: hip, upper, blade and the places the tip goes: rest, raised, stab, spread, each [out from the middle, up from the ground]), pairs (pairs of legs, scythes counted), feet ([[out, up], ...] of the walking legs), sacs (how many egg sacs, the three brood sacs counted) }.
 */
export function dims(o = {}) {
  const k = lerp(0.9, 1.08, clamp(o.size ?? 0.5)), bulk = clamp(o.bulk ?? 0.5);
  const named = LEGS.indexOf(o.legs);
  const pairs = named >= 0 ? named + 2 : clamp(Math.round((typeof o.legs === 'number' ? o.legs : 6) / 2), 2, 4);
  const rx = half(lerp(22, 29, bulk) * k);
  return {
    k, bulk, pairs, rx, ry: half(lerp(19, 25, bulk) * k),
    waist: Math.round(20 * k),
    thorax: { up: Math.round(22.5 * k), rx: half(15 * k), ry: half(8.5 * k) },
    head: { up: Math.round(12.5 * k), rx: 10 * k, ry: 7 * k },
    arm: { hip: [10 * k, 19.5 * k], upper: 13 * k, blade: 27 * k, rest: [21 * k, 0.6], out: [33 * k, 15 * k], high: [34 * k, 37 * k], raised: [30 * k, 53 * k], stab: [5.5 * k, -3.5 * k], spread: [38 * k, 40 * k] },
    feet: FEET[pairs].map(([out, up]) => [rx + out * k, up * k]),
    sacs: 3 + Math.round(lerp(3, MAX_SACS - 3, clamp(o.sacs ?? 0.5))),
  };
}

/**
 * The pose of a brood queen for a clip at phase t (0..1): the numbers solve() turns into a picture.
 * Arguments: name (one of POSES; any other name gives the resting pose, for a sprite to fill in); t; m { bounce (0..1: how much she pulses) }; d (from dims()).
 * Returns P { fwd (pixels the front of the body moves down the picture, toward the camera; negative draws back), sway (pixels to the right), rear (0..1 head and thorax reared up; below 0 ducked), head ([x, y] the head moved by itself), jaw (0..1 mandibles open), blink, glow (eyes and sacs: 1 lit, 2 flaring, 0 dark), swell, wide (the abdomen's height and width as shares of rest), beat (the phase the sacs twinkle on), arms ([left, right] scythe legs: { raise, stab, spread (0..1 toward each of those places), lift (pixels off the floor) }), feet (one { out, lift } per walking leg: the left side's first, front to back), wing (0..1 wings flared), flash (tint this frame white), brood (0..1 the brood sacs swollen), pop, spray, shout, impact (progress 0..1 of the sacs bursting, the acid spray, the shriek and the stab landing; -1 while there is none), charge (0..1 the glow in the mouth before she sprays), bloat (0..1 the abdomen swelling to burst), burst (0..1 once it has burst, else -1) }.
 * attack (10 frames): the scythes rise through frames 1 to 5 (the warning), stab down in front on 6, hold, come back. shoot (12): rears through 1 to 4 with the mouth filling with light, sprays from 5 to 8 sweeping her head, settles. spawn (10): squeezes through 1 to 3 as the three brood sacs swell, they burst on 4, new ones grow back by 9. enrage (10): ducks on 1, rears with a shriek on 2, shakes with every light flaring through 7. hurt (4): white on 0, squashed back, ends on idle. die (12): white on 0, bloats through 6 with sacs popping, bursts on 7, what is left settles.
 */
export function pose(name, t, m = {}, d = dims()) {
  const bounce = clamp(m.bounce ?? 0.5);
  const walkers = (d.pairs - 1) * 2;
  const P = {
    fwd: 0, sway: 0, rear: 0, head: [0, 0], jaw: 0, blink: false, glow: 1, swell: 1, wide: 1, beat: t,
    arms: [{ raise: 0, stab: 0, spread: 0, lift: 0 }, { raise: 0, stab: 0, spread: 0, lift: 0 }],
    feet: Array.from({ length: walkers }, () => ({ out: 0, lift: 0 })),
    wing: 0, flash: false, brood: 0, pop: -1, spray: -1, shout: -1, impact: -1, charge: 0, bloat: 0, burst: -1,
  };
  const both = (fn) => P.arms.forEach((a, i) => fn(a, i));
  const k2 = (ks) => keys(t, ks);
  const br = lerp(0.03, 0.08, bounce);
  // breathing: she swells and sinks, and the head follows a beat late; the phase keeps the two big moves off the loop's seam
  const breath = (u) => ({ swell: 1 + br * wave(u, -0.2), wide: 1 - 0.35 * br * wave(u, -0.2), head: Math.round(0.9 * wave(u, -0.33)), wing: 0.5 * pulse(u, -0.35) });
  if (name === 'idle') {
    const b = breath(t);
    P.swell = b.swell; P.wide = b.wide; P.head = [0, b.head];
    P.jaw = t >= 0.36 && t < 0.62 ? 0.45 : 0;               // one twitch of the mandibles
    P.blink = t >= 0.74;                                    // frames 6 and 7 of 8
    P.arms[1].lift = 3 * Math.sin(PI * clamp((t - 0.1) / 0.3)) ** 2;      // one tap of a scythe
    if (P.feet.length) P.feet[0].lift = 2.4 * Math.sin(PI * clamp((t - 0.5) / 0.3)) ** 2;      // and, later, of a walking leg on the other side
    P.wing = b.wing;
  } else if (name === 'attack') {
    const f = (n) => n / 9;
    const raise = k2([[0, 0], [f(1), 0.3], [f(2), 0.65], [f(3), 0.88], [f(4), 0.96], [f(5), 1], [f(5.4), 1], [f(6), 0], [1, 0]]);
    const stab = k2([[0, 0], [f(5.4), 0], [f(6), 1], [f(7), 1], [f(8), 0.4], [1, 0]]);
    both((a) => { a.raise = raise; a.stab = stab; });
    P.fwd = k2([[0, 0], [f(2), -1.5], [f(5), -3], [f(6), 4], [f(7), 3], [f(8), 1], [1, 0]]);
    P.rear = k2([[0, 0], [f(3), 0.3], [f(5), 0.45], [f(6), -0.1], [f(7), 0], [1, 0]]);
    P.jaw = k2([[0, 0], [f(3), 0.4], [f(5), 0.9], [f(6), 1], [f(7), 0.6], [1, 0]]);
    P.swell = k2([[0, 1], [f(5), 1.05], [f(6), 0.94], [f(7), 0.97], [1, 1]]);
    P.glow = k2([[0, 1], [f(5), 1.4], [f(6), 2], [f(7), 1.2], [1, 1]]);
    P.wing = k2([[0, 0], [f(5), 0.8], [f(6), 0], [1, 0]]);
    if (t > f(2.5) && t < f(5.5)) P.sway = Math.round(t * 9) % 2 ? 1 : -1;               // she trembles while they are up
    P.impact = t >= f(6) - 0.01 ? clamp((t - f(6)) / (f(9) - f(6))) : -1;
  } else if (name === 'shoot') {
    const f = (n) => n / 11;
    P.rear = k2([[0, 0], [f(1), 0.2], [f(2), 0.55], [f(3), 0.85], [f(4), 1], [f(8), 1], [f(9), 0.6], [f(10), 0.2], [1, 0]]);
    const spread = k2([[0, 0], [f(2), 0.5], [f(4), 1], [f(8), 0.9], [f(10), 0.3], [1, 0]]);
    both((a) => { a.spread = spread; });
    P.jaw = k2([[0, 0], [f(2), 0.3], [f(4), 0.8], [f(5), 1], [f(8), 1], [f(9), 0.5], [1, 0]]);
    P.swell = k2([[0, 1], [f(2), 1.05], [f(4), 1.1], [f(5), 0.93], [f(6), 0.97], [f(7), 0.93], [f(8), 0.97], [1, 1]]);
    P.wide = k2([[0, 1], [f(4), 0.97], [f(5), 1.04], [1, 1]]);
    P.glow = k2([[0, 1], [f(2), 1.2], [f(4), 1.6], [f(5), 2], [f(8), 1.6], [f(10), 1.1], [1, 1]]);
    P.charge = k2([[0, 0], [f(1), 0.25], [f(4), 1], [f(4.6), 1], [f(5), 0]]);
    P.fwd = k2([[0, 0], [f(4), -2], [f(5), 1], [f(8), 1], [1, 0]]);
    // she sweeps her head across the fan as she sprays: left, middle, right, middle
    if (t > f(4.5) && t < f(8.5)) P.head = [[-3, 0, 3, 0][Math.round(t * 11) - 5] ?? 0, 2];
    P.wing = k2([[0, 0], [f(4), 0.7], [f(8), 0.7], [1, 0]]);
    P.spray = t >= f(5) - 0.01 ? clamp((t - f(5)) / (f(9) - f(5))) : -1;
  } else if (name === 'spawn') {
    const f = (n) => n / 9;
    P.wide = k2([[0, 1], [f(1), 0.97], [f(2), 0.93], [f(3), 0.9], [f(4), 1.07], [f(5), 1.03], [f(6), 0.98], [1, 1]]);
    P.swell = k2([[0, 1], [f(1), 1.03], [f(2), 1.07], [f(3), 1.1], [f(4), 0.93], [f(5), 0.98], [f(6), 1.02], [1, 1]]);
    P.brood = k2([[0, 0], [f(1), 0.35], [f(2), 0.7], [f(3), 1], [1, 1]]);
    P.pop = t >= f(4) - 0.01 ? clamp((t - f(4)) / (f(9) - f(4))) : -1;
    P.head = [0, k2([[0, 0], [f(3), 2], [f(4), -1], [f(6), 0], [1, 0]])];
    P.jaw = k2([[0, 0], [f(3), 0.3], [f(4), 0.8], [f(6), 0.2], [1, 0]]);
    P.glow = k2([[0, 1], [f(3), 1.5], [f(4), 2], [f(5), 1.3], [1, 1]]);
    P.fwd = k2([[0, 0], [f(3), -1.5], [f(4), 1], [f(6), 0], [1, 0]]);
    const brace = k2([[0, 0], [f(3), 1], [f(4), 0.3], [f(6), 0], [1, 0]]);
    P.feet.forEach((ft) => { ft.out = 2 * brace; });
    both((a) => { a.spread = 0.12 * brace; });
  } else if (name === 'enrage') {
    const f = (n) => n / 9;
    P.rear = k2([[0, 0], [f(1), -0.2], [f(2), 1], [f(7), 1], [f(8), 0.4], [1, 0]]);
    const spread = k2([[0, 0], [f(1), 0], [f(2), 1], [f(7), 1], [f(8), 0.4], [1, 0]]);
    both((a) => { a.spread = spread; });
    P.jaw = k2([[0, 0], [f(1), 0.2], [f(2), 1], [f(7), 1], [f(8), 0.4], [1, 0]]);
    P.glow = k2([[0, 1], [f(1), 1.2], [f(2), 2], [f(7), 2], [f(8), 1.4], [1, 1]]);
    P.swell = k2([[0, 1], [f(1), 0.95], [f(2), 1.08], [f(7), 1.08], [f(8), 1.02], [1, 1]]);
    P.wing = k2([[0, 0], [f(1), 0], [f(2), 1], [f(7), 1], [1, 0]]);
    P.fwd = k2([[0, 0], [f(1), 1.5], [f(2), -1], [f(7), -1], [1, 0]]);
    if (t > f(2.5) && t < f(7.5)) {                         // she shakes: the body one way, the head the other
      const s = Math.round(t * 9) % 2 ? 1 : -1;
      P.sway = s; P.head = [-s, 0]; P.swell += 0.02 * s;
      P.feet.forEach((ft, i) => { ft.lift = (i + (s > 0 ? 1 : 0)) % 2 ? 2 : 0; });
    }
    P.shout = t >= f(2) - 0.01 && t <= f(7) + 0.01 ? clamp((t - f(2)) / (f(8) - f(2))) : -1;
  } else if (name === 'hurt') {
    const h = k2([[0, 0.7], [1 / 3, 1], [2 / 3, 0.4], [1, 0]]);     // ends back on the idle pose
    P.flash = t < 0.15;
    P.fwd = -3 * h;
    P.wide = 1 + 0.09 * h; P.swell = 1 - 0.09 * h;
    P.head = [0, -2 * h];
    P.jaw = 0.7 * h;
    P.blink = h > 0.3;
    both((a) => { a.lift = 4 * h; a.spread = 0.12 * h; });
    P.glow = 1 - 0.5 * h;
  } else if (name === 'die') {
    const f = (n) => n / 11;
    P.flash = t < f(0.5);
    P.bloat = k2([[0, 0], [f(1), 0.15], [f(2), 0.35], [f(3), 0.5], [f(4), 0.7], [f(5), 0.85], [f(6), 1], [1, 1]]);
    P.burst = t >= f(7) - 0.01 ? clamp((t - f(7)) / (f(11) - f(7))) : -1;
    if (P.burst < 0) {
      // she convulses as she swells: the head thrashes, the scythes claw at the air, the lights stutter
      const s = Math.round(t * 11) % 2 ? 1 : -1;
      P.fwd = k2([[0, -3], [f(1), -2], [f(6), 0]]);
      P.rear = k2([[0, 0.1], [f(3), 0.45], [f(6), 0.7]]);
      P.head = [t < f(0.5) ? 0 : 2 * s, t < f(0.5) ? -2 : 0];
      P.sway = t < f(0.5) ? 0 : -s;
      P.jaw = 0.8;
      P.arms[0].spread = 0.25 + 0.2 * s; P.arms[1].spread = 0.25 - 0.2 * s;
      both((a) => { a.lift = 3; });
      P.feet.forEach((ft, i) => { ft.lift = (i + (s > 0 ? 1 : 0)) % 2 ? 2.5 : 0; });
      P.glow = s > 0 ? 2 : 1.2;
      P.wing = 0.6;
    } else {
      P.glow = 0;
      P.jaw = 0.5;
    }
  }
  // a move starts from and ends on the first frame of idle exactly (hurt only ends on it), mid-breath as that frame is
  if (STANDARD[name] && !STANDARD[name].loop && name !== 'die') {
    const n = STANDARD[name].frames - 1, e = clamp(1 - n * (name === 'hurt' ? 1 - t : Math.min(t, 1 - t))), b = breath(0);
    P.swell *= lerp(1, b.swell, e); P.wide *= lerp(1, b.wide, e); P.head = [P.head[0], P.head[1] + b.head * e]; P.wing = Math.max(P.wing, b.wing * e);
  }
  return P;
}

const around = (test) => (px, py) => test(px, py) || test(px - 1, py) || test(px + 1, py) || test(px, py - 1) || test(px, py + 1);

/**
 * Every piece of a brood queen for one pose, in frame pixels: what draw() paints, lights() lights and sockets() reads.
 * Arguments: P (from pose()); d (from dims()); opt { horns: { kind: one of HORNS or 'none', length (a multiplier, default 1) }, wings: { kind: one of WINGS or 'none', span (a multiplier, default 1) } }.
 * Returns J { k, d, P, dead (true once she has burst), abdomen { x, y, rx, ry }, sacs ([{ x, y, r, level, open, brood, u, v }]), thorax { x, y, rx, ry }, chest (the soft underside that shows when she rears: { x0, y0, x1, y1, r } or null), head { x, y, angle, jaw, blink, glow }, mouth [x, y], arms ([{ s (-1 left, 1 right), hip, knee, tip, front (the blade is nearer the camera than the head) }]), legs ([{ s, hip, knee, foot }], far ones first), horns { kind, length }, wing ({ kind, reach } or null), remains (what is left once she has burst: { puddle, husk } or null) }.
 * The abdomen never grows past the room the frame leaves it: a big queen swells, flares and bloats less, and is drawn no smaller at rest.
 */
export function solve(P, d, opt = {}) {
  const k = d.k, G = GROUND, sway = Math.round(P.sway), fwd = Math.round(P.fwd);
  const dead = P.burst >= 0, fall = dead ? smooth(clamp(P.burst / 0.5)) : 0;
  const lift = Math.round(5 * k * P.rear), headLift = Math.round(13 * k * P.rear);
  const horns = { kind: HORNS.includes(opt.horns?.kind) ? opt.horns.kind : 'none', length: opt.horns?.length ?? 1 };
  const wk = WINGS.includes(opt.wings?.kind) ? opt.wings.kind : null;
  const reach0 = wk ? (wk === 'veil' ? 7 : 9) * k * (opt.wings?.span ?? 1) : 0;

  // ---- the abdomen: its front edge stays put behind the thorax, so when it swells it grows up and out
  const waistY = G - d.waist + Math.round(fwd * 0.4);
  const grow = 1 + 0.2 * P.bloat;
  // the room the frame leaves above her: a veil stands straight up out of the abdomen's top, the stubs slant up past it
  const room = wk === 'veil' ? (waistY - 3.5 - reach0) / 2 : wk === 'stubs' ? (waistY - 3 - STUB_UP * (reach0 + 1)) / (2 - (1 - STUB_UP)) : (waistY - 2.5) / 2;
  const ry = half(Math.min(d.ry * P.swell * grow, room));
  const rx = half(Math.min(d.rx * P.wide * grow, CX - 7.5 - (wk === 'veil' ? reach0 * 0.75 : 0)));
  const abdomen = { x: CX + sway, y: half(waistY - ry), rx, ry };
  const top = abdomen.y - ry;
  // wings flare only as far as the frame lets them
  const topRoom = wk === 'veil' ? top - 3.5 : (abdomen.y - 3) / STUB_UP - ry - 1;
  const sideRoom = wk === 'veil' ? (CX - 4 - rx) / 0.74 : ((CX - 3.5) / STUB_OUT - rx) / 0.85 - 1;
  const wing = wk ? { kind: wk, reach: Math.max(2, Math.min(reach0 * (1 + 0.25 * P.wing), reach0 + 3, topRoom, sideRoom)) } : null;

  // ---- the egg sacs: they ride on the skin; each twinkles on its own beat; the brood sacs swell, burst and grow back
  const sacs = SPOTS.slice(0, d.sacs).map(([u, v, h], i) => {
    const brood = i < 3;
    let r = (brood ? 4.4 : lerp(2.6, 3.7, h)) * k, open = false;
    if (brood) {
      r *= 1 + 0.42 * P.brood * (P.pop < 0 ? 1 : 0.3);
      if (P.pop >= 0 && P.pop < 0.55) open = true;
      else if (P.pop >= 0.55) r *= lerp(0.55, 1, (P.pop - 0.55) / 0.45) / (1 + 0.42 * 0.3);
    }
    if (P.bloat > 0.2 + 0.75 * hash(i, 31)) open = true;            // as she bloats they pop, one by one
    const lit = pulse(P.beat + h) > 0.55;
    const level = P.glow >= 1.5 ? 2 : P.glow < 0.25 ? 0 : P.glow < 0.75 ? 0.5 : lit || P.glow > 1.15 ? 1 : 0.5;
    return { i, u, v, h, brood, r, open, level, x: Math.round(abdomen.x + u * (rx - 1.5)), y: Math.round(abdomen.y + v * (ry - 1.5)) };
  });

  // ---- thorax, head and the soft chest that shows under them when she rears
  const thorax = { x: CX + sway, y: G - d.thorax.up + fwd - lift, rx: d.thorax.rx, ry: d.thorax.ry };
  const head = {
    x: CX + sway + Math.round(P.head[0]) + Math.round(3 * k * fall), y: Math.round(lerp(G - d.head.up + fwd - headLift + Math.round(P.head[1]), G - 10.5 * k, fall)),
    angle: 0.5 * fall, jaw: P.jaw, blink: P.blink, glow: P.glow,
  };
  const chest = P.rear > 0.12 && !dead ? { x0: head.x, y0: head.y + 2 * k, x1: CX + sway, y1: G - 13 * k + fwd, r: 4.6 * k } : null;
  const mouth = [head.x, head.y + 6.4 * k];

  // ---- the scythe legs: a short arm out to an elbow, then the long blade; the tip goes where the pose sends it
  const arms = [-1, 1].map((s, i) => {
    const A = P.arms[i], a = d.arm;
    const free = clamp(A.raise + A.stab + A.spread + A.lift / 3);
    // raising goes round the outside (out, then up), so the arm never folds across the body on the way
    const up = A.raise < 0.35 ? mixPt(a.rest, a.out, A.raise / 0.35) : A.raise < 0.7 ? mixPt(a.out, a.high, (A.raise - 0.35) / 0.35) : mixPt(a.high, a.raised, (A.raise - 0.7) / 0.3);
    const rel = [0, 1].map((c) => up[c] + A.stab * (a.stab[c] - a.rest[c]) + A.spread * (a.spread[c] - a.rest[c]));
    const hip = [CX + sway + s * a.hip[0], G - a.hip[1] + fwd - lift];
    const tip = [CX + s * rel[0] + sway * free, Math.min(G - rel[1] - A.lift + fwd * A.stab, SIZE[1] - 4.6)];       // a stab never leaves the frame
    // of the two ways the elbow can bend, the one that points out and up
    const q = [1, -1].map((bend) => ik2(hip[0], hip[1], tip[0], tip[1], a.upper, a.blade, bend))
      .sort((m, n) => (s * (n.mid[0] - hip[0]) - 0.3 * (n.mid[1] - hip[1])) - (s * (m.mid[0] - hip[0]) - 0.3 * (m.mid[1] - hip[1])))[0];
    let J3 = { hip, knee: q.mid, tip: q.end };
    if (dead) {
      // she is gone: the scythe lies flat on the floor where it fell
      const flat = { hip: [CX + s * 15 * k, G - 4 * k], knee: [CX + s * 25 * k, G - 7.5 * k], tip: [CX + s * 36 * k, G - 1.2] };
      J3 = { hip: mixPt(J3.hip, flat.hip, fall), knee: mixPt(J3.knee, flat.knee, fall), tip: mixPt(J3.tip, flat.tip, fall) };
    }
    return { s, ...J3, front: A.stab > 0.5 };
  });

  // ---- the walking legs: each arches up to a knee and comes down outside the abdomen
  const legs = [];
  for (let j = 0; j < d.pairs - 1; j++) for (const s of [-1, 1]) {
    const ft = P.feet[(s < 0 ? 0 : d.pairs - 1) + j] ?? { out: 0, lift: 0 };
    const foot = [CX + s * (d.feet[j][0] + ft.out), G - d.feet[j][1] - ft.lift];
    let L = { hip: [CX + sway + s * 10 * k, waistY - 5 * k - 3 * k * j], knee: [foot[0] - s * 4 * k + sway * 0.5, foot[1] - 13 * k - ft.lift * 0.5], foot };
    if (dead) {
      // a husk on its side: the knee has dropped and the hip lies where the abdomen was
      const end = [foot[0] - s * 1.5 * k * j, G - (2.5 + 5.5 * j) * k];
      const flat = { hip: [end[0] - s * 13 * k, end[1] + 1.2 * k], knee: [end[0] - s * 5.5 * k, end[1] - 3.2 * k], foot: end };
      L = { hip: mixPt(L.hip, flat.hip, fall), knee: mixPt(L.knee, flat.knee, fall), foot: mixPt(foot, flat.foot, fall) };
    }
    legs.push({ s, j, ...L });
  }
  legs.sort((a, b) => a.foot[1] - b.foot[1]);

  // ---- what is left once she has burst: the skin of the abdomen, torn open and sinking flat, and a puddle that spreads
  const remains = dead ? {
    puddle: { x: CX, y: half(G - 9.5 * k), r: Math.min(lerp(12, 28, easeOut(P.burst)) * k, 26), squash: 0.36 },      // its furthest drop stays in the frame
    husk: { x: CX, y: half(G - d.waist - lerp(10, 5, smooth(P.burst)) * k), r: d.rx * 0.95, squash: lerp(0.75, 0.36, smooth(P.burst)) },
  } : null;

  return { k, d, P, dead, fall, waistY, abdomen, sacs, thorax, chest, head, mouth, arms, legs, horns, wing, remains };
}

const mixPt = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

// The shapes of the head, written round its own middle (x right, y down, in pixels) and then placed and turned.
function headShapes(J) {
  const k = J.k, H = J.head, s2 = (tests) => placedIn(tests, H.x, H.y, { angle: H.angle });
  const jaw = clamp(H.jaw);
  const mand = [-1, 1].map((s) => hornIn(s * 4.4 * k, 4.6 * k, s * (0.75 + 0.7 * jaw), 8.5 * k, { curl: -s * 1.75, width: 3.8 * k, tip: 1, steps: 5 }));
  const horn = [];
  const L = J.horns.length * k;
  if (J.horns.kind === 'crown') {
    for (let i = -2; i <= 2; i++) {
      const a = PI + i * 0.42, rootX = Math.sin(a) * 6.5 * k, rootY = -1 * k + Math.cos(a) * 4.6 * k, len = (9.5 - 2 * Math.abs(i)) * L;
      horn.push(leafIn(rootX - Math.sin(a) * 2, rootY - Math.cos(a) * 2, rootX + Math.sin(a) * len, rootY + Math.cos(a) * len, 4 * k, { belly: 0.3, blunt: 0.85 }));
    }
  } else if (J.horns.kind === 'antlers') {
    for (const s of [-1, 1]) horn.push(antlerIn(s * 5.5 * k, -3.5 * k, PI - s * 1.0, 21 * L, { curl: s * 0.9, width: 3.6 * k, tip: 1.2, tines: 2, spread: -s * 0.85, tineLength: 0.36, steps: 6 }));
  }
  return {
    skull: s2([ellipseIn(0, -1 * k, 10 * k, 6 * k), ellipseIn(0, 2.6 * k, 7.2 * k, 5 * k)]),
    visor: s2(ellipseIn(0, -0.6 * k, 8.8 * k, 2.2 * k)),
    mouth: s2(ellipseIn(0, 6.2 * k, 2.6 * k, (1.1 + 1.9 * jaw) * k)),
    mandibles: s2(mand), horns: horn.length ? s2(horn) : null,
  };
}

/**
 * Paints a solved brood queen, far things first; call g.outline() after it (frame().finish() does) and then lights().
 * Arguments: g (the Surface); J (from solve()); look { body (the pale skin of the abdomen; the armour is a step darker and the bone of blades, horns and mandibles a step paler), accent (egg sacs, wings and the soft chest), glow (what is in the sacs, and the eyes), bone (what the body colour is mixed toward for bone, default cream) }.
 * Near pieces that cross the body (blades, horns, the head over the thorax) get a dark line where they cross it, so they read in front of it.
 */
export function draw(g, J, look = {}) {
  const k = J.k, G = GROUND, [W, Hh] = SIZE;
  const body = look.body ?? '#ca9eda', bone0 = look.bone ?? '#f0ead8';
  const skin = ramp(body), armour = ramp(tone(body, -0.55)), bone = ramp(mix(body, bone0, 0.6)), soft = ramp(look.accent ?? '#b04a8a'), acid = ramp(look.glow ?? '#9fe040');
  const ab = J.abdomen, th = J.thorax, H = J.head, S = headShapes(J);
  const inAb = ellipseIn(ab.x, ab.y, ab.rx, ab.ry), inTh = ellipseIn(th.x, th.y, th.rx, th.ry);
  const inChest = J.chest ? capsuleIn(J.chest.x0, J.chest.y0, J.chest.x1, J.chest.y1, J.chest.r, J.chest.r * 0.85) : null;
  const inBody = J.dead ? S.skull : anyIn(inAb, inTh, S.skull, ...(inChest ? [inChest] : []));
  const floor = (px, py) => py < G && px >= 2 && px < W - 2;
  // a near piece: a dark line round it wherever it crosses the body, then the piece itself
  const near = (test, paint, box, opt = {}) => {
    g.fill(...box, around(test), look.outline ?? INK, { clip: inBody });
    g.fill(...box, test, paint, opt);
  };
  const leg = (L, r0, r1, paint) => {
    g.limb(L.hip[0], L.hip[1], L.knee[0], L.knee[1], 3, paint);
    g.capsule(L.knee[0], L.knee[1], L.foot[0], L.foot[1], r0, r1, paint, { shade: 0 });
    g.ellipse(L.knee[0], L.knee[1], 1.9 * k, 1.9 * k, paint, { shade: 0 });
  };

  // a scythe leg: the arm, the bowed blade and the knuckle between them
  const arm = (A) => {
    const box = [Math.min(A.hip[0], A.knee[0], A.tip[0]) - 4, Math.min(A.hip[1], A.knee[1], A.tip[1]) - 4, Math.max(A.hip[0], A.knee[0], A.tip[0]) + 4, Math.max(A.hip[1], A.knee[1], A.tip[1]) + 4];
    near(capsuleIn(A.hip[0], A.hip[1], A.knee[0], A.knee[1], 1.9 * k), armour, box, { shade: 1 });
    // the blade bows outward a little, like a scythe
    const dx = A.tip[0] - A.knee[0], dy = A.tip[1] - A.knee[1], len = Math.hypot(dx, dy) || 1;
    let nx = dy / len, ny = -dx / len;
    if (nx * A.s - 0.3 * ny < 0) { nx = -nx; ny = -ny; }
    const mid = [(A.knee[0] + A.tip[0]) / 2 + nx * 1.7 * k, (A.knee[1] + A.tip[1]) / 2 + ny * 1.7 * k];
    near(anyIn(capsuleIn(A.knee[0], A.knee[1], mid[0], mid[1], 2.6 * k, 1.9 * k), capsuleIn(mid[0], mid[1], A.tip[0], A.tip[1], 1.9 * k, 0.55)), bone, box, { shade: 1 });
    near(ellipseIn(A.knee[0], A.knee[1], 2.4 * k, 2.4 * k), armour, box, { shade: 1 });
  };

  if (!J.dead) {
    // ---- wings, behind the abdomen
    if (J.wing?.kind === 'veil') {
      const beat = J.P.beat;
      const V = frillIn(ab.x, ab.y, ab.rx, ab.ry, J.wing.reach, { from: PI - 2.05, to: PI + 2.05, ribs: 9, scoop: 0.55, taper: 0.45, ripple: (i) => 0.9 * wave(beat, i * 0.21) });
      const reachAll = J.wing.reach + 2;
      g.fill(ab.x - ab.rx - reachAll, ab.y - ab.ry - reachAll, ab.x + ab.rx + reachAll, ab.y + ab.ry + reachAll, V.inside, soft, { shade: 1 });
      V.tips.forEach(([tx, ty], i) => { g.line(V.roots[i][0], V.roots[i][1], tx, ty, soft.dark); });
    } else if (J.wing?.kind === 'stubs') {
      const blades = [], veins = [];
      for (const s of [-1, 1]) STUB_AT.forEach((phi, j) => {
        const out = J.wing.reach * (j ? 0.85 : 1) + 0.9 * wave(J.P.beat, j * 0.3 + (s > 0 ? 0.12 : 0));
        const dir = [s * Math.sin(phi), -Math.cos(phi)];
        const tipX = ab.x + dir[0] * (ab.rx + out), tipY = ab.y + dir[1] * (ab.ry + out);
        blades.push(leafIn(ab.x + dir[0] * ab.rx * 0.45, ab.y + dir[1] * ab.ry * 0.45, tipX, tipY, (9 - 1.5 * j) * k, { belly: 0.72, blunt: 0.6 }));
        veins.push([ab.x + dir[0] * ab.rx, ab.y + dir[1] * ab.ry, tipX - dir[0] * 2.5, tipY - dir[1] * 2.5]);
      });
      g.blob(blades, soft, { shade: 1 });
      for (const v of veins) g.line(...v, soft.dark);            // the vein down the middle of each blade
    }
    // ---- the walking legs, then the abdomen over their hips
    for (const L of J.legs) leg(L, 1.5 * k, 0.6, armour);
    g.ellipse(ab.x, ab.y, ab.rx, ab.ry, skin, { shade: 2, light: 1 });
    g.fill(ab.x - ab.rx, ab.y - ab.ry, ab.x + ab.rx, ab.y + ab.ry, segmentRingsIn(ab.x, ab.y, ab.rx, ab.ry, [0.5, 0.76], { from: 0.34 }), skin.dark, { clip: inAb });
    const hot = { light: soft.light, base: soft.light, dark: soft.base, deep: soft.dark };          // a sac lit from inside, when every light flares
    for (const s of J.sacs) blister(g, s.x, s.y, s.r, { skin: s.level >= 2 ? hot : soft, core: look.glow ?? '#9fe040', level: s.level, under: skin.dark, open: s.open });
    // ---- the soft chest (only when she rears), and the thorax with a crease where it sits on the abdomen
    if (inChest) g.fill(0, 0, W, Hh, inChest, soft, { shade: 1 });
    g.fill(th.x - th.rx - 1, th.y - th.ry - 1, th.x + th.rx + 1, th.y + th.ry + 1, around(inTh), skin.dark, { clip: inAb });
    g.ellipse(th.x, th.y, th.rx, th.ry, armour, { shade: 1, light: 1 });
    g.rect(th.x - 0.5 * th.rx, Math.round(th.y - th.ry * 0.25), th.rx, 1, armour.dark, { clip: inTh });      // the seam between its two plates
  } else {
    // ---- what is left: the husks of the legs, the torn skin of the abdomen with its hollow inside, and the puddle
    const R = J.remains, hk = R.husk;
    for (const L of J.legs) leg(L, 1.5 * k, 0.6, armour);
    g.fill(0, 0, W, Hh, splatIn(hk.x, hk.y, hk.r, { seed: 8, lobes: 9, drops: 0, squash: hk.squash }), skin, { shade: 1, clip: floor });
    g.ellipse(hk.x, hk.y + 1, hk.r * 0.55, Math.max(1.5, hk.r * hk.squash * 0.5), soft.dark, { shade: 0 });      // the hollow inside it
    for (const A of J.arms) arm(A);                       // the scythes lie in the puddle, their tips clear of it
    const pd = R.puddle;
    g.fill(0, 0, W, Hh, splatIn(pd.x, pd.y, pd.r, { seed: 3, lobes: 6, drops: 4, squash: pd.squash }), { light: acid.light, base: acid.base, dark: acid.dark }, { shade: 1, clip: floor });
    // a few sacs lie in it, burst
    J.sacs.slice(0, 3).forEach((s, i) => blister(g, pd.x + [-0.52, 0.5, -0.12][i] * pd.r, pd.y - 2 + [1, -1, 3][i], 2.6 * k, { skin: soft, core: null, open: true }));
  }

  // ---- the scythe legs (behind the head, unless they are stabbing in front of it), the horns, the mandibles and the head
  if (!J.dead) for (const A of J.arms) if (!A.front) arm(A);
  const hb = [H.x - 30 * k, H.y - 30 * k, H.x + 30 * k, H.y + 18 * k];
  const lying = J.dead ? { clip: floor } : {};
  if (S.horns) near(S.horns, bone, hb, { shade: 1, ...lying });
  near(S.mandibles, bone, hb, { shade: 1, ...lying });
  near(S.skull, armour, hb, { shade: 1, light: 1, ...lying });
  if (!J.dead) g.fill(...hb, S.mouth, armour.deep, { clip: S.skull });
  g.fill(...hb, S.visor, armour.deep, { clip: S.skull });
  if (!J.dead) {
    if (H.jaw > 0.55 || J.P.charge > 0.3) g.rect(H.x - 1, Math.round(J.mouth[1]) - 1, 2, 2, J.P.charge > 0.6 || H.glow >= 1.5 ? acid.light : acid.base);
    if (!H.blink && H.glow >= 0.25) {
      // six eyes in the visor: two big pairs and a small one at each end
      const ey = Math.round(H.y - 0.6 * k) - 1, hot = H.glow >= 1.5, dim = H.glow < 0.75;
      for (const [c, w] of [[1, 2], [4, 2], [7, 1]]) for (const s of [-1, 1]) {
        const off = Math.round(c * k), x0 = s > 0 ? H.x + off : H.x - off - w;
        g.rect(x0, ey, w, 2, hot ? acid.light : dim ? acid.dark : acid.base, { clip: S.visor });
        if (!dim && w === 2) g.dot(x0 + 1, ey, hot ? '#ffffff' : acid.light);
      }
    }
  }
  for (const A of J.arms) if (A.front) arm(A);
  return g;
}

/**
 * Adds the light and the flying matter of a brood queen; call it AFTER g.outline(): the flare of her eyes and sacs, the acid she sprays, the shriek, the sparks where her scythes land, the burst of the brood sacs and of the whole abdomen. Light is never inked: it is rimmed with its own dark tone.
 * Arguments: g (the Surface); J (from solve()); look { glow (the acid), core (its white-hot middle, default cream), dust (what flies up where the scythes land, default steel) }.
 */
export function lights(g, J, look = {}) {
  const k = J.k, P = J.P, G = GROUND, [W, Hh] = SIZE;
  const C = steps(look.glow ?? '#9fe040', { core: look.core ?? '#f0ead8' });
  const air = [2, 2, W - 2, Hh - 2], overFloor = [2, 2, W - 2, G];
  const ab = J.abdomen, [mx, my] = J.mouth;
  if (P.flash) return g;
  // every light flaring: a sparkle on the sacs, in turn
  if (P.glow >= 1.5 && !J.dead) {
    const turn = Math.round(P.beat * 40);
    J.sacs.forEach((s) => { if (!s.open && (s.i + turn) % 2 === 0) twinkle(g, s.x, s.y, s.brood ? 2 : 1, C[2], { box: air }); });
  }
  // the mouth fills with light before she sprays
  if (P.charge > 0.2) glowDisc(g, mx, my, lerp(1.2, 3.6, P.charge) * k, C, { box: air });
  if (P.spray >= 0 && P.spray < 0.99) {
    // a fan of acid toward the camera: drops leave the mouth one after another and spread
    const aim = 0.1 * (J.head.x - CX);
    sprayFan(g, { t: P.spray, x: mx, y: my + 1, angle: aim, arc: 2.5, reach: 27 * k, jets: 7, width: 3, seed: 4, colours: C, box: air });
    particles(g, { t: P.spray, x: mx, y: my + 1, count: 8, seed: 4, loop: false, stagger: 0.5, angle: aim, arc: 2.4, dist: 24 * k, gravity: 2, size: 2.6, colours: C, box: air });
    if (P.spray < 0.8) glowDisc(g, mx, my + 1, 2.6 * k, C, { box: air });
  }
  if (P.shout >= 0 && P.shout < 0.99) {
    // the shriek: arcs of sound leaving the mouth
    for (const [r0, wide] of [[4, 0.8], [10, 1.05]]) {
      const r = Math.min(r0 + 12 * P.shout, Hh - 3 - my);
      if (r > 3) g.arc(mx, my, r, -wide, wide, 1.2, P.shout < 0.5 ? C[1] : C[2]);
    }
  }
  if (P.impact >= 0 && P.impact < 0.99) {
    // the scythes land: a flat ring of dust between the tips, and a spark on each
    const tips = J.arms.map((A) => A.tip), x = (tips[0][0] + tips[1][0]) / 2, y = Math.min(Hh - 6, Math.max(tips[0][1], tips[1][1]) - 2);
    const dust = look.dust ?? '#c2c9d6';
    ring(g, { t: P.impact, x, y, r0: 5, r1: 17 * k, thick: 3, squash: 0.3, colours: ['#ffffff', dust, tone(dust, -1)], box: air, seed: 2 });
    if (P.impact < 0.4) for (const [tx, ty] of tips) twinkle(g, tx, ty - 2, P.impact < 0.1 ? 2 : 1, dust, { box: air });
  }
  if (P.pop >= 0 && P.pop < 0.99) {
    // the brood sacs burst: a flash on the first frame, then what was in them is thrown clear
    J.sacs.filter((s) => s.brood).forEach((s, i) => {
      const a = Math.atan2(s.u, s.v), ox = s.x + Math.sin(a) * 2, oy = s.y + Math.cos(a) * 2;
      if (P.pop < 0.08) starburst(g, { x: Math.floor(ox) + 0.5, y: Math.floor(oy) + 0.5, count: 6, r1: 8 * k, width: 4, turn: a, colour: C[1], rim: C[3], box: air });
      particles(g, { t: P.pop, x: ox, y: oy, count: 6, seed: 11 + i, loop: false, stagger: 0.2, angle: a, arc: 1.7, dist: 11 * k, gravity: 7, size: 3.2, colours: C, box: air });
    });
  }
  if (P.bloat > 0 && !J.dead) {
    // sacs popping as she bloats: a spark on each as it goes
    J.sacs.forEach((s) => { const th = 0.2 + 0.75 * hash(s.i, 31); if (P.bloat > th && P.bloat - th < 0.22) twinkle(g, s.x, s.y, 2, C[1], { box: air }); });
  }
  if (J.dead && P.burst < 0.99) {
    // the abdomen bursts: one white-hot flash, and everything that was in it flies out and falls
    const cx = Math.floor(ab.x) + 0.5, cy = Math.floor(ab.y) + 0.5;
    if (P.burst < 0.08) {
      starburst(g, { x: cx, y: cy, count: 10, r1: Math.min(ab.rx * 1.25, cy - 3, CX - 4), width: 8, turn: PI + 0.2, colour: C[1], rim: C[3], box: overFloor });
      glowDisc(g, cx, cy, ab.rx * 0.5, C.slice(0, 4), { box: air });
    }
    particles(g, { t: P.burst, x: cx, y: cy, count: 20, seed: 7, loop: false, stagger: 0.12, angle: PI, arc: TAU, dist: 32 * k, gravity: 16, size: 4, colours: C, box: overFloor });
  }
  return g;
}

/**
 * Named attach points of a solved brood queen, { name: { x, y, angle } } in frame pixels: head (the top of the head, where the horns stand), back (the far end of the abdomen, where the wings stand), feet (the floor under her), muzzle (the mouth, where what she sprays appears; it flies toward the camera) and spawn1, spawn2, spawn3 (the floor beside each brood sac, where what hatches appears).
 * Arguments: J (from solve()).
 */
export function sockets(J) {
  const k = J.k, ab = J.abdomen;
  const out = {
    head: { x: J.head.x, y: J.head.y - 7 * k, angle: PI },
    back: { x: ab.x, y: ab.y - ab.ry, angle: PI },
    feet: { x: CX, y: GROUND, angle: 0 },
    muzzle: { x: J.mouth[0], y: J.mouth[1], angle: 0 },
  };
  J.sacs.filter((s) => s.brood).forEach((s, i) => {
    const a = Math.atan2(s.u, s.v), r = s.r + 5 * k;
    out[`spawn${i + 1}`] = { x: clamp(s.x + Math.sin(a) * r, 3, SIZE[0] - 4), y: clamp(s.y + Math.cos(a) * r, 3, GROUND - 1), angle: a };
  });
  return out;
}

/**
 * Builds one frame of a brood queen, posed and fitted once, so the picture and the exported attach points cannot disagree.
 * Arguments: clip (a pose name, one of POSES); t (0..1); p (the sprite's values: size, bulk and bounce are read from it); opt { legs (one of LEGS), sacs (0..1: few to many egg sacs), horns: { kind: one of HORNS or 'none', length }, wings: { kind: one of WINGS or 'none', span } }.
 * Returns F = { clip, d, P, J, draw(g, look) (paints her and returns the joints), finish(g, look) (the white flash of a hit, the outline, then the lights), sockets() }; look is draw()'s and lights()'s: { body, accent, glow, bone, core, dust, outline }.
 */
export function frame(clip, t, p = {}, opt = {}) {
  const d = dims({ size: p.size, bulk: p.bulk, legs: opt.legs, sacs: opt.sacs });
  const P = pose(clip, t, { bounce: p.bounce }, d);
  const J = solve(P, d, opt);
  return {
    clip, d, P, J,
    sockets: () => sockets(J),
    draw(g, look) { draw(g, J, look); return J; },
    finish(g, look = {}) {
      if (P.flash) g.tint('#ffffff');
      g.outline(look.outline ?? INK);
      lights(g, J, look);
      return g;
    },
  };
}
