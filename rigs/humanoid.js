// Side-view two-legged character rig (faces right), on a 64x64 canvas.
//
//   dims(p)                  body measurements from the Height / Build / Head sliders
//   pose(clip, t, m, d)      where every joint target is for idle / walk / run / jump / attack / punch / cast / hurt
//   solve(P, d)              joint positions in pixels (legs use IK so feet stay planted)
//   draw(g, P, d, look, hooks)   paints the body; hooks add hats, capes, weapons, robes
//   sockets(J, P, d)         named attach points for parts: hand, offhand, head, back, feet
//   heldItem(g, at, item)    a weapon drawn from an attach point and its own settings
//   fit(P, d, opt)           keeps a pose with a long weapon or tall headgear inside the frame
//
// A new character is usually ~100 lines: a look, a few hooks, and the shared clips.

import { lerp, clamp, wave, pulse, keys, ik2, smooth, reach, fract, TAU, PI } from '../engine/motion.js';
import { ramp, farRamp, mix, INK } from '../engine/color.js';

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
  };
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
    return { hip: h, knee: s.mid, ankle: s.end, lifted: f.y < -0.5 };
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
 * Angles use the rig convention (0 = down, PI/2 = forward, PI = up). A sprite built on this rig returns
 * these from its own sockets(clip, t, p) so they are exported with every frame.
 */
export function sockets(J, P, d) {
  const hx = Math.round(J.head[0] * 2) / 2, hy = Math.round(J.head[1] * 2) / 2;   // the head is drawn on the half-pixel grid
  return {
    hand: { x: J.armF.hand[0], y: J.armF.hand[1], angle: P.item },
    offhand: { x: J.armB.hand[0], y: J.armB.hand[1], angle: J.armB.angle },
    head: { x: hx, y: hy - d.headR * 0.95, angle: PI - P.lean - P.headTilt },
    back: { x: J.neck[0], y: J.neck[1] + 1, angle: -P.lean },
    feet: { x: CX + P.rootX, y: J.gy, angle: 0 },
  };
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
 * hooks (all optional, each receives (g, J, P, d)):
 *   behind – drawn first (capes, wings, tails)
 *   offhand – after the far arm (shields, lanterns)
 *   torso – after the body (belts, armour, robes)
 *   head – after hair (hats, helmets, horns); set look.hairStyle 'bald' to hide hair under a full helmet
 *   item – the thing in the front hand, drawn under the hand (weapons, staffs)
 *   front – drawn last
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
  g.ellipse(cx, cy, d.headR, d.headR * 0.95, skin);
  const ex = Math.floor(cx + d.headR * 0.42), ey = Math.floor(cy - 0.5);
  if (P.blink) { g.dot(ex, ey + 1, INK); g.dot(ex + 1, ey + 1, INK); }
  else { g.dot(ex, ey, INK); g.dot(ex, ey + 1, INK); if (d.headR >= 5.6) { g.dot(ex + 1, ey, INK); g.dot(ex + 1, ey + 1, INK); g.dot(ex + 1, ey, '#ffffff'); } }
  drawHair(g, J, P, d, look.hairStyle ?? 'short', hair);
  hooks.head?.(g, J, P, d);

  hooks.item?.(g, J, P, d);
  drawArm(g, J.armF, d, top, skin, look.bareArms);
  hooks.front?.(g, J, P, d);
  return J;
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

/** Kinds heldItem() can draw. */
export const ITEM_KINDS = ['sword', 'axe', 'spear', 'staff'];

/**
 * Standard sizes of the held items, in pixels, so every character's sword is the same sword:
 * length = hand to tip; back = how far it sticks out behind the hand; pad = how wide its head is.
 */
export const ITEMS = {
  sword: { length: 13, back: 1.5, pad: 1 },
  axe: { length: 12, back: 2, pad: 4 },
  spear: { length: 15, back: 4, pad: 1 },
  staff: { length: 18, back: 10, pad: 3 },
};

/** { length, back, pad } of a kind at a length setting (1 = standard), ready for fit() and heldItem(); null when nothing is held. */
export const itemSize = (kind, scale = 1) => (ITEMS[kind] ? { length: ITEMS[kind].length * scale, back: ITEMS[kind].back, pad: ITEMS[kind].pad } : null);

/** A "Hold angle" slider in degrees (positive = tipped forward) as the `hold` that pose() takes: forward is a smaller rig angle. */
export const holdAngle = (degrees) => (degrees ? -degrees * PI / 180 : 0);

/**
 * A held item drawn from an attach point and its own settings only, so the same item can go on any body.
 *   at:   { x, y, angle }, for example sockets(J, P, d).hand
 *   item: { kind: one of ITEM_KINDS, length, metal (a ramp), wood, hilt, orb, glow }
 */
export function heldItem(g, at, item) {
  const J = { armF: { hand: [at.x, at.y] } }, P = { item: at.angle };
  const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#c2c9d6');
  const wood = item.wood ?? '#8a5a34';
  if (item.kind === 'sword') sword(g, J, P, item.length, metal, item.hilt ?? '#e6c545');
  else if (item.kind === 'axe') axe(g, J, P, item.length, metal, wood);
  else if (item.kind === 'spear') spear(g, J, P, item.length, metal, wood);
  else if (item.kind === 'staff') staff(g, J, P, item.length, typeof wood === 'string' ? ramp(wood) : wood, item.orb ?? ramp('#4fd8ee'), item.glow ?? 0);
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
