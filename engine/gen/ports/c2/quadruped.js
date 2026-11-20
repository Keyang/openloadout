// PORT (migration batch C2): a copy of rigs/quadruped.js with its imports pointed at the port shims (engine/gen/ports/c2/colour.js,
// engine/gen/ports/surface.js and migration batch E2's copies in engine/gen/ports/e2/), so it draws paint refs on
// engine/gen/port-surface.js grids. It is the drawing code of migration batch C2's creature generators
// (engine/gen/creatures.js), so it is NOT temporary: it stays when rigs/quadruped.js goes and goes only with the last generator
// version that draws with it. A HAND CHANGE note says where it differs from its source; never change what a released
// generator version draws through it.
// Side-view four-legged body rig (faces right), on a 128x96 canvas: a long beast crouched on four legs with a neck,
// a head with a jaw, a tail, and, if asked, wings, horns and spines down its back (a dragon, a wyvern on all fours,
// a great lizard, a drake; with a short neck and nothing on its back, a wolf-shaped monster). For the side-view battle
// screen and for platformer bosses. The worked example is sprites/ember-wyrm.js.
//
// The rig is the code; a sprite on it is choices (Contract 13): its size, bulk and neck, what stands on its back, head
// and tail, its colours, and which of the poses are its clips. The body is described ONCE (dims) and animated by
// moving its pieces (pose -> solve): two lumps for haunch and chest, four legs on two-bone joints, a neck hung between
// the chest and wherever the head is sent, a tail that curls tighter instead of leaving the frame, wings with an elbow
// and a wrist. Nothing is redrawn by hand per frame.
//
//   clips(speedOf, entries)        the clip table for the poses a sprite uses (POSES), with labels of its own
//   frame(clip, t, p, opt)         ONE FRAME, posed and fitted once: F.draw(g, look), F.finish(g, look), F.sockets()
//   dims, pose, solve, draw, lights, sockets, wingRoom      what frame() is made of, for a pose of your own
//   WINGS, HORNS, TAILS, SPINES    the names of the parts
//
//   import * as Q from '../rigs/quadruped.js';
//   const frameOf = (clip, t, p) => Q.frame(clip, t, p, { neck: p.length, spines: p.spines,
//     wings: { kind: p.wings, span: p.wingSpan }, horns: { kind: p.horns, length: p.hornLength }, tail: { kind: p.tail, length: p.tailLength } });
//   // in defineSprite:  size: Q.SIZE, pivot: Q.PIVOT, clips: Q.clips((p) => p.speed, ['idle', { name: 'attack', label: 'Bite' }, ...]),
//   sockets: (clip, t, p) => frameOf(clip, t, p).sockets(),
//   render(g, { clip, t, p }) { const F = frameOf(clip, t, p), look = { body: p.body, accent: p.accent, glow: p.glow }; F.draw(g, look); F.finish(g, look); }
//
// What it is made of, far things first: the far wing, the far horn, the two far legs (a tone darker), the spines, the
// lower jaw, then ONE body (haunch, chest, neck, tail, skull and upper jaw painted together, so there is one shadow band
// and no seams), the belly plates in the accent colour along its underside, the two near legs, the face, the near horn
// and the near wing. After the outline come the lights, which are never inked: the eye, the smoke from the nostrils,
// the glow in the throat, the fire, the dust and the wind.
//
// The poses (POSES): idle (the chest swells, smoke curls from the nostrils, the tail tip sways, it blinks), walk (a
// slow diagonal walk: the near forefoot lands on frame 0 of 8 and the near hind foot on frame 4), attack (a bite:
// the neck coils back for five frames, strikes on frame 7 of 12 and the jaws snap shut), breath (the neck pulls back and
// the throat lights up plate by plate for four frames, then fire pours from the mouth on frames 5 to 9 of 12), buffet
// (the wings rise for three frames and beat forward on frames 4 to 5 of 10, driving wind and dust ahead; without wings
// it rears and stamps both forefeet on the same beat), hurt (white recoil), die (it rears and roars at the sky, the
// legs give way, the head hits the ground on frame 8 of 12 and the glow goes out).
//
// Nothing leaves the frame at any size: the head and the spines on its neck stop at the frame's edge (the neck bends
// instead), a breath keeps room in front of the nose for its fire, the horns shorten at the edge (hornFit), the tail
// turns up sooner and its crook curls tighter, a wing bone that would pass the top row or the ground lies along it
// instead, and the wings are drawn at the largest scale that fits every frame of every pose (wingRoom), so they do
// not change size from clip to clip.
//
// Pure functions: Node and browser, no Math.random. Angles are rig angles: 0 = down, PI/2 = right (the way it faces), PI = up.

import { lerp, clamp, wave, keys, smooth, fract, ik2, PI } from '../../../motion.js';
import { ramp, tone, INK } from './colour.js';
import { ellipseIn, capsuleIn } from '../surface.js';
import { anyIn } from '../e2/shapes.js';
import { seam } from '../c1/rock.js';   // creature batch C1's copy of engine/rock.js (the same code; one copy for both batches)
import { hornIn, hornFit, creatureEye } from '../e2/creature.js';
import { steps, flame, puffs, particles, streaks, starburst, twinkle, ring } from '../e2/fx.js';
import { arcChain, tubeIn, pathPoint, hookPath, spikeRowIn, sailIn, jointedWing, jawHead, tailTipIn, TAIL_TIPS } from './beast.js';

/** The frame of a long side-view boss, [width, height] in pixels (style guide, section 1). */
export const SIZE = [128, 96];
/** The ground line: the feet rest on the row above it and their outline lands on it. */
export const GROUND = 90;
/** The pivot column: under the chest, left of the frame's middle so the head, a bite and the fire have room in front. */
export const CX = 56;
/** Where a game anchors the sprite, [x, y]: the ground under its chest. */
export const PIVOT = [CX, GROUND];
/** The wings it can carry: large (three long fingers), small (short wings held the same way), tattered (large, with torn edges and holes). */
export const WINGS = Object.freeze(['large', 'small', 'tattered']);
/** The horns it can wear: swept (two long horns swept back), ram (two horns curled round beside the cheeks), crown (a fan of short spikes round the back of the skull). */
export const HORNS = Object.freeze(['swept', 'ram', 'crown']);
/** What the tail can end in: spade, club or flame (TAIL_TIPS in engine/beast.js). */
export const TAILS = TAIL_TIPS;
/** What can run down the neck, back and tail: ridge (a row of bone spikes) or sails (skin fins on thin rays). */
export const SPINES = Object.freeze(['ridge', 'sails']);
/** The poses pose() knows, each a clip: idle, walk, attack (a bite), breath (fire), buffet (a wing beat, or a stamp without wings), hurt, die. */
export const POSES = Object.freeze(['idle', 'walk', 'attack', 'breath', 'buffet', 'hurt', 'die']);

const STANDARD = {
  idle: { frames: 8, fps: 7, loop: true }, walk: { frames: 8, fps: 10, loop: true },
  attack: { frames: 12, fps: 11, loop: false }, breath: { frames: 12, fps: 11, loop: false }, buffet: { frames: 10, fps: 11, loop: false },
  hurt: { frames: 4, fps: 9, loop: false }, die: { frames: 12, fps: 10, loop: false },
};
const R = Math.round;
/** Turns a step [x, y] with the body when its front is lifted by p radians. */
const turned = ([x, y], p) => [x * Math.cos(p) + y * Math.sin(p), -x * Math.sin(p) + y * Math.cos(p)];
const WHITE = '#ffffff';
/** The box round a list of points, grown by pad: [x0, y0, x1, y1]. */
const around = (pts, pad = 0) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]; };
const union = (...boxes) => [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
/** A shape test that answers at once outside a box. */
const kept = (test, b) => (px, py) => px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3] && test(px, py);

/**
 * Builds the clip table of a four-legged beast from pose names, with the frames, speed and looping the style guide gives them (idle and walk 8, looping; attack and breath 12; buffet 10; hurt 4; die 12).
 * Arguments: speedOf ((p) => the Speed slider, 0..1); entries (a list, default every pose in order; each is a name of POSES or { name, label } to give the clip another button text).
 */
export function clips(speedOf = () => 0.5, entries = POSES) {
  const out = {};
  for (const raw of entries) {
    const e = typeof raw === 'string' ? { name: raw } : raw, st = STANDARD[e.name];
    if (!st) throw new Error(`quadruped rig: no pose "${e.name}" (${POSES.join(', ')})`);
    out[e.name] = { frames: st.frames, fps: (p) => st.fps * lerp(0.65, 1.45, speedOf(p) ?? 0.5), loop: st.loop, ...(e.label ? { label: e.label } : {}) };
  }
  return out;
}

// ---- measurements -------------------------------------------------------------------------------

/**
 * Returns the measurements of a four-legged beast in pixels, from its sliders and the parts it carries.
 * Arguments: p ({ size, bulk } each 0..1, missing = 0.5: the whole beast, lean to heavy); opt { neck (0..1: short to long, default 0.5), spines ('none' or one of SPINES), wings: { kind ('none' or one of WINGS), span (a multiplier, default 1) }, horns: { kind ('none' or one of HORNS), length (a multiplier) }, tail: { kind ('plain' or one of TAILS), length (a multiplier) } }.
 * Returns { s (the scale, 0.88 to 1.1), haunchUp, stand (how high the middle of the haunch and of the chest stand), long (haunch to chest), haunchR, chestR, chestRy, waistR, neckL, neckR0, neckR1, headR, snout, tailL, tailR, tipK, thigh, shin, upper, fore, thighR, shinR, pawL, pawR, ankle, hornRoom, spines, crest (px the spines stand up from the neck), wing { kind, span, upper, fore, finger, fingers, tatter, scoop }, horn { kind, length }, tail { kind } }.
 */
export function dims(p = {}, opt = {}) {
  const size = clamp(p.size ?? 0.5), bulk = clamp(p.bulk ?? 0.5), neck = clamp(opt.neck ?? 0.5);
  const s = lerp(0.88, 1.1, size);
  const wk = WINGS.includes(opt.wings?.kind) ? opt.wings.kind : 'none', span = opt.wings?.span ?? 1, ws = (wk === 'small' ? 0.64 : 1) * span * s;
  const hk = HORNS.includes(opt.horns?.kind) ? opt.horns.kind : 'none';
  const tk = TAILS.includes(opt.tail?.kind) ? opt.tail.kind : 'plain', tl = opt.tail?.length ?? 1;
  return {
    s, bulk,
    haunchUp: 28 * s, stand: 29 * s, long: 27 * s,
    haunchR: lerp(9.5, 12.5, bulk) * s, chestR: lerp(10.5, 13.5, bulk) * s, chestRy: lerp(9.8, 12.6, bulk) * s, waistR: lerp(7.6, 10.6, bulk) * s,
    neckL: lerp(24, 40, neck) * s, neckR0: lerp(6.2, 8.4, bulk) * s, neckR1: lerp(3.5, 4.4, bulk) * s,
    headR: 5.9 * s, snout: 13 * s,
    tailL: 36 * s * tl, tailR: lerp(6.2, 8.2, bulk) * s, tipK: s * lerp(0.9, 1.1, clamp((tl - 0.65) / 0.7)),
    thigh: 13 * s, shin: 12 * s, upper: 13 * s, fore: 12.5 * s,
    thighR: lerp(4.3, 5.7, bulk) * s, shinR: lerp(2.3, 3.1, bulk) * s, pawL: 6.5 * s, pawR: 2.4 * s, ankle: 3.5 * s,
    hornRoom: hk === 'none' ? 1 : 4 * s,
    spines: SPINES.includes(opt.spines) ? opt.spines : 'none', crest: opt.spines === 'sails' ? 8.5 * s : opt.spines === 'ridge' ? 5.5 * s : 0,
    wing: { kind: wk, span, upper: 10 * ws, fore: 16 * ws, finger: 27 * ws, fingers: 3, tatter: wk === 'tattered' ? 1 : 0, scoop: wk === 'tattered' ? 0.75 : 0.55 },
    horn: { kind: hk, length: (opt.horns?.length ?? 1) * s },
    tail: { kind: tk },
  };
}

// ---- poses ----------------------------------------------------------------------------------------

/**
 * Returns the pose of a four-legged beast at phase t (0..1) of an action, in the beast's own terms; solve(), draw(), lights() and sockets() take it.
 * Arguments: action (one of POSES); t; m { bounce (0..1: how deeply it breathes and how heavily it moves), wings (false: it has none, so `buffet` is a rear and a stamp) }; d (dims()).
 * The pose, lengths in px of a middle-sized beast: bx, by (the body moved forward and down), pitch (radians the chest is lifted about the haunch), swell (px the chest is swollen), head ([forward, down]: the head moved from where it rests), headA (radians the snout is lifted), ahead (px of the frame the nose keeps clear in front of it, so a long-necked look still has room for its fire), lay (0..1: the head laid on the ground, neck stretched out), jaw (0 shut .. 1 wide), blink (0 open, 0.5 half, 1 shut), glow (the eye: 0 dark, 1 lit, above 1.4 flaring), throat (0..1: how far up the neck the glow has climbed), fire (0..1 through the burst of fire, else -1), tail { sway, curl, lift } (radians: swung, curled tighter, raised), wing { raise, open (0 folded .. 1 spread), beat (radians swept forward) }, feet ([near fore, near hind, far fore, far hind], each [forward, lift]), flash (tint this frame white), bite, stomp, gust, thud (each 0..1 since the jaws shut, the forefeet came down, the wings beat, the head hit the ground; else -1), fall (0..1: how far the legs have given way), smoke (true: smoke curls from the nostrils).
 */
export function pose(action, t, m = {}, d = dims()) {
  const bounce = clamp(m.bounce ?? 0.5), winged = m.wings ?? d.wing.kind !== 'none';
  const P = {
    bx: 0, by: 0, pitch: 0, swell: 0, head: [0, 0], headA: 0, ahead: 0, lay: 0, jaw: 0, blink: 0, glow: 1, throat: 0, fire: -1,
    tail: { sway: 0, curl: 0, lift: 0 }, wing: { raise: 0, open: 0.55, beat: 0 }, feet: [[0, 0], [0, 0], [0, 0], [0, 0]],
    flash: false, bite: -1, stomp: -1, gust: -1, thud: -1, fall: 0, smoke: false,
  };
  const k = (ks) => keys(t, ks), age = (from, to) => (t >= from && t <= to ? clamp((t - from) / (to - from)) : -1);
  if (action === 'idle') {
    const br = lerp(0.55, 1.5, bounce);
    // breathing swells the chest and lifts the head a moment later; the phases keep the big moves inside the loop, not across its seam
    P.swell = br * (0.9 + 0.9 * wave(t, -0.22));
    P.by = -0.5 * br * wave(t, -0.22);
    P.head = [0.8 * wave(t, -0.4), -1.3 * br * wave(t, -0.34)];
    P.headA = 0.04 * wave(t, -0.45);
    P.tail = { sway: 0.22 * wave(t, -0.5), curl: 0.14 * wave(t, -0.62), lift: 0 };
    P.wing = { raise: 0.09 * br * wave(t, -0.3), open: 0.55 + 0.04 * wave(t, -0.36), beat: 0 };
    P.blink = t >= 0.75 && t < 0.87 ? 1 : t >= 0.87 ? 0.5 : 0;
    P.smoke = true;
  } else if (action === 'walk') {
    // a diagonal walk: near fore and far hind tread together, then the other pair; each foot is on the ground for 0.6 of the cycle
    const step = (ph) => {
      const u = fract(t + ph), duty = 0.6, st = 5;
      if (u < duty) return [lerp(st, -st, u / duty), 0];
      const v = (u - duty) / (1 - duty);
      return [lerp(-st, st, smooth(v)), Math.sin(PI * v) * lerp(2.5, 5, bounce)];
    };
    P.feet = [step(0), step(0.5), step(0.5), step(0)];
    P.by = lerp(0.6, 1.8, bounce) * (0.5 + 0.5 * Math.cos(4 * PI * (t - 0.05)));
    P.pitch = 0.02 * wave(t * 2, 0.1);
    P.head = [1.2 * wave(t * 2, -0.2), 1.4 * Math.cos(4 * PI * (t - 0.16))];
    P.tail = { sway: 0.2 * wave(t, -0.3), curl: 0, lift: 0 };
    P.wing = { raise: 0.08 * Math.cos(4 * PI * (t - 0.2)), open: 0.5, beat: 0 };
  } else if (action === 'attack') {
    // frame times of a 12-frame clip: n / 11. 1 to 5 the neck coils back and the jaws open (the warning), 6 it strikes, 7 the jaws snap shut at full reach
    const f = (n) => n / 11;
    P.head = [k([[0, 0], [f(1), -4], [f(2), -8], [f(3), -11], [f(5), -13], [f(6), 5], [f(7), 23], [f(8), 21], [f(9), 11], [f(10), 3], [1, 0]]),
      k([[0, 0], [f(2), -3], [f(3), -5], [f(5), -7], [f(6), 1], [f(7), 12], [f(8), 11], [f(9), 5], [f(10), 1], [1, 0]])];
    P.headA = k([[0, 0], [f(3), 0.22], [f(5), 0.3], [f(6), 0], [f(7), -0.2], [f(8), -0.16], [f(10), 0], [1, 0]]);
    P.jaw = k([[0, 0], [f(2), 0.3], [f(4), 0.8], [f(6), 1], [f(6.6), 1], [f(7), 0], [f(8), 0], [f(9), 0.2], [f(10), 0.1], [1, 0]]);
    P.bx = k([[0, 0], [f(3), -3], [f(5), -4], [f(6), 1], [f(7), 6], [f(8), 5], [f(10), 1], [1, 0]]);
    P.by = k([[0, 0], [f(3), 2], [f(5), 2.5], [f(7), -0.5], [f(8), 0.5], [1, 0]]);
    P.pitch = k([[0, 0], [f(4), 0.05], [f(7), -0.06], [f(9), 0], [1, 0]]);
    P.swell = k([[0, 0], [f(5), 1.5], [f(7), 0], [1, 0]]);
    P.tail = { sway: k([[0, 0], [f(4), -0.2], [f(7), 0.35], [f(9), 0.1], [1, 0]]), curl: k([[0, 0], [f(5), 0.3], [f(7), -0.3], [1, 0]]), lift: 0 };
    P.wing = { raise: k([[0, 0], [f(4), 0.4], [f(7), -0.25], [f(9), 0.1], [1, 0]]), open: k([[0, 0.55], [f(4), 0.8], [f(7), 0.45], [1, 0.55]]), beat: 0 };
    P.glow = k([[0, 1], [f(5), 1.6], [f(8), 1.6], [1, 1]]);
    P.bite = age(f(6.8), f(8.4));
  } else if (action === 'breath') {
    // frame times of a 12-frame clip: n / 11. 1 to 4 the neck pulls back and the throat lights up (the warning), 5 to 9 the fire, 10 smoke, 11 idle
    const f = (n) => n / 11, burning = t > f(4.5) && t < f(9.5);
    P.head = [k([[0, 0], [f(1), -3], [f(2), -6], [f(3), -8], [f(4), -9], [f(5), 1], [f(6), 3], [f(9), 3], [f(10), 1], [1, 0]]),
      k([[0, 0], [f(2), -3], [f(4), -6], [f(5), 2], [f(6), 3], [f(9), 3], [f(10), 1], [1, 0]]) + (burning && R(t * 11) % 2 ? 1 : 0)];
    P.headA = k([[0, 0], [f(2), 0.2], [f(4), 0.45], [f(5), -0.08], [f(9), -0.08], [1, 0]]);
    P.jaw = k([[0, 0], [f(3), 0.1], [f(4), 0.35], [f(5), 1], [f(9), 1], [f(10), 0.3], [1, 0]]);
    P.swell = k([[0, 0], [f(2), 2], [f(4), 3.4], [f(5), 1.5], [f(9), -0.5], [1, 0]]);
    P.throat = k([[0, 0], [f(1), 0.25], [f(2), 0.5], [f(3), 0.75], [f(4), 1], [f(8), 1], [f(9), 0.75], [f(10), 0.3], [1, 0]]);
    P.fire = age(f(4.5), f(9.5));
    P.ahead = k([[0, 0], [f(3), 30], [f(9), 30], [1, 0]]);                // the head keeps this much of the frame clear in front of it for the fire
    P.bx = k([[0, 0], [f(4), -1], [f(5), -2], [f(9), -3], [f(10), -1], [1, 0]]);
    P.by = k([[0, 0], [f(4), 1.5], [f(5), 0], [1, 0]]);
    P.pitch = k([[0, 0], [f(4), 0.05], [f(5), -0.02], [1, 0]]);
    P.wing = { raise: k([[0, 0], [f(4), 0.35], [f(5), 0.15], [f(9), 0.2], [1, 0]]), open: k([[0, 0.55], [f(4), 0.78], [f(9), 0.72], [1, 0.55]]), beat: 0 };
    P.tail = { sway: 0, curl: k([[0, 0], [f(4), 0.3], [f(6), -0.2], [f(9), -0.2], [1, 0]]), lift: k([[0, 0], [f(5), 0.15], [f(9), 0.15], [1, 0]]) };
    P.glow = k([[0, 1], [f(2), 1.3], [f(4), 1.8], [f(9), 1.8], [1, 1]]);
    P.smoke = t >= f(9.6) && t < 1;
  } else if (action === 'buffet') {
    // frame times of a 10-frame clip: n / 9. 1 to 3 the wind-up (the warning), 4 the beat, 5 it lands, 6 follow-through, 9 idle
    const f = (n) => n / 9;
    if (winged) {
      P.wing = {
        raise: k([[0, 0], [f(1), 0.4], [f(2), 0.8], [f(3), 1], [f(4), 0.3], [f(5), 0], [f(6), -0.1], [f(8), 0], [1, 0]]),
        open: k([[0, 0.55], [f(2), 0.9], [f(3), 1], [f(5), 1], [f(6), 0.8], [f(7), 0.2], [f(8), 0.4], [1, 0.55]]),
        // the recovery is made folded and behind the head: the wings never cross the face on their way back
        beat: k([[0, 0], [f(2), -0.2], [f(3), -0.3], [f(4), 2.6], [f(5), 3.2], [f(6), 3.4], [f(7), 0.9], [f(8), 0.4], [1, 0]]),
      };
      P.by = k([[0, 0], [f(3), 2.5], [f(4), 0], [f(5), -2], [f(6), -1], [f(8), 0.5], [1, 0]]);
      P.pitch = k([[0, 0], [f(3), -0.04], [f(5), 0.12], [f(6), 0.1], [f(8), 0.02], [1, 0]]);
      P.head = [k([[0, 0], [f(3), -4], [f(5), -2], [f(6), -2], [f(8), 0], [1, 0]]), k([[0, 0], [f(3), 3], [f(4), -6], [f(5), -7], [f(6), -6], [f(7), -2], [f(8), -1], [1, 0]])];
      P.gust = age(f(4.4), f(8.6));
    } else {
      P.pitch = k([[0, 0], [f(1), 0.12], [f(2), 0.26], [f(3), 0.34], [f(4), 0.12], [f(5), -0.05], [f(6), -0.02], [1, 0]]);
      const lift = k([[0, 0], [f(1), 3], [f(2), 8], [f(3), 11], [f(4), 5], [f(5), 0], [1, 0]]), paw = k([[0, 0], [f(3), 2], [f(4), 5], [f(5), 0], [1, 0]]);
      P.feet = [[paw, lift], [0, 0], [paw * 0.6, lift * 1.12], [0, 0]];
      P.by = k([[0, 0], [f(3), -1], [f(5), 2.5], [f(6), 1.5], [f(8), 0], [1, 0]]);
      P.head = [k([[0, 0], [f(3), -4], [f(5), 4], [f(6), 3], [1, 0]]), k([[0, 0], [f(3), -2], [f(5), 4], [f(6), 2], [1, 0]])];
      P.stomp = age(f(4.8), f(8.6));
    }
    P.headA = winged ? k([[0, 0], [f(3), 0.1], [f(5), 0.2], [f(7), 0.05], [1, 0]]) : k([[0, 0], [f(3), 0.25], [f(5), -0.12], [f(7), 0], [1, 0]]);
    P.jaw = k([[0, 0], [f(3), 0.1], [f(4), 0.7], [f(6), 0.7], [f(7), 0.25], [1, 0]]);
    P.swell = k([[0, 0], [f(3), 2.2], [f(5), 0], [1, 0]]);
    P.tail = { sway: k([[0, 0], [f(3), -0.25], [f(5), 0.3], [f(7), 0.1], [1, 0]]), curl: 0, lift: k([[0, 0], [f(5), 0.2], [1, 0]]) };
    P.glow = k([[0, 1], [f(3), 1.5], [f(6), 1.5], [1, 1]]);
  } else if (action === 'hurt') {
    P.flash = t < 0.15;
    P.head = [k([[0, -6], [0.333, -9], [0.667, -3], [1, 0]]), k([[0, -3], [0.333, -2], [0.667, 0], [1, 0]])];
    P.headA = k([[0, 0.4], [0.333, 0.3], [0.667, 0.1], [1, 0]]);
    P.jaw = k([[0, 0.75], [0.333, 0.6], [0.667, 0.2], [1, 0]]);
    P.bx = k([[0, -2], [0.333, -4], [0.667, -1], [1, 0]]);
    P.by = k([[0, 1], [0.333, 1.5], [0.667, 0.5], [1, 0]]);
    P.pitch = k([[0, 0.08], [0.333, 0.1], [0.667, 0.03], [1, 0]]);
    P.wing = { raise: k([[0, 0.5], [0.333, 0.6], [0.667, 0.2], [1, 0]]), open: k([[0, 0.9], [0.667, 0.7], [1, 0.55]]), beat: 0 };
    P.tail = { sway: k([[0, -0.3], [0.667, 0.1], [1, 0]]), curl: k([[0, 0.5], [0.667, 0.15], [1, 0]]), lift: k([[0, 0.2], [1, 0]]) };
    P.glow = k([[0, 0.6], [0.667, 0.8], [1, 1]]);
  } else if (action === 'die') {
    // frame times of a 12-frame clip: n / 11. 0 the hit (white), 1 to 3 it rears and roars at the sky, 4 to 7 the legs give way and the neck sinks, 8 the head hits the ground, 9 to 11 it settles and the glow goes out
    const f = (n) => n / 11;
    P.flash = t < f(0.5);
    P.head = [k([[0, -6], [f(1), -9], [f(2), -10], [f(3), -9], [f(4), -5], [f(5), 2], [f(6), 8], [1, 8]]), k([[0, -3], [f(1), -7], [f(2), -10], [f(3), -10], [f(4), -6], [f(5), 3], [f(6), 12], [1, 12]])];
    P.headA = k([[0, 0.4], [f(1), 0.8], [f(2), 1], [f(3), 0.95], [f(4), 0.6], [f(5), 0.25], [f(6), 0], [f(7), 0.1], [f(8), 0.22], [1, 0.22]]);
    P.lay = k([[0, 0], [f(5), 0], [f(6), 0.3], [f(7), 0.7], [f(8), 1], [1, 1]]);
    P.jaw = k([[0, 0.7], [f(1), 0.9], [f(3), 1], [f(4), 0.7], [f(6), 0.4], [f(8), 0.45], [f(9), 0.25], [1, 0.18]]);
    P.fall = k([[0, 0], [f(3), 0], [f(4), 0.12], [f(5), 0.38], [f(6), 0.7], [f(7), 0.95], [f(8), 1], [1, 1]]);
    P.pitch = k([[0, 0.08], [f(2), 0.16], [f(3), 0.14], [f(5), 0.05], [f(7), 0], [1, 0]]);
    P.bx = k([[0, -2], [f(3), -3], [f(8), 1], [1, 1]]);
    P.by = k([[0, 1], [f(3), -1], [f(8), 0], [f(8.5), 1], [f(9), 0], [1, 0]]);
    P.feet = [[9 * P.fall, 0], [-6 * P.fall, 0], [9 * P.fall, 0], [-6 * P.fall, 0]];
    P.wing = { raise: k([[0, 0.5], [f(2), 0.9], [f(3), 0.8], [f(5), 0.2], [f(8), -0.6], [1, -0.7]]), open: k([[0, 0.9], [f(3), 1], [f(5), 0.6], [f(8), 0.3], [1, 0.26]]), beat: 0 };
    P.tail = { sway: k([[0, -0.3], [f(3), 0.2], [f(8), 0], [1, 0]]), curl: k([[0, 0.5], [f(3), 0.3], [f(5), 0.6], [f(8), 2.6], [1, 2.9]]), lift: k([[0, 0.2], [f(3), 0.3], [f(8), -0.3], [1, -0.35]]) };
    P.glow = k([[0, 0.6], [f(2), 1.6], [f(4), 1.5], [f(6), 1], [f(8), 0.8], [f(9), 0.6], [f(10), 0.3], [1, 0]]);
    P.thud = age(f(7.7), f(10.6));
    P.smoke = t >= f(8.5);
  } else {
    throw new Error(`quadruped rig: no pose "${action}" (${POSES.join(', ')})`);
  }
  return P;
}

// ---- joints -----------------------------------------------------------------------------------------

/** The angles of a wing's bones for how far it is raised, opened and swept forward; the far wing is held a little further forward so it shows past the near one. */
function wingAngles(W, far) {
  const o = clamp(W.open + 0.05, 0, 1.1), r = W.raise + 0.25, turn = -W.beat - (far ? 0.2 : 0);
  return {
    a1: -PI + 0.35 + turn * 0.8 - 0.3 * r,
    a2: -PI + lerp(1.5, 0.75, o) + turn - 0.35 * r,
    fan: [-PI + lerp(2.3, 1.25, o) + turn - 0.25 * r, lerp(-0.5, -0.39, o) + turn * 0.85 - 0.1 * r],
  };
}

/**
 * Returns the joints of a posed four-legged beast, in frame pixels: where everything is, with nothing painted yet.
 * Arguments: P (a pose); d (dims()); opt { wingK (the scale the wings are drawn at, from wingRoom(); default 1), box ([x0, y0, x1, y1] everything must stay inside; default the frame less 2 px, down to the ground), ground (default GROUND) }.
 * Returns J = { H, C (the middles of the haunch and the chest, on whole pixels), chest: [rx, ry], pitch, neck (its joints, chest to skull), head { x, y, angle, jaw }, tail (its joints, root to end), tailR ((i) => half its thickness at joint i), tip { x, y, angle } (the end of the tail), legs ([{ hip, knee, ankle, foot, toe, hind, far }]: near fore, near hind, far fore, far hind), wings (null, or [near, far], each a jointedWing() of engine/beast.js with `sx`, `sy`), shoulder (where the near wing stands), gy, box, P, d }.
 */
export function solve(P, d, opt = {}) {
  const s = d.s, G = opt.ground ?? GROUND, box = opt.box ?? [2, 2, SIZE[0] - 2, G];
  const fall = clamp(P.fall ?? 0), pitch = P.pitch * (1 - fall);
  const baseY = G - d.haunchUp + P.by * s, hx = CX - 19 * s + P.bx * s;
  const H = [R(hx), R(baseY + fall * (d.haunchUp - d.haunchR * 0.95))];
  const v = turned([d.long, -(d.stand - d.haunchUp)], pitch);
  const ry = d.chestRy + P.swell * s, rx = d.chestR + P.swell * 0.5 * s;
  const C = [R(hx + v[0]), R(baseY + v[1] + fall * (d.stand - d.chestRy))];
  const on = (c, o) => { const q = turned(o, pitch); return [c[0] + q[0], c[1] + q[1]]; };

  // the neck is hung between the chest and wherever the head is sent
  const N0 = on(C, [rx * 0.42, -ry * 0.5]), aim = PI - 0.6 + pitch * 0.5;
  let tx = N0[0] + Math.sin(aim) * d.neckL * 0.9 + P.head[0] * s, ty = N0[1] + Math.cos(aim) * d.neckL * 0.9 + P.head[1] * s;
  const lay = clamp(P.lay ?? 0);
  if (lay > 0) {
    const gy = G - d.headR, dy = gy - N0[1], out = Math.sqrt(Math.max(0, (0.97 * d.neckL) ** 2 - dy * dy));
    tx = lerp(tx, N0[0] + out, lay); ty = lerp(ty, gy, lay);
  }
  let ha = PI / 2 - 0.22 + P.headA;
  if (lay > 0) ha = lerp(ha, PI / 2 + 0.06, lay);
  const nose = 0.5 * d.headR + d.snout;
  tx = Math.min(tx, box[2] - 1 - Math.sin(ha) * nose - (P.ahead ?? 0) * s);
  ty = clamp(ty, box[1] + d.headR + d.hornRoom, G - d.headR);
  const neck = arcChain(N0[0], N0[1], tx, ty, d.neckL, { bend: 1, steps: 7 });
  let [headX, headY] = neck[neck.length - 1];
  // an open jaw must not sink into the ground, and neither the nose, the chin nor the spines on the back of the neck may
  // leave the frame: the head gives way, a little at a time, and the neck bends
  for (let pass = 0; pass < 5; pass++) {
    const shape = jawHead(headX, headY, ha, { size: d.headR, snout: d.snout, jaw: P.jaw });
    const ends = [[...shape.tip, 0.5 * d.headR], [...shape.chin, 0.3 * d.headR], [...shape.crown, 0.3 * d.headR + d.hornRoom], [...shape.at(0.5 * d.headR, -0.6 * d.headR), 0.5 * d.headR], [headX, headY, d.headR]];
    let sx = 0, sy = 0;
    for (const [x, y, r] of ends) {
      sx = Math.min(sx, box[2] - 0.5 - (x + r)); sy = Math.min(sy, G - 0.5 - (y + r));
      if (y - r < box[1] + 0.5) sy = Math.max(sy, box[1] + 0.5 - (y - r));
    }
    neck.forEach(([, y], i) => { const u = i / (neck.length - 1), r = lerp(d.neckR0, d.neckR1, u) + (u > 0.2 ? d.crest : 0); if (y - r < box[1] + 0.5) sy = Math.max(sy, box[1] + 0.5 - (y - r)); });
    if (Math.abs(sx) < 0.2 && Math.abs(sy) < 0.2) break;
    const again = arcChain(N0[0], N0[1], headX + sx, headY + sy, d.neckL, { bend: 1, steps: 7 });
    neck.splice(0, neck.length, ...again);
    [headX, headY] = neck[neck.length - 1];
  }

  // the tail leaves the haunch to the left, turns up as sharply as the room behind it asks, and ends in a crook that curls
  // tighter instead of leaving the frame
  const T0 = [H[0] - d.haunchR * 0.7, H[1] + d.haunchR * 0.12];
  const tipLen = d.tail.kind === 'spade' ? 10 * d.tipK : d.tail.kind === 'club' ? 11 * d.tipK : 0, tipPad = d.tail.kind === 'flame' || d.tail.kind === 'plain' ? 2.5 : 5.6 * d.tipK + 2;
  const a0 = -PI / 2 + 0.4 - P.tail.lift, turn = -(PI / 2 + 0.18) + P.tail.lift + P.tail.sway * 0.3, STEPS = 12;
  const whole = d.tailL + tipLen, cut = Math.max(2, STEPS - Math.round((tipLen / whole) * STEPS));
  const tailR = (i) => lerp(d.tailR, 1.3 * s, Math.min(1, i / cut) ** 0.6);
  const padAt = (i) => Math.max(tailR(i), i >= cut ? tipPad : 0) + 1.2;
  const inside = (pts, upto) => { for (let i = 1; i <= upto; i++) { const [x, y] = pts[i], pad = padAt(i); if (x < box[0] + pad || x > box[2] - pad || y < box[1] + pad) return false; } return true; };
  let within = Math.min(whole * 0.5, 24 * s), curl = Math.min(-0.05, -(0.62 + P.tail.curl) + P.tail.sway);
  const make = () => hookPath(T0[0], T0[1], a0, whole, { turn, within, curl, steps: STEPS });
  while (within > 6 && !inside(make(), Math.min(STEPS, Math.ceil((within / whole) * STEPS) + 1))) within -= 1.5;
  while (curl > -7 && !inside(make(), STEPS)) curl -= 0.12;
  const path = make();
  for (let i = 1; i < path.length; i++) path[i][1] = Math.min(path[i][1], G - Math.max(tailR(i), i >= cut ? tipPad : 0) - 0.2);
  const tail = path.slice(0, cut + 1), end = tail[cut], before = tail[cut - 1];
  const tip = { x: end[0], y: end[1], angle: Math.atan2(end[0] - before[0], end[1] - before[1]) };

  // legs: the feet stay where they stand while the body moves over them
  const legOf = (hip, footX, [fwd, lift], hind, far) => {
    const fx = footX + fwd * s, up = lift * s;
    const want = hind ? [fx - 3.5 * s, G - 6.5 * s - up] : [fx, G - d.ankle - up];
    const l1 = hind ? d.thigh : d.upper, l2 = hind ? d.shin : d.fore;
    let j = ik2(hip[0], hip[1], want[0], want[1], l1, l2, hind ? 1 : -1);
    // a folded leg never puts its knee into the ground: it bends the other way instead
    if (j.mid[1] > G - d.shinR * 1.5 - 1) { const other = ik2(hip[0], hip[1], want[0], want[1], l1, l2, hind ? -1 : 1); if (other.mid[1] < j.mid[1]) j = other; }
    j.mid[1] = Math.min(j.mid[1], G - d.shinR * 1.5 - 1);
    const ankle = [R(j.end[0]), Math.min(R(j.end[1]), G - d.pawR - 1)];
    const sole = Math.min(G - d.pawR, ankle[1] + (hind ? 6.5 * s : d.ankle) - d.pawR);
    const foot = hind ? [ankle[0] + 4 * s, sole] : [ankle[0] - 0.5 * s, sole];
    const droop = Math.min(2.5 * s, up * 0.3);                         // a lifted paw hangs from its wrist
    return { hip, knee: j.mid, ankle, foot, toe: [foot[0] + d.pawL, Math.min(G - d.pawR, sole + droop)], hind, far };
  };
  const foreHip = on(C, [-2.5 * s, 3.5 * s]), hindHip = [H[0] + 1.5 * s, H[1] + 2.5 * s];
  const foreX = CX + 8 * s + 3 * s, hindX = CX - 19 * s + 4 * s;
  const legs = [
    legOf(foreHip, foreX, P.feet[0], false, false), legOf(hindHip, hindX, P.feet[1], true, false),
    legOf([foreHip[0] + 6 * s, foreHip[1] - 1 * s], foreX + 7.5 * s, P.feet[2], false, true), legOf([hindHip[0] + 6 * s, hindHip[1] - 1 * s], hindX + 7 * s, P.feet[3], true, true),
  ];

  // wings: both stand on the back above the forelegs; the skin runs back to the top of the haunch
  const shoulder = on(C, [rx * 0.05, -ry * 0.84]);
  let wings = null;
  if (d.wing.kind !== 'none') {
    const kk = opt.wingK ?? 1, W = d.wing, back = [H[0] - d.haunchR * 0.1, H[1] - d.haunchR * 0.82];
    // swept forward, the skin lets go of the haunch: its trailing edge comes in to just behind the shoulder
    const hold = clamp(1 - P.wing.beat / 2.2, 0.22, 1), root = [lerp(shoulder[0], back[0], hold), lerp(shoulder[1] + 2 * s, back[1], hold)];
    const one = (far) => {
      const sx = shoulder[0] + (far ? 5.5 * s : 0), sy = shoulder[1] - (far ? 1.5 * s : 0);
      const w = jointedWing(sx, sy, { ...wingAngles(P.wing, far), upper: W.upper * kk, fore: W.fore * kk, finger: W.finger * kk, fingers: W.fingers, scoop: W.scoop, tatter: W.tatter, seed: far ? 3 : 1, bone: Math.max(1.2, 1.5 * s), floor: G - 1, ceiling: box[1] + 1, root: [root[0] + (far ? 6 * s : 0), root[1] - (far ? 1 * s : 0)] });
      return { ...w, sx, sy };
    };
    wings = [one(false), one(true)];
  }
  return { H, C, chest: [rx, ry], pitch, neck, head: { x: headX, y: headY, angle: ha, jaw: P.jaw }, tail, tailR, tip, legs, wings, shoulder, gy: G, box, P, d };
}

const ROOM = new Map();
/**
 * The largest scale, 1 or less, at which a beast's wings stay inside the frame in every frame of every pose, so they are drawn at one size in all its clips instead of being cut off or shrinking in one of them.
 * Arguments: d (dims()); m { bounce, wings } (as pose()); opt { box ([x0, y0, x1, y1], default the frame less 3 px, down to the ground), least (the smallest answer, default 0.4) }.
 */
export function wingRoom(d, m = {}, opt = {}) {
  if (d.wing.kind === 'none') return 1;
  const box = opt.box ?? [3, 3, SIZE[0] - 3, GROUND - 1], least = opt.least ?? 0.4;
  const key = [d.s, d.bulk, d.neckL, d.wing.kind, d.wing.span, m.bounce ?? 0.5, ...box, least].join('|');
  if (ROOM.has(key)) return ROOM.get(key);
  let room = 1;
  for (const name of POSES) {
    const st = STANDARD[name];
    for (let i = 0; i < st.frames; i++) {
      const J = solve(pose(name, st.loop ? i / st.frames : i / (st.frames - 1), m, d), d, { wingK: 1 });
      for (const w of J.wings) for (const [x, y] of w.marks) {
        const dx = x - w.sx, dy = y - w.sy;
        if (dx < -1e-6) room = Math.min(room, (box[0] - w.sx) / dx); else if (dx > 1e-6) room = Math.min(room, (box[2] - w.sx) / dx);
        if (dy < -1e-6) room = Math.min(room, (box[1] - w.sy) / dy); else if (dy > 1e-6) room = Math.min(room, (box[3] - w.sy) / dy);
      }
    }
  }
  room = clamp(room, least, 1);
  if (ROOM.size > 200) ROOM.clear();
  ROOM.set(key, room);
  return room;
}

// ---- painting ---------------------------------------------------------------------------------------

/** The paints of a beast from its three colours: body, the far side a tone darker, the accent of belly and wing skin, bone, and the steps of its fire. */
function paints(look) {
  const C = ramp(look.body ?? '#c9423a'), A = ramp(look.accent ?? '#e6c96a'), K = ramp(look.bone ?? '#f0ead8');
  return {
    C, A, K,
    far: { light: C.base, base: C.dark, dark: C.deep }, farA: { light: A.base, base: A.dark, dark: A.deep },
    fire: steps(look.glow ?? '#e8662c', { core: look.core ?? '#f4e06a', white: false }),      // [core, mid, edge, rim]
    glow: look.glow ?? '#e8662c',
  };
}

/** One leg as shape tests: the muscle at its top, the upper and lower bones, the paw; and its three claws as triangles. */
function legShapes(L, d) {
  const s = d.s, top = L.hind ? d.thighR * 1.28 : d.thighR * 1.08;
  const tests = [
    ellipseIn(L.hip[0], L.hip[1], top, top * (L.hind ? 1.05 : 0.95)),
    capsuleIn(L.hip[0], L.hip[1], L.knee[0], L.knee[1], d.thighR * (L.hind ? 1.05 : 0.9), d.shinR * 1.45),
    capsuleIn(L.knee[0], L.knee[1], L.ankle[0], L.ankle[1], d.shinR * 1.4, d.shinR),
    capsuleIn(L.foot[0], L.foot[1], L.toe[0], L.toe[1], d.pawR, d.pawR * 0.9),
  ];
  if (L.hind) tests.push(capsuleIn(L.ankle[0], L.ankle[1], L.foot[0], L.foot[1], d.shinR, d.pawR));
  else tests.push(capsuleIn(L.ankle[0], L.ankle[1], L.foot[0] + 1, L.foot[1], d.shinR, d.pawR));
  // three claws: a hooked one on the front toe that reaches past the paw, and the tips of two more behind it
  const fx = R(L.toe[0] + d.pawR * 0.4), by = L.toe[1] + d.pawR, claws = [[[fx - 1, by - 2.4 * s], [fx + 2.6 * s, by], [fx - 1.6, by]]];
  for (let i = 1; i < 3; i++) { const cx = fx - 1 - R(i * 2.6 * s); claws.push([[cx - 1, by - 1.6 * s], [cx + 1, by], [cx - 1, by]]); }
  return { inside: anyIn(tests), claws };
}

/** The horns on a head, as shape tests for the near side and the far side. */
function hornShapes(Hd, d, box) {
  const kind = d.horn.kind, len = d.horn.length, s = d.s, a = Hd.angle, up = a + PI / 2;
  if (kind === 'none') return { near: null, far: null };
  const room = [box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1];
  const horn = ([x, y], angle, length, o) => hornIn(x, y, angle, hornFit(x, y, angle, length, { ...o, box: room }), o);
  const farAt = Hd.at(-0.5 * d.headR + 2.2 * s, -0.72 * d.headR - 0.6 * s);
  if (kind === 'swept') {
    const o = { curl: -0.5, width: 3.6 * s, tip: 0.9, steps: 6 };
    return { near: horn(Hd.crown, up + 1.12, 14 * len, o), far: horn(farAt, up + 0.92, 12.5 * len, o) };
  }
  if (kind === 'ram') {
    // a ram's horn: up from the brow, back, down behind the cheek and forward again
    const o = { curl: 4.7, width: 4.6 * s, tip: 1.2, steps: 10 }, nearAt = Hd.at(-0.15 * d.headR, -0.8 * d.headR);
    return { near: horn(nearAt, up + 0.35, 19 * len, o), far: horn([nearAt[0] + 2.4 * s, nearAt[1] - 1.2 * s], up + 0.2, 13 * len, { ...o, curl: 3 }) };
  }
  // crown: a fan of short spikes round the back of the skull, the middle ones longest
  const tests = [];
  for (let i = 0; i < 5; i++) {
    const v = i / 4, at = Hd.at(lerp(0.15, -0.95, v) * d.headR, lerp(-0.92, 0.05, v) * d.headR), o = { curl: -0.25, width: 2.8 * s, tip: 0.8, steps: 3 };
    tests.push(horn(at, up + lerp(0.25, 1.75, v), (5.5 + 3.5 * Math.sin(PI * v)) * len, o));
  }
  return { near: anyIn(tests), far: null };
}

/**
 * Paints a posed four-legged beast, without its outline and its lights (lights() adds those after g.outline). Returns the joints J, with what lights() needs added (J.face: the head's points).
 * Arguments: g (the Surface); J (from solve()); look { body, accent (belly plates and wing skin), glow (eyes, throat and fire), bone (horns, claws, teeth and spikes: default cream), core (the hottest tone of the fire: default a pale yellow) } as '#rrggbb'.
 */
export function draw(g, J, look = {}) {
  const { d, P, H, C, gy: G } = J, s = d.s, T = paints(look), { A, K } = T, B = T.C;
  const [rx, ry] = J.chest, W = g.w, Hh = g.h;
  const Hd = { ...jawHead(J.head.x, J.head.y, J.head.angle, { size: d.headR, snout: d.snout, jaw: J.head.jaw }), angle: J.head.angle };
  // every piece is painted inside the box of its own joints, so a frame costs a few thousand shape tests, not a million
  const fill = (test, paint, opt, box) => (box ? g.fill(box[0], box[1], box[2], box[3], kept(test, box), paint, opt) : g.fill(0, 0, W, Hh, test, paint, opt));
  const headBox = around([[J.head.x, J.head.y]], 0.5 * d.headR + d.snout + 3), hornBox = around([[J.head.x, J.head.y]], d.headR + 19 * d.horn.length + 3);
  const neckBox = around(J.neck, d.neckR0 + 9 * s), tailBox = around([...J.tail, [J.tip.x, J.tip.y]], d.tailR + 13 * d.tipK), trunkBox = around([H, C], Math.max(d.haunchR, J.chest[0], J.chest[1]) + 10 * s);
  const bodyBox = union(headBox, neckBox, tailBox, trunkBox);

  // ---- behind the body: far wing, far horn, far legs, spines ----
  const wingBox = (w) => around([[w.sx, w.sy], w.root, ...w.marks], 3);
  const wingOn = (w, skin, bone) => { fill(w.skin, skin, { shade: 1 }, wingBox(w)); fill(w.bones, bone, { shade: 0 }, wingBox(w)); };
  if (J.wings) wingOn(J.wings[1], T.farA, T.far);
  const horns = hornShapes(Hd, d, J.box);
  if (horns.far) fill(horns.far, { light: K.base, base: K.dark, dark: K.deep }, { shade: 1 }, hornBox);
  const legs = J.legs.map((L) => ({ L, ...legShapes(L, d), box: around([L.hip, L.knee, L.ankle, L.foot, L.toe], d.thighR * 1.4 + 2) }));
  for (const leg of legs) if (leg.L.far) { fill(leg.inside, T.far, { shade: 1 }, leg.box); for (const c of leg.claws) g.poly(c, K.dark); }

  const neckR = (u) => lerp(d.neckR0, d.neckR1, u), tailU = (u) => J.tailR(u * (J.tail.length - 1));
  const back = [[H[0] - d.haunchR * 0.3, H[1]], [C[0] + rx * 0.2, C[1]]], backR = (u) => lerp(d.haunchR * 0.96, ry * 0.98, u);
  if (d.spines === 'ridge') {
    const h = 3.6 * s, w = 3.4 * s, mid = (v) => 0.6 + 0.4 * Math.sin(PI * v);
    fill(anyIn(
      spikeRowIn(J.neck, { from: 0.4, to: 0.93, count: 3, height: h * 1.3, width: w * 1.2, lift: neckR, lean: -0.3, grade: (v) => 1 - 0.25 * v }).inside,
      spikeRowIn(back, { from: 0, to: 0.82, count: 5, height: h * 1.15, width: w * 1.1, lift: backR, lean: -0.3, grade: mid }).inside,
      spikeRowIn(J.tail, { from: 0.1, to: 0.72, count: 5, height: h * 0.9, width: w * 0.9, side: -1, lift: tailU, lean: 0.3, grade: (v) => 1 - 0.5 * v }).inside,
    ), K, { shade: 1 }, bodyBox);
  } else if (d.spines === 'sails') {
    const fins = [
      sailIn(J.neck, { from: 0.3, to: 0.95, rays: 5, height: 7.5 * s, lift: neckR, lean: -0.35, scoop: 0.6 }),
      sailIn(back, { from: 0, to: 0.85, rays: 5, height: 8.5 * s, lift: backR, lean: -0.3, scoop: 0.6 }),
      sailIn(J.tail, { from: 0.08, to: 0.62, rays: 4, height: 5 * s, side: -1, lift: tailU, lean: 0.3, scoop: 0.6 }),
    ];
    for (const f of fins) { fill(f.inside, A, { shade: 1 }, around([...f.tips, ...f.rays.map((r) => r.base)], 2)); for (const r of f.rays) g.limb(r.base[0], r.base[1], r.tip[0], r.tip[1], 1, B.dark, { shade: 0 }); }
  }
  const tipS = tailTipIn(d.tail.kind, J.tip.x, J.tip.y, J.tip.angle, d.tipK);
  if (tipS.spikes) fill(tipS.spikes, K, { shade: 1 }, tailBox);

  // ---- the lower jaw and the inside of the mouth ----
  const lit = P.fire >= 0 || P.throat >= 0.95;
  if (J.head.jaw > 0.08) fill(Hd.inside, lit ? T.fire[1] : B.deep, { shade: 0 }, headBox);
  fill(Hd.lower, B, { shade: 1 }, headBox);

  // ---- the body: one blob, so one shadow band and no seams ----
  const neck = tubeIn(J.neck, d.neckR0, d.neckR1), tail = tubeIn(J.tail, 0, 0, { radius: tailU });
  const upperHead = kept(Hd.upper, headBox), lowerHead = kept(Hd.lower, headBox);
  const trunk = kept(anyIn(ellipseIn(H[0], H[1], d.haunchR, d.haunchR * 0.95), ellipseIn(C[0], C[1], rx, ry), capsuleIn(H[0], H[1], C[0], C[1], d.waistR, Math.min(d.waistR * 1.06, ry))), trunkBox);
  const body = anyIn(trunk, neck, tail, upperHead, tipS.body ? kept(tipS.body, tailBox) : []), all = anyIn(body, lowerHead);
  fill(body, B, { shade: 2 }, bodyBox);
  seam(g, upperHead, B.dark, { box: headBox, clip: (px, py) => lowerHead(px, py) && !upperHead(px, py) });
  // scales: a few small dark marks in staggered rows on the flank, and one at each joint of the neck and the tail
  const scale = (x, y, inside) => { const qx = R(x), qy = R(y); for (const [dx, dy] of [[0, 0], [1, 1], [2, 0]]) if (inside(qx + dx + 0.5, qy + dy + 0.5) && inside(qx + dx + 0.5, qy + dy + 3.5)) g.dot(qx + dx, qy + dy, B.dark); };
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const u = (c + (r % 2) * 0.5) / 5.5 * 1.2 - 0.15, rad = lerp(d.haunchR, ry, clamp(u));
    scale(lerp(H[0], C[0], u), lerp(H[1], C[1], u) + (-0.62 + r * 0.3) * rad, trunk);
  }
  for (let i = 1; i < J.neck.length - 1; i++) { const u = i / (J.neck.length - 1), Q = pathPoint(J.neck, u); scale(Q.x + Q.nx * neckR(u) * 0.3 - 1, Q.y + Q.ny * neckR(u) * 0.3, neck); }

  // ---- belly plates: the accent colour along the underside of neck, chest, belly and tail ----
  const k1 = 3.2 * s, k2 = 3 * s;
  const under = (px, py) => (trunk(px, py) || neck(px, py)) && !upperHead(px, py) && !lowerHead(px, py) && (!all(px + 0.8 * s, py + k1) || !all(px + k2, py + 1 * s));
  // the tail's own underside is the outside of its curl
  const n = J.tail.length - 1, inner = J.tail.map((q, i) => { const Q = pathPoint(J.tail, i / n), w = Math.min(2.6 * s, J.tailR(i) * 0.75); return [q[0] - Q.nx * w, q[1] - Q.ny * w]; });
  const tailTop = tubeIn(inner, 0, 0, { radius: tailU });
  const tailUnder = (px, py) => tail(px, py) && !tailTop(px, py) && !trunk(px, py);
  const belly = (px, py) => under(px, py) || tailUnder(px, py);
  fill(belly, A, { shade: 1 }, bodyBox);
  // the lines between the plates: across the neck and the tail at their joints, and upright under the trunk
  const tick = (from, to) => fill(capsuleIn(from[0], from[1], to[0], to[1], 0.55), A.dark, { shade: 0, clip: belly }, around([from, to], 1.5));
  for (let i = 1; i < J.neck.length - 1; i++) { const Q = pathPoint(J.neck, i / (J.neck.length - 1)), r = neckR(i / (J.neck.length - 1)); tick([Q.x - Q.nx * (r + 1), Q.y - Q.ny * (r + 1)], [Q.x - Q.nx * (r - 5 * s), Q.y - Q.ny * (r - 5 * s)]); }
  for (let i = 1; i < n; i++) { const Q = pathPoint(J.tail, i / n), r = J.tailR(i); if (r > 2) tick([Q.x + Q.nx * (r + 1), Q.y + Q.ny * (r + 1)], [Q.x + Q.nx * (r - 4 * s), Q.y + Q.ny * (r - 4 * s)]); }
  for (let x = R(H[0] - d.haunchR * 0.5); x <= C[0] + rx; x += Math.max(3, R(4 * s))) g.rect(x, Math.min(H[1], C[1]), 1, G - Math.min(H[1], C[1]), A.dark, { clip: under });

  // ---- the throat lights up, plate by plate, from the chest to the jaw ----
  if (P.throat > 0.05) {
    const m = J.neck.length - 1, shifted = J.neck.map((q, i) => { const Q = pathPoint(J.neck, i / m), w = neckR(i / m) * 0.6; return [q[0] + Q.nx * w, q[1] + Q.ny * w]; });
    const dorsal = tubeIn(shifted, d.neckR0, d.neckR1);
    for (let i = 0; i < m; i++) {
      if ((i + 0.5) / m > P.throat) break;
      const a = J.neck[i], b = J.neck[i + 1], seg = capsuleIn(a[0], a[1], b[0], b[1], neckR(i / m), neckR((i + 1) / m));
      const front = (i + 1.5) / m > P.throat;                          // the plate the glow has just reached is the hottest
      const segBox = around([a, b], d.neckR0 + 1);
      fill((px, py) => seg(px, py) && neck(px, py) && !dorsal(px, py) && !upperHead(px, py) && !trunk(px, py), front ? T.fire[1] : T.fire[2], { shade: 0 }, segBox);
      fill((px, py) => seg(px, py) && under(px, py), T.fire[0], { shade: 0 }, segBox);
    }
  }

  // ---- near legs, each with a dark line where it lies on the body ----
  for (const leg of legs) if (!leg.L.far) {
    seam(g, leg.inside, B.deep, { box: leg.box, clip: all });
    fill(leg.inside, B, { shade: 1 }, leg.box);
    for (const c of leg.claws) g.poly(c, K.base);
  }

  // ---- the face ----
  const open = J.head.jaw > 0.2;
  Hd.teeth.forEach((tri, i) => { if (open || i >= Hd.upperTeeth - 2 && i < Hd.upperTeeth) g.poly(tri, K.base); });
  const [ex, ey] = Hd.eye, [nx, ny] = Hd.nostril;
  const socket = Hd.at(0.5 * d.headR, -0.36 * d.headR);
  g.rect(R(socket[0]) - 1, R(socket[1]) - 1, 2, 2, B.deep);
  g.dot(R(nx - 0.5), R(ny + 0.5), B.deep);
  if (horns.near) { seam(g, horns.near, B.deep, { box: hornBox, clip: body }); fill(horns.near, K, { shade: 1 }, hornBox); }

  // ---- the near wing, over everything ----
  if (J.wings) { const w = J.wings[0]; seam(g, anyIn(w.skin, w.bones), B.deep, { box: wingBox(w), clip: all }); wingOn(w, A, B); }
  J.face = { ...Hd, eye: [ex, ey] };
  return J;
}

/**
 * Adds the lights and loose effects of a four-legged beast; call it AFTER g.outline(): the lit eye, the smoke from the nostrils, the fire of its breath, a flame on the tail, the snap of a bite, the wind and dust of a wing beat or a stamp, and the dust it falls into. Light is never inked: it is rimmed with its own dark tone. Nothing is drawn on the outermost row or column.
 * Arguments: g; J (what draw() returned); look { glow, core (as draw()), smoke (the grey of smoke and dust: default a warm grey) }; opt { t (the clip's phase, for what flickers), loop (true in a looping clip) }.
 */
export function lights(g, J, look = {}, opt = {}) {
  const { d, P, gy: G, C } = J, s = d.s, T = paints(look), F = T.fire, Hd = J.face, t = opt.t ?? 0;
  const box = [1, 1, SIZE[0] - 1, G + 1], air = [1, 1, SIZE[0] - 1, SIZE[1] - 1];
  // smoke and dust share three greys, so a clip stays inside its colour budget
  const grey = look.smoke ?? '#a8a4a0', pale = [tone(grey, 0.7), grey, tone(grey, -1)];
  // the eye
  if (!P.flash) {
    if (P.glow >= 0.25) creatureEye(g, Hd.eye[0], Hd.eye[1], { style: 'glow', glow: P.glow < 0.7 ? tone(T.glow, -1) : T.glow, blink: P.blink >= 1, rim: P.blink < 0.5, within: Hd.upper });
    if (P.glow >= 1.4 && P.blink < 1) twinkle(g, Hd.eye[0], Hd.eye[1] - 1, 1, T.glow, { core: WHITE, box: air });
  }
  // a flame on the end of the tail: it gutters to an ember when the glow goes out
  if (d.tail.kind === 'flame') {
    const lvl = clamp(P.glow, 0, 1.3), a = J.tip.angle, [fx, fy] = [J.tip.x, J.tip.y];
    if (lvl < 0.25) { g.dot(R(fx), R(fy) - 1, F[3]); g.dot(R(fx) - 1, R(fy) - 1, F[3]); }
    else {
      const len = Math.min(lerp(4, 10.5, lvl / 1.3) * d.tipK, fy - 4), up = lerp(a, PI, 0.55);
      flame(g, { t: opt.loop ? t : t * 2, x: fx, y: fy, tongues: [{ angle: up, length: len, width: 3.1 * d.tipK }, { angle: up - 0.5, length: len * 0.6, width: 2 * d.tipK, phase: 0.4 }], sway: 1.2, cycles: 2, heat: 0.55, colours: F, box: [Math.max(1, fx - 16), Math.max(1, fy - 16), Math.min(air[2], fx + 16), Math.min(air[3], fy + 16)] });
    }
  }
  // smoke curls from the nostrils
  if (P.smoke && !P.flash) {
    const [nx, ny] = Hd.nostril;
    puffs(g, { t: opt.loop ? t : t * 2, x: nx + 1.5, y: ny - 2, count: 3, seed: 4, loop: true, angle: PI - 0.5, arc: 0.5, dist: 7 * s, rise: 5 * s, size: 2.3 * s, shape: 'round', colours: pale, box: air });
  }
  // the fire: three tongues from the mouth that open into a cone, with embers flying ahead
  if (P.fire >= 0) {
    const [mx, my] = Hd.mouth, a = J.head.angle - 0.06, k = P.fire;
    const grow = clamp(k / 0.22), fade = clamp((1 - k) / 0.2), power = Math.min(grow, 0.55 + 0.45 * fade);
    const most = (SIZE[0] - 3 - mx) / Math.max(0.3, Math.sin(a)), L = Math.min(44 * s, most) * lerp(0.45, 1, grow);
    const wide = lerp(3.4, 5.4, power) * s;
    const tongues = [
      { angle: a, length: L, width: wide, phase: 0 },
      { angle: a - 0.24, length: L * 0.82, width: wide * 0.78, phase: 0.37 },
      { angle: a + 0.2, length: L * 0.86, width: wide * 0.8, phase: 0.71 },
    ];
    particles(g, { t: k, x: mx + 4, y: my, count: 9, seed: 6, cycles: 3, lifespan: 0.8, angle: a, arc: 0.9, dist: L * 1.05, gravity: -3, size: 2.2, colours: F, box: air });
    flame(g, { t: k, x: mx - 1, y: my, tongues, sway: 2.2, cycles: 4, heat: lerp(0.35, 0.7, power), colours: F, box: [Math.max(1, mx - 8), Math.max(1, my - 28), air[2], Math.min(air[3], my + 34)] });
  }
  // the jaws snap shut: a white star at the teeth
  if (P.bite >= 0 && P.bite < 0.75) {
    const x = Math.min(Hd.tip[0] + 1, SIZE[0] - 9), y = (Hd.tip[1] + Hd.chin[1]) / 2, r = lerp(7.5, 4, P.bite) * s;
    starburst(g, { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, count: 6, r0: 1.5, r1: r, width: 2.2, turn: PI / 2, colour: WHITE, rim: T.K.dark, box: air });
  }
  // the wing beat: wind and dust driven forward along the ground
  if (P.gust >= 0) {
    const x = C[0] + 14 * s, k = P.gust;
    streaks(g, { t: k * 0.9, x, y: C[1] - 4 * s, count: 5, seed: 3, cycles: 1, angle: PI / 2, length: 11, reach: SIZE[0] - 8 - x, spread: 15 * s, colours: [WHITE, pale[0], pale[1]], box: air });
    puffs(g, { t: k, x: x + 4, y: G - 3, count: 5, seed: 8, loop: false, stagger: 0.25, angle: PI / 2, arc: 0.35, dist: SIZE[0] - 14 - x, rise: 6, size: 3.4, shape: 'wispy', floor: G, colours: pale, box });
  }
  // the stamp: a flat ring of dust from under the forefeet
  if (P.stomp >= 0) {
    const x = clamp(J.legs[0].toe[0] + 2, 30, SIZE[0] - 30), k = P.stomp;
    ring(g, { t: k, x, y: G - 4, r0: 6, r1: 26, thick: 4, squash: 0.26, colours: pale, box, seed: 2 });
    for (const side of [-1, 1]) puffs(g, { t: k, x: x + side * 7, y: G - 3, count: 3, seed: 5 + side, loop: false, angle: side * PI / 2, arc: 0.6, dist: 16, rise: 7, size: 3.2, shape: 'wispy', floor: G, colours: pale, box });
  }
  // the fall: dust rolls out from under the head and the chest
  if (P.thud >= 0 && P.thud < 1) {
    const k = P.thud;
    puffs(g, { t: k, x: Math.min(Hd.tip[0] + 3, SIZE[0] - 12), y: G - 3, count: 3, seed: 11, loop: false, angle: PI / 2, arc: 0.7, dist: 9, rise: 7, size: 3.3, shape: 'wispy', floor: G, colours: pale, box });
    puffs(g, { t: k, x: C[0] + 2, y: G - 3, count: 3, seed: 13, loop: false, angle: -PI / 2, arc: 2.6, dist: 12, rise: 6, size: 3.3, shape: 'wispy', floor: G, colours: pale, box });
  }
}

/**
 * Named attach points of a solved four-legged beast, { name: { x, y, angle } } in frame pixels: head (the top back of the skull, where horns stand), back (where the wings stand), tail (the end of the tail), feet (the ground under the chest) and muzzle (the mouth, where the fire appears; angle: the way the snout points).
 * Arguments: J (from solve() or draw()).
 */
export function sockets(J) {
  const { d } = J, Hd = jawHead(J.head.x, J.head.y, J.head.angle, { size: d.headR, snout: d.snout, jaw: J.head.jaw });
  return {
    head: { x: Hd.crown[0], y: Hd.crown[1], angle: J.head.angle + PI / 2 },
    back: { x: J.shoulder[0], y: J.shoulder[1], angle: PI },
    tail: { x: J.tip.x, y: J.tip.y, angle: J.tip.angle },
    feet: { x: CX + J.P.bx * d.s, y: J.gy, angle: 0 },
    muzzle: { x: Hd.mouth[0], y: Hd.mouth[1], angle: J.head.angle },
  };
}

/**
 * Builds one frame of a four-legged beast, posed and fitted once, so the picture and the exported attach points cannot disagree.
 * Arguments: clip (a pose name, one of POSES); t (0..1); p (the sprite's values: size, bulk and bounce are read from it); opt { neck (0..1), spines ('none' or one of SPINES), wings: { kind, span }, horns: { kind, length }, tail: { kind, length } (as dims()), loop (true when the clip loops: what flickers then closes with it) }.
 * Returns F = { clip, d, P, J, draw(g, look) (paints it), finish(g, look) (the white of a hit, the outline, then the lights), sockets() }; look is draw()'s and lights()'s.
 */
export function frame(clip, t, p = {}, opt = {}) {
  const d = dims(p, opt), m = { bounce: p.bounce, wings: d.wing.kind !== 'none' };
  const P = pose(clip, t, m, d), J = solve(P, d, { wingK: wingRoom(d, m) });
  let drawn = false;
  return {
    clip, d, P, J,
    sockets: () => sockets(J),
    draw(g, look) { drawn = true; return draw(g, J, look); },
    finish(g, look = {}) {
      if (!drawn) draw(g, J, look);
      if (P.flash) g.tint(WHITE);
      g.outline(look.outline ?? INK);
      lights(g, J, look, { t, loop: opt.loop ?? STANDARD[clip]?.loop ?? false });
      return g;
    },
  };
}
