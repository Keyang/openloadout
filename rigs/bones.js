// The bone renderer: draws a rig that is data (`loadout-rig`, docs/studio.md section 2.1; Contract 14; version 2:
// docs/data-sprites.md 2.2, Contract 15) as pixel art, by handing its shapes to the shape-list renderer
// (engine/draw-list.js), the one renderer every kind of data sprite ends in.
//
//   solveRig(rig, pose, opt)        where every bone and node is this frame: forward kinematics from data angles, two-bone IK
//   rigList(rig, J, pose, opt)      the frame's shapes as a draw list in frame coordinates, with its palette and what was left out
//   drawRig(g, rig, pose, opt)      solveRig + rigList + engine/draw-list.js drawList onto a Surface; returns the solved bones
//   renderRig(rig, pose, opt)       the same on a new Surface of the rig's frame size: { g, J }
//   rigFacing(rig, direction)       a top-down rig as seen from one direction: its overlay on bones, shapes and stamps applied
//   drawResolvedRig(g, resolved, pose, ctx), resolvedRigPoints(resolved, pose, ctx)
//                                   the same for a version 2 sprite as engine/resolve.js resolveSprite hands it over (B6)
//   rigPoints(rig, J)               attach points as Contract 3 sockets: { name: { x, y, angle } }
//   boneLines(J), drawBoneLines()   the skeleton, for the studio to draw over the picture
//   groundOf(rig)                   the ground row for the rig's frame size (style guide section 1)
//
// Angles in the data are degrees in the rig convention of engine/motion.js (0 = down, 90 = forward / picture-right,
// 180 = up). A root bone's angle is absolute; a child's is relative to its parent's direction. Lengths are frame px.
//
// A POSE is what the key blender (rigs/keypose.js) gives for one frame, after frame edits; every field is optional:
//   { root: [dx, dy], bones: { id: degrees }, ik: { chainId: [x, y] }, stretch: { id: 0.5..1.5 },
//     show: [shape ids], hide: [shape ids], swap: { stampId: variant | null }, nudge: [dx, dy], flash: true }
// `bones` replaces a bone's (or node's) rest angle (it is not added to it) and is clamped to its min / max. `show` and
// `hide` may be lists, Sets or objects of flags. `swap` picks a stamp's variant by name (keys step it; a frame edit
// sets it); null, or a name the stamp has not got, draws its rows. `nudge` is rounded to whole pixels and moves everything.
//
// IK. A target is measured, as rigs/humanoid.js holds feet, from the point on the ground under the chain's first joint
// in the rest pose (moved by the pose's root x and by nudge): [0, 0] stands the chain's end on the ground there,
// negative y lifts it. "On the ground" means its lowest pixels are on the row above the ground row, so the outline
// lands on the ground row (style guide 1): the end point sits half the end bone's limb width (or its capsule's end
// radius, else 1 px) above the ground. The two bones are solved with engine/motion.js ik2 exactly; joint limits do
// not apply to a chain that has a target, so a planted foot is never pulled off its spot. Ground row: opt.ground,
// else groundOf(rig).
//
// VERSION 2 (docs/data-sprites.md 2.2 and 2.7, build item B5). Every version 1 rig is a version 2 rig and draws byte
// for byte as before (tests/unit/bones-v2-v1.test.mjs holds it to a frozen copy of the version 1 renderer). Added:
//   - `nodes`: bones with no length (pivots for a lid, a floating eye). They hang from bones or nodes like bones, a pose
//     turns them by `bones`, and bones may hang from them; bones and nodes are solved parents first.
//   - every primitive of engine/draw-list.js on a bone or node (`on`, or version 1's `bone`), written in its frame (u
//     along the bone, v to its left): rect, line, arc, ring, stamp, dither, bands, text, and the operations outline,
//     tint and cut. A shape written as version 1 keeps version 1's meaning (a limb with no ends runs along its whole
//     bone; a capsule's from / to are shares of the bone; points of an ellipse, dot or poly move along it as it
//     stretches); other primitives' points stretch along the bone the same way and are placed by draw-list placeOn
//     with boneFrame: points turn with the bone, a rect, stamp or text is only moved. A stamp is never turned; its
//     variant comes from pose.swap, else from the direction overlay or its own `variant`; `mirror` as draw-list takes it.
//     A slider's shape scale grows version 1 kinds as before and arc and ring radii; rects, lines, stamps and text keep
//     their size.
//   - generator calls ({ gen, v }) and pieces (`kind: "use"`) on bones are expanded through opt.expand, the caller's
//     hook (engine/resolve.js expandFrame bound to the resolved sprite): each call alone, in its place in the list, its
//     output keeping the call's id, bone and z. Without a hook they are left out and reported. (This module does not
//     import the resolver: engine/resolve.js -> catalog/sprite-schema.js -> catalog/studio-schema.js imports this file.)
//   - `when` and `clip` left on a shape after resolving (they name only clip and direction) are decided by opt.clip and
//     opt.direction; any other condition is the resolver's and taken as holding here.
//   - top-down overlays (rigFacing): bones (and nodes) angle, at, length, from; shapes z, far, hidden, shade, light and
//     each kind's own geometry; stamps at, variant, hidden, mirror.
//   - Order and operations as engine/draw-list.js has them: shapes paint in z order (list order breaking ties) between
//     operations, each operation acts on what is drawn before it, glow comes last. The rig gets one outline (INK, or
//     opt.outline) at the end, as version 1 does, unless its own list has an outline of everything (no `only`); a flash
//     is a white tint just before that last outline. Paints are palette slots (rig `colours` with opt.colours, and
//     opt.palette, engine/resolve.js's resolved palette, over them), slot tones ('skin.dark'), 'ink' or '#rrggbb' in a
//     version 2 rig; a version 1 rig paints only with its own slots, as before. A rig counts as version 2 when it says
//     so, has nodes, a base, `on`, a generator call or a new kind; a version 2 sprite's rig (drawResolvedRig) always
//     does, even when it uses only version 1 kinds on `bone`.
//   - Caps: a version 2 frame's whole list, after every expansion and with the flash and outline added here, is at
//     most RIG_V2_LIMITS.shapes (engine/draw-list.js's cap, so the outline is never the one cut): its own primitives
//     stop two short of it, and no more generator calls are expanded once it is full. Shapes past a cap are reported
//     in skipped, never dropped in silence.
//
// HOW IT STAYS PIXEL ART (docs/studio.md section 4). Nothing is a turned bitmap: every frame redraws every shape as a
// shape test sampled at pixel centres (engine/draw-list.js, as Surface.fill). Limb widths are whole pixels and their
// ends are snapped as g.limb snaps them. Each bone's start is rounded to the half-pixel grid before its shapes are
// placed. Shapes with the same `group` and `z` are painted as one body (one shade band in screen space, so the light
// stays top-right at every angle). Dots and stamps (eyes, teeth) are moved to their rounded point, never turned. One
// outline after all body shapes; glow shapes after it, flat, rimmed with a darker tone of their own colour where they
// meet air. Colours come from colour slots: ramp() for near shapes, farRamp() for `far`, flat for slots marked `detail`.
//
// Data is trusted only as far as this: the renderer never throws on a missing reference (a bone whose parent is
// unknown or comes later, a shape on a missing bone or slot, a chain that is not parent and child is left out), caps
// every count at the Contract 14 limits (version 2 rigs: RIG_V2_LIMITS) and ignores numbers that are not finite.
// Validating and cleaning a definition is catalog/studio-schema.js's and catalog/sprite-schema.js's job. Pure: no
// randomness, no clock, no DOM; runs the same in the browser and in Node.

import { Surface } from '../engine/surface.js';
import { INK } from '../engine/color.js';
import { ik2 } from '../engine/motion.js';
import { drawList, boneFrame, placeOn, DRAW_LIST_KINDS, DRAW_LIST_OPS, DRAW_LIST_LIMITS } from '../engine/draw-list.js';

const RAD = Math.PI / 180;
const CAP = { bones: 48, shapes: 160, poly: 24, ik: 8, points: 16, depth: 16 };

/** The counts the renderer draws at most (Contract 14 rule 6): bones, shapes, poly points, IK chains, attach points, depth. */
export const BONE_LIMITS = Object.freeze({ ...CAP });

const LIM2 = { nodes: 64, shapes: DRAW_LIST_LIMITS.primitives, poly: DRAW_LIST_LIMITS.polyPoints, calls: 64, radius: 320, colours: 8 };

/** The counts a version 2 rig is drawn with at most (docs/data-sprites.md 2.7): bones and nodes, shapes, poly points, generator calls a frame, a radius (px), rig colours. */
export const RIG_V2_LIMITS = Object.freeze({ ...LIM2 });

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const half = (v) => Math.round(v * 2) / 2;
const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
const pair = (v) => (Array.isArray(v) && v.length >= 2 ? [num(v[0], 0), num(v[1], 0)] : [0, 0]);
const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
/** A list, a Set or an object of flags, as a Set of ids. */
const idSet = (v) => {
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v);
  if (v && typeof v === 'object') return new Set(Object.keys(v).filter((k) => v[k]));
  return new Set();
};
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const V1_KINDS = new Set(['limb', 'capsule', 'ellipse', 'poly', 'dot']);
const OPS = new Set(DRAW_LIST_OPS);
const V2_KINDS = new Set([...DRAW_LIST_KINDS, ...DRAW_LIST_OPS, 'use', 'gen']);
/** The bone (or node) a shape is on: version 2's `on`, else version 1's `bone`. */
const boneOf = (s) => (s.on !== undefined ? s.on : s.bone);
/** A solved bone or node by id, only the rig's own (never a prototype key such as 'constructor'), else undefined. */
const boneIn = (J, id) => (id !== undefined && id !== null && isObj(J?.bones) && Object.hasOwn(J.bones, id) ? J.bones[id] : undefined);
/**
 * Whether a rig uses anything of version 2 (then the version 2 caps apply and every paint ref draws); a rig that does
 * not is drawn exactly as version 1 drew it.
 */
function isV2(rig) {
  if (!isObj(rig)) return false;
  if (rig.version === 2 || rig.nodes !== undefined || rig.extends !== undefined) return true;
  const shapes = Array.isArray(rig.shapes) ? rig.shapes : [];
  for (let i = 0; i < shapes.length && i < LIM2.shapes; i++) {
    const s = shapes[i];
    if (isObj(s) && (s.on !== undefined || s.gen !== undefined || (typeof s.kind === 'string' && !V1_KINDS.has(s.kind) && V2_KINDS.has(s.kind)))) return true;
  }
  return false;
}
/**
 * The bones to solve, in order: a version 1 rig's bones as listed (one whose parent comes later is left out, as
 * always); with nodes, bones and nodes together (nodes of length 0), parents first, at most RIG_V2_LIMITS.nodes.
 */
function bonesOf(rig, v2) {
  if (!v2 || !Array.isArray(rig.nodes)) return list(rig.bones, v2 ? LIM2.nodes : CAP.bones);
  let rest = [...list(rig.bones, LIM2.nodes), ...list(rig.nodes, LIM2.nodes).map((n) => (isObj(n) ? { ...n, length: 0 } : n))]
    .filter((b) => isObj(b) && typeof b.id === 'string').slice(0, LIM2.nodes);
  const out = [], placed = new Set();
  for (let moved = true; rest.length && moved;) {
    moved = false;
    const next = [];
    for (const b of rest) {
      if (b.parent === null || b.parent === undefined || placed.has(b.parent)) { if (!placed.has(b.id)) { out.push(b); placed.add(b.id); } moved = true; }
      else next.push(b);
    }
    rest = next;
  }
  return out;
}
/** The unit vector along a rig angle (radians) and the one to its left as you look along it. */
const axes = (a) => { const s = clean(Math.sin(a)), c = clean(Math.cos(a)); return { d: [s, c], n: [c, -s] }; };
/** Rig angle (radians) of the direction from p to q. */
const angleTo = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]);

// ---- the ground -------------------------------------------------------------------------------------------------

/** Ground rows (pivot y) of the style guide's frame sizes for things that stand (section 1, "Frame sizes"). */
export const GROUND_ROWS = Object.freeze({ '16x16': 14, '32x32': 28, '32x48': 46, '32x64': 62, '48x48': 42, '64x48': 43, '64x64': 58, '64x80': 76, '96x96': 90, '128x96': 90 });

/** The ground row of a rig: the style guide's pivot y for its frame size, or h - h / 8 for a size the guide does not list. Arguments: rig (anything with `size: [w, h]`). */
export function groundOf(rig) {
  const [w, h] = pair(rig?.size);
  const row = GROUND_ROWS[`${w}x${h}`];
  if (row !== undefined) return row;
  return Math.max(1, Math.round(h - Math.max(2, h / 8)));
}

// ---- solving -----------------------------------------------------------------------------------------------------

/** How far above the ground a chain's end point stands so its lowest pixels are on the row above the ground row. */
function footRise(rig, boneId, shapeScale) {
  let r = 0;
  for (const s of list(rig.shapes, isV2(rig) ? LIM2.shapes : CAP.shapes)) {
    if (!s || boneOf(s) !== boneId) continue;
    const k = clamp(num(shapeScale[s.id], 1), 0.1, 4);
    if (s.kind === 'limb') r = Math.max(r, Math.max(1, Math.round(num(s.width, 1) * k)) / 2);
    else if (s.kind === 'capsule' && num(s.to, 1) >= 0.999) r = Math.max(r, num(Array.isArray(s.r) ? s.r[1] : undefined, 0) * k);
  }
  return r || 1;
}

/** Forward kinematics, with IK overrides when `targets` holds { chainId: [x, y] } in frame px. */
function forward(rig, pose, opt, targets) {
  const out = {}, order = [];
  const [ox, oy] = opt._offset;
  const scaleB = opt.scale?.bones ?? {};
  const stretch = pose.stretch ?? {};
  const set = pose.bones ?? {};
  const chains = new Map();
  const bones = bonesOf(rig, isV2(rig));
  if (targets) {
    const byId = new Map(bones.filter(Boolean).map((b) => [b.id, b]));
    for (const c of list(rig.ik, CAP.ik)) {
      const t = targets[c?.id];
      if (!t || !Array.isArray(c.bones)) continue;
      const lower = byId.get(c.bones[1]);
      if (!byId.has(c.bones[0]) || !lower || lower.parent !== c.bones[0]) continue;
      chains.set(c.bones[0], { chain: c, lower, target: t });
    }
  }
  const forced = new Map();    // bone id -> absolute angle set by a solved chain
  for (const b of bones) {
    if (!b || typeof b.id !== 'string' || out[b.id]) continue;
    const base = Math.max(0, num(b.length, 0));
    const k = clamp(num(scaleB[b.id], 1), 0.1, 4) * clamp(num(stretch[b.id], 1), 0.5, 1.5);
    const length = base * k;
    let deg = num(set[b.id], num(b.angle, 0));
    const rest = num(b.angle, 0);           // limits are measured from the rest angle (the newt's tail rests at 180, limits -45..45)
    if (Number.isFinite(b.min) && deg < rest + b.min) deg = rest + b.min;
    if (Number.isFinite(b.max) && deg > rest + b.max) deg = rest + b.max;
    let start, parentAngle = 0, depth = 0;
    if (b.parent === null || b.parent === undefined) {
      const at = pair(b.at);
      start = [at[0] + ox, at[1] + oy];
    } else {
      const P = out[b.parent];
      if (!P || P.depth + 1 >= CAP.depth) continue;
      const f = clamp(num(b.from, 1), 0, 1);
      const { d } = axes(P.angle);
      start = [P.start[0] + d[0] * P.length * f, P.start[1] + d[1] * P.length * f];
      parentAngle = P.angle;
      depth = P.depth + 1;
    }
    let angle = forced.has(b.id) ? forced.get(b.id) : parentAngle + deg * RAD;
    const ch = chains.get(b.id);
    if (ch) {
      const lk = clamp(num(scaleB[ch.lower.id], 1), 0.1, 4) * clamp(num(stretch[ch.lower.id], 1), 0.5, 1.5);
      const l1 = length * clamp(num(ch.lower.from, 1), 0, 1), l2 = Math.max(0, num(ch.lower.length, 0)) * lk;
      if (l1 > 0 && l2 > 0) {
        const s = ik2(start[0], start[1], ch.target[0], ch.target[1], l1, l2, ch.chain.bend === -1 ? -1 : 1);
        angle = angleTo(start, s.mid);
        forced.set(ch.lower.id, angleTo(s.mid, s.end));
      }
    }
    if (forced.has(b.id) || ch) deg = (angle - parentAngle) / RAD;
    const { d } = axes(angle);
    out[b.id] = { id: b.id, parent: b.parent ?? null, start, end: [start[0] + d[0] * length, start[1] + d[1] * length], angle, deg, length, k, depth };
    order.push(b.id);
  }
  return { bones: out, order };
}

/**
 * Where every bone (and node: a bone of length 0) is for one pose: { bones: { id: { start, end, angle, deg, length, k } }, order, ground, feet, offset }.
 * start / end are frame px; angle is the bone's absolute direction in radians (rig convention); deg is its angle relative
 * to its parent in degrees after limits and IK; k is how much it is stretched (shapes' along-the-bone positions scale by it).
 * Arguments: rig (a loadout-rig), pose (see the header; default the rest pose), opt { ground (row), scale: { bones: { id: k } } }.
 */
export function solveRig(rig, pose = {}, opt = {}) {
  pose = pose ?? {};
  const ground = num(opt.ground, groundOf(rig));
  const root = pair(pose.root), nudge = pair(pose.nudge).map(Math.round);
  const offset = [root[0] + nudge[0], root[1] + nudge[1]];
  let targets = null;
  const ik = pose.ik ?? {};
  if (Object.keys(ik).length) {
    const rest = forward(rig, {}, { ...opt, _offset: [0, 0] }, null).bones;
    targets = {};
    const shapeScale = opt.scale?.shapes ?? {};
    for (const c of list(rig.ik, CAP.ik)) {
      if (!c || !Array.isArray(ik[c.id]) || !Array.isArray(c.bones)) continue;
      const hip = rest[c.bones[0]];
      if (!hip) continue;
      const [tx, ty] = pair(ik[c.id]);
      targets[c.id] = [hip.start[0] + root[0] + nudge[0] + tx, ground - footRise(rig, c.bones[1], shapeScale) + nudge[1] + ty];
    }
  }
  const J = forward(rig, pose, { ...opt, _offset: offset }, targets);
  const firstRoot = list(rig.bones, CAP.bones).find((b) => b && (b.parent === null || b.parent === undefined));
  const rx = firstRoot ? pair(firstRoot.at)[0] : pair(rig.size)[0] / 2;
  return { ...J, ground, offset, feet: [rx + root[0] + nudge[0], ground + nudge[1]] };
}

/**
 * Attach points for one solved pose as Contract 3 sockets: { id: { x, y, angle } }, frame px, angle in radians (rig
 * convention). A point on a bone or node (`on`, or version 1's `bone`) sits at [u, v] in its frame (u along it, scaled with its stretch; v to its left)
 * and points along the bone turned by its own `angle` (degrees); `{ id: 'feet', ground: true }` is the ground under the root.
 * Arguments: rig (a loadout-rig), J (from solveRig).
 */
export function rigPoints(rig, J) {
  const out = {};
  for (const p of list(rig.points, CAP.points)) {
    if (!p || typeof p.id !== 'string') continue;
    if (p.ground) { out[p.id] = { x: J.feet[0], y: J.feet[1], angle: 0 }; continue; }
    const B = boneIn(J, boneOf(p));
    if (!B) continue;
    const [u, v] = pair(p.at);
    const { d, n } = axes(B.angle);
    out[p.id] = { x: B.start[0] + u * B.k * d[0] + v * n[0], y: B.start[1] + u * B.k * d[1] + v * n[1], angle: B.angle + num(p.angle, 0) * RAD };
  }
  return out;
}

// ---- shapes: the frame's draw list -------------------------------------------------------------------------------

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const pt = (v) => (Array.isArray(v) && v.length >= 2 && fin(v[0]) && fin(v[1]) ? [v[0], v[1]] : null);
const scaleR = (r, k) => (k === 1 ? r : fin(r) ? r * k : Array.isArray(r) ? r.map((v) => (fin(v) ? v * k : v)) : r);
// What a shape of the rig says about where and when it is drawn, which the draw list has no use for.
const RIG_ONLY = new Set(['on', 'bone', 'when', 'clip', 'hidden', 'part', 'variant']);
/** A primitive's fields for the draw list: the shape's own (none of RIG_ONLY) with `over` on top, z clamped. Built, never deleted from (objects stay fast). */
function primOf(s, over, v2, z) {
  const p = {};
  if (v2) { for (const k in s) if (Object.hasOwn(s, k) && !RIG_ONLY.has(k) && !Object.hasOwn(over, k)) p[k] = s[k]; }
  else for (const k of ['id', 'paint', 'group', 'glow', 'far', 'shade', 'light']) if (s[k] !== undefined) p[k] = s[k];
  for (const k in over) p[k] = over[k];
  p.z = z;
  return p;
}
/** The points of a primitive written in a bone's frame with their u (along the bone) stretched by uk: { at, from, to, points } (those it has). */
function stretched(p, uk) {
  const out = {};
  if (uk === 1) return out;
  const u = (q) => { const x = pt(q); return x ? [x[0] * uk, x[1]] : q; };
  for (const f of ['at', 'from', 'to']) if (Object.hasOwn(p, f)) out[f] = u(p[f]);
  if (Array.isArray(p.points)) out.points = p.points.map(u);
  return out;
}

/**
 * The geometry of one shape in its bone's frame as the draw-list primitive it stands for, not yet placed (draw-list
 * placeOn places it): the fields to put over the shape's own, or null when it cannot be drawn. A version 1 kind keeps
 * version 1's meaning and arithmetic exactly (so the pixels are those rigs/bones.js drew before B5); the rest stretch
 * along the bone. k: the slider's scale of this shape.
 */
function localShape(s, B, k, v2) {
  const L = B.length, uk = B.k, rmax = v2 ? LIM2.radius : 32;
  switch (s.kind) {
    case 'limb': {
      const w = Math.max(1, Math.round(num(s.width, 1) * k));
      if (v2 && pt(s.from) && pt(s.to)) return { ...stretched(s, uk), width: w };
      return { kind: 'limb', from: [0, 0], to: [L, 0], width: w };
    }
    case 'capsule': {
      if (v2 && pt(s.from) && pt(s.to)) return { ...stretched(s, uk), r: scaleR(s.r, k) };
      const r = Array.isArray(s.r) ? s.r : v2 && fin(s.r) ? [s.r] : [];
      const r0 = clamp(num(r[0], 1), 0, rmax) * k, r1 = clamp(num(r[1], num(r[0], 1)), 0, rmax) * k;
      const off = num(s.offset, 0);
      return { kind: 'capsule', from: [clamp(num(s.from, 0), 0, 1) * L, off], to: [clamp(num(s.to, 1), 0, 1) * L, off], r: [r0, r1] };
    }
    case 'ellipse': {
      const [u, v] = pair(s.at), r = Array.isArray(s.r) ? s.r : v2 && fin(s.r) ? [s.r] : [];
      return { kind: 'ellipse', at: [u * uk, v], r: [clamp(num(r[0], 1), 0.01, rmax) * k, clamp(num(r[1], num(r[0], 1)), 0.01, rmax) * k] };
    }
    case 'poly': {
      let pts = list(s.points, v2 ? LIM2.poly : CAP.poly).map((p) => pair(p)).map(([u, v]) => [u * uk, v]);
      if (pts.length < 3) return null;
      if (k !== 1) {
        const cu = pts.reduce((a, p) => a + p[0], 0) / pts.length, cv = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        pts = pts.map(([u, v]) => [cu + (u - cu) * k, cv + (v - cv) * k]);
      }
      return { kind: 'poly', points: pts };
    }
    case 'dot': {
      const [u, v] = pair(s.at);
      return { kind: 'dot', at: [u * uk, v], size: num(s.size, 1) >= 2 ? 2 : 1 };
    }
    case 'arc': case 'ring': return k === 1 ? stretched(s, uk) : { ...stretched(s, uk), r: scaleR(s.r, k) };
    case 'dither': case 'bands': case 'cut': {
      const f = s.kind === 'cut' ? 'shape' : 'area';
      if (!isObj(s[f])) return null;
      const inner = localShape(s[f], B, k, true);
      return inner ? { ...stretched(s, uk), [f]: primOf(s[f], inner, true, clamp(num(s[f].z, 0), -100, 100)) } : null;
    }
    default: return stretched(s, uk);
  }
}

/** The palette of a frame: the rig's colour slots (version 1: with opt.colours) and opt.palette (engine/resolve.js's resolved palette) over them, as { slot: { hex, detail } }. */
function paletteOf(rig, opt) {
  const out = {};
  for (const c of list(rig.colours, LIM2.colours)) if (c && typeof c.id === 'string' && !BAD_KEYS.has(c.id)) out[c.id] = { hex: opt.colours?.[c.id] ?? c.default, detail: !!c.detail };
  if (isObj(opt.palette)) {
    for (const [id, s] of Object.entries(opt.palette)) {
      if (BAD_KEYS.has(id)) continue;
      if (typeof s === 'string') out[id] = { hex: s, detail: false };
      else if (isObj(s) && typeof s.hex === 'string') out[id] = { hex: s.hex, detail: s.detail === true };
    }
  }
  return out;
}

/** A clip / direction condition at a scene: every alternative's clip and direction must hold; other conditions are the resolver's (taken as holding). */
function sceneHolds(when, scene) {
  if (when === undefined) return true;
  const alts = Array.isArray(when) ? when : [when];
  return alts.some((alt) => isObj(alt) && Object.keys(alt).every((k) => (k !== 'clip' && k !== 'direction') || (Array.isArray(alt[k]) ? alt[k] : [alt[k]]).some((x) => x === scene[k])));
}

const str = (v) => (typeof v === 'string' ? v : null);

/**
 * A version 1 kind (as localShape gives its geometry) or a stamp placed in its bone's frame F, built in one object: the
 * same numbers draw-list placeOn gives (its arithmetic: at + u * F.u + v * F.v; an ellipse turned by F.turnRad), for the
 * fields the pixel renderer reads. Most of a rig's shapes take this way, so a frame's list costs little.
 * A dot in a group is part of its body, shaded with it, also as the group's only member (version 1's meaning; draw-list
 * paints a lone dot flat): it is handed over as a rect of its pixel. A lone dot is its slot's colour, flat: never `far`.
 */
function placedFast(s, local, F, z, v2, swap) {
  const m = (p) => [F.at[0] + p[0] * F.u[0] + p[1] * F.v[0], F.at[1] + p[0] * F.u[1] + p[1] * F.v[1]];
  const kind = local.kind ?? s.kind;
  const o = { kind, id: s.id, paint: s.paint, z, group: s.group, glow: s.glow, far: s.far, shade: s.shade, light: s.light };
  switch (kind) {
    case 'limb': o.from = m(local.from); o.to = m(local.to); o.width = local.width; break;
    case 'capsule': o.from = m(local.from); o.to = m(local.to); o.r = local.r; break;
    case 'ellipse': {
      o.at = m(local.at); o.r = local.r;
      const t = v2 && fin(s.turn) ? s.turn * RAD : 0;
      o.turnRad = t === 0 ? F.turnRad : F.turnRad + (F.det < 0 ? -t : t);
      break;
    }
    case 'poly': o.points = local.points.map(m); break;
    case 'dot': {
      const a = m(local.at), n = local.size;
      if (s.group && typeof s.group === 'string') {
        o.kind = 'rect';
        o.at = [n === 1 ? Math.floor(a[0]) : Math.round(a[0]) - 1, n === 1 ? Math.floor(a[1]) : Math.round(a[1]) - 1];
        o.size = [n, n];
      } else { o.at = a; o.size = n; o.far = undefined; }
      break;
    }
    case 'stamp': {
      const a = pt(local.at ?? s.at);
      o.at = a ? m(a) : s.at;
      o.rows = s.rows; o.key = s.key; o.variants = s.variants; o.anchor = s.anchor; o.mirror = s.mirror;
      const v = swap && typeof s.id === 'string' && Object.hasOwn(swap, s.id) ? swap[s.id] : s.variant;
      if (typeof v === 'string') o.variant = v;
      break;
    }
    default: break;
  }
  return o;
}
const TINT = Object.freeze({ kind: 'tint', paint: '#ffffff' });

/**
 * The shapes of a rig for one solved pose as an engine/draw-list.js draw list in frame coordinates: shapes left out
 * that the pose hides, parts that are off, clip or direction conditions that fail; stamps given their variant (pose
 * swap); generator calls and pieces expanded through opt.expand; each placed on its bone (draw-list boneFrame +
 * placeOn); then the white flash and the outline (see VERSION 2 in the header). Never throws.
 * Returns { list, palette ({ slot: { hex, detail } }, for drawList), skipped ([{ index, id, kind, why }]: shapes left out
 * that should have drawn), errors (what opt.expand reported), sources ([{ index, id }] per list entry: the shape it came
 * from, index -1 for the flash and the outline) }.
 * Arguments: rig, J (from solveRig), pose (see the header), opt { colours, palette, partsOff, scale: { shapes }, outline,
 * flash (as drawRig), clip, direction (decide `when` and `clip` left on shapes), expand ((list, ctx) -> { ok,
 * primitives, palette, errors }: engine/resolve.js expandFrame bound to the resolved sprite), frame ({ t, frame,
 * frames, loop, size }: what a generator sees besides clip and direction) }.
 */
export function rigList(rig, J, pose = {}, opt = {}) {
  pose = pose ?? {};
  opt = opt ?? {};
  const v2 = isV2(rig);
  const palette = paletteOf(rig ?? {}, opt);
  const shown = idSet(pose.show), hidden = idSet(pose.hide), off = idSet(opt.partsOff);
  const swap = isObj(pose.swap) ? pose.swap : null;
  const scaleS = opt.scale?.shapes ?? {};
  const scene = { clip: str(opt.clip), direction: str(opt.direction) };
  const out = [], sources = [], skipped = [], errors = [];
  const skip = (s, index, why) => { if (skipped.length < 200) skipped.push({ index, id: typeof s?.id === 'string' ? s.id : null, kind: typeof s?.kind === 'string' ? s.kind : s?.gen !== undefined ? 'gen' : null, why }); };
  let calls = 0, fctx = null, over = 0, overCalls = 0, overAt = -1;
  // a version 2 frame's own primitives stop two short of draw-list's cap, so the flash and the outline always fit
  const room = v2 ? LIM2.shapes - 2 : CAP.shapes;
  /** Whether the frame's list is full: then the shape (or `n` primitives of it) is counted as left out. */
  const full = (i, n = 1) => { if (out.length < room) return false; if (overAt < 0) overAt = i; over += n; return true; };
  const frameCtx = () => {
    if (fctx) return fctx;
    fctx = isObj(opt.frame) ? { ...opt.frame } : {};
    if (scene.clip !== null) fctx.clip = scene.clip;
    if (scene.direction !== null) fctx.direction = scene.direction;
    if (fctx.size === undefined && Array.isArray(rig?.size)) fctx.size = [...rig.size];
    return fctx;
  };

  const frames = new Map();
  /** The frame of a solved bone (draw-list boneFrame), once per bone a frame. */
  const frameOf = (on, B) => { let F = frames.get(on); if (!F) { F = boneFrame(B.start, B.angle); frames.set(on, F); } return F; };

  /** One concrete primitive of the rig (or of an expansion) placed on its bone and added. */
  const place = (s, i) => {
    if (full(i)) return;
    const op = OPS.has(s.kind);
    const on = boneOf(s);
    if (op && on === undefined) { out.push(primOf(s, {}, true, clamp(num(s.z, 0), -100, 100))); sources.push({ index: i, id: s.id ?? null }); return; }
    const B = boneIn(J, on);
    if (!B) { skip(s, i, on === undefined ? 'it names no bone or node (on)' : `its bone ${JSON.stringify(String(on).slice(0, 40))} is not in the rig`); return; }
    if (!v2) {
      const slot = typeof s.paint === 'string' && Object.hasOwn(palette, s.paint) ? palette[s.paint] : null;
      if (!slot || typeof slot.hex !== 'string') { skip(s, i, `its paint ${JSON.stringify(String(s.paint).slice(0, 40))} is not a colour slot of the rig`); return; }
    }
    const k = clamp(num(scaleS[s.id], 1), 0.1, 4);
    const local = localShape(s, B, k, v2);
    if (!local) { skip(s, i, `a ${s.kind} that cannot be drawn (too few points, or no area)`); return; }
    const z = clamp(num(s.z, 0), -100, 100), F = frameOf(on, B);
    if (local.kind !== undefined || s.kind === 'stamp') { out.push(placedFast(s, local, F, z, v2, swap)); sources.push({ index: i, id: typeof s.id === 'string' ? s.id : null }); return; }
    out.push(placeOn(primOf(s, local, v2, z), F));
    sources.push({ index: i, id: typeof s.id === 'string' ? s.id : null });
  };

  const cap = v2 ? LIM2.shapes : CAP.shapes;
  const given = Array.isArray(rig?.shapes) ? rig.shapes.length : 0;
  if (given > cap) skip(null, cap, `the rig has ${given} shapes; a rig draws at most ${cap} shapes, so ${given - cap} more are left out`);
  list(rig?.shapes, cap).forEach((s, i) => {
    if (!isObj(s)) return;
    const op = OPS.has(s.kind);
    if (!op && typeof s.id !== 'string') return;
    const id = typeof s.id === 'string' ? s.id : null;
    if ((id !== null && hidden.has(id)) || (s.hidden && !(id !== null && shown.has(id))) || (s.part && off.has(s.part))) return;
    if (!sceneHolds(s.when, scene)) return;
    if (Array.isArray(s.clip) && !s.clip.includes(scene.clip)) return;
    if (s.gen !== undefined || s.kind === 'use' || s.kind === 'gen') {
      if (typeof opt.expand !== 'function') { skip(s, i, 'a generator call or piece must be expanded first: pass opt.expand (engine/resolve.js expandFrame)'); return; }
      if (++calls > LIM2.calls) { skip(s, i, `a frame expands at most ${LIM2.calls} generator calls and pieces`); return; }
      if (out.length >= room) { if (overAt < 0) overAt = i; overCalls++; return; }
      const call = { ...s };
      for (const f of ['when', 'clip', 'hidden']) delete call[f];
      let r;
      try { r = opt.expand([call], frameCtx()); } catch (e) { r = { ok: false, errors: [String(e?.message ?? e)] }; }
      if (!isObj(r) || r.ok !== true || !Array.isArray(r.primitives)) {
        const why = Array.isArray(r?.errors) && r.errors.length ? r.errors.map((e) => String(e).slice(0, 300)) : ['it could not be expanded'];
        for (const e of why) if (errors.length < 50) errors.push(`${id ?? s.gen ?? s.use}: ${e}`);
        return;
      }
      if (isObj(r.palette)) for (const [pid, slot] of Object.entries(paletteOf({}, { palette: r.palette }))) if (!Object.hasOwn(palette, pid)) palette[pid] = slot;
      const prims = r.primitives;
      for (let k = 0; k < prims.length; k++) {
        if (full(i, prims.length - k)) break;
        const q = prims[k];
        if (!isObj(q)) continue;
        const p = { ...q };
        if (id !== null) p.id = id;
        if (boneOf(p) === undefined && boneOf(s) !== undefined) p.on = boneOf(s);
        place(p, i);
      }
      return;
    }
    place(s, i);
  });

  if (over || overCalls) {
    skipped.push({ index: overAt, id: null, kind: null, why: `a frame draws at most ${LIM2.shapes} primitives after expansion (with the flash and outline), so ${over} more${overCalls ? ` and ${overCalls} generator calls and pieces` : ''} are left out` });
  }
  const flash = !!(pose.flash || opt.flash);
  let last = -1;
  for (let j = 0; j < out.length; j++) if (out[j].kind === 'outline' && out[j].only === undefined) last = j;
  if (last >= 0) {
    if (flash) { out.splice(last, 0, { ...TINT }); sources.splice(last, 0, { index: -1, id: null }); }
  } else {
    if (flash) { out.push({ ...TINT }); sources.push({ index: -1, id: null }); }
    if (opt.outline !== false && opt.outline !== null) { out.push({ kind: 'outline', paint: typeof opt.outline === 'string' ? opt.outline : 'ink' }); sources.push({ index: -1, id: null }); }
  }
  return { list: out, palette, skipped, errors, sources };
}
/** Draw-list's report of what it left out, said about the rig's shapes (rigList's sources). */
const skippedOf = (r, d) => d.skipped.map((x) => ({ index: r.sources[x.index]?.index ?? -1, id: r.sources[x.index]?.id ?? null, kind: x.kind, why: x.why }));

/**
 * Paints a bone rig onto a Surface for one pose and returns the solved bones J (see solveRig): solveRig, then rigList,
 * then engine/draw-list.js drawList (body shapes in z order between operations, same group and z as one blob, then
 * `flash` (white), then the outline, then glow shapes, flat, rimmed in their own darker tone where they meet air).
 * Arguments: g (a Surface), rig (a loadout-rig, version 1 or 2), pose (see the header), opt { colours: { slot:
 * '#rrggbb' } (default each slot's default), palette (version 2: { slot: { hex, detail } }, over the rig's colours),
 * partsOff (part names whose shapes are left out), scale: { bones: { id: k }, shapes: { id: k } } (what a slider
 * scales: a bone's length, a shape's size; limb widths stay whole pixels), ground (row), outline (a colour or paint
 * ref, or false for none; default INK), flash (as pose.flash), direction (a top-down rig is drawn with that
 * direction's overlay, rigFacing; and `when` / `clip` left on shapes are decided by it and by clip), clip, expand,
 * frame (as rigList takes them) }.
 */
export function drawRig(g, rig, pose = {}, opt = {}) {
  pose = pose ?? {};
  opt = opt ?? {};
  const view = typeof opt.direction === 'string' && isObj(rig?.directions) ? rigFacing(rig, opt.direction) : rig;
  const J = solveRig(view, pose, opt);
  const r = rigList(view, J, pose, opt);
  drawList(g, r.list, { palette: r.palette });
  return J;
}

/** A new Surface of the rig's frame size with the rig drawn on it for one pose: { g, J }. Arguments: rig, pose, opt (as drawRig). */
export function renderRig(rig, pose = {}, opt = {}) {
  const [w, h] = pair(rig?.size);
  const g = new Surface(clamp(Math.round(w) || 48, 1, 256), clamp(Math.round(h) || 48, 1, 256));
  const J = drawRig(g, rig, pose, opt);
  return { g, J };
}

// ---- top-down directions ----------------------------------------------------------------------------------------------

/** The directions a top-down rig is seen from (Contract 2: one clip per direction; side faces right, games mirror it). */
const FACINGS = ['down', 'up', 'side'];
const DIR_BONE = ['angle', 'at', 'length', 'from'];
const DIR_SHAPE = ['z', 'far', 'hidden', 'shade', 'light'];
const DIR_KIND = { limb: ['width'], capsule: ['from', 'to', 'r', 'offset'], ellipse: ['at', 'r'], poly: ['points'], dot: ['at', 'size'], rect: ['at', 'size'], line: ['from', 'to'], arc: ['at', 'r'], ring: ['at', 'r'] };
const DIR_STAMP = ['at', 'variant', 'hidden', 'mirror'];
const FACED = new WeakMap();
const frozen = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) frozen(x); } return v; };

/**
 * A top-down rig as seen from one direction: a copy of the rig with that direction's overlay applied (bones and nodes
 * re-posed and re-proportioned; shapes re-ordered, shown or hidden, re-shaped; stamps moved, swapped to a variant,
 * hidden or mirrored) and no `directions` field. Any other rig, or a direction with no overlay, comes back as a plain
 * copy. For a version 1 rig it is catalog/studio-schema.js directionRig exactly. A frozen rig's views are kept, frozen
 * (they are the same every frame). Arguments: rig (a loadout-rig, cleaned or resolved), direction ('down', 'up' or 'side').
 */
export function rigFacing(rig, direction) {
  const keep = isObj(rig) && Object.isFrozen(rig) && typeof direction === 'string';
  if (keep) { const c = FACED.get(rig)?.get(direction); if (c) return c; }
  const out = JSON.parse(JSON.stringify(rig ?? {}));
  const over = isObj(out.directions) && FACINGS.includes(direction) && Object.hasOwn(out.directions, direction) ? out.directions[direction] : null;
  delete out.directions;
  if (isObj(over)) {
    const patch = (items, changes, allowed) => {
      if (!Array.isArray(items) || !isObj(changes)) return;
      for (const item of items) {
        const c = item && Object.hasOwn(changes, item.id) ? changes[item.id] : null;
        if (!isObj(c)) continue;
        for (const k of allowed(item)) if (Object.hasOwn(c, k)) item[k] = c[k];
      }
    };
    patch(out.bones, over.bones, () => DIR_BONE);
    patch(out.nodes, over.bones, () => DIR_BONE);
    patch(out.shapes, over.shapes, (s) => [...DIR_SHAPE, ...(Object.hasOwn(DIR_KIND, s.kind) ? DIR_KIND[s.kind] : [])]);
    patch(out.shapes, over.stamps, (s) => (s.kind === 'stamp' ? DIR_STAMP : []));
  }
  if (keep) {
    if (!FACED.has(rig)) FACED.set(rig, new Map());
    FACED.get(rig).set(direction, frozen(out));
  }
  return out;
}

// ---- a version 2 sprite as engine/resolve.js hands it over --------------------------------------------------------------

const DIR_CLIP = /^(.+)_(down|up|side)$/;
const POINTS = new WeakMap();

/** The rig and drawing options of a resolved rig sprite for one frame's clip and direction, or { error }. */
function setupResolved(resolved, ctx) {
  if (!isObj(resolved) || resolved.ok !== true || !isObj(resolved.body) || resolved.body.kind !== 'rig' || !isObj(resolved.body.rig)) {
    return { error: 'not a resolved rig sprite: give engine/resolve.js resolveSprite\'s result for a definition whose body is a rig' };
  }
  const c = isObj(ctx) ? ctx : {};
  let rig = resolved.body.rig;
  // a version 2 sprite's rig is drawn as version 2 even when it uses only version 1 kinds on `bone` (every paint ref,
  // the version 2 caps); it takes its frame size and its attach points from the sprite (the sprite's `points` win by id)
  const lift = resolved.version === 2 && rig.version !== 2;
  if (lift || (!Array.isArray(rig.size) && Array.isArray(resolved.size)) || Array.isArray(resolved.points)) {
    let cached = POINTS.get(rig);
    if (!cached) {
      cached = { ...rig };
      if (lift) cached.version = 2;
      if (!Array.isArray(rig.size) && Array.isArray(resolved.size)) cached.size = [...resolved.size];
      if (Array.isArray(resolved.points)) {
        const mine = new Set(resolved.points.filter(isObj).map((p) => p.id));
        cached.points = [...list(rig.points, CAP.points).filter((p) => !(isObj(p) && mine.has(p.id))), ...resolved.points];
      }
      if (Object.isFrozen(rig)) { Object.freeze(cached); POINTS.set(rig, cached); }
    }
    rig = cached;
  }
  const clip = str(c.clip);
  const topDown = rig.view === 'top-down' || (!rig.view && resolved.meta?.view === 'top-down');
  const direction = str(c.direction) ?? (topDown ? (DIR_CLIP.exec(String(clip))?.[2] ?? 'down') : null);
  if (direction !== null && isObj(rig.directions)) rig = rigFacing(rig, direction);
  const frame = { size: Array.isArray(resolved.size) ? [...resolved.size] : pair(rig.size) };
  for (const k of ['t', 'frame', 'frames', 'loop']) if (c[k] !== undefined) frame[k] = c[k];
  const opt = { palette: resolved.palette ?? {}, scale: resolved.scales ?? {}, clip, direction, frame };
  if (typeof c.expand === 'function') opt.expand = c.expand;
  for (const k of ['outline', 'flash', 'ground', 'partsOff']) if (c[k] !== undefined) opt[k] = c[k];
  return { rig, opt };
}

/**
 * Draws one frame of a version 2 rig sprite (or a version 1 one) as engine/resolve.js resolveSprite gives it (body.rig
 * with its base merged and its pieces drawn in, palette, scales; parts that are off are already gone) onto a Surface:
 * the rig as seen from the frame's direction (ctx.direction, else for a top-down rig the clip name's `_down`, `_up`,
 * `_side`, else down), solved for the pose, its list built (rigList) and drawn (engine/draw-list.js). Never throws.
 * Returns { J (the solved bones, null when nothing was drawn), drawn (primitives painted), skipped ([{ index, id,
 * kind, why }]), errors }. The entry point of engine/data-sprite.js (B6) for rig bodies.
 * Arguments: g (a Surface of the sprite's size), resolved (resolveSprite's result), pose (rigs/keypose.js's pose of the
 * frame with its frame edits: nudge, flash, show, hide, swap), ctx { clip, direction, t, frame, frames, loop (what a
 * generator sees), expand ((list, ctx) -> expandFrame(resolved, list, ctx): runs generator calls and placed pieces),
 * outline, flash, ground (as drawRig) }.
 */
export function drawResolvedRig(g, resolved, pose = {}, ctx = {}) {
  try {
    const S = setupResolved(resolved, ctx);
    if (S.error) return { J: null, drawn: 0, skipped: [], errors: [S.error] };
    const J = solveRig(S.rig, pose ?? {}, S.opt);
    const r = rigList(S.rig, J, pose ?? {}, S.opt);
    const d = drawList(g, r.list, { palette: r.palette });
    return { J, drawn: d.drawn, skipped: [...r.skipped, ...skippedOf(r, d)], errors: r.errors };
  } catch (e) {
    return { J: null, drawn: 0, skipped: [], errors: [`the rig could not be drawn: ${String(e?.message ?? e).slice(0, 300)}`] };
  }
}

/**
 * One frame of a resolved rig sprite as the draw list drawResolvedRig draws (for a caller that bakes or inspects it,
 * such as engine/data-sprite.js's frame lists): the same rig (direction overlay, the sprite's size and points, a
 * version 2 sprite's rig drawn as version 2) solved and listed. Never throws.
 * Returns rigList's { list, palette, skipped, errors, sources } and J, or { error } for what is not a resolved rig sprite.
 * Arguments: resolved, pose, ctx (as drawResolvedRig).
 */
export function resolvedRigList(resolved, pose = {}, ctx = {}) {
  try {
    const S = setupResolved(resolved, ctx);
    if (S.error) return { error: S.error };
    const J = solveRig(S.rig, pose ?? {}, S.opt);
    return { J, ...rigList(S.rig, J, pose ?? {}, S.opt) };
  } catch (e) {
    return { error: `the rig could not be listed: ${String(e?.message ?? e).slice(0, 300)}` };
  }
}

/**
 * The attach points of a resolved rig sprite for one frame as Contract 3 sockets (rigPoints): the rig's points (a
 * base's included) and the sprite's own `points`, on the rig as seen from the frame's direction. {} for anything that
 * is not a resolved rig sprite. Never throws. Arguments: resolved, pose, ctx (as drawResolvedRig).
 */
export function resolvedRigPoints(resolved, pose = {}, ctx = {}) {
  try {
    const S = setupResolved(resolved, ctx);
    if (S.error) return {};
    return rigPoints(S.rig, solveRig(S.rig, pose ?? {}, S.opt));
  } catch {
    return {};
  }
}

// ---- the skeleton, for the studio -------------------------------------------------------------------------------

/** The solved bones as line segments in painting order: [{ id, parent, a: [x, y], b: [x, y] }] (frame px). Arguments: J (from solveRig). */
export function boneLines(J) {
  return J.order.map((id) => { const B = J.bones[id]; return { id, parent: B.parent, a: B.start, b: B.end }; });
}

/**
 * Draws the skeleton over a picture: a 1 px line per bone and a dot on each joint, on a Surface that may be the frame
 * enlarged `scale` times (the studio's zoomed stage). Returns the Surface.
 * Arguments: g (a Surface), J (from solveRig), options { scale (default 1), colour (the lines, default '#ffffff'), joint (the joint dots, default INK), only (a bone id: draw just that bone, for a selection) }.
 */
export function drawBoneLines(g, J, { scale = 1, colour = '#ffffff', joint = INK, only } = {}) {
  const s = num(scale, 1);
  for (const L of boneLines(J)) {
    if (only && L.id !== only) continue;
    g.line(L.a[0] * s, L.a[1] * s, L.b[0] * s, L.b[1] * s, colour);
  }
  for (const L of boneLines(J)) {
    if (only && L.id !== only) continue;
    g.dot(L.a[0] * s, L.a[1] * s, joint);
  }
  return g;
}
