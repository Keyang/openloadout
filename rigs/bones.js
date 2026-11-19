// The bone renderer: draws a rig that is data (`loadout-rig`, docs/studio.md section 2.1; Contract 14) as pixel art.
//
//   solveRig(rig, pose, opt)        where every bone is this frame: forward kinematics from data angles, two-bone IK
//   drawRig(g, rig, pose, opt)      paints the shapes on the bones onto a Surface, outlines once, glow after
//   renderRig(rig, pose, opt)       the same on a new Surface of the rig's frame size: { g, J }
//   rigPoints(rig, J)               attach points as Contract 3 sockets: { name: { x, y, angle } }
//   boneLines(J), drawBoneLines()   the skeleton, for the studio to draw over the picture
//   groundOf(rig)                   the ground row for the rig's frame size (style guide section 1)
//
// Angles in the data are degrees in the rig convention of engine/motion.js (0 = down, 90 = forward / picture-right,
// 180 = up). A root bone's angle is absolute; a child's is relative to its parent's direction. Lengths are frame px.
//
// A POSE is what the key blender (rigs/keypose.js) gives for one frame, after frame edits; every field is optional:
//   { root: [dx, dy], bones: { id: degrees }, ik: { chainId: [x, y] }, stretch: { id: 0.5..1.5 },
//     show: [shape ids], hide: [shape ids], nudge: [dx, dy], flash: true }
// `bones` replaces a bone's rest angle (it is not added to it) and is clamped to the bone's min / max. `show` and
// `hide` may be lists, Sets or objects of flags. `nudge` is rounded to whole pixels and moves everything.
//
// IK. A target is measured, as rigs/humanoid.js holds feet, from the point on the ground under the chain's first joint
// in the rest pose (moved by the pose's root x and by nudge): [0, 0] stands the chain's end on the ground there,
// negative y lifts it. "On the ground" means its lowest pixels are on the row above the ground row, so the outline
// lands on the ground row (style guide 1): the end point sits half the end bone's limb width (or its capsule's end
// radius, else 1 px) above the ground. The two bones are solved with engine/motion.js ik2 exactly; joint limits do
// not apply to a chain that has a target, so a planted foot is never pulled off its spot. Ground row: opt.ground,
// else groundOf(rig).
//
// HOW IT STAYS PIXEL ART (docs/studio.md section 4). Nothing is a turned bitmap: every frame redraws every shape as a
// shape test sampled at pixel centres by Surface.fill. Limb widths are whole pixels and their ends are snapped as
// g.limb snaps them. Each bone's start is rounded to the half-pixel grid before its shapes are placed. Shapes with the
// same `group` and `z` are painted as one body (one shade band in screen space, so the light stays top-right at every
// angle). Dots (eyes, teeth) are moved to their rounded point, never turned. One outline after all body shapes; glow
// shapes after it, flat, rimmed with a darker tone of their own colour where they meet air. Colours come from
// colour slots: ramp() for near shapes, farRamp() for `far`, flat for slots marked `detail`.
//
// Data is trusted only as far as this: the renderer never throws on a missing reference (a bone whose parent is
// unknown or comes later, a shape on a missing bone or slot, a chain that is not parent and child is left out), caps
// every count at the Contract 14 limits and ignores numbers that are not finite. Validating and cleaning a definition
// is catalog/studio-schema.js's job. Pure: no randomness, no clock, no DOM; runs the same in the browser and in Node.

import { Surface, capsuleIn, ellipseIn, rectIn } from '../engine/surface.js';
import { placedIn } from '../engine/shapes.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';
import { ik2 } from '../engine/motion.js';

const RAD = Math.PI / 180;
const CAP = { bones: 48, shapes: 160, poly: 24, ik: 8, points: 16, depth: 16 };

/** The counts the renderer draws at most (Contract 14 rule 6): bones, shapes, poly points, IK chains, attach points, depth. */
export const BONE_LIMITS = Object.freeze({ ...CAP });

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
  for (const s of list(rig.shapes, CAP.shapes)) {
    if (!s || s.bone !== boneId) continue;
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
  if (targets) {
    const byId = new Map(list(rig.bones, CAP.bones).filter(Boolean).map((b) => [b.id, b]));
    for (const c of list(rig.ik, CAP.ik)) {
      const t = targets[c?.id];
      if (!t || !Array.isArray(c.bones)) continue;
      const lower = byId.get(c.bones[1]);
      if (!byId.has(c.bones[0]) || !lower || lower.parent !== c.bones[0]) continue;
      chains.set(c.bones[0], { chain: c, lower, target: t });
    }
  }
  const forced = new Map();    // bone id -> absolute angle set by a solved chain
  for (const b of list(rig.bones, CAP.bones)) {
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
 * Where every bone is for one pose: { bones: { id: { start, end, angle, deg, length, k } }, order, ground, feet, offset }.
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
 * convention). A point on a bone sits at [u, v] in the bone's frame (u along it, scaled with its stretch; v to its left)
 * and points along the bone turned by its own `angle` (degrees); `{ id: 'feet', ground: true }` is the ground under the root.
 * Arguments: rig (a loadout-rig), J (from solveRig).
 */
export function rigPoints(rig, J) {
  const out = {};
  for (const p of list(rig.points, CAP.points)) {
    if (!p || typeof p.id !== 'string') continue;
    if (p.ground) { out[p.id] = { x: J.feet[0], y: J.feet[1], angle: 0 }; continue; }
    const B = J.bones[p.bone];
    if (!B) continue;
    const [u, v] = pair(p.at);
    const { d, n } = axes(B.angle);
    out[p.id] = { x: B.start[0] + u * B.k * d[0] + v * n[0], y: B.start[1] + u * B.k * d[1] + v * n[1], angle: B.angle + num(p.angle, 0) * RAD };
  }
  return out;
}

// ---- shapes --------------------------------------------------------------------------------------------------------

/** One shape as { test, box } (a shape test and the box it can touch) or { dot: [x, y, size] }, placed on its solved bone. */
function placeShape(s, B, k) {
  const O = [half(B.start[0]), half(B.start[1])];
  const { d, n } = axes(B.angle);
  const L = B.length, uk = B.k;
  const W = (u, v) => [O[0] + u * d[0] + v * n[0], O[1] + u * d[1] + v * n[1]];
  switch (s.kind) {
    case 'limb': {
      const w = Math.max(1, Math.round(num(s.width, 1) * k));
      const snap = w % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
      const e = W(L, 0);
      const a = [snap(O[0]), snap(O[1])], b = [snap(e[0]), snap(e[1])], r = w / 2;
      return { test: capsuleIn(a[0], a[1], b[0], b[1], r, r), box: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r] };
    }
    case 'capsule': {
      const r = Array.isArray(s.r) ? s.r : [];
      const r0 = clamp(num(r[0], 1), 0, 32) * k, r1 = clamp(num(r[1], num(r[0], 1)), 0, 32) * k;
      const off = num(s.offset, 0);
      const a = W(clamp(num(s.from, 0), 0, 1) * L, off), b = W(clamp(num(s.to, 1), 0, 1) * L, off), R = Math.max(r0, r1);
      return { test: capsuleIn(a[0], a[1], b[0], b[1], r0, r1), box: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R] };
    }
    case 'ellipse': {
      const [u, v] = pair(s.at), r = Array.isArray(s.r) ? s.r : [];
      const rx = clamp(num(r[0], 1), 0.01, 32) * k, ry = clamp(num(r[1], num(r[0], 1)), 0.01, 32) * k;
      const c = W(u * uk, v), R = Math.max(rx, ry);
      return { test: placedIn(ellipseIn(0, 0, rx, ry), c[0], c[1], { angle: Math.PI / 2 - B.angle }), box: [c[0] - R, c[1] - R, c[0] + R, c[1] + R] };
    }
    case 'poly': {
      let pts = list(s.points, CAP.poly).map((p) => pair(p)).map(([u, v]) => [u * uk, v]);
      if (pts.length < 3) return null;
      if (k !== 1) {
        const cu = pts.reduce((a, p) => a + p[0], 0) / pts.length, cv = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        pts = pts.map(([u, v]) => [cu + (u - cu) * k, cv + (v - cv) * k]);
      }
      const P = pts.map(([u, v]) => W(u, v));
      const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
      return { test: polyTest(P), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    }
    case 'dot': {
      const [u, v] = pair(s.at);
      const p = W(u * uk, v), size = num(s.size, 1) >= 2 ? 2 : 1;
      const x = size === 1 ? Math.floor(p[0]) : Math.round(p[0]) - 1, y = size === 1 ? Math.floor(p[1]) : Math.round(p[1]) - 1;
      return { dot: [x, y, size], test: rectIn(x, y, size, size), box: [x, y, x + size, y + size] };
    }
    default: return null;
  }
}

/**
 * The same test as surface.js polyIn, with the same arithmetic (so the same pixels), on flat number arrays: polyIn reads
 * each corner with array destructuring, which made a polygon cost about ten times more per pixel in Node 24.
 */
function polyTest(pts) {
  const n = pts.length, X = new Float64Array(n), Y = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = pts[i][0]; Y[i] = pts[i][1]; }
  return (px, py) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = X[i], yi = Y[i], xj = X[j], yj = Y[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
}

/** A shape test that answers false outside its box without asking the shape: groups and rims test many shapes per pixel. */
const guarded = (f, [x0, y0, x1, y1]) => (px, py) => px >= x0 && px <= x1 && py >= y0 && py <= y1 && f(px, py);
const anyOf = (tests) => (tests.length === 1 ? tests[0] : (px, py) => { for (let i = 0; i < tests.length; i++) if (tests[i](px, py)) return true; return false; });
/** Which pixel centres of a w x h frame any of the placed shapes covers, worked out from the shapes (never read back from a Surface). */
function coverage(items, w, h) {
  const mask = new Uint8Array(w * h);
  for (const it of items) {
    const x0 = Math.max(0, Math.floor(it.box[0])), y0 = Math.max(0, Math.floor(it.box[1]));
    const x1 = Math.min(w - 1, Math.ceil(it.box[2])), y1 = Math.min(h - 1, Math.ceil(it.box[3]));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!mask[y * w + x] && it.test(x + 0.5, y + 0.5)) mask[y * w + x] = 1;
  }
  return (px, py) => { const x = Math.floor(px), y = Math.floor(py); return x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1; };
}
const boxOf = (items) => items.reduce((a, it) => [Math.min(a[0], it.box[0]), Math.min(a[1], it.box[1]), Math.max(a[2], it.box[2]), Math.max(a[3], it.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);

/** The shapes to paint this frame, placed and in painting order (z, then list order), each with its colour and options. */
function placedShapes(rig, J, pose, opt) {
  const slots = {};
  for (const c of list(rig.colours, 8)) if (c && typeof c.id === 'string') slots[c.id] = { hex: opt.colours?.[c.id] ?? c.default, detail: !!c.detail };
  const shown = idSet(pose.show), hidden = idSet(pose.hide), off = idSet(opt.partsOff);
  const scaleS = opt.scale?.shapes ?? {};
  const out = [];
  list(rig.shapes, CAP.shapes).forEach((s, i) => {
    if (!s || typeof s.id !== 'string') return;
    const B = J.bones[s.bone], slot = slots[s.paint];
    if (!B || !slot || typeof slot.hex !== 'string') return;
    if (hidden.has(s.id) || (s.hidden && !shown.has(s.id)) || (s.part && off.has(s.part))) return;
    const placed = placeShape(s, B, clamp(num(scaleS[s.id], 1), 0.1, 4));
    if (!placed) return;
    placed.test = guarded(placed.test, placed.box);
    out.push({ ...placed, s, i, z: clamp(num(s.z, 0), -100, 100), slot });
  });
  return out.sort((a, b) => a.z - b.z || a.i - b.i);
}

/** Paint a list of placed shapes, merging those with the same group and z into one body. */
function paintAll(g, items, paintOf, extra) {
  const done = new Set();
  for (const it of items) {
    if (it.dot && !it.s.group) { extra?.(it, [it]); g.rect(it.dot[0], it.dot[1], it.dot[2], it.dot[2], it.slot.hex, { shade: 0 }); continue; }
    const key = it.s.group ? `${it.z}\u0000${it.s.group}` : null;
    if (key && done.has(key)) continue;
    const members = key ? items.filter((o) => o.s.group === it.s.group && o.z === it.z) : [it];
    if (key) done.add(key);
    const test = anyOf(members.map((m) => m.test));
    extra?.(it, members, test, boxOf(members));
    // One body: every pixel is decided by the joined test alone, so filling it over each member's own box gives exactly
    // the pixels of one fill over the whole group, without testing the empty space between far-apart members.
    const paint = paintOf(it), o = { shade: it.slot.detail ? 0 : clamp(num(it.s.shade, 1), 0, 3), light: it.slot.detail ? 0 : clamp(num(it.s.light, 0), 0, 2) };
    for (const m of members) g.fill(m.box[0], m.box[1], m.box[2], m.box[3], test, paint, o);
  }
}

/**
 * Paints a bone rig onto a Surface for one pose and returns the solved bones J (see solveRig). Body shapes in z order
 * (same group and z as one blob), then `flash` (white), then the outline, then glow shapes, flat, rimmed in their own
 * darker tone where they meet air.
 * Arguments: g (a Surface), rig (a loadout-rig), pose (see the header), opt { colours: { slot: '#rrggbb' } (default each
 * slot's default), partsOff (part names whose shapes are left out), scale: { bones: { id: k }, shapes: { id: k } } (what a
 * slider scales: a bone's length, a shape's size; limb widths stay whole pixels), ground (row), outline (a colour, or
 * false for none; default INK), flash (as pose.flash) }.
 */
export function drawRig(g, rig, pose = {}, opt = {}) {
  pose = pose ?? {};
  const J = solveRig(rig, pose, opt);
  const items = placedShapes(rig, J, pose, opt);
  const ramps = new Map();
  const paintOf = (it) => {
    if (it.slot.detail || it.s.glow) return it.slot.hex;
    const key = (it.s.far ? 'f' : 'n') + it.slot.hex;
    if (!ramps.has(key)) ramps.set(key, it.s.far ? farRamp(it.slot.hex) : ramp(it.slot.hex));
    return ramps.get(key);
  };
  const body = items.filter((it) => !it.s.glow), glow = items.filter((it) => it.s.glow);
  paintAll(g, body, paintOf);
  if (pose.flash || opt.flash) g.tint('#ffffff');
  if (opt.outline !== false && opt.outline !== null) g.outline(typeof opt.outline === 'string' ? opt.outline : INK);
  if (glow.length) {
    const solid = coverage(body, g.w, g.h);
    paintAll(g, glow, paintOf, (it, members, test, box) => {
      const inside = test ?? it.test, [x0, y0, x1, y1] = box ?? it.box;
      const rim = (px, py) => (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)) && !inside(px, py) && !solid(px, py);
      g.fill(x0 - 1, y0 - 1, x1 + 1, y1 + 1, rim, tone(it.slot.hex, -1), { shade: 0 });
    });
  }
  return J;
}

/** A new Surface of the rig's frame size with the rig drawn on it for one pose: { g, J }. Arguments: rig, pose, opt (as drawRig). */
export function renderRig(rig, pose = {}, opt = {}) {
  const [w, h] = pair(rig?.size);
  const g = new Surface(clamp(Math.round(w) || 48, 1, 256), clamp(Math.round(h) || 48, 1, 256));
  const J = drawRig(g, rig, pose, opt);
  return { g, J };
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
