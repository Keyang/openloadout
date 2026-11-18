// Beast helpers: the long, jointed parts of big animals and monsters (a neck, a tail, a row of back spines, a sail
// fin, a wing with an elbow and a wrist, a head with a jaw that opens, the thing on the end of a tail). Each takes
// joints or an attach point and returns shape tests, inside(px, py), so the pieces go straight into g.fill(...) or
// g.blob([...]) and a rig animates them by moving the joints. Nothing here draws or picks a colour.
// Pure functions: Node and browser, no Math.random. The worked example is rigs/quadruped.js.
//
//   import { arcChain, tubeIn, pathPoint, spikeRowIn, jawHead } from '../engine/beast.js';
//   const neck = arcChain(60, 55, 84, 33, 32);                       // 32 px of neck hung between the chest and the head
//   const H = jawHead(84, 33, PI / 2 - 0.2, { size: 5, snout: 11, jaw: 0.6 });
//   g.blob([tubeIn(neck, 7, 4), H.upper], ramp(body), { shade: 2 }); // one body: one shadow band, no seams
//   g.blob([spikeRowIn(neck, { count: 5, lift: (u) => lerp(7, 4, u) }).inside], ramp(bone));
//
// Angles use the rig convention of engine/motion.js: 0 = down, PI/2 = picture-right, PI = up, negative = to the left.
// "Share" always means a share of a path's length: 0 at its first point, 1 at its last.

import { clamp, lerp, hash, PI } from './motion.js';
import { capsuleIn, polyIn as wholePolyIn } from './surface.js';
import { hornPath } from './creature.js';

const any = (tests) => (px, py) => { for (const f of tests) if (f(px, py)) return true; return false; };
/** polyIn that answers at once outside the box of its own corners: these shapes are small and asked about over a whole body. */
function polyIn(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const inside = wholePolyIn(pts);
  return (px, py) => px >= x0 && px <= x1 && py >= y0 && py <= y1 && inside(px, py);
}
/** The running length of a path at each of its points, and the whole length last. */
function lengthsOf(pts) {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return at;
}

// ---- paths ------------------------------------------------------------------------

/**
 * The point at a share of a path's length, with the way the path runs there: for standing spines, plates, eyes or an attach point on a neck or a tail.
 * Arguments: pts ([[x, y], ...]: the joints of the path, two or more); u (share of its length, 0..1).
 * Returns { x, y, tx, ty (the unit step along the path), nx, ny (the unit step to its side: up, for a path that runs to the right), angle (the rig angle of the way it runs) }.
 */
export function pathPoint(pts, u) {
  const at = lengthsOf(pts), total = at[at.length - 1] || 1e-6, want = clamp(u) * total;
  let i = 1;
  while (i < pts.length - 1 && at[i] < want) i++;
  const [ax, ay] = pts[i - 1], [bx, by] = pts[i], seg = at[i] - at[i - 1] || 1e-6, k = clamp((want - at[i - 1]) / seg);
  const tx = (bx - ax) / seg, ty = (by - ay) / seg;
  return { x: lerp(ax, bx, k), y: lerp(ay, by, k), tx, ty, nx: ty, ny: -tx, angle: Math.atan2(tx, ty) };
}

/**
 * Joints of a chain of fixed length hung between two points as one even curve: a neck that reaches for a head, a tail thrown to a spot, a tentacle. Returns [[x, y], ...], steps + 1 points.
 * Arguments: x0, y0 (where it starts); x1, y1 (where its end should be); length (px along the chain); options { bend (1 or -1: which side it bows to; 1 bows up for a chain that runs to the right), steps (straight pieces, default 6), least (the closest its ends may come, as a share of its length; default 0.25) }.
 * When the two points are further apart than the chain is long it runs straight toward the second and stops short; nearer than `least` it ends beyond it.
 */
export function arcChain(x0, y0, x1, y1, length, { bend = 1, steps = 6, least = 0.25 } = {}) {
  const dx = x1 - x0, dy = y1 - y0, far = Math.hypot(dx, dy) || 1e-6, cx = dx / far, cy = dy / far;
  const chord = clamp(far, least * length, length), n = Math.max(1, Math.round(steps));
  let phi = 0;
  if (chord < length * 0.9995) {
    // half the angle the curve turns through: sin(phi) / phi = chord / length, which falls steadily from 1 to 0
    let lo = 1e-4, hi = PI - 1e-4;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (Math.sin(mid) / mid > chord / length) lo = mid; else hi = mid; }
    phi = (lo + hi) / 2;
  }
  const side = bend < 0 ? -1 : 1, nx = side * cy, ny = -side * cx, pts = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    if (phi < 1e-3) { pts.push([x0 + cx * length * s, y0 + cy * length * s]); continue; }
    const r = length / (2 * phi), a = phi - 2 * phi * s, along = r * (Math.sin(phi) - Math.sin(a)), out = r * (Math.cos(a) - Math.cos(phi));
    pts.push([x0 + cx * along + nx * out, y0 + cy * along + ny * out]);
  }
  return pts;
}

/**
 * How tightly a curled tail, horn or tendril has to curl to stay inside a box: the asked curl when that fits, else the least stronger curl (same way round) that does, so a long tail coils up instead of leaving the frame.
 * Arguments: x, y, angle, length (as hornPath() in engine/creature.js); options { curl (radians it turns in all, as hornPath(); its sign is kept), steps (default 8), box ([x0, y0, x1, y1] every joint after the root must stay inside), pad (px to keep clear of the box, for the thickness; default 0), most (the strongest curl tried and the answer when nothing fits, default 6), by (how much stronger each try is, default 0.1) }.
 * Returns the curl to hand to hornPath().
 */
export function curlToFit(x, y, angle, length, { curl = 0, steps = 8, box, pad = 0, most = 6, by = 0.1 } = {}) {
  if (!box) return curl;
  const sign = curl < 0 ? -1 : 1;
  for (let c = Math.abs(curl); c <= most + 1e-9; c += by) {
    const pts = hornPath(x, y, angle, length, { curl: sign * c, steps });
    let ok = true;
    for (let i = 1; i < pts.length && ok; i++) ok = pts[i][0] >= box[0] + pad && pts[i][0] <= box[2] - pad && pts[i][1] >= box[1] + pad && pts[i][1] <= box[3] - pad;
    if (ok) return sign * c;
  }
  return sign * most;
}

// ---- shapes on a path ----------------------------------------------------------------

/**
 * Shape test for a round tube through a list of joints that tapers from one end to the other: a neck, a tail, a tentacle, a trunk, a fat worm.
 * Arguments: pts ([[x, y], ...]: the joints); r0, r1 (half its thickness at the first and the last joint; r1 defaults to r0); options { bulge (px added to the half thickness in the middle of its length, default 0), radius ((u) => half thickness at a share of its length: replaces r0, r1 and bulge) }.
 */
export function tubeIn(pts, r0, r1 = r0, { bulge = 0, radius = null } = {}) {
  const at = lengthsOf(pts), total = at[at.length - 1] || 1e-6;
  const rAt = radius ?? ((u) => lerp(r0, r1, u) + bulge * Math.sin(PI * u));
  const tests = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ra = Math.max(0.3, rAt(at[i - 1] / total)), rb = Math.max(0.3, rAt(at[i] / total));
    tests.push(capsuleIn(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], ra, rb));
    for (const [p, r] of [[pts[i - 1], ra], [pts[i], rb]]) { x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); }
  }
  return (px, py) => {
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    for (const f of tests) if (f(px, py)) return true;
    return false;
  };
}

/**
 * A row of pointed spikes standing along one side of a path: the ridge down a dragon's back, the plates of a lizard, thorns on a vine, teeth on a jaw.
 * Arguments: pts (the joints of the path); options { from, to (the shares of its length the row runs between, default 0 and 1), count (how many, default 6), height (px each stands up, default 3), width (px across its foot, default 3), side (1 or -1: which side of the path; 1 is up for a path that runs to the right), lift (px from the path to the foot of a spike: half the thickness of the body there, a number or (u) => px; default 0), lean (how far the tip is pushed along the path, as a share of the height; default 0), grade ((v) => a multiplier of the height along the row, v 0..1; default all the same), sink (px the foot is sunk into the body so no gap shows, default 1) }.
 * Returns { inside (the shape test), tips ([[x, y], ...]) }.
 */
export function spikeRowIn(pts, { from = 0, to = 1, count = 6, height = 3, width = 3, side = 1, lift = 0, lean = 0, grade = null, sink = 1 } = {}) {
  const n = Math.max(1, Math.round(count)), sgn = side < 0 ? -1 : 1, tests = [], tips = [];
  for (let i = 0; i < n; i++) {
    const v = n > 1 ? i / (n - 1) : 0.5, u = lerp(from, to, v), P = pathPoint(pts, u);
    const h = height * (grade ? grade(v) : 1), off = (typeof lift === 'function' ? lift(u) : lift) - sink;
    if (h <= 0.2) continue;
    const bx = P.x + P.nx * sgn * off, by = P.y + P.ny * sgn * off;
    const tip = [bx + P.nx * sgn * (h + sink) + P.tx * lean * h, by + P.ny * sgn * (h + sink) + P.ty * lean * h];
    tests.push(polyIn([[bx - P.tx * width / 2, by - P.ty * width / 2], tip, [bx + P.tx * width / 2, by + P.ty * width / 2]]));
    tips.push(tip);
  }
  return { inside: any(tests), tips };
}

/**
 * A sail fin standing along one side of a path: thin rays with skin stretched between their tips, tallest in the middle, with a scooped edge. The back fin of a sail lizard, a fish, a sea serpent, a crest.
 * Arguments: pts (the joints of the path); options { from, to (shares of its length, default 0 and 1), rays (how many, default 5), height (px the tallest stands up, default 6), side (1 or -1, as spikeRowIn), lift (px from the path to the foot of the fin: a number or (u) => px), lean (how far the tips are swept along the path, as a share of the height; default 0), scoop (0 straight edges .. 1 deep scoops between the tips, default 0.5), grade ((v) => a multiplier of the height along the fin, v 0..1; default tallest in the middle), sink (px the foot is sunk into the body, default 1) }.
 * Returns { inside (the shape test of the skin), rays ([{ base: [x, y], tip: [x, y] }, ...], for drawing each ray over the skin), tips ([[x, y], ...]) }.
 */
export function sailIn(pts, { from = 0, to = 1, rays = 5, height = 6, side = 1, lift = 0, lean = 0, scoop = 0.5, grade = null, sink = 1 } = {}) {
  const n = Math.max(2, Math.round(rays)), sgn = side < 0 ? -1 : 1, list = [];
  const tall = grade ?? ((v) => 0.45 + 0.55 * Math.sin(PI * (0.12 + 0.76 * v)));
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1), u = lerp(from, to, v), P = pathPoint(pts, u);
    const h = height * tall(v), off = (typeof lift === 'function' ? lift(u) : lift) - sink;
    const base = [P.x + P.nx * sgn * off, P.y + P.ny * sgn * off];
    list.push({ base, tip: [base[0] + P.nx * sgn * (h + sink) + P.tx * lean * h, base[1] + P.ny * sgn * (h + sink) + P.ty * lean * h], out: [P.nx * sgn, P.ny * sgn] });
  }
  const hull = polyIn([...list.map((r) => r.base), ...list.map((r) => r.tip).reverse()]);
  const bites = [];
  if (scoop > 0) for (let i = 0; i + 1 < n; i++) {
    const [ax, ay] = list[i].tip, [bx, by] = list[i + 1].tip, d = Math.hypot(bx - ax, by - ay);
    let ox = list[i].out[0] + list[i + 1].out[0], oy = list[i].out[1] + list[i + 1].out[1];
    const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
    const k = lerp(2.2, 0.3, clamp(scoop)) * d;
    bites.push([(ax + bx) / 2 + ox * k, (ay + by) / 2 + oy * k, (d / 2) ** 2 + k * k]);
  }
  const inside = (px, py) => {
    if (!hull(px, py)) return false;
    for (const [x, y, r2] of bites) if ((px - x) ** 2 + (py - y) ** 2 < r2) return false;
    return true;
  };
  return { inside, rays: list.map(({ base, tip }) => ({ base, tip })), tips: list.map((r) => r.tip) };
}

// ---- a wing with an elbow and a wrist ---------------------------------------------------

/**
 * A skin wing with an elbow and a wrist, seen from the side: an upper arm, a forearm, long fingers fanned from the wrist and skin stretched from finger to finger and back to the body. Unlike membraneWing() the arm bends, so it can fold, rise and beat like a dragon's or a bat's.
 * Arguments: sx, sy (the shoulder); options { upper, fore (px of upper arm and forearm), finger (px of the longest finger), a1, a2 (rig angles of the upper arm and the forearm), fan ([first, last]: rig angles of the leading and the last finger), fingers (how many, default 3), taper (how much shorter the last finger is than the first, as a share; default 0.2), scoop (0 straight .. 1 deep scoops in the trailing edge, default 0.5), root ([x, y] where the trailing edge meets the body; default below the shoulder), tatter (0 whole .. 1 torn: notches in the edge and holes in the skin), seed (which tears), bone (half the thickness of the arm, default 1.5) }.
 * Returns { skin (shape test of the skin), bones (shape test of the arm, the fingers and the thumb claw: paint it over the skin), elbow, wrist, root ([x, y] each), tips ([[x, y], ...], leading finger first), marks (its outermost points, for keeping it in the frame) }.
 */
export function jointedWing(sx, sy, { upper = 8, fore = 12, finger = 20, a1 = -PI + 0.35, a2 = -PI + 0.9, fan = [-PI + 1.4, -0.5], fingers = 3, taper = 0.2, scoop = 0.5, root = null, tatter = 0, seed = 0, bone = 1.5 } = {}) {
  const n = Math.max(2, Math.round(fingers)), tear = clamp(tatter);
  const elbow = [sx + Math.sin(a1) * upper, sy + Math.cos(a1) * upper];
  const wrist = [elbow[0] + Math.sin(a2) * fore, elbow[1] + Math.cos(a2) * fore];
  const tips = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), a = lerp(fan[0], fan[1], u), L = finger * (1 - taper * u);
    tips.push([wrist[0] + Math.sin(a) * L, wrist[1] + Math.cos(a) * L]);
  }
  const base = root ?? [sx + Math.sin(fan[1]) * finger * 0.4, sy + Math.cos(fan[1]) * finger * 0.4];
  const hull = polyIn([[sx, sy], elbow, wrist, ...tips, base]);
  const edge = [...tips, base], cuts = [];
  for (let i = 0; i + 1 < edge.length; i++) {
    const [ax, ay] = edge[i], [bx, by] = edge[i + 1], mx = (ax + bx) / 2, my = (ay + by) / 2, d = Math.hypot(bx - ax, by - ay);
    let ox = mx - wrist[0], oy = my - wrist[1];
    const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
    if (scoop > 0) { const k = lerp(2.2, 0.3, clamp(scoop)) * d; cuts.push([mx + ox * k, my + oy * k, (d / 2) ** 2 + k * k]); }
    if (tear > 0) {
      // a torn wing: two notches bitten out of each stretch of the edge, and a hole in the skin behind it
      for (const j of [0, 1]) {
        const k = lerp(0.2, 0.42, hash(i * 2 + j, seed * 16 + 1)) + j * 0.4, r = (d * 0.09 + 1) * tear * (0.8 + 0.5 * hash(i * 2 + j, seed * 16 + 2));
        cuts.push([lerp(ax, bx, k) - ox * r * 0.2, lerp(ay, by, k) - oy * r * 0.2, r * r]);
      }
      const hk = lerp(0.5, 0.68, hash(i, seed * 16 + 3)), hr = (d * 0.06 + 0.9) * tear;
      if (d > 7) cuts.push([lerp(wrist[0], mx, hk), lerp(wrist[1], my, hk), hr * hr]);
    }
  }
  const skin = (px, py) => {
    if (!hull(px, py)) return false;
    for (const [x, y, r2] of cuts) if ((px - x) ** 2 + (py - y) ** 2 < r2) return false;
    return true;
  };
  const thumb = [wrist[0] + Math.sin(a2 - 1) * (bone * 2 + 1), wrist[1] + Math.cos(a2 - 1) * (bone * 2 + 1)];
  const bones = any([
    capsuleIn(sx, sy, elbow[0], elbow[1], bone * 1.25, bone), capsuleIn(elbow[0], elbow[1], wrist[0], wrist[1], bone, bone * 0.8),
    ...tips.map(([tx, ty]) => capsuleIn(wrist[0], wrist[1], tx, ty, bone * 0.62, 0.45)),
    capsuleIn(wrist[0], wrist[1], thumb[0], thumb[1], bone * 0.6, 0.4),
  ]);
  return { skin, bones, elbow, wrist, root: base, tips, marks: [elbow, wrist, thumb, ...tips] };
}

// ---- a head with a jaw ---------------------------------------------------------------------

/**
 * A long-snouted head seen from the side with a lower jaw that swings open on a hinge: a dragon, a lizard, a crocodile, a wolf, a horse. Returns its shapes and the points a face is drawn at.
 * Arguments: x, y (the middle of the skull, where the neck ends); angle (the rig angle the snout points: PI/2 = to the right); options { size (the radius of the skull in px, default 5), snout (px from the skull to the tip of the nose, default 11), jaw (0 shut .. 1 wide open), gape (radians the jaw drops when wide open, default 0.75), teeth (how many along the upper jaw, default 4; the lower jaw gets one fewer) }.
 * Returns { upper (shape test: skull, brow and upper jaw), lower (shape test: the lower jaw), inside (shape test: the dark inside of the open mouth, to paint first), teeth ([[[x, y], [x, y], [x, y]], ...]: one triangle per tooth, upper ones first; `upperTeeth` says how many of them are upper), eye, nostril, crown (the top back of the skull, where horns stand), cheek, hinge, tip (the nose), chin (the end of the lower jaw), mouth (between the two, where breath leaves) as [x, y]; at ((u, v) => [x, y]: a point in the head's own measure, u px along the snout from the skull and v px toward the chin) }.
 */
export function jawHead(x, y, angle, { size = 5, snout = 11, jaw = 0, gape = 0.75, teeth = 4 } = {}) {
  const R = size, L = snout, turn = PI / 2 - angle, c = Math.cos(turn), s = Math.sin(turn);
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const cap = (a, b, ra, rb = ra) => capsuleIn(a[0], a[1], b[0], b[1], ra, rb);
  const front = 0.5 * R + L;                                    // how far the nose is from the middle of the skull
  const upper = any([
    cap(at(-0.25 * R, 0), at(0.35 * R, -0.05 * R), 0.95 * R),                                    // the skull
    cap(at(0.4 * R, -0.6 * R), at(0.55 * R, -0.58 * R), 0.42 * R),                               // the brow
    cap(at(0.5 * R, -0.08 * R), at(front - 0.45 * R, 0.02 * R), 0.66 * R, 0.45 * R),             // the upper jaw
    cap(at(front - 0.8 * R, -0.3 * R), at(front - 0.7 * R, -0.3 * R), 0.3 * R),                  // the bump of the nostril
  ]);
  const open = clamp(jaw) * gape, hinge = at(-0.05 * R, 0.5 * R), reach = L * 0.95;
  const end = at(-0.05 * R + Math.cos(open) * reach, 0.58 * R + Math.sin(open) * reach);
  const lower = cap(hinge, end, 0.42 * R, 0.27 * R);
  const tip = at(front, 0), lip = at(front - 0.5 * R, 0.4 * R);
  const inside = polyIn([at(0.1 * R, 0.2 * R), lip, [end[0], end[1]], hinge]);
  // teeth: the upper ones hang from the upper jaw, the lower ones stand on the lower jaw and turn with it
  const tris = [], nUp = Math.max(0, Math.round(teeth)), th = Math.max(1.6, 0.36 * R), tw = Math.max(1.4, 0.3 * R);
  for (let i = 0; i < nUp; i++) {
    const u = lerp(0.5 * R + L * 0.3, front - 0.55 * R, nUp > 1 ? i / (nUp - 1) : 1), v = lerp(0.5 * R, 0.4 * R, nUp > 1 ? i / (nUp - 1) : 1);
    tris.push([at(u - tw / 2, v - 0.6), at(u + tw / 2, v - 0.6), at(u, v + th * (i === nUp - 1 ? 1.35 : 1))]);
  }
  const co = Math.cos(open), so = Math.sin(open), onJaw = (d, h) => at(-0.05 * R + co * d + so * h, 0.58 * R + so * d - co * h);
  for (let i = 0; i < nUp - 1; i++) {
    const d = lerp(reach * 0.4, reach * 0.88, nUp > 2 ? i / (nUp - 2) : 1), foot = lerp(0.36 * R, 0.26 * R, d / reach) - 0.6;
    tris.push([onJaw(d - tw / 2, foot), onJaw(d + tw / 2, foot), onJaw(d, foot + th)]);
  }
  return {
    upper, lower, inside, teeth: tris, upperTeeth: nUp, at,
    eye: at(0.5 * R, -0.36 * R), nostril: at(front - 0.75 * R, -0.3 * R), crown: at(-0.5 * R, -0.72 * R), cheek: at(-0.1 * R, 0.25 * R),
    hinge, tip, chin: [end[0], end[1]], mouth: [(lip[0] + end[0]) / 2, (lip[1] + end[1]) / 2],
  };
}

// ---- the end of a tail -----------------------------------------------------------------------

/** What tailTipIn() can put on the end of a tail: spade (a barbed arrowhead), club (a knob with spikes), flame (nothing solid: a fire burns there). No arguments: a list. */
export const TAIL_TIPS = Object.freeze(['spade', 'club', 'flame']);

/**
 * The thing on the end of a tail, turned the way the tail ends: a barbed spade, a spiked club, or the bare end a flame burns on.
 * Arguments: kind (one of TAIL_TIPS); x, y (the end of the tail); angle (the rig angle the tail ends in); size (a multiplier, default 1: a spade about 10 px long, a club about 9 px across).
 * Returns { body (shape test in the tail's own colour, or null), spikes (shape test of the club's spikes, in bone; or null), end ([x, y]: its furthest point, and where a flame stands), marks ([[x, y], ...]: its outermost points, for keeping it in the frame) }.
 */
export function tailTipIn(kind, x, y, angle, size = 1) {
  const turn = PI / 2 - angle, c = Math.cos(turn), s = Math.sin(turn), k = size;
  const at = (u, v) => [x + (u * c - v * s) * k, y + (u * s + v * c) * k];
  if (kind === 'spade') {
    const pts = [at(-1.5, -1.4), at(-1, -5), at(4.5, -2.8), at(10, 0), at(4.5, 2.8), at(-1, 5), at(-1.5, 1.4)];
    return { body: polyIn(pts), spikes: null, end: at(10, 0), marks: [at(-1, -5), at(10, 0), at(-1, 5)] };
  }
  if (kind === 'club') {
    const mid = at(3.4, 0), r = 4.3 * k;
    const body = capsuleIn(x, y, mid[0], mid[1], 2 * k, r);
    const tris = [], marks = [];
    for (const a of [-1.9, -0.95, 0, 0.95, 1.9]) {
      const ux = Math.cos(a), uy = Math.sin(a), foot = 3.3, top = 7.6, half = 1.5;
      tris.push(polyIn([at(3.4 + ux * foot - uy * half, uy * foot + ux * half), at(3.4 + ux * top, uy * top), at(3.4 + ux * foot + uy * half, uy * foot - ux * half)]));
      marks.push(at(3.4 + ux * top, uy * top));
    }
    return { body, spikes: any(tris), end: at(11, 0), marks };
  }
  return { body: null, spikes: null, end: [x, y], marks: [[x, y]] };
}
