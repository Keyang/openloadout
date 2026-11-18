// Side-view two-legged character rig (faces right), on a 64x64 canvas.
//
//   dims(p)                  body measurements from the Height / Build / Head sliders
//   pose(clip, t, m, d)      where every joint target is for idle / walk / run / jump / attack / cast / hurt
//   solve(P, d)              joint positions in pixels (legs use IK so feet stay planted)
//   draw(g, P, d, look, hooks)   paints the body; hooks add hats, capes, weapons, robes
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

/**
 * Pose for a clip at phase t (0..1).
 * m: { bounce, stride } 0..1 — how lively and how long the steps are.
 * Angles: 0 = down, PI/2 = forward, PI = up. Foot x/y are relative to the
 * ground point under the hips (y negative = lifted).
 */
export function pose(clip, t, m = {}, d = dims()) {
  const bounce = m.bounce ?? 0.5, stride = m.stride ?? 0.5;
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
      P.armF.a = keys(t, [[0, 0.15], [0.28, 3.4], [0.42, 3.6], [0.57, 1.15], [0.72, 0.85], [1, 0.15]]);
      P.armF.e = keys(t, [[0, 0.25], [0.3, 0.7], [0.42, 0.8], [0.57, 0.1], [0.72, 0.1], [1, 0.25]]);
      P.item = keys(t, [[0, 2.5], [0.28, 4.3], [0.42, 4.6], [0.57, 1.5], [0.72, 1.0], [1, 2.5]]);
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

/**
 * White arc that follows a fast swing. Call AFTER g.outline() so it is not outlined.
 * poseAt(t) must return the pose; the trail spans the motion since t - span.
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
  if (sweep < 0.45) return;
  const r = (Math.hypot(t1[0] - sx, t1[1] - sy) + Math.hypot(t0[0] - sx, t0[1] - sy)) / 2;
  g.arc(sx, sy, r, a1 + 0.1, a1 + sweep, 2, colour);
  if (sweep > 1.2) g.arc(sx, sy, r - 3, a1 + 0.5, a1 + sweep * 0.7, 1, colour);
}

export { ramp, farRamp, mix, INK };
