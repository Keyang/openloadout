// PORT (creature batch C1): the drawing of the code sprite sprites/crow-scout.js (its constants, helpers, sockets and render), word
// for word, with its imports pointed at the port shims (engine/gen/ports/colour.js through ./colour.js, ./surface.js) and at
// the E2 copies of the engine helpers (engine/gen/ports/e2/) or C1's own copies here, so it draws paint refs on an
// engine/gen/port-surface.js grid. It is the drawing of the creature generator creature.crow-scout@1 (engine/gen/creature-c1.js),
// which sprites/crow-scout.json names; it goes only with the last version that draws with it. Its settings (p) are that
// generator's arguments; its colours are the paint refs the data file names. The defineSprite block's metadata (name,
// params, clips, sounds) lives in the data file now. A HAND CHANGE note says where it differs from its source; never
// change what a released generator version draws through it.
// Crow scout: a dark, sharp-beaked bird seen from the side. No skeleton. The body and head are one blob that
// tilts as a whole; the two wings are feathered fans hinged at the shoulder (one in front of the body, one
// behind it and darker) that sweep up, back and down on one beat per clip; the tail fan and the crest lag the
// body. Something may hang from its claws (the `held` part) and swings behind it.
// The wing, the fans, the beat and the eye come from engine/creature.js; this file holds the proportions and the timing.
import { lerp, clamp, wave, keys, dir, PI } from '../../../motion.js';
import { ramp, farRamp, tone, INK } from './colour.js';
import { ellipseIn, capsuleIn, rectIn } from './surface.js';
import { placedIn } from '../e2/shapes.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { glow, twinkle } from '../e2/fx.js';
import { flapCycle, featherWing, fanIn, fanTips, flutterIn, nudgeInside, fitScale, creatureEye } from '../e2/creature.js';

const P = PALETTE.thornwood;
const W = 48, CX = 22, CY = 26;
// Feathers and beak touch, so the two lists share no colour.
const BODY = swatches('thornwood', 'body', { lead: 'slate' });
const BEAK = swatches('thornwood', 'accent', { lead: 'ember' }).filter((c) => !BODY.includes(c));
const EYES = { dot: 'dots', angry: 'angry', glow: 'glow' };       // the Eyes choice, and the moods of the clips, as styles of creatureEye()

const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);
const CLIPS = {
  idle: { label: 'Hover', frames: 8, fps: fps(7), loop: true },
  fly: { frames: 8, fps: fps(12), loop: true },
  attack: { label: 'Dive', frames: 8, fps: fps(13), loop: false },
  hurt: { frames: 4, fps: fps(9), loop: false },
  die: { frames: 8, fps: fps(10), loop: false },
};

// How high the wings may lift, 1 in full. A big bird that carries a big thing is taller than the frame when its wings are right up,
// so it lifts them less: by one amount in every clip, found from every frame of the clips in which the wings beat.
const BEATS = ['idle', 'fly', 'attack', 'hurt'].flatMap((clip) => Array.from({ length: CLIPS[clip].frames }, (_, f) => [clip, CLIPS[clip].loop ? f / CLIPS[clip].frames : f / (CLIPS[clip].frames - 1)]));
let liftFor = '', liftIs = 1;                              // the last look asked about and its answer: frames are drawn a look at a time
function liftOf(p) {
  const look = [p.size, p.span, p.beak, p.flap, p.bob, p.held, p.heldSize].join();
  if (look !== liftFor) { liftIs = fitScale((k) => BEATS.map(([clip, t]) => pose(clip, t, p, k).marks), W, W, 2.5, { step: 0.05 }); liftFor = look; }
  return liftIs;
}

// Where everything is this frame: shared by render() and sockets(). lift: how high the wings may go (left out: as high as fits this look).
function pose(clip, t, p, lift = liftOf(p)) {
  const s = lerp(0.82, 1.18, p.size);
  const L = lerp(13, 19, p.span) * s, K = lerp(0.7, 1.2, p.flap), float = lerp(0.5, 3, p.bob);
  const hover = (u) => { const F = flapCycle(u); return { arm: 0.6 + 0.4 * F.arm, lag: F.tip - F.arm, fold: 0.35 * F.fold, dy: -0.6 * float * F.lift }; };      // hovering, the wings stay high
  const r0 = hover(0), tilt0 = 0.3, nod0 = 0.65, swing0 = -0.3;
  // arm: 1 wings up .. -1 down. tilt: the body, + head up. nod: how far the head looks down. swing: the way the held thing hangs (0 straight down, - behind).
  let legs = -0.5;                                       // the way the legs point, from straight down under the body: more negative is further back
  let arm = r0.arm, lag = r0.lag, fold = r0.fold, dx = 0, dy = r0.dy, tilt = tilt0, nod = nod0, open = 0, swing = swing0, sway = 0, limp = 0, burst = -1;
  let mood = p.eyes, flash = false;
  if (clip === 'idle') {
    const h = hover(t);
    arm = h.arm; lag = h.lag; fold = h.fold; dy = h.dy;
    sway = 0.18 * flapCycle(t - 0.15).lift;
    swing = swing0 + 0.22 * wave(t, -0.3) - 0.22 * wave(0, -0.3);
    if (t >= 0.75) mood = 'blink';
  } else if (clip === 'fly') {
    const F = flapCycle(t);
    arm = F.arm; lag = F.tip - F.arm; fold = 0.6 * F.fold; dy = -float * F.lift;
    tilt = -0.2 + 0.07 * F.lift; nod = 0.12; legs = -1;
    sway = 0.25 * flapCycle(t - 0.15).lift;
    swing = -0.7 + 0.25 * wave(t, -0.3);
  } else if (clip === 'attack') {
    // 0 hover, 1 to 2 it rears up and back with its wings high, 3 the wings fold and it tips over, 4 the plunge lands, 5 to 6 it brakes and climbs back
    const far = clamp(9 - 4 * (s - 1) / 0.18, 3, 8);            // a big bird has less room to plunge
    dx = keys(t, [[0, 0], [0.143, -2], [0.286, -3], [0.429, 2], [0.571, far * 0.9], [0.714, far * 0.5], [0.857, 1], [1, 0]]);
    dy = r0.dy + keys(t, [[0, 0], [0.143, -2], [0.286, -3], [0.429, 2], [0.571, far], [0.714, far * 0.4], [0.857, -1], [1, 0]]);
    tilt = keys(t, [[0, tilt0], [0.286, tilt0 + 0.4], [0.429, -0.6], [0.571, -0.75], [0.714, 0.05], [0.857, tilt0 + 0.25], [1, tilt0]]);
    nod = keys(t, [[0, nod0], [0.286, 0.7], [0.429, 0.1], [0.571, 0], [0.857, 0.3], [1, nod0]]);
    arm = keys(t, [[0, r0.arm], [0.143, 0.75], [0.286, 1], [0.429, 0.45], [0.571, 0.3], [0.714, -0.9], [0.857, 0.7], [1, r0.arm]]);
    lag = keys(t, [[0, r0.lag], [0.286, -0.3], [0.571, 0], [0.714, 0.6], [1, r0.lag]]);
    fold = keys(t, [[0, r0.fold], [0.286, 0], [0.429, 0.85], [0.571, 1], [0.714, 0], [1, r0.fold]]);
    open = keys(t, [[0.4, 0], [0.571, 1], [0.66, 1], [0.75, 0]]);
    legs = keys(t, [[0, -0.5], [0.429, -1.1], [0.571, -1.1], [0.857, -0.2], [1, -0.5]]);
    swing = keys(t, [[0, swing0], [0.286, 0.25], [0.571, -1.2], [0.714, -0.5], [0.857, 0.1], [1, swing0]]);
    sway = keys(t, [[0, 0], [0.286, -0.3], [0.571, 0.35], [1, 0]]);
    if (t > 0.1 && t < 0.9) mood = 'angry';
  } else if (clip === 'hurt') {
    dx = keys(t, [[0, -3], [0.333, -4], [0.667, -1], [1, 0]]);
    dy = r0.dy + keys(t, [[0, 0], [0.333, -2], [0.667, 0], [1, 0]]);
    tilt = keys(t, [[0, tilt0 + 0.55], [0.333, tilt0 + 0.4], [0.667, tilt0 - 0.1], [1, tilt0]]);
    arm = keys(t, [[0, 0.9], [0.333, 1], [0.667, -0.5], [1, r0.arm]]);
    lag = keys(t, [[0, -0.4], [0.667, 0.4], [1, r0.lag]]);
    fold = keys(t, [[0, 0.3], [0.333, 0.5], [0.667, 0], [1, r0.fold]]);
    swing = keys(t, [[0, 0.7], [0.333, 0.4], [0.667, -0.6], [1, swing0]]);
    open = t < 0.5 ? 1 : 0;
    flash = t < 0.2;
    if (t < 0.9) mood = 'hurt';
  } else if (clip === 'die') {
    // 0 the hit (white), 1 to 3 it tumbles over backwards and drops with its wings trailing, 4 it bursts into feathers, 5 to 6 they drift down, 7 three are left
    dx = keys(t, [[0, -3], [0.143, -4], [0.429, -5]]);
    dy = r0.dy + keys(t, [[0, 0], [0.143, -1], [0.286, 3], [0.429, 8]], (x) => x * x);
    tilt = keys(t, [[0, tilt0 + 0.55], [0.143, 1.1], [0.286, 1.9], [0.429, 2.7]], (x) => x);
    arm = keys(t, [[0, 0.9], [0.143, 1], [0.429, 1]]);
    limp = keys(t, [[0, 0], [0.143, 0.5], [0.286, 1]]);
    fold = keys(t, [[0, 0.3], [0.286, 0.6], [0.429, 0.7]]);
    lag = 0;
    swing = keys(t, [[0, 0.7], [0.286, 0], [0.429, -0.2]]);
    open = 1;
    flash = t < 0.1;
    mood = 'hurt';
    if (t > 0.5) burst = clamp((t - 0.42) / 0.58);            // frames 4 to 7: 0.26, 0.51, 0.75, 1; the first is already as wide as the bird was
  }

  const held = p.held === 'none' ? null : { kind: p.held, size: p.heldSize };
  const build = (cx, cy) => {
    const ct = Math.cos(tilt), st = Math.sin(tilt), ch = Math.cos(tilt - nod), sh = Math.sin(tilt - nod);
    const at = (f, u) => [cx + (f * ct - u * st) * s, cy - (f * st + u * ct) * s];       // f px forward and u px up from the middle of the body
    const head = at(6.4, 2.2);
    const hat = (f, u) => [head[0] + (f * ch - u * sh) * s, head[1] - (f * sh + u * ch) * s];   // the same from the middle of the head, which nods
    const beat = arm > 0 ? arm * lift : arm;                            // above the back the wings go only as high as fits
    const A = lerp(-PI / 2 + tilt - beat * K * 1.25, PI * 0.93, limp);          // the arm of the wing: up, back, down
    const reachOf = L * lerp(0.74, 1, Math.abs(arm));                   // pointing back it is seen end-on, so shorter
    // the far wing is a little ahead of the near one, so both show
    const wingAt = (sh0, far) => featherWing(sh0[0], sh0[1], A + (far ? 0.38 * (1 - limp) : 0), reachOf * (far ? 0.92 : 1), {
      chord: L * 0.56, feathers: 6, spread: lerp(beat * K * 1.5, -0.5, limp), fold, tip: 0.5 * lag * K, fingers: 1 });
    const near = wingAt(at(0.8, 3), false), far = wingAt(at(2.8, 3.4), true);
    const tailRoot = at(-6.4, 0.2), tailA = -PI / 2 + tilt + 0.15 + sway;
    const tail = { root: tailRoot, a0: tailA - 0.45, a1: tailA + 0.45, len: 8 * s };
    const beakLen = lerp(4.5, 9, p.beak) * s;
    const grip = (() => { const [x, y] = at(-1.4, -3.2); const [ux, uy] = dir(tilt + legs); return [x + ux * 3 * s, y + uy * 3 * s]; })();
    const hang = held ? HELD[held.kind].reach * held.size : 0, [hx, hy] = dir(swing);
    const reachB = 2.6 + beakLen / s, gape = 0.34 * open;
    const marks = [[cx, cy, 5 * s], [head[0], head[1], 3.6 * s], hat(reachB, -0.8, 1), hat(reachB * Math.cos(gape), reachB * Math.sin(gape)), hat(reachB * 0.86 * Math.cos(gape), -1.1 - reachB * 0.86 * Math.sin(gape * 1.6)), hat(-5, 6), hat(-1, 8), [grip[0], grip[1], 1],
      ...near.tips, ...far.tips, near.wrist, far.wrist, ...fanTips(tailRoot[0], tailRoot[1], tail.a0, tail.a1, 3, tail.len)];
    if (held) marks.push([grip[0] + hx * hang * 0.6, grip[1] + hy * hang * 0.6, HELD[held.kind].half * held.size + 1], [grip[0] + hx * hang, grip[1] + hy * hang, 1.5]);
    return { cx, cy, at, hat, head, near, far, tail, beakLen, grip, marks };
  };
  let q = build(CX + dx, CY + dy);
  const [nx, ny] = burst >= 0 ? [0, 0] : nudgeInside(q.marks, W, W, 2.5);
  if (nx || ny) q = build(CX + dx + nx, CY + dy + ny);
  return { ...q, s, L, tilt, nod, arm, open, swing, sway, held, mood, flash, burst, limp };
}

// ---- the held thing: a part drawn from the claws, the way it hangs and its settings ---------------------------

// reach: how far below the claws its bottom is; half: half its width (both at size 1)
const HELD = { lantern: { reach: 9, half: 3 }, sack: { reach: 8.5, half: 3.6 }, bomb: { reach: 9, half: 3.4 } };

/** Draws what hangs from the claws at (x, y), swung to rig angle `swing`. Returns the points that give light, for drawing after the outline. */
function drawHeld(g, x, y, swing, { kind, size }, flick) {
  const k = size, put = (tests) => placedIn(tests, x, y, { angle: -swing });
  const to = (lx, ly) => { const c = Math.cos(-swing), s = Math.sin(-swing); return [x + lx * c - ly * s, y + lx * s + ly * c]; };
  if (kind === 'lantern') {
    const w = 5 * k, h = 6 * k, top = 2.5 * k, iron = ramp(P.soil), light = ramp(P.gold);
    g.fill(0, 0, W, W, put([capsuleIn(0, 0, 0, top, 0.6), rectIn(-w / 2, top, w, h), rectIn(-1, top - 1, 2, 1)]), iron, { shade: 0 });
    g.fill(0, 0, W, W, put([rectIn(-w / 2 + 1, top + 1.2, w - 2, h - 2.6)]), light.base);
    g.dot(...to(flick ? -0.5 : 0.5, top + h * 0.55), light.light);
    return [];
  }
  if (kind === 'sack') {
    const r = 3.6 * k, top = 1.5 * k, cloth = ramp(P.wood);
    g.blob([put([ellipseIn(0, top + r + 0.5, r * 0.95, r), capsuleIn(0, 0.5, 0, top + 2, 1.2 * k)])], cloth, { shade: 1 });
    g.fill(0, 0, W, W, put([rectIn(-1.6 * k, top + 0.6, 3.2 * k, 1)]), P.soil);                 // the cord that ties it
    return [];
  }
  const r = 3.3 * k, top = 2.4 * k, iron = ramp(P.cavern);
  g.fill(0, 0, W, W, put([capsuleIn(0, 0, 0, top, 0.6)]), P.wood);                               // the cord
  g.fill(0, 0, W, W, put([ellipseIn(0, top + r, r, r)]), iron, { shade: 1, light: 1 });
  g.fill(0, 0, W, W, put([rectIn(0.6, top - 0.4, 2, 1.6)]), P.stone);                            // the cap the fuse comes out of
  const spark = to(3.4 * k, top - 1.2 * k);
  g.line(...to(2, top), ...to(3 * k, top - 0.6 * k), P.cream);
  return [[spark[0], spark[1], flick ? 1 : 0]];
}

/** The attach points of one frame as sprites/crow-scout.js did: { name: { x, y, angle } } in the old frame's pixels. */
export function sockets(clip, t, p) {
  const q = pose(clip, t, p);
  return { hand: { x: q.grip[0], y: q.grip[1], angle: q.swing } };
}

/** Draws one frame as sprites/crow-scout.js did (g a PortSurface, p the settings with colours as paint refs). */
export function render(g, { clip, t, frame, p }) {
  const q = pose(clip, t, p);
  const { s, at, hat, head } = q;
  const body = ramp(p.body), wing = ramp(tone(p.body, -0.7)), back = farRamp(p.body), horn = ramp(p.accent);

  if (q.burst >= 0) {
    // what is left of it: feathers thrown out, then drifting down; three stay to the end
    const u = q.burst;
    flutterIn(u, q.cx, q.cy, { reach: 13 * s, length: 5.5 * s, width: 2.6 * s, box: [5, 5, W - 6, W - 6] }).forEach((feather, i) => g.fill(0, 0, W, W, feather, i % 2 ? wing : body, { shade: 0 }));
    g.outline(INK);
    if (u < 0.3) glow(g, q.cx, q.cy, 4.5 * s, ['#ffffff', wing.light, wing.base]);          // the flash of the burst
    return;
  }

  // behind the body: the far wing, the tail fan, the held thing
  g.fill(0, 0, W, W, q.far.inside, back, { shade: 0 });
  g.fill(0, 0, W, W, fanIn(q.tail.root[0], q.tail.root[1], q.tail.a0, q.tail.a1, 3, q.tail.len, 3 * s, { belly: 0.5, blunt: 0.6 }), body, { shade: 1 });
  const lights = q.held ? drawHeld(g, q.grip[0], q.grip[1], q.swing, q.held, frame % 2) : [];

  // legs and claws
  const hip = at(-1.4, -3.2);
  for (const o of [0, 1.6]) g.line(hip[0] + o * s, hip[1], q.grip[0] + o, q.grip[1], horn.dark);
  g.rect(Math.round(q.grip[0]) - 1, Math.round(q.grip[1]), 3 + (s > 1 ? 1 : 0), 1, horn.base);

  // crest, behind the head
  if (p.crest !== 'none') {
    // tuft: two plumes swept back off the crown; spiky: three spikes standing up
    const root = hat(-0.6, 2.4), up = PI + q.tilt - q.nod + 0.6 * q.sway;
    const c = p.crest === 'tuft' ? fanIn(root[0], root[1], up + 0.3, up + 1.05, 2, [6 * s, 8.5 * s], 2.5 * s, { belly: 0.5, blunt: 0.7 })
      : fanIn(root[0], root[1], up - 0.3, up + 0.9, 3, [5.5 * s, 7 * s], 2.3 * s, { belly: 0.3, blunt: 0.8 });
    g.fill(0, 0, W, W, c, body, { shade: 0 });
  }

  // body and head: one blob
  const rear = at(-5, -0.2), chest = at(2.6, 0.2);
  const trunk = [capsuleIn(rear[0], rear[1], chest[0], chest[1], 2.6 * s, 4.2 * s), ellipseIn(head[0], head[1], 3.3 * s, 3.1 * s)];
  g.blob(trunk, body, { shade: 1, light: 1 });          // glossy feathers: a lit rim along the crown and the back

  // beak: a long wedge, which opens when it strikes or is hit
  const gape = 0.34 * q.open, b0 = 2.2, b1 = 2.6 + q.beakLen / s;
  const upper = [hat(b0, 1.9), hat(b0, -0.4), hat(b1 * Math.cos(gape), -0.8 + b1 * Math.sin(gape))];
  const lower = [hat(b0, 0), hat(b0, -1.9), hat(b1 * 0.86 * Math.cos(gape), -1.1 - b1 * 0.86 * Math.sin(gape * 1.6))];
  g.poly(lower, horn.dark);
  g.poly(upper, horn, { shade: 0 });

  // the eye: a glowing one is light, so it is drawn after the outline
  const eye = hat(0.6, 1.1);
  const look = { body: body.base, style: EYES[q.mood] ?? EYES[p.eyes], blink: q.mood === 'blink', squint: q.mood === 'hurt', glow: p.accent, within: (px, py) => trunk.some((f) => f(px, py)) };
  const glows = look.style === 'glow' && !look.squint;
  if (!glows) creatureEye(g, eye[0], eye[1], look);

  // the near wing, in front of the body and darker than it; the sheen along its arm is the lightest thing on the bird
  const over = q.near.inside;
  g.fill(0, 0, W, W, over, wing, { shade: 1 });
  const sh = at(0.8, 3);
  g.fill(0, 0, W, W, capsuleIn(sh[0], sh[1], q.near.wrist[0], q.near.wrist[1], 1.3 * s, 0.9 * s), body.light, { clip: over });

  if (q.flash) g.tint('#ffffff');
  g.outline(INK);

  // light, drawn after the outline: a glowing eye, a lit fuse
  if (glows && !q.flash) creatureEye(g, eye[0], eye[1], look);
  for (const [x, y, big] of lights) twinkle(g, x, y, big, P.ember, { core: P.gold });
}
