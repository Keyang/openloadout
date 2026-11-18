// Walking war machine rig, on a 96x96 canvas: a two-legged mech that faces the camera, for the bosses and heavy
// machines of top-down games. It is seen in the three-quarter view (docs/style-guide.md, section 1): the tops of its
// shoulders, chest and feet show, lit, above the fronts turned to the camera. No direction clips: a boss of this size
// always faces the player. The worked example is sprites/warden-mech.js.
//
// The rig is the code; a sprite on it is choices (Contract 13): its proportions, which head, which weapon arms, what it
// carries on its back, its colours, and which of the poses are its clips. The body is described once (dims) and animated
// by moving its pieces (pose): about twenty numbers a frame, never a redrawn picture.
//
//   clips(speedOf, entries)          the clip table for the poses a sprite uses (POSES)
//   frame(clip, t, p, opt)           ONE FRAME, posed once: F.draw(g, look), F.finish(g, look), F.sockets()
//   dims, pose, solve, draw, lights, sockets      what frame() is made of, for a pose of your own
//   WEAPONS, PACKS, HEADS            the names of the weapon arms, the things on its back and the heads
//
//   import * as M from '../rigs/mech-walker.js';
//   const frameOf = (clip, t, p) => M.frame(clip, t, p, { head: p.shape, weapon: { kind: p.weapon, length: p.weaponLength }, pack: { kind: p.pack, size: p.packSize } });
//   // in defineSprite:  size: M.SIZE, pivot: M.PIVOT, clips: M.clips((p) => p.speed, ['idle', 'walk', 'shoot', 'beam', 'overheat', 'hurt', 'die']),
//   sockets: (clip, t, p) => frameOf(clip, t, p).sockets(),
//   render(g, { clip, t, p }) { const F = frameOf(clip, t, p), look = { body: p.body, accent: p.accent, glow: p.glow }; F.draw(g, look); F.finish(g, look); }
//
// What it is made of, from the floor up: two feet, shins and knee caps, thighs, a pelvis, a broad chest with a glowing
// reactor in it (the weak point: socket `core`), two shoulder blocks with hazard stripes, an arm under each that ends in
// a weapon, a head, and on its back missile pods, radiators or nothing. The pieces are painted by engine/warmachine.js.
//
// The poses (POSES): idle (it breathes, the reactor pulses, it blinks), walk (it stomps on the spot: the feet come down
// on frames 0 and 4 of 8 and the body drops on each), shoot (a volley of four missiles straight up, from the pods on its
// back or from hatches in its shoulders: three frames of warning, the first away on frame 4 of 12), beam (the reactor
// charges for six frames with rings closing on it, then a thick beam fires down the picture and sweeps across),
// overheat (it slumps, steam pours from both shoulders and the reactor lies open), hurt (white recoil), die (a chain of
// small blasts, it drops to its knees, the reactor blows on frame 8 of 12 and the wreck stays).
//
// Pure functions: Node and browser, no Math.random. Angles are frame angles: 0 = down the picture, PI/2 = right, PI = up.

import { lerp, clamp, keys, pulse, wave, fract, PI, TAU } from '../engine/motion.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';
import { polyIn, capsuleIn } from '../engine/surface.js';
import { seam } from '../engine/rock.js';
import { stripesIn } from '../engine/solids.js';
import { steps, glow, twinkle, puffs, particles, ring } from '../engine/fx.js';
import { lightShape } from '../engine/shots.js';
import { fireball } from '../engine/blast.js';
import { swirl } from '../engine/spells.js';
import { ringIn } from '../engine/shapes.js';
import { scrap } from '../engine/fx-floor.js';
import { armourBlock, reactorPort, mechHead, armWeapon, missileRack, rackTubes, radiatorFins, risingMissile, MECH_HEADS, ARM_WEAPONS } from '../engine/warmachine.js';

/** The frame of a walking war machine, [width, height] in pixels (a top-down boss: style guide, section 1). */
export const SIZE = [96, 96];
/** The ground line: the feet rest on the row above it and their outline lands on it. */
export const GROUND = 88;
/** The pivot column: the machine is the same on both sides of the line between this column and the one before it. */
export const CX = 48;
/** Where a game anchors the sprite, [x, y]: the floor between its feet. */
export const PIVOT = [CX, GROUND];
/** The weapon arms: cannon arms, claws, drills (drawn by armWeapon in engine/warmachine.js). */
export const WEAPONS = ARM_WEAPONS;
/** What it can carry on its back: missile pods (two launcher boxes) or radiators (two fans of cooling fins). */
export const PACKS = Object.freeze(['missile pods', 'radiators']);
/** The heads: cockpit, sensor, skull plate (drawn by mechHead in engine/warmachine.js). */
export const HEADS = MECH_HEADS;
/** The poses pose() knows, each a clip: idle, walk, shoot, beam, overheat, hurt, die. */
export const POSES = Object.freeze(['idle', 'walk', 'shoot', 'beam', 'overheat', 'hurt', 'die']);

const STANDARD = {
  idle: { frames: 8, fps: 7, loop: true }, walk: { frames: 8, fps: 10, loop: true },
  shoot: { frames: 12, fps: 11, loop: false }, beam: { frames: 12, fps: 11, loop: false }, overheat: { frames: 10, fps: 10, loop: false },
  hurt: { frames: 4, fps: 9, loop: false }, die: { frames: 12, fps: 10, loop: false },
};
const R = Math.round;
const even = (v) => 2 * Math.max(1, R(v / 2));
const WEAPON_LENGTH = { 'cannon arms': 17, claws: 15, drills: 18 };
/** How many missiles a volley is, and the frame of a 12-frame `shoot` on which the first leaves. */
const VOLLEY = 4, FIRST = 4;

/**
 * Builds the clip table of a walking war machine from pose names, with the frames, speed and looping the style guide gives them (idle and walk 8, looping; shoot and beam 12; overheat 10; hurt 4; die 12).
 * Arguments: speedOf ((p) => the Speed slider, 0..1); entries (a list, default every pose in order; each is a name of POSES or { name, label } to give the clip another button text).
 */
export function clips(speedOf = () => 0.5, entries = POSES) {
  const out = {};
  for (const raw of entries) {
    const e = typeof raw === 'string' ? { name: raw } : raw, s = STANDARD[e.name];
    if (!s) throw new Error(`mech-walker rig: no pose "${e.name}" (${POSES.join(', ')})`);
    out[e.name] = { frames: s.frames, fps: (p) => s.fps * lerp(0.65, 1.45, speedOf(p) ?? 0.5), loop: s.loop, ...(e.label ? { label: e.label } : {}) };
  }
  return out;
}

// ---- measurements -------------------------------------------------------------------------------

/**
 * Returns the measurements of a walking war machine in whole pixels, from its sliders and the parts it carries.
 * Arguments: p ({ size, bulk, legs } each 0..1, missing = 0.5: the whole machine, light to heavy, short to long legs); opt { head (one of HEADS, default 'cockpit'), weapon: { kind (one of WEAPONS), length (a multiplier, default 1) }, pack: { kind (one of PACKS, or 'none'), size (a multiplier, default 1) } }.
 * Returns { s (the scale, 0.9 to 1.1), chest, waist (half the width of the chest at its top and at its foot), chestH, lid (rows of its top face), coreR (the reactor), pelvisW (half), pelvisH, hipX, stance (how far each hip and each foot is from the middle), thigh, shin, foot (rows), thighW, shinW (half), footW (half), kneeR, shoulderW, shoulderH, shoulderX, armX, upper (rows of upper arm), headW, headH, head, weapon { kind, length (px), k (the scale of its width), half (half its width, px) }, pack { kind, size, tube (px across a missile tube), rows (rows of tubes: 2, or 1 on a machine too tall for them), fin (px of radiator fin) } }.
 */
export function dims(p = {}, opt = {}) {
  const size = clamp(p.size ?? 0.5), bulk = clamp(p.bulk ?? 0.5), legs = clamp(p.legs ?? 0.5);
  const s = lerp(0.9, 1.1, size);
  const chest = R(lerp(18, 22, bulk) * s), shoulderW = even(lerp(12, 15, bulk) * s), shinW = R(lerp(5, 6.5, bulk) * s);
  const shoulderX = chest + shoulderW / 2 - 2;
  const head = HEADS.includes(opt.head) ? opt.head : 'cockpit';
  const wk = WEAPONS.includes(opt.weapon?.kind) ? opt.weapon.kind : 'cannon arms';
  const pk = PACKS.includes(opt.pack?.kind) ? opt.pack.kind : 'none', ps = opt.pack?.size ?? 1;
  const d = {
    s, chest, waist: R(lerp(10, 13, bulk) * s), chestH: R(lerp(16, 18, bulk) * s), lid: R(5 * s), coreR: R(lerp(5, 6, bulk) * s),
    pelvisW: R(lerp(10, 12, bulk) * s), pelvisH: R(8 * s), hipX: R(lerp(9, 11, bulk) * s), stance: R(lerp(14, 17, bulk) * s),
    thigh: R(lerp(8, 12, legs) * s), shin: R(lerp(10, 16, legs) * s), foot: R(7 * s),
    thighW: R(lerp(8, 10, bulk) * s), shinW, footW: shinW + 2, kneeR: Math.max(3, R(3.4 * s)),
    shoulderW, shoulderH: R(13 * s), shoulderX, armX: shoulderX + 2, upper: R(6 * s),
    headW: even(14 * s), headH: R(12 * s), head,
    weapon: { kind: wk, length: R(WEAPON_LENGTH[wk] * (opt.weapon?.length ?? 1) * s), k: lerp(0.9, 1.15, bulk) * s, half: R((wk === 'claws' ? 10.5 : 5) * lerp(0.9, 1.15, bulk) * s) + 1 },
  };
  // what stands on its back must stay in the frame when the machine stands at its full height and is knocked upward:
  // the tallest machine carries one row of tubes instead of two, and shorter fins
  const room = GROUND - d.foot - d.shin - d.thigh - 3 - d.chestH - d.lid - 2 - 3;
  const tube = Math.max(3, R(4 * ps * s));
  d.pack = { kind: pk, size: ps, tube, rows: 2 * (tube + 1) + 1 + 3 <= room ? 2 : 1, fin: Math.min(15 * ps * s, room) };
  return d;
}

// ---- poses ----------------------------------------------------------------------------------------

/**
 * Returns the pose of a walking war machine at phase t (0..1) of an action, in the machine's own terms; solve(), draw(), lights() and sockets() take it.
 * Arguments: action (one of POSES); t; m { bounce: 0..1, how heavily it moves }; d (dims()).
 * The pose: bx, by (the body moved sideways and down, px), roll (px the picture's right shoulder hangs lower than the left), shrug (px both shoulders are raised), slump (px it has sagged forward), head ([dx, dy]), eye (0 off, 0.5 dim, 1 lit, 2 flaring), scan (-1..1: where the eye looks), core (the reactor: 0 dark .. 2 white hot), open (0..1: the reactor's shutters), burnt (true: the reactor has blown), feet ([left, right]: px each foot is off the floor), kneel (0..1: down on both knees), arms ([left, right], each { out, up }: px its weapon is swung outward and raised), work (a whole number that turns drills and works claws), hatch (0..1: the launchers open), fired (missiles gone), rockets ([{ i, age }]: the ones in the air and how many frames ago each left), kick (which launcher fired this frame: 0 left, 1 right, else -1), charge (0..1 while the reactor charges, else -1), beam (null, or { sweep: -1..1, power: 0..1 }), steam (0..1 while it vents, else -1), stomp ([left, right]: 0..1 since that foot came down, else -1), blasts ([{ at, age, big }]: the explosions on it), scrap (0..1 while armour flies from the last blast, else -1), smoke (0..1 while the wreck smokes, else -1), flash (tint this frame white).
 */
export function pose(action, t, m = {}, d = dims()) {
  if (!POSES.includes(action)) throw new Error(`mech-walker rig: no pose "${action}" (${POSES.join(', ')})`);
  const bounce = clamp(m.bounce ?? 0.5), s = d.s;
  const P = {
    bx: 0, by: 0, roll: 0, shrug: 0, slump: 0, head: [0, 0], eye: 1, scan: 0, core: 1, open: 0,
    feet: [0, 0], kneel: 0, arms: [{ out: 0, up: 0 }, { out: 0, up: 0 }], work: 0,
    hatch: 0, fired: 0, rockets: [], kick: -1, charge: -1, beam: null, steam: -1, stomp: [-1, -1], blasts: [], scrap: -1, smoke: -1, burnt: false, flash: false,
  };
  const k2 = (ks) => keys(t, ks);
  if (action === 'idle') {
    // it breathes: the chest lifts, the shoulders follow a beat later; the reactor swells and sinks; one blink
    const u = fract(t);
    P.by = -lerp(0.7, 1.9, bounce) * pulse(u);
    P.shrug = 0.9 * pulse(u, -0.16);
    P.core = 1 + 0.55 * pulse(u, -0.06);
    P.eye = u >= 0.74 && u < 0.86 ? 0 : u >= 0.86 ? 0.5 : 1;
    P.scan = wave(u, 0.1);
    P.work = Math.floor(u * 8 + 1e-6);
  } else if (action === 'walk') {
    // it stomps on the spot: the left foot comes down at t = 0, the right at t = 0.5, and the body drops onto each
    const u = fract(t), lift = lerp(4, 8, bounce) * s, drop = lerp(1.6, 3.4, bounce);
    const up = (v) => { v = fract(v); return v < 0.55 ? 0 : Math.sin((PI * (v - 0.55)) / 0.45) ** 0.8; };
    P.feet = [lift * up(u), lift * up(u + 0.5)];
    const beat = fract(u * 2);
    P.by = drop * keys(beat, [[0, 1], [0.25, 0.45], [0.5, 0], [0.75, -0.3], [1, 1]]);
    P.bx = -lerp(1, 2, bounce) * Math.sin(TAU * u);                    // its weight goes over the foot that stands
    P.roll = -Math.sin(TAU * u);                                       // and the shoulder over the lifted foot rises
    P.arms = [{ out: 0, up: -2 * Math.sin(TAU * u) }, { out: 0, up: 2 * Math.sin(TAU * u) }];
    P.head = [0, 0.9 * keys(fract(u * 2 - 0.12), [[0, 1], [0.3, 0.3], [0.6, 0], [1, 1]])];
    P.stomp = [u < 0.3 ? u / 0.3 : -1, u >= 0.5 && u < 0.8 ? (u - 0.5) / 0.3 : -1];
    P.core = 1 + 0.5 * pulse(u * 2);
    P.work = Math.floor(u * 8 + 1e-6);
  } else if (action === 'shoot') {
    // frames of 12: 0 idle, 1 to 3 it braces and the launchers open (the warning), 4 to 7 one missile each, left and right in turn,
    // 8 the last one climbs away, 9 to 10 the launchers shut, 11 idle
    const f = (n) => n / 11, n = R(t * 11);
    P.by = k2([[0, 0], [f(1), 1], [f(2), 2], [f(3), 3], [f(7), 3], [f(8), 1], [f(9), -1], [f(10), 0], [1, 0]]) + (n >= FIRST && n < FIRST + VOLLEY ? 1 : 0);
    P.shrug = k2([[0, 0], [f(2), 1], [f(8), 1], [f(10), 0], [1, 0]]);
    P.hatch = k2([[0, 0], [f(1), 0.4], [f(2), 0.8], [f(3), 1], [f(8), 1], [f(9), 0.5], [f(10), 0], [1, 0]]);
    P.head = [0, k2([[0, 0], [f(2), 1], [f(3), 2], [f(8), 2], [f(10), 0], [1, 0]])];
    P.eye = n >= 1 && n <= 8 ? 2 : 1;
    P.core = n >= 1 && n <= 8 ? 1.5 : 1;
    const out = k2([[0, 0], [f(3), 2], [f(8), 2], [f(10), 0], [1, 0]]);
    P.arms = [{ out, up: 0 }, { out, up: 0 }];
    P.fired = clamp(n - FIRST + 1, 0, VOLLEY);
    if (n >= FIRST && n < FIRST + VOLLEY) { P.kick = (n - FIRST) % 2; P.roll = P.kick ? 1.6 : -1.6; }
    for (let i = 0; i < VOLLEY; i++) { const age = n - FIRST - i; if (age >= 0 && age <= 3 && n < 11) P.rockets.push({ i, age }); }
  } else if (action === 'beam') {
    // frames of 12: 0 idle, 1 to 5 the reactor charges and it spreads its arms (the warning), 6 the beam fires, 7 to 9 it sweeps
    // from the picture's left to its right, 10 the reactor cools, 11 idle
    const f = (n) => n / 11, n = R(t * 11);
    P.charge = n >= 1 && n <= 5 ? (n - 1) / 4 : -1;
    P.by = k2([[0, 0], [f(1), 1], [f(3), 2], [f(5), 3], [f(6), -2], [f(7), -1], [f(9), 0], [f(10), 1], [1, 0]]);
    P.shrug = k2([[0, 0], [f(5), 1], [f(6), 2], [f(9), 1], [1, 0]]);
    P.arms = [0, 1].map(() => ({ out: k2([[0, 0], [f(1), 1], [f(3), 3], [f(5), 5], [f(6), 6], [f(9), 5], [f(10), 2], [1, 0]]), up: k2([[0, 0], [f(5), 3], [f(6), 4], [f(9), 3], [f(10), 1], [1, 0]]) }));
    P.open = k2([[0, 0], [f(2), 0.5], [f(4), 1], [f(9), 1], [f(10), 0.5], [1, 0]]);
    P.core = [1, 1.3, 1.5, 1.5, 2, 2, 2, 2, 2, 2, 1.5, 1][n];
    P.head = [0, k2([[0, 0], [f(3), 1], [f(5), 2], [f(6), -1], [f(9), 0], [1, 0]])];
    P.eye = n >= 4 && n <= 9 ? 2 : 1;
    if (n >= 6 && n <= 9) {
      const sweep = [-1, -0.36, 0.36, 1][n - 6];
      P.beam = { sweep, power: n === 9 ? 0.6 : 1 };
      P.bx = R(sweep * 2);
    }
  } else if (action === 'overheat') {
    // frames of 10: 0 the reactor flares (idle pose), 1 to 3 it slumps and the shutters fall open, 3 to 6 it hangs there heaving
    // while steam pours from both shoulders, 7 to 8 it pulls itself up, 9 idle
    const f = (n) => n / 9, n = R(t * 9);
    const down = k2([[0, 0], [f(1), 0.35], [f(2), 0.85], [f(3), 1], [f(6), 1], [f(7), 0.5], [f(8), 0.15], [1, 0]]);
    const heave = n >= 3 && n <= 6 ? (n % 2 ? 0 : 1) : 0;
    P.by = 5 * down + heave;
    P.slump = 6 * down;
    P.open = k2([[0, 0], [f(1), 0.3], [f(2), 0.7], [f(3), 1], [f(6), 1], [f(7), 0.5], [f(8), 0], [1, 0]]);
    P.core = n === 0 ? 2 : n >= 9 ? 1 : n >= 2 && n <= 7 ? (n % 2 ? 2 : 1.5) : 1.5;
    P.eye = n >= 2 && n <= 7 ? 0.5 : 1;
    P.arms = [0, 1].map(() => ({ out: -1 * down, up: -3 * down }));
    P.steam = n >= 1 && n <= 8 ? (n - 1) / 7 : -1;
  } else if (action === 'hurt') {
    // frames of 4: 0 knocked back, white; 1 it dips; 2 nearly back; 3 idle
    const n = R(t * 3);
    P.flash = n === 0;
    P.by = [-2, 2, 1, 0][n]; P.bx = [-2, -1, 0, 0][n];
    P.shrug = [2, 0, 0, 0][n];
    P.head = [[-1, -2], [0, 1], [0, 0], [0, 0]][n];
    P.arms = [0, 1].map(() => ({ out: [3, 1, 0, 0][n], up: [2, -1, 0, 0][n] }));
    P.core = [0.5, 0.5, 1, 1][n]; P.eye = [0.5, 0.5, 1, 1][n];
  } else {
    // die, frames of 12: 0 the hit (white), 1 to 3 small blasts and it shudders, 4 to 6 its legs give and it drops to its knees
    // (another blast on 5), 7 it sags, 8 the reactor blows, 9 to 10 smoke, 11 the wreck: on its knees, dark, a wisp of smoke
    const f = (n) => n / 11, n = R(t * 11);
    P.flash = n === 0;
    P.kneel = k2([[0, 0], [f(3), 0], [f(4), 0.3], [f(5), 0.72], [f(6), 1], [1, 1]]);
    P.by = [-2, -1, 1, 0, 0, 0, 1, 0, -1, 1, 0, 0][n];
    P.bx = [-2, 2, -2, 1, 0, 0, 0, 0, 0, 0, 0, 0][n];
    P.shrug = n === 0 ? 2 : 0;
    P.slump = k2([[0, 0], [f(5), 0], [f(6), 2], [f(7), 5], [f(8), 6], [f(9), 7], [1, 7]]);
    P.roll = k2([[0, 0], [f(6), 0], [f(8), 2], [1, 2]]);
    P.core = [0.5, 1.5, 0.5, 2, 1, 2, 1.5, 2, 2, 0, 0, 0][n];
    P.eye = n < 2 ? 0.5 : n < 5 ? (n % 2 ? 0.5 : 1) : n < 8 ? 0.5 : 0;
    P.open = n >= 8 ? 1 : 0;
    const out = k2([[0, 3], [f(1), 1], [f(6), 1], [f(8), 3], [1, 3]]);
    P.arms = [0, 1].map((i) => ({ out, up: n === 0 ? 2 : -k2([[0, 0], [f(6), 0], [f(8), 4], [1, 4]]) * (i ? 1 : 0.6) }));
    for (const [at, start, big] of [['shoulderL', 1], ['armR', 2], ['head', 3], ['shoulderR', 5], ['core', 8, true]]) {
      const age = (n - start) / (big ? 2.5 : 2);
      if (age >= 0 && age <= 1) P.blasts.push({ at, age, big: !!big });
    }
    P.scrap = n >= 8 ? (n - 8) / 3 : -1;
    P.smoke = n >= 9 ? (n - 9) / 2 : -1;
    P.burnt = n >= 9;
  }
  return P;
}

// ---- joints ---------------------------------------------------------------------------------------

/**
 * Works out where every piece of a posed walking war machine is, in whole frame pixels: the legs take up whatever the body drops, and nothing a pose does carries a piece through the floor.
 * Arguments: P (a pose); d (dims()); opt { cx, ground (the pivot: default CX and GROUND) }.
 * Returns J: { cx (the body's middle line), gy, hipY, kneel, legs ([left, right], each { sgn, hip, knee, ankle ([x, y]), sole (the row after the foot's last), lift }), pelvis ([x, y]), chest { x0, x1, top, face, bottom, waistY }, core ([x, y]), shoulders ([left, right], each { sgn, x, top, face, bottom }), arms ([left, right], each { sgn, x, elbow (the row the weapon starts on), tip (the row after its last) }), head ([x, chin row]), back ([x, y]: where the pack stands), launchers ([[x, y], ...]: the mouth each missile of a volley leaves from, in firing order) }.
 */
export function solve(P, d, opt = {}) {
  const cx0 = opt.cx ?? CX, G = opt.ground ?? GROUND;
  const kneel = clamp(P.kneel ?? 0), by = P.by ?? 0;
  const cx = cx0 + R(P.bx ?? 0);
  const standHip = G - d.foot - d.shin - d.thigh, kneelHip = G - d.kneeR - 1 - R(d.thigh * 0.8);
  // the hips never sink below what bent knees allow
  const hipY = Math.min(R(lerp(standHip, kneelHip, kneel) + Math.max(0, by) * (1 - kneel) + Math.min(0, by) * 0.5), kneelHip);
  const bodyY = hipY - standHip + (by < 0 ? R(by * 0.5) : 0);            // how far the torso has moved from where it stands at rest
  const legs = [-1, 1].map((sgn, i) => {
    const lift = (P.feet?.[i] ?? 0) * (1 - kneel), bend = Math.max(0, hipY - standHip) * (1 - kneel);
    const fx = cx0 + sgn * d.stance;
    const sole = R(lerp(G - lift, G - d.shin * 0.5, kneel)), ankleY = sole - d.foot;
    const kneeY = R(lerp(G - d.foot - d.shin - lift * 0.45 + bend * 0.35, G - d.kneeR - 1, kneel));
    const kneeX = fx + sgn * R(lift * 0.15 + bend * 0.3) + (kneel > 0.5 ? sgn : 0);
    return { sgn, hip: [cx0 + R((P.bx ?? 0) * 0.6) + sgn * d.hipX, hipY], knee: [kneeX, kneeY], ankle: [fx + sgn, ankleY], sole, lift };
  });
  const pelvis = [cx0 + R((P.bx ?? 0) * 0.6), hipY];
  const slump = P.slump ?? 0;
  const bottom = hipY - 3, face = bottom - d.chestH + R(slump * 0.3), top = face - d.lid - R(slump * 0.15);
  const chest = { x0: cx - d.chest, x1: cx + d.chest, top, face, bottom, waistY: face + R((bottom - face) * 0.46) };
  const core = [cx, chest.waistY];
  const shoulders = [-1, 1].map((sgn) => {
    const sy = top - 2 - R(P.shrug ?? 0) + R(sgn * (P.roll ?? 0) * 0.5) + R(slump * 0.45);
    return { sgn, x: cx + sgn * d.shoulderX, top: sy, face: sy + R(d.shoulderH * 0.3), bottom: sy + d.shoulderH };
  });
  const arms = [-1, 1].map((sgn, i) => {
    const A = P.arms?.[i] ?? { out: 0, up: 0 }, S = shoulders[i];
    let elbow = S.bottom - 2 + d.upper - R(A.up ?? 0);
    elbow = Math.max(S.face + 2, Math.min(elbow, G - 2 - d.weapon.length));         // the tip of a weapon never goes through the floor
    const reach = Math.min(d.armX + R(A.out ?? 0), SIZE[0] / 2 - 3 - d.weapon.half - Math.abs(cx - cx0));      // a weapon swung wide stops short of the frame's edge
    return { sgn, x: cx + sgn * reach, elbow, tip: elbow + d.weapon.length, from: [S.x + sgn, S.bottom - 3] };
  });
  const head = [cx + R(P.head?.[0] ?? 0), face + 2 + R(P.head?.[1] ?? 0) + R(slump * 0.7)];
  const back = [cx, top + 1 - R((P.shrug ?? 0) * 0.5) + R(slump * 0.3)];
  const J = { cx, gy: G, hipY, kneel, bodyY, legs, pelvis, chest, core, shoulders, arms, head, back };
  J.pods = podsOf(J, d);
  J.launchers = launchersOf(J, d);
  return J;
}

/** Where the two missile pods stand: [{ x (middle), y (the row after the last), cols, rows, tube, gap, lid }], or null when the pack is not pods. */
function podsOf(J, d) {
  if (d.pack.kind !== 'missile pods') return null;
  const tube = d.pack.tube, gap = 2, w = 2 * (tube + gap) + gap, lid = 3;
  // they stand on its back, one each side of the head
  return [-1, 1].map((sgn) => ({ x: J.cx + sgn * (d.headW / 2 + w / 2 + 1), y: J.back[1], cols: 2, rows: d.pack.rows, tube, gap, lid }));
}

/** The mouth each missile of a volley leaves from, in firing order (left and right in turn): tubes of the pods, or the hatches in the shoulders. */
function launchersOf(J, d) {
  const out = [];
  if (J.pods) {
    const T = J.pods.map((Pd) => { const w = Pd.cols * (Pd.tube + Pd.gap) + Pd.gap; return rackTubes(R(Pd.x - w / 2), Pd.y - (Pd.rows * (Pd.tube + 1) + 1), Pd); });
    for (let i = 0; i < VOLLEY; i++) { const tb = T[i % 2][Math.floor(i / 2) % T[i % 2].length]; out.push([tb.cx, tb.y]); }
  } else for (let i = 0; i < VOLLEY; i++) { const S = J.shoulders[i % 2]; out.push([S.x + (Math.floor(i / 2) ? 2 : -2) * S.sgn, S.top + 1]); }
  return out;
}

/** The tubes of pod `side` (0 left, 1 right) that have fired, as indexes into its tubes. */
const firedTubes = (fired, side) => { const out = []; for (let i = 0; i < fired; i++) if (i % 2 === side) out.push(Math.floor(i / 2)); return out; };

// ---- painting -------------------------------------------------------------------------------------

/** The ramps and colour steps of a look: { body, far, dark, metal, accent, light (steps) }. */
function paints(look = {}) {
  const body = look.body ?? '#6b7896', K = ramp(look.dark ?? '#434d6d');
  return {
    body: ramp(body), far: farRamp(body), K, dark: { light: K.light, base: K.base, dark: K.base, deep: K.dark }, metal: ramp(look.metal ?? '#c2c9d6'),
    accent: ramp(look.accent ?? '#f2a030'), light: steps(look.glow ?? '#e2473f', { core: look.core ?? '#f0ead8' }), seam: ramp(body).deep,
  };
}

function drawPack(g, J, P, d, C) {
  if (d.pack.kind === 'missile pods') {
    J.pods.forEach((Pd, side) => missileRack(g, Pd.x, Pd.y, { ...Pd, paint: C.far, dark: C.K, nose: C.light[3], glint: C.light[1], empty: firedTubes(P.fired ?? 0, side) }));
  } else if (d.pack.kind === 'radiators') {
    const hot = (P.core ?? 1) >= 1.9 ? C.light[1] : (P.core ?? 1) >= 1.4 ? C.light[3] : null;                 // the fins glow when the reactor runs hot
    // a fan of fins each side of the head
    for (const sgn of [-1, 1]) radiatorFins(g, J.cx + sgn * (d.headW / 2 + 3), J.back[1] + 1, { side: sgn, count: 3, length: d.pack.fin, spread: 1.05, lean: 0.15, width: 4, paint: C.metal, slat: C.metal.dark, hot, step: Math.max(3, R(4 * d.s)) });
  }
}

function drawLeg(g, L, J, d, C) {
  const { sgn, hip, knee, ankle, sole } = L, kneeling = J.kneel > 0.5;
  const shin = () => {
    const ht = d.shinW - 1, hb = d.shinW, y0 = knee[1], y1 = Math.max(y0 + 2, ankle[1] + 1);
    const plate = polyIn([[knee[0] - ht, y0], [knee[0] + ht, y0], [ankle[0] + hb, y1], [ankle[0] - hb, y1]]);
    g.fill(Math.min(knee[0], ankle[0]) - hb, y0, Math.max(knee[0], ankle[0]) + hb, y1, plate, C.body, { shade: 1, light: 1 });
    if (y1 - y0 >= 7) g.rect(R((knee[0] + ankle[0]) / 2) - 1, y0 + 4, 2, y1 - y0 - 6, C.body.dark, { clip: plate });      // the groove down the greave
  };
  const foot = () => {
    const B = armourBlock(g, { x0: ankle[0] - d.footW, x1: ankle[0] + d.footW, top: sole - d.foot, face: sole - d.foot + R(d.foot * 0.4), bottom: sole, inset: 2, cut: [1, 1], paint: C.body, seam: C.seam });
    g.fill(ankle[0] - 1, sole - d.foot, ankle[0] + 1, sole, (px, py) => B.front(px, py) && Math.abs(px - ankle[0]) < 1 && py > sole - d.foot + R(d.foot * 0.4) + 1, C.body.dark, { shade: 0 });   // the split between its two toes
  };
  const thigh = () => {
    seam(g, capsuleIn(hip[0], hip[1], knee[0], knee[1], d.thighW / 2), C.seam);
    g.limb(hip[0], hip[1], knee[0], knee[1], d.thighW, C.body, { shade: 1 });
    g.line(hip[0] - sgn * 3, hip[1] + 2, knee[0] - sgn * 3, knee[1] - 2, C.body.dark);                                     // the edge of the plate on its inner side
  };
  const cap = () => {
    const w = d.shinW + 1, r = d.kneeR, [kx, ky] = knee;
    const oct = polyIn([[kx - w + 1, ky - r], [kx + w - 1, ky - r], [kx + w, ky - r + 2], [kx + w, ky + r - 2], [kx + w - 1, ky + r], [kx - w + 1, ky + r], [kx - w, ky + r - 2], [kx - w, ky - r + 2]]);
    seam(g, oct, C.seam);
    g.fill(kx - w, ky - r, kx + w, ky + r, oct, C.accent, { shade: 1 });
    g.fill(kx - w, ky - r, kx + w, ky - r + 1, (px, py) => oct(px, py) && py < ky - r + 1, C.accent.light, { shade: 0 });
    g.rect(kx - 1, ky - 1, 2, 2, C.K.base);
  };
  if (kneeling) { foot(); shin(); thigh(); cap(); } else { thigh(); shin(); cap(); foot(); }
}

function drawShoulder(g, S, d, C, hatch) {
  const half = d.shoulderW / 2, x0 = S.x - half, x1 = S.x + half, sgn = S.sgn;
  if (hatch > 0) {
    // the lid of the launch hatch stands up behind its opening
    const lift = Math.max(1, R(3 * hatch));
    g.rect(S.x - 4, S.top - lift, 8, lift + 1, C.far, { shade: 0 });
    g.rect(S.x - 4, S.top - lift, 8, 1, C.far.light, { shade: 0 });
  }
  const B = armourBlock(g, { x0, x1, top: S.top, face: S.face, bottom: S.bottom, inset: 2, cut: sgn < 0 ? [3, 0] : [0, 3], paint: C.body, seam: C.seam });
  // hazard stripes across its front
  const y0 = S.face + 2, tall = Math.max(4, R((S.bottom - S.face) * 0.5));
  const band = (px, py) => B.front(px, py) && py >= y0 && py < y0 + tall;
  g.fill(x0, y0, x1, y0 + tall, band, C.K.base, { shade: 0 });
  g.fill(x0, y0, x1, y0 + tall, stripesIn(band, { pitch: 6, slant: sgn, duty: 0.5, phase: S.x + (sgn < 0 ? 1 : 0) }), C.accent.base, { shade: 0 });
  if (hatch > 0) g.rect(S.x - 3, S.top + 1, 6, Math.max(1, S.face - S.top - 2), C.K.dark, { shade: 0 });
}

/**
 * Paints a posed walking war machine, without its outline and its lights (lights() adds those after g.outline): what is on its back, the legs, the pelvis, the chest with the reactor in it, the arms and their weapons, the shoulders and the head. Returns the joints J, with J.eyes ([[x, y], ...]) added.
 * Arguments: g (the Surface); P (a pose); d (dims()); look { body (the armour), accent (hazard stripes and knee caps), glow (the reactor, the eyes and the noses of the missiles), metal (pistons, barrels, claws: default steel), dark (joints and fittings: default plate), core (the white-hot middle of the lights: default cream) } as '#rrggbb'; opt (as solve()).
 */
export function draw(g, P, d, look = {}, opt = {}) {
  const J = solve(P, d, opt), C = paints(look), { cx } = J;
  drawPack(g, J, P, d, C);
  for (const L of J.legs) drawLeg(g, L, J, d, C);
  // the pelvis: a dark block hip to hip, with an armour plate hung on its front
  const [px, py] = J.pelvis, ph = d.pelvisH, pTop = py - R(ph / 2);
  armourBlock(g, { x0: px - d.pelvisW, x1: px + d.pelvisW, top: pTop, face: pTop + 1, bottom: pTop + ph, inset: 1, cut: [3, 3], paint: C.dark, lit: C.K.light, shade: 0, seam: C.seam });
  for (const sgn of [-1, 1]) g.rect(px + sgn * (d.pelvisW - 3) - 1, pTop + R(ph / 2) - 1, 2, 2, C.metal.base);          // the pin of each hip
  const pw = Math.max(3, R(d.pelvisW * 0.42));
  g.poly([[px - pw, pTop + 1], [px + pw, pTop + 1], [px + pw, pTop + ph - 1], [px, Math.min(pTop + ph + 3, J.gy - 1)], [px - pw, pTop + ph - 1]], C.body, { shade: 1 });
  // the chest: wide at the shoulders, cut in to the waist, with a lit top
  const Ch = J.chest;
  const B = armourBlock(g, { x0: Ch.x0, x1: Ch.x1, top: Ch.top, face: Ch.face, bottom: Ch.bottom, inset: 2, foot: [cx - d.waist, cx + d.waist], waist: Ch.waistY, paint: C.body, shade: 2, seam: C.seam });
  const [kx, ky] = J.core;
  // plate lines: one across each side at the height of the reactor, and vents under them
  for (const sgn of [-1, 1]) {
    g.fill(Ch.x0, ky, Ch.x1, ky + 1, (qx, qy) => B.front(qx, qy) && Math.floor(qy) === ky && (qx - cx) * sgn > d.coreR + 3, C.body.dark, { shade: 0 });
    for (let i = 0; i < 2; i++) { const vy = ky + 3 + i * 2, vx = cx + sgn * (d.coreR + 4); g.fill(Ch.x0, vy, Ch.x1, vy + 1, (qx, qy) => B.front(qx, qy) && B.front(qx + sgn * 2, qy) && Math.floor(qy) === vy && (qx - vx) * sgn >= 0 && (qx - vx) * sgn < 4, C.K.base, { shade: 0 }); }
  }
  // the collar the head stands in
  g.rect(cx - d.headW / 2 - 1, Ch.face - 2, d.headW + 2, 3, C.K.base, { shade: 0 });
  reactorPort(g, kx, ky, d.coreR, { level: P.core ?? 1, open: P.open ?? 0, housing: C.K, colours: C.light, burnt: P.burnt ? B.front : false });
  // the arms: a dark strut from under each shoulder to the elbow, and the weapon from there down
  for (const A of J.arms) {
    seam(g, capsuleIn(A.from[0], A.from[1], A.x, A.elbow, 3), C.seam);
    g.limb(A.from[0], A.from[1], A.x, A.elbow + 1, 6, C.dark, { shade: 0, light: 1 });
    armWeapon(g, d.weapon.kind, A.x, A.elbow, d.weapon.length, { k: d.weapon.k, side: A.sgn, body: C.body, metal: C.metal, dark: C.K, accent: C.accent, work: P.work ?? 0, seam: C.seam });
  }
  const hatch = d.pack.kind === 'missile pods' ? 0 : clamp(P.hatch ?? 0);
  for (const S of J.shoulders) drawShoulder(g, S, d, C, hatch);
  const Hd = mechHead(g, d.head, J.head[0], J.head[1], { w: d.headW, h: d.headH, body: C.body, metal: C.metal, dark: C.K, colours: C.light, level: P.eye ?? 1, look: P.scan ?? 0, seam: C.seam });
  J.eyes = Hd.eyes; J.headTop = Hd.top;
  return J;
}

/**
 * Adds the lights and loose effects of a walking war machine; call it AFTER g.outline(): the dust of a stomp, the flare of a hot reactor and of its eyes, the rings that close on a charging reactor, missiles climbing on their flames, the beam, steam, blasts with flying scrap, and the smoke of the wreck. Light is never inked: it is rimmed with its own dark tone. Nothing is drawn on the outermost row or column.
 * Arguments: g; J (what draw() returned); P (the pose); d (dims()); look { glow, core (as draw()), fire (blasts and missile flames: default amber), steam (default near white), dust (default the metal's colour) }; opt { frame (a whole number that changes every frame: flicker) }.
 */
export function lights(g, J, P, d, look = {}, opt = {}) {
  const C = paints(look), L = C.light, box = [1, 1, SIZE[0] - 1, SIZE[1] - 1], G = J.gy, s = d.s;
  const fire = steps(look.fire ?? '#f2a030', { core: look.core ?? '#f0ead8' });
  const metal = look.metal ?? '#c2c9d6', pale = [tone(metal, 0.85), metal, tone(metal, -1)];
  const [kx, ky] = J.core;
  // stomp: dust kicked out to both sides of the foot that came down
  P.stomp?.forEach((age, i) => {
    if (age < 0 || age >= 1) return;
    const Lg = J.legs[i];
    for (const side of [-1, 1]) puffs(g, { t: age, x: Lg.ankle[0] + side * (d.footW + 1), y: G - 2, count: 2, seed: 3 + i * 2 + side, loop: false, angle: side * PI / 2, arc: 0.5, dist: 5, rise: 2, size: 2.2, shape: 'round', floor: G, colours: pale, box });
  });
  // the eyes flare
  if ((P.eye ?? 1) >= 2) for (const [ex, ey] of J.eyes ?? []) twinkle(g, ex, ey, 1, L[2], { core: L[0], box });
  // the reactor charges: rings close on it one after the other, and sparks spiral in
  if (P.charge >= 0) {
    for (const lag of [0, 0.5]) {
      const u = fract(P.charge * 1.25 + lag), r = R(lerp(30 * s, d.coreR + 5, u));
      g.fill(kx - r - 1, ky - r - 1, kx + r + 1, ky + r + 1, ringIn(kx, ky, r, 1.25), u > 0.55 ? L[1] : L[3], { clip: (qx, qy) => qx >= box[0] && qy >= box[1] && qx < box[2] && qy < box[3] });
    }
    swirl(g, { t: P.charge, x: kx, y: ky, count: 7, seed: 5, loop: true, r0: 24 * s, r1: d.coreR + 2, turns: 0.4, size: 2, tail: 3, colours: L, box });
    twinkle(g, kx, ky, P.charge > 0.5 ? 2 : 1, L[1], { core: L[0], box });
  } else if ((P.core ?? 1) >= 1.75 && !P.beam && !P.burnt) twinkle(g, kx, ky, 2, L[1], { core: L[0], box });
  // the beam: a thick shaft of light from the reactor down the picture and out of the frame
  if (P.beam) {
    const w = lerp(5, 11, P.beam.power) * s, x1 = kx + P.beam.sweep * 16 * s, y1 = SIZE[1] + 6;
    lightShape(g, capsuleIn(kx, ky, x1, y1, w / 2, w / 2 + 1.5), [L[0], L[1], L[2], L[3], L[4]], { box, inset: 1 });
    glow(g, kx, ky, (d.coreR + 5) * P.beam.power, L, { box });
  }
  // missiles: a flash at the mouth as each leaves, then it climbs on its flame; smoke hangs where it left
  for (const { i, age } of P.rockets ?? []) {
    const [mx, my] = J.launchers[i];
    if (age === 0) glow(g, mx, my - 1, 4.2 * s, fire, { box });
    if (age <= 2) risingMissile(g, mx, my - 5 - age * 13 * s, { length: 5, flame: age === 0 ? 3 : 6, body: look.core ?? '#f0ead8', nose: L[3], colours: fire, box });
    if (age >= 1 && age <= 3) puffs(g, { t: (age - 1) / 3, x: mx, y: my - 2, count: 2, seed: 20 + i, loop: false, angle: PI, arc: 1.2, dist: 7, rise: 4, size: 3, shape: 'round', colours: pale, box });
  }
  // steam from both shoulders
  if (P.steam >= 0) for (const S of J.shoulders) {
    puffs(g, { t: P.steam, x: S.x + S.sgn * 2, y: S.top - 1, count: 5, seed: 40 + S.sgn, loop: false, stagger: 0.6, angle: PI - S.sgn * 0.35, arc: 0.7, dist: 16 * s, rise: 6, size: 4.2, shape: 'round', lobes: 2, colours: [look.steam ?? '#ffffff', ...pale], box });
  }
  // blasts
  const where = { shoulderL: () => [J.shoulders[0].x - 2, J.shoulders[0].face + 2], shoulderR: () => [J.shoulders[1].x + 2, J.shoulders[1].face + 3], armR: () => [J.arms[1].x, J.arms[1].elbow + 5], head: () => [J.head[0] + 3, J.head[1] - 6], core: () => [kx, ky] };
  if (P.scrap >= 0) scrap(g, { t: P.scrap, x: kx, y: Math.min(ky + 10, G - 8), count: 7, keep: 4, seed: 7, shape: 'plates', dist: 34 * s, hop: 8, size: 5, colour: look.body ?? '#6b7896', rim: INK, box: [3, 3, SIZE[0] - 3, G + 5] });
  for (const b of P.blasts ?? []) {
    const [bx, by] = where[b.at]?.() ?? [kx, ky], r = (b.big ? 15 : 7) * s, k = b.age;
    if (k < 0.45) fireball(g, { x: bx, y: by, r: r * lerp(0.75, 1, k / 0.45), lobes: 6, seed: b.at.length, boil: k, colours: fire, box });
    else fireball(g, { x: bx, y: by, r: r * lerp(1, 1.2, k), lobes: 6, seed: b.at.length, boil: k, hole: r * lerp(0.4, 1.05, (k - 0.45) / 0.55), colours: fire.slice(2), box });
    if (k < 1) particles(g, { t: k, x: bx, y: by, count: b.big ? 10 : 5, seed: b.at.length * 3, loop: false, stagger: 0.2, angle: PI, arc: 5, dist: r * 1.5, gravity: 5, size: 2.2, colours: fire, box });
    if (b.big && k > 0 && k < 1) ring(g, { t: k, x: bx, y: by, r0: r * 0.6, r1: r * 1.7, thick: 3, colours: fire, box, seed: 2 });
  }
  // the wreck smokes
  if (P.smoke >= 0) puffs(g, { t: clamp(0.15 + P.smoke * 0.6), x: kx, y: ky - 4, count: 4, seed: 61, loop: false, stagger: 0.5, angle: PI, arc: 0.8, dist: 20 * s, rise: 8, size: 4.5, shape: 'round', lobes: 2, colours: [tone(metal, -0.6), tone(metal, -1), tone(metal, -1.8)], box });
}

/**
 * Named attach points of a solved walking war machine, { name: { x, y, angle } } in frame pixels: hand and offhand (the elbows the weapons hang from, on the picture's left and right), head (its top), back (where the pack stands), feet (the floor between the feet), muzzle (the launcher mouth the next missile leaves from; angle: up) and core (the reactor, the weak point; the beam leaves it down the picture).
 * Arguments: J (from solve() or draw()); P (the pose); d (dims()).
 */
export function sockets(J, P, d) {
  const next = J.launchers[Math.min(VOLLEY - 1, P.kick >= 0 ? Math.max(0, (P.fired ?? 1) - 1) : (P.fired ?? 0) % VOLLEY)];
  return {
    hand: { x: J.arms[0].x, y: J.arms[0].elbow, angle: 0 },
    offhand: { x: J.arms[1].x, y: J.arms[1].elbow, angle: 0 },
    head: { x: J.head[0], y: J.head[1] - d.headH, angle: PI },
    back: { x: J.back[0], y: J.back[1], angle: PI },
    feet: { x: (J.legs[0].ankle[0] + J.legs[1].ankle[0]) / 2, y: J.gy, angle: 0 },
    muzzle: { x: next[0], y: next[1], angle: PI },
    core: { x: J.core[0], y: J.core[1], angle: 0 },
  };
}

/**
 * Builds one frame of a walking war machine, posed once, so the picture and the exported attach points cannot disagree.
 * Arguments: clip (a pose name, one of POSES); t (0..1); p (the sprite's values: size, bulk, legs and bounce are read from it); opt { head: one of HEADS, weapon: { kind: one of WEAPONS, length }, pack: { kind: one of PACKS or 'none', size }, frame (the frame number, for flicker) }.
 * Returns F = { clip, d, P, draw(g, look) (paints it and returns the joints), finish(g, look) (the white of a hit, the outline, then the lights), sockets() }; look is draw()'s and lights()'s.
 */
export function frame(clip, t, p = {}, opt = {}) {
  const d = dims(p, opt), P = pose(clip, t, { bounce: p.bounce }, d);
  let J = null;
  return {
    clip, d, P,
    sockets: () => sockets(solve(P, d, opt), P, d),
    draw(g, look) { J = draw(g, P, d, look, opt); return J; },
    finish(g, look = {}) {
      if (!J) J = draw(g, P, d, look, opt);
      if (P.flash) g.tint('#ffffff');
      g.outline(look.outline ?? INK);
      lights(g, J, P, d, look, { frame: opt.frame ?? 0 });
      return g;
    },
  };
}
