// PORT (migration batch C3): a copy of rigs/kiosk.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/c3/surface.js) and the other port copies (engine/gen/ports/e2/, engine/gen/ports/c3/), so it draws paint refs on
// engine/gen/port-surface.js grids. It is the drawing code of migration batch C3's robot ports (engine/gen/robots.js), so it
// is NOT temporary: it stays when rigs/kiosk.js goes and goes only with the last generator version that draws with it. A HAND
// CHANGE note below says where it differs from its source; never change what a released generator version draws through it.
// Kiosk robot rig, on a 48x48 canvas: a service machine that hovers in place and always faces the camera (a shop,
// a bank, a repair point), for top-down games. It is seen in the three-quarter view (docs/style-guide.md, section 1):
// the top face of the cabinet shows, lit, above the front that faces the camera. No direction clips: a kiosk looks the
// same whichever way the player comes from.
//
// The rig is the code; a sprite on it is choices (Contract 13): which body, which face on the screen, arms or none,
// what it wears on top and what it holds, its colours, and which of the poses are its clips.
//
//   clips(speedOf, names)            the clip table for the poses a sprite uses (POSES: idle, talk, sell)
//   frame(clip, t, p, opt)           ONE FRAME, posed and fitted once: F.draw(g, look), F.finish(g, look), F.sockets()
//   dims, pose, solve, draw, lights, sockets      what frame() is made of, for a pose of your own
//   SHAPES, FACES, HEADGEAR, HELD    the names of the bodies, the screen faces and the parts
//
//   import * as K from '../rigs/kiosk.js';
//   const frameOf = (clip, t, p) => K.frame(clip, t, p, { shape: p.shape, face: p.eyes, arms: p.arms,
//     headgear: { kind: p.headgear, size: p.headgearSize }, held: { kind: p.held, size: p.heldSize } });
//   // in defineSprite:  size: K.SIZE, pivot: K.PIVOT, clips: K.clips((p) => p.speed),
//   sockets: (clip, t, p) => frameOf(clip, t, p).sockets(),
//   render(g, { clip, t, p }) { const F = frameOf(clip, t, p), look = { body: p.body, accent: p.accent, glow: p.glow }; F.draw(g, look); F.finish(g, look); }
//
// What it is made of, from the ground up: a jet of light that always reaches the floor (so the machine stands on its
// pivot line however high it bobs), a nozzle, the cabinet (boxy: a box with rounded corners; round: a drum; capsule: a
// tall pill), and on its front a screen with a face, a band of the accent colour, a serving hatch and a coin slot.
// In `sell` the hatch opens and a tray slides out towards the camera with something on it.
//
// Pure functions: Node and browser, no Math.random. Angles are frame angles: 0 = down the picture, PI/2 = right, PI = up.

import { lerp, clamp, keys, wave, fract, hash, PI } from '../../../motion.js';
import { ramp, tone, INK } from './colour.js';
import { ellipseIn, capsuleIn } from './surface.js';
import { squircleIn, solid } from '../e2/solids.js';
import { hover } from './creature-topdown.js';

/** The frame of a kiosk robot, [width, height] in pixels. */
export const SIZE = [48, 48];
/** The ground line: the jet under the machine ends on the row above it. */
export const GROUND = 42;
/** The pivot column: the machine is centred on this pixel column. */
export const CX = 24;
/** Where a game anchors the sprite, [x, y]: the floor under the middle of the machine. */
export const PIVOT = [CX, GROUND];
/** The bodies: boxy (a cabinet with rounded corners), round (a wide drum), capsule (a tall narrow pill). */
export const SHAPES = ['boxy', 'round', 'capsule'];
/** The faces the screen can show: smile (two eyes and a mouth), dots (two big round eyes), visor (one bar with a light that runs along it), one eye. */
export const FACES = ['smile', 'dots', 'visor', 'one eye'];
/** What stands on top of the cabinet: antenna (a rod with a ball), dish (a small dish on a mast), cap (a shopkeeper's peaked cap). */
export const HEADGEAR = ['antenna', 'dish', 'cap'];
/** What it holds out at its side, in a hand or on a bracket when it has no arms: sign (a plate on a pole with a coin on it), tray (a tray of goods). */
export const HELD = ['sign', 'tray'];
/** The poses pose() knows: idle (hovering, one blink), talk (the face flickers between two expressions, an arm waves), sell (the hatch opens and a tray slides out with something on it). */
export const POSES = ['idle', 'talk', 'sell'];

const STANDARD = { idle: { frames: 8, fps: 7, loop: true }, talk: { frames: 8, fps: 7, loop: true }, sell: { frames: 8, fps: 10, loop: false } };

/**
 * Builds the clip table of a kiosk robot from pose names, with the frames, speed and looping the style guide gives them (idle and talk: 8 frames, looping; sell: 8 frames, once).
 * Arguments: speedOf ((p) => the Speed slider, 0..1); names (a list of POSES, default all of them, in order).
 */
export function clips(speedOf = () => 0.5, names = POSES) {
  const out = {};
  for (const name of names) {
    const s = STANDARD[name];
    if (!s) throw new Error(`kiosk rig: no pose "${name}" (${POSES.join(', ')})`);
    out[name] = { frames: s.frames, fps: (p) => s.fps * lerp(0.65, 1.45, speedOf(p) ?? 0.5), loop: s.loop };
  }
  return out;
}

// ---- measurements -------------------------------------------------------------------------------

const BODIES = {
  boxy: { rx: 9.5, ry: 2.5, wall: 19 },
  round: { rx: 10.5, ry: 3, wall: 16 },
  capsule: { rx: 7.5, ry: 0, wall: 25 },
};

/**
 * Returns the measurements of a kiosk body in whole pixels, from the Size slider and the body's shape.
 * Arguments: p ({ size } 0..1, missing = 0.5); opt { shape: one of SHAPES (default 'boxy') }.
 * Returns { shape, k (the scale, 0.84 to 1.16), rx (half its width; the width is always odd), ry (half the depth of its top face on screen; 0 for a capsule), wall (rows of front under the top face), tall (all its rows), gap (rows between it and the floor at rest), arm (the length of each half of an arm) }.
 */
export function dims(p = {}, opt = {}) {
  const shape = SHAPES.includes(opt.shape) ? opt.shape : 'boxy', B = BODIES[shape], k = lerp(0.84, 1.16, clamp(p.size ?? 0.5));
  const rx = Math.round(B.rx * k - 0.5) + 0.5, ry = B.ry ? Math.max(2, Math.round(B.ry * k * 2) / 2) : 0, wall = Math.round(B.wall * k);
  return { shape, k, rx, ry, wall, tall: wall + Math.round(2 * ry), gap: 7, arm: Math.max(3, Math.round(4.5 * k)) };
}

// ---- poses ----------------------------------------------------------------------------------------

/**
 * Returns the pose of a kiosk robot at phase t (0..1) of an action, in the machine's own terms; solve(), draw() and sockets() take it.
 * Arguments: action (one of POSES); t; m { bob: the Float slider, 0..1 }.
 * The pose: lift (pixels above its resting height), dx (pixels sideways), wag (-1..1: how far what stands on top lags), face ('rest' | 'blink' | 'alt': the screen's expression), scan (0..1, moves the lights of the face), wave (0..1: the free arm is raised) and swing (-1..1: where its hand is in the wave), present (0..1: the free hand points at the hatch), hatch (0..1 open), tray (0..1 out), goods (true while something lies on the tray), glint (0, 1 or 2: the sparkle on it).
 */
export function pose(action, t, m = {}) {
  if (!POSES.includes(action)) throw new Error(`kiosk rig: no pose "${action}" (${POSES.join(', ')})`);
  const bob = clamp(m.bob ?? 0.5);
  const P = { lift: 0, dx: 0, wag: 0, face: 'rest', scan: fract(t), wave: 0, swing: 0, present: 0, hatch: 0, tray: 0, goods: false, glint: 0 };
  if (action === 'idle') {
    const H = hover(t, { bob });
    P.lift = H.lift; P.wag = H.lean;
    if (fract(t) >= 0.74) P.face = 'blink';                              // frames 6 and 7
  } else if (action === 'talk') {
    // two beats a loop: the face changes on frames 2 and 6 and back on 4 and 0, and the machine bobs with each word
    const beat = fract(t * 2), H = hover(t, { bob: bob * 0.6 });
    P.face = beat >= 0.5 ? 'alt' : 'rest';
    P.lift = H.lift + (beat >= 0.5 ? 1 : 0);
    P.wag = wave(t * 2, -0.2);
    P.wave = 1; P.swing = wave(t * 2);
  } else {
    // sell: 0 hovering, 1 it dips and the hatch cracks open, 2 the tray starts out, 3 it is out with the goods on it (they glint),
    // 4 held, 5 the goods are taken, 6 the tray goes back, 7 hovering with the hatch shut
    const f = (n) => n / 7;
    P.lift = keys(t, [[0, 0], [f(1), -1.2], [f(2), 0], [f(3), 1], [f(5), 0.6], [1, 0]]);
    P.hatch = keys(t, [[0, 0], [f(1), 0.4], [f(2), 1], [f(5), 1], [f(6), 0.5], [1, 0]]);
    P.tray = keys(t, [[f(1), 0], [f(2), 0.5], [f(3), 1], [f(5), 1], [f(6), 0.4], [1, 0]]);
    P.goods = t > f(1.5) && t < f(4.5);
    P.glint = t > f(2.5) && t < f(3.5) ? 2 : t >= f(3.5) && t < f(4.5) ? 1 : 0;
    P.face = t > f(2.5) && t < f(5.5) ? 'alt' : 'rest';
    P.present = keys(t, [[0, 0], [f(2), 1], [f(5), 1], [1, 0]]);
    P.wag = keys(t, [[0, 0], [f(1), -1], [f(3), 1], [f(5), 0], [1, 0]]);
  }
  return P;
}

// ---- joints ---------------------------------------------------------------------------------------

const rise = (kind, size) => (kind === 'antenna' ? 2 + Math.round(4 * size) : kind === 'dish' ? 3 + Math.round(3 * size) : kind === 'cap' ? Math.max(1, Math.round(2 * size)) : 0);

/**
 * Works out where everything of a posed kiosk robot is, in frame pixels, and keeps it inside the frame: a machine too tall for the room over it hovers lower, and one that holds something too far out moves over.
 * Arguments: P (a pose); d (dims()); opt { headgear: { kind, size }, held: { kind, size } } (what it wears and holds, or none).
 * Returns J: { cx (the centre line), top, bottom (its first row and the row after its last), topCy (the middle row of the top face), body, cap (shape tests of the whole cabinet and of its lit top), S (the solid, for a boxy or round body), half(row) (half its width on that row), front { x0, x1, y0, y1 } (the flat of its front), screen, hatch, slot ({ x, y, w, h } each), band (the row of the accent band), shoulder, hand ({ free, hold }: [x, y] of the arm on the picture's left and of the one that holds), mount ([x, y]: the middle of the held thing), crown ([x, y]: where the headgear stands), rise (pixels of headgear above the cabinet), nozzle (the row under the cabinet) }.
 */
export function solve(P, d, opt = {}) {
  const hg = opt.headgear && HEADGEAR.includes(opt.headgear.kind) ? opt.headgear : null, held = opt.held && HELD.includes(opt.held.kind) ? opt.held : null;
  const hs = held ? held.size ?? 1 : 1;
  let up = hg ? rise(hg.kind, hg.size ?? 1) : 0, gap = d.gap;
  // too tall for the frame: it hovers a little lower, then what stands on top is cut shorter, and last its float is held
  // inside the room there is (so the biggest look bobs less instead of being clipped; the nozzle never touches the floor)
  const headAt = () => GROUND - gap - d.tall - up;                      // the top row of everything, at rest
  if (headAt() < 4) gap -= Math.min(4 - headAt(), 2);
  if (headAt() < 4 && hg) up = Math.max(1, up - (4 - headAt()));
  const lift = clamp(Math.round(P.lift ?? 0), -(gap - 3), Math.max(0, headAt() - 2));
  const top = GROUND - gap - lift - d.tall, bottom = top + d.tall;
  // what it holds reaches furthest to the right and a waving arm furthest to the left: the machine moves over to keep both in
  // the frame, and where there is no room for both, what it holds is carried closer to the cabinet
  const ext = !held ? 0 : held.kind === 'sign' ? Math.round(3.5 * hs) : Math.floor(Math.min(5.5, Math.max(3.5, 4.5 * hs)) + 2);      // from the mount to its right edge
  let off = Math.round(5 * d.k) + 1;                                    // from the side of the cabinet to the mount
  const needR = () => d.rx + (held ? off + ext : opt.arms ? d.arm + 2.5 : 0);
  const minCx = 2 + d.rx + (opt.arms ? Math.ceil(1.5 * d.arm) + 2 : 0), maxCx = () => SIZE[0] - 3 - needR();
  if (held && maxCx() < minCx) off = Math.max(2, off - Math.ceil(minCx - maxCx()));
  const cx = Math.floor(clamp(CX + 0.5 + Math.round(P.dx ?? 0), Math.min(minCx, maxCx()), maxCx())) + 0.5;

  let body, cap, S = null, half, topCy, frontY0;
  if (d.shape === 'capsule') {
    const r = d.rx;
    body = capsuleIn(cx, top + r, cx, bottom - r, r);
    topCy = top + r * 0.62;
    const lid = ellipseIn(cx, topCy, r * 0.86, r * 0.5);
    cap = (px, py) => body(px, py) && (lid(px, py) || py < topCy);
    half = (row) => { const y = row + 0.5, dy = y < top + r ? top + r - y : y > bottom - r ? y - (bottom - r) : 0; return Math.sqrt(Math.max(0, r * r - dy * dy)); };
    frontY0 = Math.round(top + r * 1.05);
  } else {
    topCy = top + d.ry;
    cap = d.shape === 'round' ? ellipseIn(cx, topCy, d.rx, d.ry) : squircleIn(cx, topCy, d.rx, d.ry, 5);
    S = solid(cap, d.wall, [cx - d.rx - 1, top - 1, cx + d.rx + 1, top + 2 * d.ry + 1]);
    body = S.body;
    half = (row) => { let w = 0; for (let x = 0; x <= d.rx + 1; x++) if (body(cx + x, row + 0.5)) w = x + 0.5; return w; };
    frontY0 = Math.round(top + 2 * d.ry);
  }
  // the flat of the front: under the top face, between the rounded sides, and down to the last row still wide enough for the hatch and the slot
  let frontY1 = bottom - 2;
  while (frontY1 > frontY0 + 10 && half(frontY1 + 1) < 6.5) frontY1--;
  const fw = Math.min(half(frontY0 + 2), d.rx) - (d.shape === 'round' ? 2.5 : 1.5);
  const front = { x0: Math.ceil(cx - fw), x1: Math.floor(cx + fw), y0: frontY0, y1: frontY1 };
  const fh = front.y1 - front.y0, c0 = Math.floor(cx);
  // the screen in the upper half, the band under it, the hatch and the coin slot below
  const sw = Math.min(13, 2 * Math.floor((front.x1 - front.x0 - 1) / 2) + 1), sh = clamp(Math.round(fh * 0.5), 6, 8);
  const screen = { x: c0 - (sw - 1) / 2, y: front.y0 + 1, w: sw, h: sh };
  const band = screen.y + sh + 1;
  const low = band + 2, lh = clamp(front.y1 - low + 1, 3, 5);
  const slotW = 3, hw = Math.max(5, Math.min(11, front.x1 - front.x0 - slotW - 2));
  const hx = c0 - Math.floor((hw + slotW + 1) / 2);
  const hatch = { x: hx, y: low, w: hw, h: lh }, slot = { x: hx + hw + 1, y: low, w: slotW, h: lh };
  // arms: a shoulder on each side at the band; the free arm is on the picture's left, the one that holds on its right
  const sy = band, sL = [cx - half(sy) - 0.5, sy + 0.5], sR = [cx + half(sy) + 0.5, sy + 0.5];
  const holdX = cx + d.rx + off, holdY = sy - 1;
  return {
    cx, top, bottom, topCy, body, cap, S, half, front, screen, hatch, slot, band, gap,
    shoulder: { free: sL, hold: sR }, mount: [holdX, holdY], crown: [cx, Math.round(topCy) - (d.shape === 'capsule' ? Math.round(d.rx * 0.4) : 0)], rise: up, nozzle: bottom,
    hand: { free: null, hold: null },
  };
}

// the two halves of an arm from a shoulder to a hand: the elbow is pushed out to the side the arm is on
function elbowOf(s, h, len, side) {
  const mx = (s[0] + h[0]) / 2, my = (s[1] + h[1]) / 2, dx = h[0] - s[0], dy = h[1] - s[1], dist = Math.hypot(dx, dy) || 1;
  const off = Math.sqrt(Math.max(0, len * len - (dist / 2) ** 2));
  let nx = -dy / dist, ny = dx / dist;
  if (nx * side < 0 || (nx === 0 && ny < 0)) { nx = -nx; ny = -ny; }
  return [mx + nx * off, my + ny * off * 0.6];
}

/** Returns where the two hands of a posed kiosk robot are: { free: [x, y], hold: [x, y], elbows: { free, hold } }. Arguments: J (solve()); P (the pose); d (dims()); opt { held: { kind, size } or none }. */
export function hands(J, P, d, opt = {}) {
  const held = opt.held && HELD.includes(opt.held.kind), [fx, fy] = J.shoulder.free, [hx, hy] = J.shoulder.hold, L = d.arm;
  const sway = Math.round((P.wag ?? 0) * 0.8);
  // the free arm: hanging with the elbow out; raised and waving beside the screen; or pointing down at the hatch
  let free = [fx - 2, fy + 2 * L - 2 + sway];
  if (P.wave > 0) free = [fx - L + 0.5 + Math.round(1.5 * (P.swing ?? 0)), fy - L - 1 + Math.abs(Math.round(P.swing ?? 0))];
  if (P.present > 0) { const k = clamp(P.present); free = [lerp(free[0], Math.max(J.hatch.x - 2.5, fx + 1), k), lerp(free[1], J.hatch.y + J.hatch.h + 1.5, k)]; }
  // the arm that holds: its hand out at the side under what it holds; with nothing held it hangs like the other
  const hold = held ? [J.mount[0], J.mount[1] + 2] : [hx + 2, hy + 2 * L - 2 - sway];
  return { free, hold, elbows: { free: elbowOf([fx, fy], free, L, -1), hold: elbowOf([hx, hy], hold, L, 1) } };
}

/**
 * Returns the named attach points of a posed kiosk robot, { name: { x, y, angle } } in frame pixels: head (the top of the cabinet), hand (what it holds, or its hand on that side), offhand (the free hand), feet (the floor under it) and hatch (where what it sells appears).
 * Arguments: J (solve()); P (the pose); d (dims()); opt { held } as solve().
 */
export function sockets(J, P, d, opt = {}) {
  const H = hands(J, P, d, opt), out = Math.round(5 * d.k * clamp(P.tray ?? 0));
  return {
    head: { x: J.cx, y: J.top, angle: PI },
    hand: { x: H.hold[0], y: H.hold[1], angle: PI },
    offhand: { x: H.free[0], y: H.free[1], angle: P.wave > 0 ? PI : 0 },
    feet: { x: J.cx, y: GROUND, angle: 0 },
    hatch: { x: J.hatch.x + J.hatch.w / 2, y: J.hatch.y + J.hatch.h + out, angle: 0 },
  };
}

// ---- drawing --------------------------------------------------------------------------------------

// the lit marks of a face on the screen, as [x, y, w, h, tone] boxes from the middle column c and the screen's first row y
function faceMarks(kind, state, c, y, sw, sh, scan) {
  const m = [], e = sw >= 11 ? 3 : 2, mid = y + Math.floor(sh / 2), low = y + sh - 2;
  if (kind === 'dots') {
    const r = sh >= 7 ? 3 : 2, ex = e + (r === 3 ? 1 : 0);
    for (const sg of [-1, 1]) {
      const x = sg < 0 ? c - ex : c + ex - r + 1;
      if (state === 'rest') { m.push([x, mid - 2, r, r]); m.push([x + (sg < 0 ? r - 1 : 0), mid - 2, 1, 1, 'hot']); }
      else m.push([x, mid - 1, r, 1]);                                     // shut to a line (a blink, or a laugh)
    }
    if (state === 'alt') m.push([c - 1, low - 1, 3, 2]);                   // and the mouth opens
  } else if (kind === 'visor') {
    const w = sw - 2, x0 = c - (w - 1) / 2;
    if (state === 'alt') {
      // speaking: the bar breaks into columns of different heights
      for (let i = 0; i < w; i += 2) { const hgt = 1 + Math.floor(hash(i, Math.floor(scan * 8)) * (sh - 3)); m.push([x0 + i, mid - Math.floor(hgt / 2), 1, hgt]); }
    } else {
      m.push([x0, mid - 1, w, state === 'blink' ? 1 : 2]);
      if (state === 'rest') { const sx = Math.round(c + (w / 2 - 2) * wave(scan)); m.push([sx - 1, mid - 1, 3, 2, 'hot']); }      // the light that runs along it
    }
  } else if (kind === 'one eye') {
    if (state === 'rest') { m.push([c - 1, mid - 3, 3, 5]); m.push([c - 2, mid - 2, 5, 3]); m.push([c, mid - 1, 1, 1, 'off']); m.push([c + 1, mid - 2, 1, 1, 'hot']); }
    else if (state === 'blink') m.push([c - 2, mid - 1, 5, 1]);
    else { m.push([c - 1, mid - 2, 3, 1]); m.push([c - 3, mid - 1, 2, 1]); m.push([c + 2, mid - 1, 2, 1]); m.push([c - 3, mid, 1, 1]); m.push([c + 3, mid, 1, 1]); }      // a happy arc
  } else {
    // smile
    for (const sg of [-1, 1]) {
      const x = sg < 0 ? c - e - 1 : c + e;
      if (state === 'rest') m.push([x, y + 1, 2, sh >= 7 ? 3 : 2]);
      else if (state === 'blink') m.push([x, y + 2, 2, 1]);
      else m.push([x, y + 1, 2, 2]);
    }
    if (state === 'alt') m.push([c - 1, low - 1, 3, 2]);
    else { m.push([c - 2, low - 1, 1, 1]); m.push([c + 2, low - 1, 1, 1]); m.push([c - 1, low, 3, 1]); }
  }
  return m;
}

function drawHeadgear(g, J, P, d, kind, size, C) {
  const [cx, cy] = J.crown, up = J.rise, c0 = Math.floor(cx), wag = P.wag ?? 0;
  if (kind === 'antenna') {
    const bx = c0 + Math.min(3, Math.floor(d.rx / 3)), tx = bx + Math.round(wag * 1.5), ty = J.top - up + 1;
    g.rect(bx - 1, cy - 1, 3, 2, C.dark.base, { shade: 0 });
    g.line(bx + 0.5, cy - 0.5, tx + 0.5, ty + 1.5, C.metal.dark);
    // the ball at its tip: a bigger size is a longer rod and, from 1.2, a bigger ball
    if (size >= 1.2) { g.rect(tx - 1, ty, 3, 5, C.accent, { shade: 0 }); g.rect(tx - 2, ty + 1, 5, 3, C.accent, { shade: 0 }); g.rect(tx - 1, ty + 4, 3, 1, C.accent.dark, { shade: 0 }); }
    else g.rect(tx - 1, ty, 3, 3, C.accent, { shade: 0 });
    g.dot(tx + 1, ty + (size >= 1.2 ? 1 : 0), C.accent.light);
  } else if (kind === 'dish') {
    // a bowl tipped to the sky on a short mast: its rim, the dark of its hollow, and the feed on a rod over it
    // (where the room over the cabinet was cut, the bowl sits lower and flatter: nothing rises past J.top - up)
    const mx = c0 - 1, r = Math.max(3.4, 4.4 * size), lim = J.top - up + 1, dx = mx + 0.5 + Math.round(wag);
    const by = Math.max(cy - 2 - Math.round(1.6 * size), Math.min(cy - 1, lim + r * 0.55 + 0.5)), ry = Math.min(r * 0.55 + 0.5, Math.max(1.2, by - lim));
    g.rect(mx, Math.round(by), 1, Math.max(1, cy - Math.round(by)), C.metal.dark, { shade: 0 });
    g.rect(mx - 1, cy - 1, 3, 1, C.dark.base, { shade: 0 });
    g.ellipse(dx, by, r + 0.5, ry, C.metal, { shade: 1 });
    g.ellipse(dx, by - 0.5, r - 0.8, Math.max(0.8, ry - 1.4), C.dark.base, { shade: 0 });
    g.line(dx, by - 0.5, dx + 1.5, J.top - up + 1.5, C.metal.light);
    g.rect(Math.floor(dx + 1), J.top - up, 2, 2, C.accent.base, { shade: 0 });
  } else if (kind === 'cap') {
    // a peaked cap: a soft crown on the top face and a peak out over the front edge
    const w = Math.max(3.5, J.half(Math.round(cy)) * 0.72), by = Math.round(cy) + 1, ty = J.top - up, h = by - ty;
    g.ellipse(cx, ty + h * 0.62, w, h * 0.62, C.accent, { clip: (px, py) => py < by + 1 });
    g.rect(Math.round(cx - w - 1.5), by, Math.round(2 * w + 3), 2, C.accent.dark, { shade: 0 });
    g.rect(c0 - 1, by - 1, 3, 1, C.metal.base, { shade: 0 });                                   // its badge
  }
}

function drawHeld(g, J, d, kind, size, C, at) {
  const [hx, hy] = at, x = Math.floor(hx);
  if (kind === 'sign') {
    // a plate on a pole: a coin on it says what the machine is for
    const w = 2 * Math.round(3.5 * size) + 1, h = Math.max(5, Math.round(6 * size)), y1 = Math.round(hy) - 2, y0 = y1 - h;
    g.rect(x, y1, 1, 5, C.metal.dark, { shade: 0 });
    g.rect(x - (w - 1) / 2, y0, w, h, C.sign, { shade: 1 });
    g.rect(x - (w - 1) / 2, y0, w, 1, C.accent.base, { shade: 0 });
    g.rect(x - (w - 1) / 2, y1 - 1, w, 1, C.accent.dark, { shade: 0 });
    const r = h >= 7 ? 2 : 1.5, cy = y0 + h / 2;
    g.ellipse(x + 0.5, cy, r + 0.2, r + 0.2, C.goods, { shade: 0 });
    g.dot(x, Math.floor(cy), C.goods.dark);
  } else {
    // a tray of goods: a can and a box
    const rx = Math.min(5.5, Math.max(3.5, 4.5 * size)), y = Math.round(hy);
    g.ellipse(hx + 1, y - 0.5, rx + 0.5, 1.6, C.metal, { shade: 1, light: 1 });
    const a = Math.round(hx + 1 - rx * 0.5), b = Math.round(hx + 1 + rx * 0.3), tall = Math.max(3, Math.round(3.5 * size));
    g.rect(a - 1, y - 1 - tall, 2, tall, C.accent, { shade: 0 });
    g.rect(a - 1, y - 1 - tall, 2, 1, C.accent.light, { shade: 0 });
    g.rect(b - 1, y - 3, 3, 2, C.goods, { shade: 0 });
    g.rect(b - 1, y - 3, 3, 1, C.goods.light, { shade: 0 });
  }
}

function drawArm(g, s, e, h, C, grip) {
  g.line(s[0], s[1], e[0], e[1], C.metal.base);
  g.line(e[0], e[1], h[0], h[1], C.metal.base);
  g.rect(Math.floor(e[0]), Math.floor(e[1]), 1, 1, C.metal.dark);                              // the elbow
  const x = Math.floor(h[0]), y = Math.floor(h[1]);
  g.rect(x - 1, y - 1, 3, 2, C.accent.base, { shade: 0 });                                      // the hand: a clamp
  if (!grip) g.rect(x, y + (h[1] > e[1] ? 0 : -1), 1, 1, C.accent.dark);
  g.rect(Math.floor(s[0]) - (s[0] < e[0] ? 1 : 0), Math.floor(s[1]) - 1, 2, 2, C.dark.base, { shade: 0 });      // the shoulder joint
}

/**
 * Paints a posed kiosk robot, without its outline and its lights (lights() adds those after g.outline): the nozzle, the cabinet with its lit top, the screen and its face, the accent band, the hatch and the coin slot, the tray when it is out, then what it wears, its arms and what it holds. Returns the joints J.
 * Arguments: g (the Surface); P (a pose); d (dims()); look { body, accent, glow (the lit face of the screen), metal (arms, tray, fittings), dark (openings, the screen's glass, the nozzle), goods (what it sells; the coin on its sign), sign (the plate of a sign) } as '#rrggbb';
 * opt { face: one of FACES, arms: true | false, headgear: { kind, size }, held: { kind, size } }.
 */
export function draw(g, P, d, look = {}, opt = {}) {
  const J = solve(P, d, opt);
  const C = {
    accent: ramp(look.accent ?? '#2fb3a8'), glow: ramp(look.glow ?? '#5fe0f0'), metal: ramp(look.metal ?? '#c2c9d6'),
    dark: ramp(look.dark ?? '#434d6d'), goods: ramp(look.goods ?? '#f2c230'), sign: ramp(look.sign ?? '#f0ead8'),
  };
  // HAND CHANGE (C3): engine/solids.js faceRamps reads the colour's brightness; on paint refs its two ramps are the
  // faceTone colour rule of the same function, tone by tone (the top has no deep tone)
  const R = faceRampsP(look.body ?? '#9aa6c0'), { cx, bottom, screen, hatch, slot } = J, c0 = Math.floor(cx);
  const box = [cx - d.rx - 1, J.top - 1, cx + d.rx + 1, bottom + 1];
  const hg = opt.headgear && HEADGEAR.includes(opt.headgear.kind) ? opt.headgear : null, held = opt.held && HELD.includes(opt.held.kind) ? opt.held : null;

  // the nozzle under it
  g.rect(c0 - 3, bottom - 1, 7, 2, C.dark, { shade: 0 });
  g.rect(c0 - 2, bottom + 1, 5, 1, C.dark.dark, { shade: 0 });
  // the cabinet: the front shaded by the way it turns, the top face a step lighter
  if (J.S) {
    g.fill(...box, (px, py) => J.S.wall(px, py), R.wall, { shade: 0 });
    for (let y = Math.floor(box[1]); y <= box[3]; y++) for (let x = Math.floor(box[0]); x <= box[2]; x++) {
      if (!J.S.wall(x + 0.5, y + 0.5)) continue;
      const tn = J.S.shadeOf(x + 0.5, y + 0.5, { shade: d.rx > 7 ? 2 : 1, shadow: g.shadow });
      if (tn !== 'base') g.dot(x, y, R.wall[tn]);
    }
  } else g.fill(...box, J.body, R.wall, { shade: 2 });
  g.fill(...box, J.cap, { isRamp: true, light: R.top.light, base: R.top.base, dark: R.top.base }, { shade: 0, light: 1 });
  const onBody = (px, py) => J.body(px, py) && !J.cap(px, py);
  // the band of the accent colour round it, under the screen
  g.fill(...box, (px, py) => onBody(px, py) && Math.floor(py) === J.band, C.accent.base, { shade: 0 });
  g.fill(...box, (px, py) => onBody(px, py) && Math.floor(py) === J.band && !onBody(px - 2, py), C.accent.dark, { shade: 0 });
  // the screen: dark glass with the face lit on it
  g.rect(screen.x - 1, screen.y - 1, screen.w + 2, screen.h + 2, C.dark.base, { shade: 0 });
  g.rect(screen.x, screen.y, screen.w, screen.h, C.dark.dark, { shade: 0 });
  const tones = { hot: C.glow.light, off: C.dark.dark };
  for (const [x, y, w, h, tn] of faceMarks(opt.face ?? 'smile', P.face ?? 'rest', c0, screen.y, screen.w, screen.h, P.scan ?? 0)) g.rect(x, y, w, h, tn ? tones[tn] : C.glow.base, { shade: 0 });
  // the hatch: a door with a lintel in the accent colour, which slides up to open on the dark inside
  const open = Math.round(clamp(P.hatch ?? 0) * (hatch.h - 1));
  g.rect(hatch.x - 1, hatch.y - 1, hatch.w + 2, 1, C.accent.base, { shade: 0 });
  g.rect(hatch.x, hatch.y, hatch.w, hatch.h, C.dark.base, { shade: 0 });
  g.rect(hatch.x, hatch.y, hatch.w, 1, C.dark.dark, { shade: 0 });
  if (open > 0) g.rect(hatch.x, hatch.y + hatch.h - open, hatch.w, open, C.dark.dark, { shade: 0 });
  else g.rect(c0 - Math.floor((hatch.w + slot.w + 1) / 2) + Math.floor(hatch.w / 2) - 1, hatch.y + Math.floor(hatch.h / 2), 3, 1, C.metal.base, { shade: 0 });      // its handle
  // the coin slot: a bright plate with a slit, and a small light over it
  g.rect(slot.x, slot.y, slot.w, slot.h, C.metal, { shade: 0 });
  g.rect(slot.x + 1, slot.y + 1, 1, Math.max(1, slot.h - 2), C.dark.dark, { shade: 0 });
  g.rect(slot.x + 1, slot.y - 2 < J.band + 1 ? slot.y : slot.y - 1, 1, 1, C.goods.base);
  // the tray: it slides out of the hatch towards the camera, so more of its top shows the further out it is
  const out = Math.round(5 * d.k * clamp(P.tray ?? 0));
  if (out > 0) {
    const ty = hatch.y + hatch.h - 1, tx = hatch.x + 1, tw = hatch.w - 2;
    g.rect(tx, ty, tw, out, C.metal.light, { shade: 0 });
    g.rect(tx, ty + out, tw, 1, C.metal.dark, { shade: 0 });
    g.rect(tx, ty, 1, out, C.metal.base, { shade: 0 }); g.rect(tx + tw - 1, ty, 1, out, C.metal.base, { shade: 0 });
    if (P.goods && out >= 3) {
      const gx = tx + Math.floor(tw / 2) - 1, gy = ty + out - 3;
      g.rect(gx, gy, 3, 3, C.goods, { shade: 0 });
      g.rect(gx, gy, 3, 1, C.goods.light, { shade: 0 });
      g.rect(gx, gy + 2, 3, 1, C.goods.dark, { shade: 0 });
    }
  }
  if (hg) drawHeadgear(g, J, P, d, hg.kind, hg.size ?? 1, C);
  // the arms, or the bracket that carries what it holds when it has none
  const H = hands(J, P, d, opt);
  J.hand = { free: H.free, hold: H.hold };
  if (held && !opt.arms) g.line(J.shoulder.hold[0], J.shoulder.hold[1], H.hold[0], H.hold[1], C.dark.base);
  if (held) drawHeld(g, J, d, held.kind, held.size ?? 1, C, [J.mount[0], J.mount[1]]);
  if (opt.arms) {
    drawArm(g, J.shoulder.free, H.elbows.free, H.free, C, false);
    drawArm(g, J.shoulder.hold, H.elbows.hold, H.hold, C, !!held);
  }
  return J;
}

/**
 * Adds the lights of a kiosk robot; call it AFTER g.outline(): the jet under the nozzle, which always reaches down to the floor and flickers, and the sparkle on what lies on the tray. Light is never inked: it is rimmed with its own dark tone.
 * Arguments: g; J (what draw() returned); P (the pose); d (dims()); look { glow (the jet), core (its white-hot middle and the sparkle) }; opt { frame (a whole number that changes every frame: the flicker) }.
 */
export function lights(g, J, P, d, look = {}, opt = {}) {
  const glow = look.glow ?? '#5fe0f0', core = look.core ?? '#f0ead8', rim = tone(glow, -1), c0 = Math.floor(J.cx);
  const flick = Math.abs(Math.round(opt.frame ?? 0)) % 2, y0 = J.nozzle + 2, y1 = GROUND - 1 - flick;
  const put = (x, y, c) => { if (x >= 1 && y >= 1 && x <= SIZE[0] - 2 && y <= SIZE[1] - 2 && g.get(x, y) === 0) g.dot(x, y, c); };
  // the jet: widest and hottest at the nozzle, a point at the floor
  const n = Math.max(1, y1 - y0 + 1);
  for (let i = 0; i < n; i++) {
    const y = y0 + i, k = n === 1 ? 0 : i / (n - 1), w = k < 0.34 ? 2 : k < 0.75 ? 1 : 0;
    for (let x = -w; x <= w; x++) put(c0 + x, y, Math.abs(x) < w || w === 0 ? (k < 0.5 && w > 0 ? core : glow) : glow);
    put(c0 - w - 1, y, rim); put(c0 + w + 1, y, rim);
  }
  if (y1 + 1 < GROUND) put(c0, y1 + 1, rim);
  // the sparkle on the goods
  if (P.glint > 0 && P.tray > 0.5) {
    const out = Math.round(5 * d.k * clamp(P.tray)), gx = J.hatch.x + 1 + Math.floor((J.hatch.w - 2) / 2) + 1, gy = J.hatch.y + J.hatch.h - 1 + out - 3;
    const dot = (x, y, c) => { if (x >= 1 && y >= 1 && x <= SIZE[0] - 2 && y <= SIZE[1] - 2) g.dot(x, y, c); };
    for (let i = 1; i <= P.glint; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(gx + dx * i, gy + dy * i, i === 1 ? '#ffffff' : core);
    dot(gx, gy, '#ffffff');
  }
}

/**
 * Builds one frame of a kiosk robot, posed and fitted once, so the picture and the exported attach points cannot disagree.
 * Arguments: clip (a pose name, one of POSES); t (0..1); p (the sprite's values: size and bob are read from it); opt { shape: one of SHAPES, face: one of FACES, arms: true | false, headgear: { kind: one of HEADGEAR or 'none', size }, held: { kind: one of HELD or 'none', size }, frame (the frame number, for the flicker of the jet) }.
 * Returns F = { clip, action, d, P, draw(g, look) (paints it and returns the joints), finish(g, look) (the outline, then the lights), sockets() }; look is draw()'s and lights()'s: { body, accent, glow, metal, dark, goods, sign, core }.
 */
export function frame(clip, t, p = {}, opt = {}) {
  const d = dims(p, { shape: opt.shape }), P = pose(clip, t, { bob: p.bob });
  let J = null;
  return {
    clip, action: clip, d, P,
    sockets: () => sockets(solve(P, d, opt), P, d, opt),
    draw(g, look) { J = draw(g, P, d, look, opt); return J; },
    finish(g, look = {}) {
      g.outline(look.outline ?? INK);
      lights(g, J ?? solve(P, d, opt), P, d, look, { frame: opt.frame ?? Math.floor(t * 8 + 1e-6) });
      return g;
    },
  };
}

// HAND CHANGE (C3): engine/solids.js faceRamps as colour rules (the faceTone rule works it out per frame), for draw() above.
function faceRampsP(of) {
  const f = (face, tone) => ({ rule: 'faceTone', of, face, tone });
  return { wall: { isRamp: true, light: f('wall', 'light'), base: f('wall', 'base'), dark: f('wall', 'dark'), deep: f('wall', 'deep') }, top: { light: f('top', 'light'), base: f('top', 'base'), dark: f('top', 'dark') } };
}
