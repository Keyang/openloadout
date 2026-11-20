// PORT (migration batch C2): the drawing of sprites/thorn-beetle.js, word for word (its build and frame functions, the
// horns, sockets() and render()), on the side-view crawler rig's copy (engine/gen/ports/c2/crawler.js), with its imports
// pointed at the port shims. What the code sprite said besides its drawing is in sprites/thorn-beetle.json; this is
// what bug.beetle@1 (engine/gen/creatures.js) runs on a paint-ref grid. The swatch lists of the code file are left out
// (the data file lists the swatches). Pure; Node and browser.
import { lerp, clamp, PI } from '../../../motion.js';
import { ramp, farRamp, mix, INK } from './colour.js';
import { ellipseIn, polyIn } from '../surface.js';
import { hornIn, hornPath, creatureEye, feelerIn } from '../e2/creature.js';
import { PALETTE } from '../e2/palettes.js';
import * as C from './crawler.js';

const T = PALETTE.thornwood;
const HORNS = { stag: { reach: 6.5, rise: 7 }, rhino: { reach: 4, rise: 7.5 } };      // how far each sticks out in front of and above its root, at Length 1

/** Everything about the beetle's shape that follows from the controls, in pixels. */
function build(p) {
  const k = lerp(0.86, 1.08, p.size);
  const len = 22 * k, h = lerp(9.5, 14.5, p.shell) * k;
  const horn = HORNS[p.horns], hornLen = horn ? p.hornLength * k : 0;
  const head = 4 * k;                                   // how far the head shows in front of the neck shield
  const thorn = lerp(2.6, 3.4, p.size);
  const feel = 4.6 + 1.6 * k;                           // the length of the near feeler
  const front = len / 2 + Math.max(head + (horn ? horn.reach * hornLen : 0), head * 0.75 + feel), back = len / 2 + 0.5;
  // the whole silhouette is centred on the pivot, with room in front for the jab
  const cx = Math.round(Math.min(C.CX - (front - back) / 2, C.SIZE[0] - 6 - front));
  const d = C.dims({ length: len, height: h, legs: lerp(2.4, 5.6, p.legs) * lerp(0.92, 1.08, p.size), pairs: 3, cx });
  return { d, k, len, h, head, thorn, feel, front, back, horn, hornLen, thorns: Math.round(lerp(2, 6, p.spikes)), full: lerp(0.15, 0.5, p.shell) };
}

/** The pose and the solved body for one frame: shared by render() and sockets(), so the horns follow the head. */
function frameOf(clip, t, p) {
  const B = build(p), { d } = B;
  const P = C.pose(clip, t, { bounce: p.bounce }, d);
  P.lift += B.thorn * 0.7 * clamp(P.roll / PI);           // on its back it rests on its thorns, not in the ground
  const tuckedIn = 1 - 0.75 * P.hide;                     // a drawn-in head takes most of the horn under the shell with it
  C.fit(P, d, {
    front: d.len / 2 + C.headShift(P, d) + Math.max(B.head + (B.horn ? B.horn.reach * B.hornLen * tuckedIn : 0), B.head * 0.75 + (B.feel + 1) * (1 - P.hide)),
    back: B.back + 1,
    top: d.h / 2 + Math.max(B.thorn + 1, B.horn ? B.horn.rise * B.hornLen * tuckedIn - d.h * 0.2 : 0),
  });
  // the wing case, written round the middle of the body: curled up, it draws in and humps up
  const L = d.len / 2;
  const S = { x0: -L * (1 - 0.12 * P.round), x1: L + 0.8, base: d.h / 2 - 0.6, top: (d.h - 0.6) * (1 + 0.18 * P.round), dome: { peak: 0.44, full: B.full } };
  const on = (u) => C.domePoint(S.x0, S.x1, S.base, S.top, u, S.dome);
  // thorns along the back, leaning backward: where each stands, and its tip. They stand out further when it is curled up
  const tl = B.thorn * (1 + 0.45 * P.round), thorns = [];
  for (let i = 0; i < B.thorns; i++) {
    const q = on(lerp(0.1, 0.7, (i + 0.5) / B.thorns)), tx = -q.ny, ty = q.nx;      // (tx, ty): along the surface, toward the front
    thorns.push({ q, tx, ty, tip: [q.x + q.nx * tl - tx * 1.1, q.y + q.ny * tl - ty * 1.1] });
  }
  let J = C.solve(P, d);
  // turned over, nothing is pushed into the ground: the lowest thorn tip or bit of shell rests on it
  if (P.roll > 0) {
    let low = -Infinity;
    for (const th of thorns) low = Math.max(low, J.at(th.tip[0], th.tip[1])[1] - 0.8);        // the last pixel of a thorn is too thin to be drawn
    for (const u of [0.02, 0.1, 0.2, 0.3, 0.44, 0.6, 0.75, 0.9, 0.98]) { const q = on(u); low = Math.max(low, J.at(q.x, q.y)[1]); }
    if (low > J.gy - 0.05) { P.lift += low - (J.gy - 0.05); J = C.solve(P, d); }
  }
  // the horns sit on the front of the head, above the eye
  const root = [d.len / 2 + B.head * 0.55, d.h / 2 - 4.4 * B.k];
  return { B, P, J, S, on, thorns, root, tuckedIn, socket: C.sockets(J, P, d, { head: root }).head };
}

/** The horns part, drawn from its attach point (where, and which way the head faces) and its own settings. */
function drawHorns(g, at, { kind, length, paint }) {
  if (kind === 'stag') {
    // a forked antler: it rises forward from the head and splits into two tines
    const o = { curl: 0.5, width: 2.6, tip: 1.2, steps: 4 }, a = at.angle + 0.5, len = 8.4 * length;
    const fork = hornPath(at.x, at.y, a, len, o)[2];
    g.blob([hornIn(at.x, at.y, a, len, o), hornIn(fork[0], fork[1], a - 0.75, 4.2 * length, { width: 2, tip: 1, steps: 2 })], paint);
  } else if (kind === 'rhino') {
    // one thick horn that sweeps up from the nose and curls back
    g.blob([hornIn(at.x, at.y, at.angle + 0.75, 7.6 * length, { curl: 0.85, width: 3.8, tip: 1 })], paint);
  }
}

// the head socket: where the horns attach, and the way the head faces
/** The beetle's attach point for one frame (the code sprite's sockets(), word for word): head. Arguments: clip, t, p. */
export function sockets(clip, t, p) {
  return { head: frameOf(clip, t, p).socket };
}

/** The code sprite's render(), word for word. Arguments: g (a paint-ref grid), { clip, t, p }. */
export function render(g, { clip, t, p }) {
  const { B, P, J, S, on, thorns, tuckedIn, socket } = frameOf(clip, t, p);
  const { d, k } = B, L = d.len / 2;
  const shell = ramp(p.body), soft = ramp(p.accent), softFar = farRamp(p.accent);
  const put = (tests, paint, opt) => g.blob([C.place(J, tests)], paint, opt);
  const shift = C.headShift(P, d);
  const over = P.roll > PI / 2;                           // turned over: the wing case is underneath

  C.drawLegs(g, J, d, 'far', softFar);

  // head: a small lump low at the front, most of it under the neck shield
  const hx = L + B.head * 0.3 + shift, hy = d.h / 2 - 3 * k;
  const headIn = ellipseIn(hx, hy, B.head * 0.85, 3 * k);
  if (B.horn && tuckedIn > 0.3) drawHorns(g, socket, { kind: p.horns, length: B.hornLen * tuckedIn, paint: ramp(mix(p.accent, T.cream, 0.6)) });
  put([headIn], soft);
  // underside, then the near legs over it
  put([ellipseIn(-L * 0.06, d.h / 2 - 2, L * 0.86, 2.4)], softFar, { shade: 0 });
  C.drawLegs(g, J, d, 'near', soft);

  // the shell: one glossy dome from tail to neck, with a groove where the neck shield meets the wing case. The gloss
  // is the light from the top right, so the engine's highlight band is only asked for while the dome faces up
  const domeIn = C.domeIn(S.x0, S.x1, S.base, S.top, S.dome), shellIn = C.place(J, [domeIn]);
  put([domeIn], shell, { shade: 2, light: over ? 0 : 1 });
  const neck = on(0.74);
  for (let v = 0.12; v < 0.9; v += 0.06) {
    const gp = J.at(neck.x + 1.6 * Math.sin(v * PI), lerp(neck.y + 1.5, S.base - 1, v));
    if (shellIn(Math.floor(gp[0]) + 0.5, Math.floor(gp[1]) + 0.5)) g.dot(gp[0], gp[1], shell.dark);      // only on the shell itself
  }
  // the shine: a short bright streak on the lit side of the shell, which is the top right of the picture. Upright that is
  // high on the dome, in front of its peak; on its back it is the tail end of the wing case, just under the rim; while it
  // tumbles there is none
  const inset = (q, by) => J.at(q.x - q.nx * by, q.y - q.ny * by);
  const streak = P.roll < 0.6 ? [inset(on(0.5), 2.4), inset(on(0.64), 2.4)] : P.roll > 2.9 ? [J.at(S.x0 + 2.4, S.base - S.top * 0.34), J.at(S.x0 + 2.4, S.base - S.top * 0.1)] : null;
  if (streak) {
    const [a, b] = streak;
    g.line(a[0], a[1], b[0], b[1], shell.light);
    g.dot(b[0], b[1], '#ffffff');
  }

  const pale = ramp(mix(p.body, T.cream, 0.62));
  for (const { q, tx, ty, tip } of thorns) {
    const foot = [q.x - q.nx * 0.9, q.y - q.ny * 0.9];
    put([polyIn([[foot[0] - tx * 1.8, foot[1] - ty * 1.8], [foot[0] + tx * 1.8, foot[1] + ty * 1.8], tip])], pale, { clip: (px, py) => py < J.gy });      // on its back it rests on them
  }

  // eye: on the head, in front of the shell
  const eye = J.at(hx + B.head * 0.3, hy - 0.4 * k), seen = P.hide < 0.4;
  const look = { style: p.eyes, blink: P.blink, body: p.accent, brow: soft.deep, glow: T.gold, within: C.place(J, [headIn, domeIn]) };
  if (seen && p.eyes !== 'glow') creatureEye(g, eye[0], eye[1], look);

  if (P.flash) g.tint('#ffffff');
  g.outline(INK);

  // feelers: two hair-thin lines from the face, under the horns, that reach out in front, trail the body as it walks
  // and are drawn in with the head. They are as thin as the outline and take its colour, so they are drawn after it
  const out = 1 - P.hide;
  if (out > 0.3) {
    const at = [hx + B.head * 0.62, hy - 0.2 * k], lag = 0.3 * P.sway;
    put([feelerIn(at[0], at[1], PI / 2 + 0.7 - lag, B.feel * 1.1 * out, { curl: -1.5 }), feelerIn(at[0] - 0.5, at[1] + 1, PI / 2 - 0.15 - lag, B.feel * 0.7 * out, { curl: -0.9 })], INK);
  }

  // a glowing eye is light: drawn after the outline, with a darker rim of its own colour on the head round it
  if (seen && p.eyes === 'glow' && !P.flash) creatureEye(g, eye[0], eye[1], look);
}
