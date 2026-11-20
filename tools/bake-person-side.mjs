#!/usr/bin/env node
// Bakes the side-view person (rigs/humanoid.js) into data: the base piece base:person-side (a bone rig with the
// standard clips as key poses) and the part pieces people swap on it (docs/data-sprites.md sections 1.1, 3.3, 7 and
// build item B16; Contract 15 rule 5). TEMPORARY, as the design's tools/bake-rig.mjs: it is deleted with the code rigs
// (docs/data-sprites.md section 5, P4). Named for its family so the top-down family's baker (B16b) is a file of its own.
//
//   node tools/bake-person-side.mjs            say what would be written and whether pieces/ already holds it
//   node tools/bake-person-side.mjs --write    write the pieces: a piece whose content differs from its pinned (released)
//                                              version goes to the next version (releasedAs); pin new ones by hand
//   node tools/bake-person-side.mjs --sheet    out/person-side-knight.png: the Hero fixture beside the frozen code Hero
//                                              (tests/fixtures/code-sprites/knight.js), every clip, and the difference
//
// What is baked (at the code rig's defaults: dims() with height, build and head 0.5; motion bounce and stride 0.5):
//   bones    the code rig's joints as bones: `stand` (the ground under the hips up to the hips, so a Height scale moves
//            the hips with the legs), `spine` (hips to neck), `neck`, `face` (the code's 0.8 px forward), node `skull`
//            (the middle of the head, upright, turned only when the body lies down), hips 0.6 px either side, IK legs,
//            arms from 0.84 up the spine, nodes `handF` (pointing the way the held thing points) and `handB`, upright
//            nodes at the ankles and the lifted toes, the nodes parts hang from (PART_NODES), and the bones the limbs
//            are drawn on (LIMBS) and the torso's carriers (trunkOf), whose starts are on the half-pixel grid where the
//            code's snapped and rounded points are, so rigs/bones.js's rounding of a bone's start moves no pixel
//   shapes   exactly the Surface calls of rigs/humanoid.js draw(): limbs, the pelvis ellipse, the torso capsule, the
//            skull ellipse, stamps for the eye (variant blink) and the open mouth, rects for the planted feet; last,
//            GROUND_CUT on node ground (engine/resolve.js puts a base's operations after the sprite's own shapes, so the
//            cut reaches every part a sprite adds and a sprite never writes one)
//   clips    STANDARD_CLIPS: every frame of the code pose (an armed body: what the family holds) as one key, so each
//            frame is the code's joints exactly; flash as a frame edit; each track written only where it changes
//            (compactKeys). VARIANT_CLIPS: the poses the code draws in their place for other settings (nothing held, a
//            punch, a thrust, a bow), for a sprite to name with `from`; baked, not yet published (VARIANTS_PUBLISHED)
//   points   hand, offhand, head, back, feet (Contract 3 sockets)
// Drawn, the bare base is within 2 % of the code rig's pixels at every frame but die 1 to 3, where the code turns the
// head's pixels part way (tests/unit/pieces-person-side.test.mjs). Proportions are not args (a base takes none: extends
// carries no args): a sprite scales the base's bones and shapes by id with a control's `scales` (SCALES).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from '../rigs/humanoid.js';
import { PI } from '../engine/motion.js';
import { Surface } from '../engine/surface.js';
import { INK, ramp } from '../engine/color.js';
import { renderFrame, defaultParams } from '../engine/sprite.js';
import { sheetPng } from './lib/data-sheet.mjs';
import { readPins, pieceHash } from './lib/pieces-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEG = 180 / PI;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const deg = (rad) => r4(rad * DEG);

/** The body measurements the base is baked at: rigs/humanoid.js dims() at its defaults (height, build, head 0.5). */
export const D0 = Object.freeze(H.dims({}));
/** The motion settings the clips are baked at: bounce and stride 0.5, something held (the family's default). */
export const MOTION = Object.freeze({ bounce: 0.5, stride: 0.5, armed: true });
const CX = H.CX, GROUND = H.GROUND;
const ANKLE_Y = GROUND - D0.foot;            // the ankles' row at rest
const STAND = D0.leg * 0.97;                 // the ground under the hips (at ankle height) up to the hips
const HIP_Y = ANKLE_Y - STAND;               // the hips at rest
// a rect's pixels are those whose centres are at or past its corner; rigs/humanoid.js puts its corner on a rounded
// pixel, Math.round (halves up): a hair past the point gives the same pixels
const NUDGE = 0.01;
// the lay chain (keyOf): layD from the ground node straight down PARK px to the chain's root, then layR and layF, each
// REACH long. At rest they fold flat back on each other, so lay is parked at that root, PARK px under the ground, off
// any frame (the tallest is 360 rows); when the body lies flat they open, keeping the line from the root to lay, to
// reach the ground strip. Between a parked key and a lying one (a die played at other frames) the renderer blends the
// angles, and with the fold split evenly either side of that line lay moves along it: straight up from under the
// ground to the strip, never through the frame. Angles kept to 1e-5 degree (compactKeys FINE): under 0.001 px at lay
const PARK = 1000, REACH = 600;
const half = (v) => Math.round(v * 2) / 2;
/**
 * Where rigs/humanoid.js draws the torso and the pelvis from a solved pose: it rounds the hips and the neck (x to half
 * pixels, y to whole ones), puts the pelvis on the rounded hips and runs the torso's capsule from 0.12 of the way up,
 * half a pixel higher, to 0.55 of the chest's radius under the neck. The bone renderer rounds the start of each bone
 * to half pixels, so the base reaches each of those points with a bone that ends on that grid: `seat` (down from the
 * hips to one pixel under the rounded hips: the pelvis hangs there), `loin` (from the hips to the capsule's lower end,
 * rounded to half pixels) and `trunk` (from there to the capsule's top, exactly). Each is turned and stretched per
 * frame: { seat: stretch, loin: { angle, length }, trunk: { angle, length } } (radians from straight down, px).
 * Arguments: J (rigs/humanoid.js solve), d.
 */
export function trunkOf(J, d = D0) {
  const hx = half(J.hip[0]), hy = Math.round(J.hip[1]), nx = half(J.neck[0]), ny = Math.round(J.neck[1]);
  const hi = [nx, ny + d.chestR * 0.55], lo = torsoStart([hx + 0.12 * (nx - hx), hy + 0.12 * (ny - hy) - 0.5], hi, d);
  const seg = (a, b) => ({ angle: Math.atan2(b[0] - a[0], b[1] - a[1]), length: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  return { seat: hy + 1 - J.hip[1], loin: seg(J.hip, lo), trunk: seg(lo, hi) };
}
const TORSO_PAINT = ramp('#3a6ea5');
/** The torso capsule's pixels from a to b (Surface.capsule, as rigs/humanoid.js draws it), as one string. */
function torsoPixels(a, b, d) {
  const g = new Surface(...H.SIZE);
  g.capsule(a[0], a[1], b[0], b[1], d.hipR, d.chestR, TORSO_PAINT);
  return g.data;
}
/**
 * Where the base starts the torso: the renderer puts a bone's start on the half-pixel grid, and the code's capsule
 * starts at `lo` (on a 0.06 px grid), so of the four half-pixel points around lo the one whose capsule (to hi) has the
 * fewest pixels unlike the code's. Arguments: lo, hi (the code's capsule ends), d.
 */
function torsoStart(lo, hi, d) {
  const want = torsoPixels(lo, hi, d);
  let best = null;
  for (const x of new Set([Math.floor(lo[0] * 2) / 2, Math.ceil(lo[0] * 2) / 2])) for (const y of new Set([Math.floor(lo[1] * 2) / 2, Math.ceil(lo[1] * 2) / 2])) {
    const got = torsoPixels([x, y], hi, d);
    let n = 0;
    for (let i = 0; i < got.length; i++) if (got[i] !== want[i]) n++;
    const far = Math.hypot(x - lo[0], y - lo[1]);
    if (!best || n < best.n || (n === best.n && far < best.far)) best = { at: [x, y], n, far };
  }
  return best.at;
}
// loin and trunk lengths the keys stretch (0.5 to 1.5 of them): the clips need 1.09 to 2.51 and 5.4 to 8.0 px
const LOIN = 1.7, TRUNK_LENGTH = 6.8;
// the face bone: the code's 0.8 px forward, stretched per frame; when the head turns, the turned head's middle is 0.48
// to 1.53 px from its start, so it is long enough for both with a stretch of 0.5 to 1.5
const FACE = 1.02;
// the floor bone: from the root to the ground row 6 px behind it; the root is 10 px up to 3 px down in the clips
const FLOOR_BACK = 6, FLOOR = 9, FLOOR_REST = Math.atan2(-FLOOR_BACK, 2);
const STEP = 1.2;                            // ankle to under its rounded pixel: 0.58 to 1.49 of this, inside a key's stretch
const HEEL = { angle: Math.atan2(-1, -0.2), length: Math.hypot(1, 0.2) };   // from 1.2 under the rounded ankle to 1 back, 1 down
const TOE = 2.5;                             // the lifted foot's bone, stretched per frame

/**
 * The standard clips of the base, in order, as the code rig plays them (rigs/humanoid.js CLIP_TABLE): name ->
 * { pose (the code pose drawn), frames, fps (at the middle speed), loop }. A sprite inherits every one.
 */
export const STANDARD_CLIPS = Object.freeze({
  idle: { pose: 'idle', frames: 8, fps: 7, loop: true },
  walk: { pose: 'walk', frames: 8, fps: 10, loop: true },
  run: { pose: 'run', frames: 8, fps: 14, loop: true },
  jump: { pose: 'jump', frames: 8, fps: 11, loop: false },
  attack: { pose: 'attack', frames: 8, fps: 13, loop: false },
  shoot: { pose: 'shoot', frames: 6, fps: 14, loop: false },
  cast: { pose: 'cast', frames: 8, fps: 10, loop: false },
  block: { pose: 'block', frames: 6, fps: 10, loop: false },
  hurt: { pose: 'hurt', frames: 4, fps: 9, loop: false },
  die: { pose: 'die', frames: 8, fps: 10, loop: false },
  victory: { pose: 'victory', frames: 8, fps: 8, loop: true },
  talk: { pose: 'talk', frames: 8, fps: 7, loop: true },
});

/** The phase of a frame, exactly as engine/sprite.js gives it to render. Arguments: clip ({ frames, loop }), frame. */
export const phaseOf = (c, f) => (c.loop ? f / c.frames : c.frames > 1 ? f / (c.frames - 1) : 0);

/**
 * The base's other clips: the poses rigs/humanoid.js draws in place of a standard clip for some settings, baked so a
 * sprite can name them with `from` (docs/data-sprites.md 2.2: "attack": { "from": "swing" }): name -> { pose, frames,
 * fps, loop (as the standard clip it stands in for), motion (over MOTION), label, for (the standard clip it replaces) }.
 * The unarmed walk, run and talk swing the near arm freely (armed false); punch is the attack with nothing held; thrust
 * the lunge with a point (spears); shoot-bow the archer's shot (the far hand holds the bow out).
 */
export const VARIANT_CLIPS = Object.freeze({
  'walk-unarmed': { pose: 'walk', frames: 8, fps: 10, loop: true, motion: { armed: false }, label: 'Walk (nothing held)', for: 'walk' },
  'run-unarmed': { pose: 'run', frames: 8, fps: 14, loop: true, motion: { armed: false }, label: 'Run (nothing held)', for: 'run' },
  'talk-unarmed': { pose: 'talk', frames: 8, fps: 7, loop: true, motion: { armed: false }, label: 'Talk (nothing held)', for: 'talk' },
  punch: { pose: 'punch', frames: 8, fps: 13, loop: false, motion: { armed: false }, label: 'Punch', for: 'attack' },
  thrust: { pose: 'thrust', frames: 8, fps: 13, loop: false, motion: {}, label: 'Thrust', for: 'attack' },
  'shoot-bow': { pose: 'shoot', frames: 6, fps: 14, loop: false, motion: { shot: 'bow' }, label: 'Shoot (bow)', for: 'shoot' },
});
/** Every clip the base has: STANDARD_CLIPS then VARIANT_CLIPS. */
export const BASE_CLIPS = Object.freeze({ ...STANDARD_CLIPS, ...VARIANT_CLIPS });

/** The code pose of one frame of a base clip (rigs/humanoid.js pose at MOTION, the clip's motion and D0). Arguments: name (of BASE_CLIPS), frame, motion (over those), d (dims). */
export function codePose(name, frame, motion = {}, d = D0) {
  const c = BASE_CLIPS[name];
  return H.pose(c.pose, phaseOf(c, frame), { ...MOTION, ...(c.motion ?? {}), ...motion }, d);
}


/** The nodes and bones parts hang from, beside the body's: what each is for. */
export const PART_NODES = Object.freeze({
  skull: 'the middle of the head, upright (local x forward, y up); faces',
  headwear: 'one pixel above the middle of the head (head up), upright like skull and turning with it: hair caps, helmets, crowns',
  brow: 'a bone from the middle of the head to headwear (one pixel head up)',
  nape: 'a bone from the middle of the head to the back of it (0.75 of the head\'s radius)',
  hang: 'at the back of the head, pointing down the head (turning with it) and swung by the clip\'s sway: long hair, a ponytail, a hood\'s tail',
  back: 'the neck, pointing down (along the body when it lies down) and swung by the clip\'s sway: a cape, a pack, a scarf',
  plume: 'on top of the head (half a pixel above it), pointing back (turning with the head) and swung by the clip\'s sway: a plume, a feather, a tassel',
  top: 'a bone from the middle of the head up to half a pixel above it',
  waist: 'one pixel under the hips as rigs/humanoid.js rounds them (x to half pixels, y whole), upright (local x forward, y up): a belt, the skirt of a coat',
  chest: 'the neck end of the spine, upright: armour, a collar',
  ground: 'on the ground row whatever the pose, upright: the base\'s GROUND_CUT is on it (everything from the ground row to the bottom and edges of any frame cleared, as rigs/humanoid.js cuts its turned head; engine/resolve.js puts it after the sprite\'s shapes)',
  lay: 'upright, on the ground row two rows up (the top of what lies there), under the front of the shoulders (the neck less the chest\'s radius, rounded) when the body lies flat (die 4 to 7), and parked 1000 px under the ground, off any frame, in every other frame (between the two, in a die played at other frames, it rises straight up from there to the strip): what shows along the ground under a body lying on its back (part:cape-ground)',
  handF: 'the near hand, pointing the way the held thing points: swords, staffs, spears',
  handB: 'the far hand, along its forearm: a shield, a lantern',
});

/**
 * How far, in degrees, each swinging part node turns at sway 1 (the code rig's P.sway, -1..1), so the tip of what hangs
 * there moves about as far as rigs/humanoid.js moves it: long hair 1.2 px, a cape's hem 1.5 to 2.5 px, a plume 1.5 px.
 * The way the code moves them: a positive sway takes hair and the cape's hem back (headParts, keyOf turn the nodes by
 * minus these), and the plume's tip up and back.
 */
export const SWAY = Object.freeze({ hang: 8, back: 9, plume: 16 });

const TRUNK = trunkOf(H.solve(H.pose('idle', 0, MOTION, D0), D0));

// ---- the body -----------------------------------------------------------------------------------------------------

/** An offset on the screen as a point in an upright node's frame (local x forward, y up). */
const up = (x, y) => [r4(x), r4(-y)];

function bones(d = D0) {
  const half = d.arm / 2, R = d.headR;
  return [
    { id: 'stand', parent: null, at: [CX, ANKLE_Y], angle: 180, length: r4(STAND) },
    { id: 'spine', parent: 'stand', angle: 0, length: r4(d.torso) },
    { id: 'seat', parent: 'stand', angle: -180, length: 1 },
    { id: 'loin', parent: 'stand', angle: r4(deg(TRUNK.loin.angle) - 180), length: LOIN },
    { id: 'trunk', parent: 'loin', angle: r4(deg(TRUNK.trunk.angle - TRUNK.loin.angle)), length: TRUNK_LENGTH },
    { id: 'neck', parent: 'spine', angle: 0, length: r4(R * 0.78) },
    { id: 'face', parent: 'neck', angle: -90, length: FACE },
    { id: 'hipF', parent: 'stand', angle: -90, length: 0.6 },
    { id: 'thighF', parent: 'hipF', angle: -90, length: r4(d.leg / 2) },
    { id: 'shinF', parent: 'thighF', angle: 0, length: r4(d.leg / 2) },
    { id: 'hipB', parent: 'stand', angle: 90, length: 0.6 },
    { id: 'thighB', parent: 'hipB', angle: 90, length: r4(d.leg / 2) },
    { id: 'shinB', parent: 'thighB', angle: 0, length: r4(d.leg / 2) },
    { id: 'armF', parent: 'spine', from: 0.84, angle: r4(deg(0.15) - 180), length: r4(half) },
    { id: 'foreF', parent: 'armF', angle: r4(deg(0.25)), length: r4(half) },
    { id: 'armB', parent: 'spine', from: 0.84, angle: r4(deg(-0.15) - 180), length: r4(half) },
    { id: 'foreB', parent: 'armB', angle: r4(deg(0.2)), length: r4(half) },
    { id: 'nape', parent: 'skull', angle: 180, length: r4(0.75 * R) },
    { id: 'top', parent: 'skull', angle: 90, length: r4(R + 0.5) },
    { id: 'brow', parent: 'skull', angle: 90, length: 1 },
    // from the ground under the hips (the root) to the ground row FLOOR_BACK px behind it, whatever the root's height
    { id: 'floor', parent: 'stand', from: 0, angle: r4(deg(FLOOR_REST) - 180), length: FLOOR },
    // from the ground node to the lay node (PART_NODES.lay): layD straight down to the chain's root, then layR (up, a
    // quarter turn aside) and layF (folded flat back on it), so lay is parked at the root; opened to reach the ground
    // strip when the body lies flat (keyOf)
    { id: 'layD', parent: 'ground', angle: -90, length: PARK },
    { id: 'layR', parent: 'layD', angle: 270, length: REACH },
    { id: 'layF', parent: 'layR', angle: -180, length: REACH },
    // the feet: `step` reaches from the ankle to 1.2 px under the ankle's rounded pixel (rigs/humanoid.js draws a foot
    // at Math.round of the ankle), `plant` stands there upright, `heel` goes to where a lifted foot starts and `toe`
    // (turned and stretched per frame) to where it ends
    ...['F', 'B'].flatMap((s) => [
      { id: `step${s}`, parent: `ankle${s}`, angle: -90, length: STEP },
      { id: `heel${s}`, parent: `plant${s}`, angle: r4(deg(HEEL.angle) - 90), length: r4(HEEL.length) },
      { id: `toe${s}`, parent: `heel${s}`, angle: r4(90 - deg(HEEL.angle)), length: TOE },
    ]),
    // the limbs as drawn (LIMBS), on bones whose starts are on the half-pixel grid (see LIMBS)
    ...LIMBS.flatMap(({ id, bone, len, after }) => [
      ...(bone ? [{ id: `${id}a`, parent: bone, angle: 180, length: r4(len(d)) }] : after && id.startsWith('shin') ? [{ id: `${id}a`, parent: `${after}d`, angle: 0, length: KNEE }] : []),
      { id: `${id}d`, parent: bone || id.startsWith('shin') ? `${id}a` : `${after}d`, angle: bone ? 180 : 0, length: r4(len(d)) },
    ]),
  ];
}

/**
 * The limbs rigs/humanoid.js draws with g.limb (drawLeg, drawArm), as the base draws them. The renderer puts each
 * bone's start on the half-pixel grid before placing its shapes, and Surface.limb snaps a limb's ends (snapEnd), so
 * each limb is drawn on a bone `<id>d` that runs from the code's snapped start to its snapped end (both on the grid,
 * so the rounding changes nothing) and the keys turn and stretch it there. It starts at the end of `<id>a`: from the
 * far end of the body bone `bone` back to the snapped start (thigh, upper arm), or, for a shin, a bone of KNEE px from
 * the drawn thigh's end (a 3 px thigh's ends are on pixel middles, a 2 px shin's on pixel corners: half a pixel apart
 * both ways). A forearm, as wide as the upper arm, starts where the drawn upper arm ends; the fist is its end.
 * Fields: id, bone (the body bone a reach starts from), after (the limb it follows), len (px, from dims), width (px,
 * from dims), ends (the code's joints it runs between, from solve's J).
 */
export const LIMBS = Object.freeze([
  ...['F', 'B'].flatMap((s) => [
    { id: `thigh${s}`, bone: `thigh${s}`, len: (d) => d.leg / 2, width: (d) => d.legW, ends: (J) => [J[`leg${s}`].hip, J[`leg${s}`].knee] },
    { id: `shin${s}`, after: `thigh${s}`, len: (d) => d.leg / 2, width: (d) => Math.max(2, d.legW - 1), ends: (J) => [J[`leg${s}`].knee, J[`leg${s}`].ankle] },
    { id: `arm${s}`, bone: `arm${s}`, len: (d) => d.arm / 2, width: (d) => d.armW, ends: (J) => [J[`arm${s}`].shoulder, J[`arm${s}`].elbow] },
    { id: `fore${s}`, after: `arm${s}`, len: (d) => d.arm / 2, width: (d) => d.armW, ends: (J) => [J[`arm${s}`].elbow, J[`arm${s}`].hand] },
  ]),
]);
/** From the drawn thigh's end to the drawn shin's start: half a pixel across and half a pixel down or up. */
const KNEE = r4(Math.SQRT1_2);
/** Where Surface.limb puts an end of a limb `w` px wide: odd widths on pixel middles, even ones on pixel corners. */
const snapEnd = (w) => (w % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v));

/**
 * How Height, Build and Head sliders scale the base: a control's `scales` (bones or shapes, by [at 0, at 1]), matching
 * dims() at 0.5 and its ends. Height stretches the body's bones and the drawn limbs' (LIMBS: not the shin's half-pixel
 * KNEE step), and the `back` node, so what hangs down the back (a cape) is as long as the body; Build widens the pelvis, torso and thighs; Head grows the skull, and a sprite adds to its list the ids of
 * its own uses on the head's nodes (headwear, hang, plume) so hair and headgear grow with it (the Hero:
 * hair, nape, hairLong, ponytail, helmet, plume, crown). A control scales bones or shapes, not both, so the head's
 * bones (neck, nape, top, brow) keep their default lengths: at the Head slider's ends the head sits up to 0.8 px off
 * the code's, and a plume or long hair hangs from where the default head's top and back are.
 */
export const SCALES = Object.freeze({
  height: { bones: ['stand', 'loin', 'trunk', 'thighF', 'shinF', 'thighB', 'shinB', 'spine', 'armF', 'foreF', 'armB', 'foreB', 'back',
    ...LIMBS.flatMap(({ id, bone }) => (bone ? [`${id}a`, `${id}d`] : [`${id}d`]))], by: [r4(9 / D0.leg), r4(14 / D0.leg)] },
  build: { shapes: ['pelvis', 'torso', 'thighF', 'thighB'], by: [r4(2.3 / D0.hipR), r4(3.8 / D0.hipR)] },
  head: { shapes: ['skull'], by: [r4(4.6 / D0.headR), r4(6.6 / D0.headR)] },
});

function nodes() {
  return [
    { id: 'skull', parent: 'face', angle: 0 },
    { id: 'ankleF', parent: 'shinF', angle: 90 },
    { id: 'ankleB', parent: 'shinB', angle: 90 },
    { id: 'plantF', parent: 'stepF', angle: 90 },
    { id: 'plantB', parent: 'stepB', angle: 90 },
    { id: 'handF', parent: 'foreF', angle: r4(deg(2.5 - 0.4)) },
    { id: 'handB', parent: 'foreB', angle: 0 },
    { id: 'hang', parent: 'nape', angle: 90 },           // the nape points back (270); down is 0
    { id: 'back', parent: 'spine', angle: -180 },         // the neck end of the spine, pointing down
    { id: 'plume', parent: 'top', angle: 90 },            // on top of the head, pointing back
    { id: 'headwear', parent: 'brow', angle: -90 },        // one pixel head up, upright like the skull
    { id: 'waist', parent: 'seat', angle: 90 },           // the hips, upright (the seat points down)
    { id: 'chest', parent: 'spine', angle: -90 },         // the neck, upright when the spine stands up
    { id: 'ground', parent: 'floor', angle: r4(90 - deg(FLOOR_REST)) },  // on the ground row, upright
    { id: 'lay', parent: 'layF', angle: 0 },                               // upright (layF points up at rest), at its end
  ];
}

/** The body's shapes (rigs/humanoid.js draw, drawLeg, drawArm, drawHead), each the Surface call it stands for. */
function shapes(d = D0) {
  const R = d.headR, T = d.torso;
  const shin = Math.max(2, d.legW - 1), footW = d.legW >= 4 ? 6 : 5;
  const leg = (s, z, far) => {
    const f = far ? { far: true } : {};
    return [
      { id: `thigh${s}`, kind: 'limb', on: `thigh${s}d`, width: d.legW, paint: 'bottom', z, ...f },
      { id: `shin${s}`, kind: 'limb', on: `shin${s}d`, width: shin, paint: 'bottom', z, ...f },
      { id: `foot${s}`, kind: 'rect', on: `plant${s}`, at: up(-2 + NUDGE, NUDGE - STEP), size: [footW, d.foot], paint: 'boots', shade: 0, z, ...f },
      { id: `sole${s}`, kind: 'rect', on: `plant${s}`, at: up(-2 + NUDGE, d.foot - 1 + NUDGE - STEP), size: [footW, 1], paint: 'boots', z, ...f },
      { id: `toe${s}`, kind: 'limb', on: `toe${s}`, width: 2, paint: 'boots', z, hidden: true, ...f },
    ];
  };
  const arm = (s, z, far) => {
    const f = far ? { far: true } : {};
    const L = r4(d.arm / 2);
    return [
      { id: `arm${s}`, kind: 'limb', on: `arm${s}d`, width: d.armW, paint: 'top', z, ...f },
      { id: `fore${s}`, kind: 'limb', on: `fore${s}d`, width: d.armW, paint: 'top', z, ...f },
      { id: `fist${s}`, kind: 'limb', on: `fore${s}d`, from: [L, 0], to: [L, 0], width: d.armW, paint: 'skin', shade: 0, z, ...f },
    ];
  };
  const big = R >= 5.6;
  return [
    ...arm('B', 10, true),
    ...leg('B', 20, true),
    ...leg('F', 30, false),
    { id: 'pelvis', kind: 'ellipse', on: 'waist', at: up(0, -1), r: [r4(d.hipR + 0.3), r4(d.hipR * 0.8)], paint: 'bottom', shade: 0, z: 40 },
    { id: 'torso', kind: 'capsule', on: 'trunk', from: 0, to: 1, r: [r4(d.hipR), r4(d.chestR)], paint: 'top', z: 50 },
    { id: 'skull', kind: 'ellipse', on: 'skull', at: [0, 0], r: [r4(R), r4(R * 0.95)], paint: 'skin', z: 60 },
    // the eye's middle (anchor c) on the screen: drawn at floor(head + 0.42 R), floor(head y - 0.5) by the code; lying
    // down (turned a quarter, the code turns its pixels) it shows its pixels turned: variants lie and lie-blink
    { id: 'eye', kind: 'stamp', on: 'skull', anchor: 'c', at: up(0.42 * R + 0.5, 0.25), rows: big ? ['aw', 'aa'] : ['a', 'a'], key: { a: 'ink', w: 'shine' },
      variants: { blink: ['..', 'aa'], lie: big ? ['wa', 'aa'] : ['aa'], 'lie-blink': ['.a', '.a'] }, z: 62 },
    { id: 'mouth', kind: 'stamp', on: 'skull', at: up(0.42 * R - 0.5, 2.25), rows: [big ? 'aa' : 'a'], key: { a: 'ink' }, hidden: true, z: 63 },
    ...arm('F', 90, false),
    // last, the ground cut: a cut is an operation, and engine/draw-list.js paints by z only between operations, so it
    // must come after everything; engine/resolve.js puts a base's operations after the sprite's own shapes (B16a2)
    GROUND_CUT,
  ];
}

/**
 * The base's ground cut, the last of its shapes: every pixel from the ground row down cleared (1000 rows deep and 1000
 * px either side, past the edges of any frame: the largest is 640x360, and the body keeps its rows in a taller one),
 * on the base's ground node, so nothing of the body or of its parts goes under the ground (rigs/humanoid.js cuts its turned head there).
 * engine/resolve.js puts a base's operations (cut, outline, tint) after the sprite's own shapes, so it applies to the
 * parts a sprite adds as well and the base and parts still paint in z order (a cut splits the z order: Contract 15,
 * engine/draw-list.js ORDER). A sprite never writes it; `extends.drop: ["groundCut"]` removes it.
 */
export const GROUND_CUT = Object.freeze({ id: 'groundCut', kind: 'cut', on: 'ground', shape: { kind: 'poly', points: [[-1000, 0], [1000, 0], [1000, -1000], [-1000, -1000]] } });

function points(d = D0) {
  return [
    { id: 'hand', on: 'handF', at: [0, 0] },
    { id: 'offhand', on: 'handB', at: [0, 0] },
    { id: 'head', on: 'skull', at: up(0, d.headR * 0.95), angle: 90 },
    { id: 'back', on: 'spine', at: [r4(d.torso - 1), 0], angle: -180 },
    { id: 'feet', ground: true },
  ];
}

// ---- the clips ----------------------------------------------------------------------------------------------------

const angleOf = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]);

/**
 * One frame of a code pose as a key of the base: the root, every bone's angle (relative to its parent, degrees), the
 * legs' IK targets (or, lying down, their angles), the lifted feet shown, the eye's blink and the open mouth.
 * Arguments: P (a code pose), d (dims the base is baked at), t (the key's phase).
 */
export function keyOf(P, d = D0, t = 0) {
  const J = H.solve(P, d);
  const spine = PI - P.lean, neck = spine - P.headTilt;
  const turn = P.headTurn || 0;
  const b = {
    spine: deg(-P.lean), neck: deg(-P.headTilt), face: deg(PI / 2 - neck), skull: deg(turn),
    armF: deg(P.armF.a - spine), foreF: deg(P.armF.e), handF: deg(P.item - (P.armF.a + P.armF.e)),
    armB: deg(P.armB.a - spine), foreB: deg(P.armB.e),
    // the part nodes: hang (the nape points back, 270 + turn on the screen; hair hangs down, 0 + turn, swung by sway),
    // plume (back from the middle of the head, swung), back (down the back from the neck whatever the lean, swung),
    // chest (upright)
    // back hangs straight down the screen whatever the body does, as knight.js drawCape hangs the cape (screen-aligned,
    // its hem held above the ground): when the body falls, capeStretch puts the hem where the code's is
    back: r4(deg(-spine) - SWAY.back * P.sway), chest: deg(PI / 2 - spine),
  };
  const key = { t, root: [r4(J.hip[0] - CX), r4(J.hip[1] - HIP_Y)], bones: b };
  // a clip that lies down keeps the hips on the ground at any Height: `stand` leans over instead of the root dropping
  // (the root moves only sideways), so a shorter or longer stand still ends at the hips' height above the ground
  let stand = PI;
  if (P.lie > 0) {
    stand = Math.acos(Math.max(-1, Math.min(1, -(ANKLE_Y - J.hip[1]) / STAND)));
    key.root = [r4(J.hip[0] - CX - STAND * Math.sin(stand)), 0];
    Object.assign(b, { stand: deg(stand), spine: deg(spine - stand), seat: deg(-stand), hipF: deg(PI / 2 - stand), hipB: deg(1.5 * PI - stand) });
  }
  // the ground node stays on the ground row (floor reaches it from the root, turned and stretched)
  const fl = [-FLOOR_BACK, GROUND - ANKLE_Y - key.root[1]], floor = Math.atan2(fl[0], fl[1]);
  b.floor = deg(floor - stand); b.ground = deg(PI / 2 - floor);
  // lay (PART_NODES.lay): when the body lies flat, the top-left of the ground strip under the front of the shoulders
  // (knight.js drawCapeOnGround: from round(neck - chest radius), on the two rows above the ground); else parked at
  // the chain's root, PARK px under the ground, off any frame (every frame sets it, so a clip that lies down holds it
  // parked until then; compactKeys drops it elsewhere). From the root (end of layD, straight down) the way to lay is
  // `a` (radians from straight down: up is PI, kept on that side so a blend never turns the long way round); layR and
  // layF, each REACH long, open by `fold` either side of it (a quarter turn: folded flat, lay at the root). A blend
  // of two keys moves a and fold together, so lay stays on the line up from the root: it rises out of the ground
  {
    const gx = CX + key.root[0] - FLOOR_BACK;
    const to = P.lie >= 0.9 ? [Math.round(J.neck[0] - d.chestR) + NUDGE - gx, PARK + 2 - NUDGE] : [0, 0];   // root to lay, x right, y up
    const a = PI - Math.atan2(to[0], to[1]);
    const fold = Math.acos(Math.min(1, Math.hypot(...to) / (2 * REACH)));
    b.layR = (a + fold) * DEG; b.layF = -2 * fold * DEG; b.lay = (PI / 2 - a + fold) * DEG;
  }
  const tr = trunkOf(J, d);
  b.loin = deg(tr.loin.angle - stand); b.trunk = deg(tr.trunk.angle - tr.loin.angle);
  key.stretch = { seat: r4(tr.seat), loin: r4(tr.loin.length / LOIN), trunk: r4(tr.trunk.length / TRUNK_LENGTH), face: r4(0.8 / FACE), floor: r4(Math.hypot(...fl) / FLOOR) };
  // every frame of a clip that falls sets it (a track before its first key would hold that key's value); 1 elsewhere
  key.stretch.back = P.lie >= 0.05 ? capeStretch(J, d) : 1;
  const show = [], hide = [];
  for (const [s, L, f, off] of [['F', J.legF, P.footF, 0.6], ['B', J.legB, P.footB, -0.6]]) {
    const thigh = angleOf(L.hip, L.knee), shin = angleOf(L.knee, L.ankle);
    b[`ankle${s}`] = deg(PI / 2 - shin);
    const ax = L.ankle[0], ay = L.ankle[1], vx = Math.round(ax) - ax, vy = Math.round(ay) + STEP - ay;
    const step = Math.atan2(vx, vy);
    b[`step${s}`] = deg(step - PI / 2);
    b[`plant${s}`] = deg(PI / 2 - step);
    key.stretch[`step${s}`] = r4(Math.min(1.5, Math.hypot(vx, vy) / STEP));
    // the lifted foot (drawLeg): a 2 px limb from one pixel behind and below the ankle to 2.2 px along PI/2 + 0.7 shin
    // from the pixel below it; heel is that first point, the toe bone is turned and stretched to reach the second
    const a = PI / 2 + 0.7 * shin, tx = 1 + 2.2 * Math.sin(a), ty = 2.2 * Math.cos(a);
    b[`toe${s}`] = deg(Math.atan2(tx, ty) - HEEL.angle);
    key.stretch[`toe${s}`] = r4(Math.min(1.5, Math.max(0.5, Math.hypot(tx, ty) / TOE)));
    (L.lifted ? show : hide).push(`toe${s}`);
    (L.lifted ? hide : show).push(`foot${s}`, `sole${s}`);
    if (P.footF.up || P.footB.up || P.lie > 0) {
      // lying down: the legs are posed by angle (the code turns a knee up that IK would turn down)
      b[`thigh${s}`] = deg(thigh - (s === 'F' ? PI / 2 : -PI / 2));
      b[`shin${s}`] = deg(shin - thigh);
    } else {
      key.ik ??= {};
      key.ik[`leg${s}`] = [r4(f.x - off), r4(f.y - P.lift - 1)];
    }
  }
  // the drawn limbs (LIMBS): each `<id>d` from the code's snapped start to its snapped end
  const drawn = {};
  for (const { id, bone, after, len, width, ends } of LIMBS) {
    const [S, E] = ends(J), snap = snapEnd(width(d)), a = S.map(snap), z = E.map(snap), L = len(d);
    let from;                                     // the absolute angle of the bone the drawn one hangs from
    if (bone) {
      from = angleOf(E, a);
      b[`${id}a`] = deg(from - angleOf(S, E));
      key.stretch[`${id}a`] = r4(Math.hypot(a[0] - E[0], a[1] - E[1]) / L);
    } else if (id.startsWith('shin')) {
      const p = drawn[after];
      if (Math.abs(Math.hypot(a[0] - p.z[0], a[1] - p.z[1]) - KNEE) > 1e-3) throw new Error(`${id}: the drawn thigh and shin do not meet half a pixel apart`);
      from = angleOf(p.z, a);
      b[`${id}a`] = deg(from - p.angle);
    } else from = drawn[after].angle;
    const angle = angleOf(a, z);
    b[`${id}d`] = deg(angle - from);
    key.stretch[`${id}d`] = r4(Math.hypot(z[0] - a[0], z[1] - a[1]) / L);
    drawn[id] = { z, angle };
  }
  (P.mouth ? show : hide).push('mouth');
  key.show = show; key.hide = hide;
  Object.assign(b, headParts(turn, P.sway));
  const quarter = Math.abs(turn - PI / 2) < 1e-9;
  key.swap = { eye: quarter ? (P.blink ? 'lie-blink' : 'lie') : P.blink ? 'blink' : null };
  if (turn) {
    // rigs/humanoid.js turns the head's pixels about the middle of the pixel the head's middle is in: the middle of the
    // head lands there, turned; the face bone reaches it
    const cx = half(J.head[0]), cy = half(J.head[1]), px = Math.floor(cx) + 0.5, py = Math.floor(cy) + 0.5;
    const c = Math.cos(turn), s = Math.sin(turn), vx = cx - px, vy = cy - py;
    const D = [px + vx * c + vy * s, py - vx * s + vy * c];
    const base = [J.head[0] - 0.8, J.head[1]], face = Math.atan2(D[0] - base[0], D[1] - base[1]);
    b.face = deg(face - neck); b.skull = deg(PI / 2 + turn - face);
    key.stretch.face = r4(Math.min(1.5, Math.max(0.5, Math.hypot(D[0] - base[0], D[1] - base[1]) / FACE)));
  }
  return key;
}

/**
 * How far the `back` node is stretched while the body falls (P.lie 0.05 and more), so a cape hanging there (part:cape,
 * whose hem is the torso and 0.45 to 0.55 of a leg down the back) ends where knight.js drawCape ends it: at the hips
 * and that much of a leg below them, held above the ground. Measured at Length 1, the middle of the hem; held to the
 * renderer's 0.5..1.5 (lying flat, 0.5: what then passes the ground is cut).
 */
function capeStretch(J, d = D0) {
  const hem = (k) => Math.min(J.hip[1] + d.leg * k, J.gy - 1);
  return r4(Math.max(0.5, Math.min(1.5, ((hem(0.45) + hem(0.55)) / 2 - J.neck[1]) / (d.torso + d.leg / 2))));
}

/**
 * The part nodes on the head for a head turned back by `turn` (radians; PI/2 lying face up) and the clip's sway:
 * { hang, plume } as key angles (degrees, to their parents). Long hair hangs down from the back of the
 * head and a plume sweeps back, both swung by sway (SWAY), and headwear is one pixel head up. Everything on the head
 * turns with it, as rigs/humanoid.js turns the head's layer (hair, hat and all) when the body falls and lies down; what
 * then passes the ground is cut by the sprite's GROUND_CUT, as the code cuts its turned layer. So only sway moves them
 * against the head; brow and headwear keep their rest angles (no key sets them).
 */
export function headParts(turn, sway = 0) {
  const skull = PI / 2 + turn, nape = skull + PI, top = skull + PI / 2;
  const rel = (abs, parent) => { let a = (abs - parent) * DEG; a = ((a % 360) + 540) % 360 - 180; return r4(a); };
  const hang = turn - (SWAY.hang * sway) / DEG, plume = top + PI / 2 + (SWAY.plume * sway) / DEG;
  return { hang: rel(hang, nape), plume: rel(plume, top) };
}

/** Each bone's and node's rest angle (degrees), as bones() and nodes() give them. */
const REST = Object.freeze(Object.fromEntries([...bones(), ...nodes()].map((b) => [b.id, b.angle ?? 0])));

/**
 * A clip's keys holding only what they change (rigs/keypose.js: a track is blended between the keys that set it, a
 * stepped field changes at its key), so the base stays under a piece's size cap: a number track that is the same in
 * every key is written once, in the first key, or not at all when it is the bone's rest (stretch 1); show, hide and
 * swap name a shape only in the keys where it changes. The pose at every key is the same as before.
 */
const FINE = new Set(['layR', 'layF', 'lay']);
function compactKeys(keys) {
  // angles to a hundredth of a degree (the lay chain's, FINE, to 1e-5: its bones are REACH long), stretches and
  // offsets to a thousandth: under 0.01 px at the hands
  const r = (v, n) => Math.round(v * n) / n;
  for (const k of keys) {
    for (const id of Object.keys(k.bones ?? {})) k.bones[id] = r(k.bones[id], FINE.has(id) ? 1e5 : 100);
    for (const id of Object.keys(k.stretch ?? {})) k.stretch[id] = r(k.stretch[id], 1000);
    for (const id of Object.keys(k.ik ?? {})) k.ik[id] = k.ik[id].map((v) => r(v, 1000));
    k.root = k.root.map((v) => r(v, 1000));
  }
  const same = (f, id) => keys.every((k) => JSON.stringify(k[f]?.[id]) === JSON.stringify(keys[0][f]?.[id]));
  for (const f of ['bones', 'stretch', 'ik']) {
    const ids = new Set(keys.flatMap((k) => Object.keys(k[f] ?? {})));
    for (const id of ids) {
      if (!keys.every((k) => k[f] && Object.hasOwn(k[f], id)) || !same(f, id)) continue;
      const v = keys[0][f][id], rest = f === 'bones' ? REST[id] : f === 'stretch' ? 1 : null;
      keys.forEach((k, i) => { if (i || v === rest) delete k[f][id]; });
    }
    for (const k of keys) if (k[f] && !Object.keys(k[f]).length) delete k[f];
  }
  if (keys.every((k) => k.swap?.eye === null)) for (const k of keys) delete k.swap;
  let was = {};
  keys.forEach((k, i) => {
    const now = { ...was };
    for (const id of k.show ?? []) now[id] = 'show';
    for (const id of k.hide ?? []) now[id] = 'hide';
    if (i) {
      k.show = (k.show ?? []).filter((id) => was[id] !== 'show');
      k.hide = (k.hide ?? []).filter((id) => was[id] !== 'hide');
      if (!k.show.length) delete k.show;
      if (!k.hide.length) delete k.hide;
      if (k.swap && JSON.stringify(k.swap) === JSON.stringify(keys[i - 1].swapWas)) delete k.swap;
    }
    k.swapWas = k.swap ?? keys[i - 1]?.swapWas;
    was = now;
  });
  for (const k of keys) delete k.swapWas;
  return keys;
}


/** A clip of the base: { label (a variant's), frames, fps, loop, keys (one a frame), frameEdits (the flash) }. Arguments: name (of BASE_CLIPS), d. */
export function clipOf(name, d = D0) {
  const c = BASE_CLIPS[name];
  const keys = [], edits = {};
  let lying = false;
  for (let f = 0; f < c.frames; f++) {
    const P = codePose(name, f, {}, d);
    if (P.footF.up || P.footB.up || P.lie > 0) lying = true;
    keys.push({ P, t: phaseOf(c, f) });
    if (P.flash) edits[String(f)] = { flash: true };
  }
  // one way of posing the legs for the whole clip (keys blend every track they set): angles when any frame lies down
  const out = compactKeys(keys.map(({ P, t }) => keyOf(lying ? { ...P, lie: Math.max(P.lie, 1e-9) } : P, d, t)));
  return { ...(c.label ? { label: c.label } : {}), frames: c.frames, fps: c.fps, loop: c.loop, keys: out, ...(Object.keys(edits).length ? { frameEdits: edits } : {}) };
}


// ---- the parts ------------------------------------------------------------------------------------------------------
// Each part is drawn on the base's nodes (PART_NODES), so a sprite uses it without `on`: { "kind": "use", "use":
// "part:hair", "v": 1, "args": {...}, "paint": {...} }. Shapes are the code's (rigs/humanoid.js drawHair, sword, axe,
// spear; sprites/knight.js drawHeadgear, drawNapeHair, drawCape and the belt) at the base's measurements, D0.

const ARC = 16;                                    // points on the elliptical edge of a hair cap or a helmet shell

/** Points of an ellipse (rx, ry) about the origin from angle a0 to a1 (screen radians, 0 = right, PI/2 = down), n of them, pushed out a little so the chords keep the pixels the curve covers. */
function arc(rx, ry, a0, a1, n = ARC) {
  const out = [];
  const k = (1 + 1 / Math.cos(Math.abs(a1 - a0) / (n - 1) / 2)) / 2;
  for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / (n - 1)); out.push([rx * Math.cos(a) * (i && i < n - 1 ? k : 1), ry * Math.sin(a) * (i && i < n - 1 ? k : 1)]); }
  return out;
}
/** The screen angle of the point of ellipse (rx, ry) at height y on the side `side` (1 front, -1 back). */
const atY = (rx, ry, y, side) => Math.atan2(y / ry, side * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)));
/** Screen points (y down) as an upright node's local points (y up), rounded. */
const local = (pts) => pts.map(([x, y]) => up(x, y));

/** The hair cap of drawHair: the ellipse (R + 0.8, R + 0.7) above a line that steps from 0.38 R over the eye down to 0.62 R under the back of the head. */
function hairCap(R) {
  const rx = R + 0.8, ry = R + 0.7, yTop = -0.38 * R, yBack = 0.62 * R;
  const pts = arc(rx, ry, atY(rx, ry, yTop, 1), atY(rx, ry, yBack, -1) - 2 * PI, 18).reverse();
  // arc from the back (bottom) over the top to the front, then along the hairline: back corner, sloped edge, front
  pts.push([-0.05 * R, yTop], [-0.6 * R, yBack]);
  return local(pts);
}
/** The helmet's shell (knight.js drawHeadgear): the ellipse R + 1 above 0.3 R over the face, all of it behind 0.15 R forward of the middle. */
function helmetShell(R) {
  const r = R + 1, yFace = -0.3 * R, xBack = -0.15 * R;
  // from where the face line meets the shell, up over the top, down the back to the bottom of the guard
  const a0 = Math.atan2(yFace, Math.sqrt(r * r - yFace * yFace)), a1 = Math.atan2(Math.sqrt(r * r - xBack * xBack), xBack) - 2 * PI;
  return local([...arc(r, r, a0, a1, 20), [xBack, yFace]]);
}
/** The hair under the back of a helmet (knight.js drawNapeHair): the ellipse (R + 0.8, R + 0.7) behind 0.45 R back and between 0.2 R and 0.62 R down. */
function napeHair(R) {
  const rx = R + 0.8, ry = R + 0.7, x1 = -0.45 * R, y0 = 0.2 * R, y1 = 0.62 * R;
  return local([[x1, y0], [x1, y1], ...arc(rx, ry, atY(rx, ry, y1, -1), atY(rx, ry, y0, -1), 4)]);
}

/** A number or a binding ({ from, map }) moved by dv. */
const moved = (x, dv) => (typeof x === 'number' ? r4(x + dv) : { ...x, map: x.map.map(([a, b]) => [a, r4(b + dv)]) });
/**
 * A head part's shapes, written about the middle of the head (as on the skull node), moved for the headwear node: one
 * pixel head down, since headwear is one pixel head up (PART_NODES).
 */
function onHeadwear(draw) {
  const pt = (q) => [q[0], moved(q[1], -1)];
  return draw.map((x) => {
    const o = { ...x };
    for (const f of ['at', 'from', 'to']) if (Array.isArray(o[f])) o[f] = pt(o[f]);
    if (Array.isArray(o.points)) o.points = o.points.map(pt);
    return o;
  });
}

/** A binding of a piece arg: a table from the arg's value to px (rounded when asked). */
const bind = (from, map, round) => ({ from, map: map.map(([a, b]) => [r4(a), r4(b)]), ...(round ? { round } : {}) });

function hairPiece(d = D0) {
  const R = d.headR;
  const spikes = [0, 1, 2, 3].map((i) => {
    const bx = R * (0.55 - i * 0.42), by = -R * (0.78 - Math.abs(i - 1.2) * 0.12);
    return { kind: 'poly', points: local([[bx - 1.6, by + 1.5], [bx + 1.4, by + 1.5], [bx - 1.2 - i * 0.5, by - 2.8]]), paint: 'hair', shade: 0, z: 64, when: { style: ['spiky'] } };
  });
  return {
    format: 'loadout-piece', version: 1, id: 'part:hair', v: 1, name: 'Hair',
    about: 'A cap of hair over the head, short or spiky; on base:person-side\'s headwear node (long hair and a ponytail are part:hair-long and part:ponytail).',
    slots: [{ id: 'hair', label: 'Hair', default: '#5a3a22', material: 'plant' }],
    args: { style: { type: 'word', values: ['short', 'spiky'], default: 'short' } },
    made: { from: 'rigs/humanoid.js drawHair', by: 'tools/bake-person-side.mjs' },
    body: { draw: onHeadwear([{ kind: 'poly', points: hairCap(R), paint: 'hair', z: 64 }, ...spikes]) },
  };
}

/** Hair hanging from the back of the head (drawHair long, ponytail) on base:person-side's hang node (x down, y forward). */
function hangingHairPiece(kind, d = D0) {
  const R = d.headR;
  const long = kind === 'long';
  return {
    format: 'loadout-piece', version: 1, id: long ? 'part:hair-long' : 'part:ponytail', v: 1, name: long ? 'Long hair' : 'Ponytail',
    about: long ? 'Long hair falling from the back of the head to the shoulders, swinging; on base:person-side\'s hang node, under part:hair.'
      : 'A ponytail tied at the back of the head, swinging; on base:person-side\'s hang node, under part:hair.',
    slots: [{ id: 'hair', label: 'Hair', default: '#5a3a22', material: 'plant' }],
    made: { from: 'rigs/humanoid.js drawHair', by: 'tools/bake-person-side.mjs' },
    body: { draw: [long
      ? { kind: 'capsule', from: [0, 0], to: [r4(1.55 * R), r4(-0.2 * R)], r: [r4(0.5 * R), r4(0.35 * R)], paint: 'hair', z: 64 }
      : { kind: 'capsule', from: [r4(-0.25 * R), r4(-0.2 * R)], to: [r4(0.9 * R), r4(-0.75 * R)], r: [1.5, 0.8], paint: 'hair', z: 64 }] },
  };
}

function napePiece(d = D0) {
  return {
    format: 'loadout-piece', version: 1, id: 'part:hair-nape', v: 1, name: 'Hair under a helmet',
    about: 'The hair that shows under the back of a helmet on base:person-side, so the hair colour still reads with the helmet on; on its headwear node.',
    slots: [{ id: 'hair', label: 'Hair', default: '#5a3a22', material: 'plant' }],
    made: { from: 'sprites/knight.js drawNapeHair', by: 'tools/bake-person-side.mjs' },
    body: { draw: onHeadwear([{ kind: 'poly', points: napeHair(d.headR), paint: 'hair', shade: 0, z: 66 }]) },
  };
}

/**
 * A rect written as the poly that covers the same pixels, so it turns with its node (a rect is only moved: lying down
 * a visor would stay level). Arguments: x, y (its top left corner in an upright node's frame, local y up), w, h (px).
 */
const rectPoly = (x, y, w, h) => [[r4(x), r4(y)], [r4(x + w), r4(y)], [r4(x + w), r4(y - h)], [r4(x), r4(y - h)]];

function helmetPiece(d = D0) {
  const R = d.headR;
  return {
    format: 'loadout-piece', version: 1, id: 'part:helmet', v: 1, name: 'Helmet',
    about: 'A round helmet with a back and cheek guard and a dark visor slit; on base:person-side\'s headwear node (a plume is part:plume).',
    slots: [{ id: 'metal', label: 'Metal', default: '#b8c4cc', material: 'metal' }],
    made: { from: 'sprites/knight.js drawHeadgear', by: 'tools/bake-person-side.mjs' },
    body: { draw: onHeadwear([
      { kind: 'poly', points: helmetShell(R), paint: 'metal', light: 1, z: 65 },
      // the visor slit: a 1 px row (as knight.js's rect), drawn as a poly so it tilts with the head; its front end a
      // quarter pixel short, so the Head slider's scale (a poly grows, a rect does not) adds no pixel at the default
      { kind: 'poly', points: rectPoly(-0.1 * R + NUDGE, 0.3 * R + 1 - NUDGE, Math.ceil(R * 1.1) + 0.75, 1), paint: 'metal.dark', z: 65 },
    ]) },
  };
}

function plumePiece(d = D0) {
  const R = d.headR, from = [0.5, 0], tip = [0.9 * R, -2];     // on the `plume` node (x back, y down)
  const at = (s) => [from[0] + (tip[0] - from[0]) * s, from[1] + (tip[1] - from[1]) * s];
  const SIZES = [0.5, 0.75, 1, 1.4, 1.8];
  return {
    format: 'loadout-piece', version: 1, id: 'part:plume', v: 1, name: 'Plume',
    about: 'A plume on top of a helmet, swept back and swinging; on base:person-side\'s plume node. Size makes it longer and fuller.',
    slots: [{ id: 'plume', label: 'Plume', default: '#c9423a', material: 'cloth' }],
    args: { size: { type: 'px', lo: 0.5, hi: 1.8, default: 1 } },
    made: { from: 'sprites/knight.js drawHeadgear', by: 'tools/bake-person-side.mjs' },
    body: { draw: [
      { kind: 'capsule', from, to: [bind('size', SIZES.map((s) => [s, at(s)[0]])), bind('size', SIZES.map((s) => [s, at(s)[1]]))],
        r: [bind('size', SIZES.map((s) => [s, 1.6 * Math.sqrt(s)])), bind('size', SIZES.map((s) => [s, 0.9 * Math.sqrt(s)]))], paint: 'plume', z: 65 },
    ] },
  };
}

/** A binding of a size arg (0.5..1.8) to a value that steps: f(size), held flat between the breaks. */
function steps(from, f, breaks, lo = 0.5, hi = 1.8) {
  const map = [[lo, f(lo)]];
  for (const b of breaks) map.push([b - 1e-4, f(b - 1e-4)], [b, f(b)]);
  map.push([hi, f(hi)]);
  return bind(from, map);
}

function crownPiece(d = D0) {
  const R = d.headR, w = Math.round(R * 1.2), x = -0.55 * R;
  // knight.js: the band is round(2 size) deep and its top edge round(head - R - 1) + 2 - band; points round(size) tall
  const band = (s) => Math.max(1, Math.round(2 * s)), points = (s) => Math.max(1, Math.round(s));
  const BREAKS = [0.75, 1.25, 1.5, 1.75];
  const topY = (s) => 1 - R - band(s);                       // the band's top row, on the screen, from the head's middle
  // the band's top and bottom edges, the bottom 0.15 px and the front end 0.1 px in, so the Head slider's scale (a poly
  // grows with it, knight.js's rect does not) adds no row or column up to Head 1 (measured against the code knight)
  const top = (s) => -(topY(s) + NUDGE), bottom = (s) => top(s) - band(s) + 0.15, EXR = 0.1;
  // the points, one dot each (every other pixel along the band's top), so they turn with the head: a dot is drawn in
  // the pixel its point is in, so the middle of the pixel a stamp at (x, y) would put there (a stamp is never turned)
  const pointRow = (y) => Array.from({ length: Math.ceil(w / 2) }, (_, i) => ({ kind: 'dot', at: [r4(x + 2 * i + 0.5), moved(y, -0.5)], paint: 'gold.light', z: 65 }));
  return {
    format: 'loadout-piece', version: 1, id: 'part:crown', v: 1, name: 'Crown',
    about: 'A gold crown band with a row of points (two rows when big) and a jewel in front, tilting with the head; on base:person-side\'s headwear node.',
    slots: [{ id: 'gold', label: 'Gold', default: '#e6c545', material: 'metal' }, { id: 'jewel', label: 'Jewel', default: '#c9423a', material: 'magic' }],
    args: { size: { type: 'px', lo: 0.5, hi: 1.8, default: 1 } },
    made: { from: 'sprites/knight.js drawHeadgear', by: 'tools/bake-person-side.mjs' },
    body: { draw: onHeadwear([
      // the band as a poly (knight.js's rect), so it tilts with the head
      { kind: 'poly', points: [[r4(x + NUDGE), steps('size', top, BREAKS)], [r4(x + NUDGE + w - EXR), steps('size', top, BREAKS)], [r4(x + NUDGE + w - EXR), steps('size', bottom, BREAKS)], [r4(x + NUDGE), steps('size', bottom, BREAKS)]], paint: 'gold', z: 65 },
      // the points: the second row stands on the first when the crown is big, else it is drawn on it again
      ...pointRow(steps('size', (s) => -(topY(s) - 1), BREAKS)),
      ...pointRow(steps('size', (s) => -(topY(s) - points(s)), BREAKS)),
      { kind: 'dot', at: [r4(x + Math.floor(w / 2) + 0.5), steps('size', (s) => -(topY(s) + Math.floor((band(s) - 1) / 2) + 0.5), BREAKS)], paint: 'jewel', z: 65 },
    ]) },
  };
}

function capePiece(d = D0) {
  // knight.js drawCape on the `back` node (x down the back, y toward the front), from the neck: the top edge across
  // the shoulders, the hem's back corner 0.45 and its front corner 0.55 of a leg below the hips at Length 1
  const c = d.chestR, T = d.torso, L = d.leg;
  const pt = (sx, sy) => [sy, sx];                            // screen offset from the neck (x right, y down) -> local
  const back = (len) => pt(-c - 3, T + L * 0.45 * len), front = (len) => pt(-c + 1.5, T + L * 0.55 * len);
  const LENS = [0.3, 1, 1.8];
  const along = (f) => [bind('length', LENS.map((l) => [l, f(l)[0]])), bind('length', LENS.map((l) => [l, f(l)[1]]))];
  const bite = (k, upPx) => along((l) => { const a = back(l), b = front(l); return [a[0] + (b[0] - a[0]) * k - upPx, a[1] + (b[1] - a[1]) * k]; });
  const top = [pt(1, 1), pt(-c - 0.5, 1)];
  return {
    format: 'loadout-piece', version: 1, id: 'part:cape', v: 1, name: 'Cape',
    about: 'A cape hanging from the shoulders down the back, plain or with a torn hem, swinging with the clip; for base:person-side.',
    slots: [{ id: 'cloth', label: 'Cape', default: '#c9423a', material: 'cloth' }],
    args: { style: { type: 'word', values: ['plain', 'tattered'], default: 'plain' }, length: { type: 'px', lo: 0.3, hi: 1.8, default: 1 } },
    made: { from: 'sprites/knight.js drawCape', by: 'tools/bake-person-side.mjs' },
    body: { draw: [
      { kind: 'poly', points: [...top.map((p) => p.map(r4)), along(back), along(front)], paint: 'cloth', far: true, z: 2, when: { style: ['plain'] } },
      { kind: 'poly', points: [...top.map((p) => p.map(r4)), along(back), bite(0.2, 0), bite(0.35, 3.5), bite(0.5, 0), bite(0.68, 3), bite(0.85, 0), along(front)], paint: 'cloth', far: true, z: 2, when: { style: ['tattered'] } },
    ] },
  };
}

/**
 * knight.js drawCapeOnGround on the base's lay node (upright, at the strip's top-left: x right, y up): under a body
 * lying on its back the cape's edge shows along the ground from the front of the shoulders toward the feet, two rows
 * deep (the top row two pixels shorter), with a dark pixel behind; torn, every fifth pixel of the bottom row from the
 * fourth and the last but one are dark and missing from the top row, and the top row darkens every other pixel. Its
 * length follows the cape's Length as the code's does (held at 1.5). The lay node is parked off any frame unless the body
 * lies flat, so a sprite uses it beside part:cape with the same `when` and nothing else.
 */
function capeGroundPiece(d = D0) {
  const LENS = [0.3, 0.6, 1, 1.5, 1.8];
  // the strip's length in pixels at a Length: x1 - x0 for a lying neck at x 21 (die 4 to 7: 21.0 to 21.3)
  const W = (len) => Math.round(21 + (d.torso + d.leg * 0.45) * Math.min(len, 1.5)) - Math.round(21 - d.chestR);
  // the Lengths where W steps: where 21 + K m passes a half pixel (K: the torso and 0.45 of a leg), up to 1.5
  const Kw = d.torso + d.leg * 0.45;
  const breaks = [];
  for (let n = Math.ceil(21 + Kw * 0.3 - 0.5); n + 0.5 < 21 + Kw * 1.5; n++) breaks.push((n + 0.5 - 21) / Kw + 1e-6);
  // W before rounding is linear in the Length up to 1.5 (21 + K m rounded, less round(21 - chest)): a map rounded to px
  const K = d.torso + d.leg * 0.45, W0 = 21 - Math.round(21 - d.chestR);
  const size = (dw, round = 'px') => bind('length', [0.3, 1.5, 1.8].map((l) => [l, W0 + K * Math.min(l, 1.5) + dw]), round);
  // a dark dot at offset o of a row while `last(W)` reaches it; otherwise drawn on `park(W)`, a pixel painted dark anyway
  const dot = (o, row, last, park) => {
    const u = (l) => (o <= last(W(l)) ? o : park(W(l))) + 0.5;
    return { kind: 'dot', at: [steps('length', u, breaks.filter((x) => u(x) !== u(x - 1e-4)), 0.3, 1.8), r4(-row - 0.5)], paint: 'cloth.dark', z: 95, when: { style: ['tattered'] } };
  };
  const MAXW = W(1.8);
  const torn = (o) => o % 5 === 3;
  return {
    format: 'loadout-piece', version: 1, id: 'part:cape-ground', v: 1, name: 'Cape on the ground',
    about: 'The edge of a cape along the ground under a body lying on its back, plain or torn; with part:cape, on base:person-side\'s lay node.',
    slots: [{ id: 'cloth', label: 'Cape', default: '#c9423a', material: 'cloth' }],
    args: { style: { type: 'word', values: ['plain', 'tattered'], default: 'plain' }, length: { type: 'px', lo: 0.3, hi: 1.8, default: 1 } },
    made: { from: 'sprites/knight.js drawCapeOnGround', by: 'tools/bake-person-side.mjs' },
    body: { draw: [
      // the top row (x0 .. x1 - 2) and the bottom row (x0 .. x1), and the dark pixel behind
      { kind: 'rect', at: [0, 0], size: [size(-1), 1], paint: 'cloth', shade: 0, z: 95 },
      { kind: 'rect', at: [0, -1], size: [size(1), 1], paint: 'cloth', shade: 0, z: 95 },
      { kind: 'dot', at: [-0.5, -1.5], paint: 'cloth.dark', z: 95 },
      // torn: the bottom row's dark pixels (parked on the dark pixel behind while the strip is shorter)
      ...Array.from({ length: MAXW }, (_, o) => o).filter(torn).map((o) => dot(o, 1, (w) => w - 2, () => -1)),
      { kind: 'dot', at: [size(-0.5, null), -1.5], paint: 'cloth.dark', z: 95, when: { style: ['tattered'] } },
      // torn: the top row's dark pixels, every other one (the lying neck's x0 is odd: knight.js darkens even columns)
      // and the torn ones (the code leaves those undrawn; drawn dark here), parked on the first (offset 1, dark anyway)
      ...Array.from({ length: MAXW }, (_, o) => o).filter((o) => o % 2 === 1 || torn(o)).map((o) => dot(o, 0, (w) => w - 2, () => 1)),
    ] },
  };
}

function beltPiece(d = D0) {
  // knight.js torso hook: a dark row across the hips at their rounded row - 2, a light buckle pixel one to the front
  const w = Math.round(d.hipR);
  return {
    format: 'loadout-piece', version: 1, id: 'part:belt', v: 1, name: 'Belt',
    about: 'A belt across the hips with a one-pixel buckle in front; for base:person-side.',
    slots: [{ id: 'belt', label: 'Belt', default: '#3a3350', material: 'cloth' }, { id: 'buckle', label: 'Buckle', default: '#c2c9d6', material: 'metal' }],
    made: { from: 'sprites/knight.js (the torso hook)', by: 'tools/bake-person-side.mjs' },
    body: { draw: [
      { kind: 'rect', at: up(-w + NUDGE, -3 + NUDGE), size: [2 * w, 1], paint: 'belt.dark', z: 55 },
      { kind: 'dot', at: up(1.5, -2.5), paint: 'buckle.light', z: 55 },
    ] },
  };
}

/** A held thing on `handF` (x along the way it points, y to its left), as rigs/humanoid.js sword, axe, spear draw it from the hand. */
function heldPiece(kind) {
  const L = H.ITEMS[kind].length;
  const length = { type: 'px', lo: Math.round(L * 0.5), hi: Math.round(L * 1.5), default: L };
  const tip = (dx = 0) => ({ from: 'length', map: [[length.lo, length.lo + dx], [length.hi, length.hi + dx]] });
  const common = { format: 'loadout-piece', version: 1, v: 1, args: { length }, made: { from: `rigs/humanoid.js ${kind}`, by: 'tools/bake-person-side.mjs' } };
  if (kind === 'sword') return { ...common, id: 'held:sword', name: 'Sword',
    about: 'A sword in the near hand: a blade, a cross-guard and a pommel; for base:person-side (on handF).',
    slots: [{ id: 'metal', label: 'Blade', default: '#c2c9d6', material: 'metal' }, { id: 'hilt', label: 'Hilt', default: '#e6c545', material: 'metal' }],
    body: { draw: [
      { kind: 'limb', from: [1.5, 0], to: [tip(), 0], width: 2, paint: 'metal', z: 80 },
      { kind: 'dot', at: [tip(), 0], paint: 'metal.light', z: 80 },
      { kind: 'line', from: [1.5, 2.2], to: [1.5, -2.2], paint: 'hilt', z: 80 },
      { kind: 'dot', at: [-1.5, 0], paint: 'hilt', z: 80 },
    ] } };
  if (kind === 'axe') return { ...common, id: 'held:axe', name: 'Axe',
    about: 'An axe in the near hand: a wooden shaft with a round blade at its end; for base:person-side (on handF).',
    slots: [{ id: 'metal', label: 'Blade', default: '#c2c9d6', material: 'metal' }, { id: 'wood', label: 'Shaft', default: '#8a5a34', material: 'wood' }],
    body: { draw: [
      { kind: 'line', from: [-2, 0], to: [tip(), 0], paint: 'wood', z: 80 },
      { kind: 'ellipse', at: [tip(-2.5), -2.2], r: [3, 3], paint: 'metal', z: 80 },
    ] } };
  return { ...common, id: 'held:spear', name: 'Spear',
    about: 'A spear in the near hand: a shaft reaching behind the hand, with a point; for base:person-side (on handF).',
    slots: [{ id: 'metal', label: 'Point', default: '#c2c9d6', material: 'metal' }, { id: 'wood', label: 'Shaft', default: '#8a5a34', material: 'wood' }],
    body: { draw: [
      { kind: 'line', from: [-4, 0], to: [tip(), 0], paint: 'wood', z: 80 },
      { kind: 'capsule', from: [tip(-3.5), 0], to: [tip(), 0], r: [1.5, 0.5], paint: 'metal', z: 80 },
    ] } };
}

/**
 * Whether the published base carries VARIANT_CLIPS. Not yet: engine/resolve.js (clipNames) gives a sprite every clip
 * of its base, so each sprite on it would gain punch, thrust, the unarmed and bow clips (the Hero would draw a punch
 * with a sword held, past the frame at all sliders high), and a sprite cannot yet pick a base clip by a setting (no
 * weapon: punch). Both are B4's (a clip list on `extends`; `from` taking a choice binding). The variants are baked and
 * tested all the same (basePiece({ variants: true }): 127,833 bytes with them, 3,239 under the 128 KiB cap).
 */
export const VARIANTS_PUBLISHED = false;

/** The base piece base:person-side as a plain object (what --write puts in pieces/): the standard clips, and VARIANT_CLIPS when asked. Arguments: { variants }. */
export function basePiece({ variants = VARIANTS_PUBLISHED } = {}) {
  const clips = {};
  for (const name of Object.keys(variants ? BASE_CLIPS : STANDARD_CLIPS)) clips[name] = clipOf(name);
  return {
    format: 'loadout-piece', version: 1, id: 'base:person-side', v: 1, name: 'Person, side view',
    about: 'A two-legged person seen from the side, facing right, on 64x64: body, head, eye and the standard clips; parts hang on its nodes.',
    slots: [
      { id: 'skin', label: 'Skin', default: '#e0a878', material: 'skin' },
      { id: 'top', label: 'Top', default: '#3a6ea5', material: 'cloth' },
      { id: 'bottom', label: 'Trousers', default: '#29466a', material: 'cloth' },
      { id: 'boots', label: 'Boots', default: '#5b3d2e', material: 'cloth' },
      { id: 'shine', label: 'Eye shine', default: '#ffffff', material: 'skin' },
    ],
    made: { from: 'rigs/humanoid.js', by: 'tools/bake-person-side.mjs' },
    body: {
      rig: { size: [...H.SIZE], bones: bones(), nodes: nodes(), shapes: shapes(), ik: [{ id: 'legF', bones: ['thighF', 'shinF'] }, { id: 'legB', bones: ['thighB', 'shinB'] }], points: points() },
      clips,
    },
  };
}

// ---- comparing with the code rig ---------------------------------------------------------------------------------

/** One frame of a base clip as rigs/humanoid.js draws the bare body (no hair, no hooks), flash and outline included. Arguments: clip, frame, look ({ skin, top, bottom, boots }). */
export function codeFrame(clip, frame, look) {
  const P = codePose(clip, frame);
  const g = new Surface(...H.SIZE);
  H.draw(g, P, D0, { ...look, hair: '#000000', hairStyle: 'bald' });
  if (P.flash) g.tint('#ffffff');
  g.outline(INK);
  return g;
}

/** How two frames differ: { diff (pixels not the same), drawn (pixels drawn in either), share (diff / drawn) }. */
export function frameDiff(a, b) {
  let diff = 0, drawn = 0;
  for (let i = 0; i < a.data.length; i++) { if (a.data[i] || b.data[i]) drawn++; if (a.data[i] !== b.data[i]) diff++; }
  return { diff, drawn, share: drawn ? diff / drawn : 0 };
}

/**
 * A data sprite beside a code sprite at their defaults, every clip of the code sprite: { shares ({ clip: share of
 * pixels that differ over the clip }), png (rows per clip: the code sprite, the data sprite, the difference: red only
 * in the code's, blue only in the data's, orange in both but another colour), w, h }. Arguments: data, code (sprites).
 */
export function heroSheet(data, code) {
  const pd = defaultParams(data), pc = defaultParams(code);
  const rows = [], shares = {};
  for (const [clip, c] of Object.entries(code.clips)) {
    const a = [], b = [], x = [];
    let diff = 0, drawn = 0;
    for (let f = 0; f < c.frames; f++) {
      const g = renderFrame(code, clip, f, pc), h = renderFrame(data, clip, f, pd), d = new Surface(g.w, g.h);
      for (let i = 0; i < g.data.length; i++) {
        if (g.data[i] || h.data[i]) drawn++;
        if (g.data[i] !== h.data[i]) { diff++; d.data[i] = g.data[i] && h.data[i] ? 0xff00a0ff : g.data[i] ? 0xff0000ff : 0xffff0000; }
      }
      a.push(g); b.push(h); x.push(d);
    }
    shares[clip] = drawn ? diff / drawn : 0;
    rows.push(a, b, x);
  }
  return { shares, ...sheetPng(rows, { cell: code.size ?? H.SIZE, scale: 3 }) };
}

// ---- command line ---------------------------------------------------------------------------------------------------

/**
 * The version a baked piece is written as: the first whose pin (pieces/_pins.json) is its content, else the first not
 * pinned yet. A pinned version is released and never changes (pieces/README.md), so a change always lands in a new v.
 * Arguments: value (the piece, any v), pins ({ "id@v": hash }). Returns the piece at that v.
 */
export function releasedAs(value, pins) {
  for (let v = 1; v <= 999; v++) {
    const at = { ...value, v };
    const pin = pins[`${value.id}@${v}`];
    if (pin === undefined || pin === pieceHash(at)) return at;
  }
  throw new Error(`${value.id}: no free version`);
}

/** Every piece this baker writes, each at the version releasedAs gives: { file (relative to the site), value }. Arguments: pins (default: pieces/_pins.json). */
export function bakedPieces(pins = readPins(ROOT)) {
  const all = [basePiece(), hairPiece(), hangingHairPiece('long'), hangingHairPiece('ponytail'), napePiece(), helmetPiece(), plumePiece(),
    crownPiece(), capePiece(), capeGroundPiece(), beltPiece(), ...['sword', 'axe', 'spear'].map(heldPiece)];
  return all.map((x) => {
    const value = releasedAs(x, pins);
    const [kind, name] = value.id.split(':');
    return { file: `pieces/${kind}-${name}.v${value.v}.json`, value };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  if (process.argv.includes('--sheet')) {
    // the Hero rebuilt from the pieces on disk (tests/fixtures/person-side/knight.json) beside the code Hero's frozen
    // copy, tests/fixtures/code-sprites/knight.js (never the library's sprites/knight.js, which its redraw replaces)
    const { nodePieceStore } = await import('./lib/pieces-index.mjs');
    const { makeDataSprite } = await import('../engine/data-sprite.js');
    const lib = await import('../tests/helpers/library.mjs');
    const frozen = path.join(lib.FROZEN_DIR, 'knight.js');
    if (lib.codeSpriteFile('knight') !== frozen) { console.error(`${path.relative(ROOT, frozen)} is missing: the sheet compares with the frozen code Hero only`); process.exit(1); }
    const knight = await lib.codeSprite('knight');
    const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/person-side/knight.json'), 'utf8'));
    const store = nodePieceStore();
    await store.loadFor(def);
    const r = makeDataSprite(def, { pieces: store });
    if (!r.ok) { console.error(r.errors.join('\n')); process.exit(1); }
    const sheet = heroSheet(r.sprite, knight);
    fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'out/person-side-knight.png'), sheet.png);
    for (const [clip, share] of Object.entries(sheet.shares)) console.log(`${clip.padEnd(8)} ${(share * 100).toFixed(1)} % of pixels differ`);
    console.log(`wrote out/person-side-knight.png (${sheet.w}x${sheet.h}): per clip the code sprite, the data sprite, the difference`);
    process.exit(0);
  }
  for (const { file, value } of bakedPieces()) {
    const abs = path.join(ROOT, file);
    const text = `${JSON.stringify(value)}\n`;
    const now = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    const same = now !== null && JSON.stringify(JSON.parse(now)) === JSON.stringify(value);
    if (write && !same) fs.writeFileSync(abs, text);
    console.log(`${file}: ${same ? 'unchanged' : write ? 'written' : now === null ? 'would be written (new)' : 'would change'} (${Buffer.byteLength(text)} bytes)`);
  }
}
