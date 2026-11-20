#!/usr/bin/env node
// Bakes the top-down person of rigs/topdown.js into pieces (docs/data-sprites.md section 9, row B16, item B16b;
// sections 2.2 and 7). TEMPORARY, like tools/bake-rig.mjs: it goes with the code rigs in P4. What it makes is data:
//
//   base:person-topdown@1   one bone rig seen from down, up and side (overlays), with every standard clip of the code
//                           rig as sparse key poses (compactKeys): each frame stands exactly where the code rig puts
//                           it. The body is drawn as rigs/topdown.js draws it with a bald head and nothing worn:
//                           legs, torso, sleeves with their rim, fists, head and face. Hair, beards, headgear, robes
//                           and held things are part pieces (B16b's parts, below).
//   base:person-topdown-walker@1   the same rig with idle, walk and talk only (WALKER_CLIPS)
//
//   node tools/bake-topdown.mjs                 check: bake everything and say how far each clip is from the code rig
//   node tools/bake-topdown.mjs --write [dir]   write the piece files (default: pieces/)
//   node tools/bake-topdown.mjs --clip <name>   print the key poses of a standard clip (run_side, talk_down, hurt ...)
//   node tools/bake-topdown.mjs --elder [file]   write the village elder fixture
//   node tools/bake-topdown.mjs --sheet <png> [fixture] [settings]   the code sprite above its data redraw, every clip, 3x
// Node names, z ranges and the frame conventions are in pieces/README.md ("The top-down person").
//
// HOW THE RIG IS LAID OUT. The code rig works in screen pixels with rounding at every joint; the bone rig places shapes
// on bones and screen-aligned nodes. Every place the code rig rounds to is made a bone end or node here, and each
// frame's key sets every bone's angle and stretch so its end lands on that place exactly (stretch stays inside 0.5 to
// 1.5, which the renderer draws). Shapes that never turn in the code rig (the head, the boots, the fists, the eyes) are
// stamps baked from the code rig's own drawing; the rest are the same shapes the code rig fills (limbs, polygons).
// The rim the code rig paints round a sleeve where it crosses the body (rigs/topdown.js over()) reads pixels back;
// here it is a second sleeve one pixel nearer the body, under the first, on its own pair of bones.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as T from '../rigs/topdown.js';
import { Surface } from '../engine/surface.js';
import { ramp, tone, col, INK } from '../engine/color.js';
import { lerp, clamp } from '../engine/motion.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAD = Math.PI / 180;
const r5 = (v) => Math.round(v * 1e4) / 1e4 + 0;
// what a key writes: angles to a hundredth of a degree, stretches to a ten-thousandth, offsets to a hundredth of a pixel
// (a bone end lands on a pixel centre and a sleeve's edge on a pixel's, so a stretch rounded coarser moves a shade band)
const rA = (v) => Math.round(v * 100) / 100 + 0;
const rS = (v) => Math.round(v * 1e4) / 1e4 + 0;

/** The three drawn directions, in clip order. */
export const DIRECTIONS = ['down', 'up', 'side'];
/** The body every bake is made at: the code rig's defaults (height, build and head 0.5): head 13 x 12, 30 px tall. */
export const DIMS = Object.freeze(T.dims({}));
/** The colours the base is compared in, as a code rig look; bald, so no hair is drawn by the body. */
export const LOOK = Object.freeze({ skin: '#e0a878', top: '#3a6ea5', bottom: '#4a3f5c', boots: '#6b4a2e', hairStyle: 'bald' });
/** The standard actions of rigs/topdown.js the base holds, with the directions each is baked for (hurt and die face down, as the code rig names them: plain). */
export const ACTIONS = Object.freeze({ idle: DIRECTIONS, walk: DIRECTIONS, run: DIRECTIONS, attack: DIRECTIONS, shoot: DIRECTIONS, cast: DIRECTIONS, block: DIRECTIONS, dodge: DIRECTIONS, talk: DIRECTIONS, hurt: ['down'], die: ['down'] });

const phaseOf = (s, f) => (s.loop ? f / s.frames : s.frames > 1 ? f / (s.frames - 1) : 0);
const clipAction = (clip) => T.parseClip(clip);

// ---- the code rig, as the reference ------------------------------------------------------------------------------

/** One frame of the code rig with nothing worn or held: what the base is held to. clip: 'walk_side', 'hurt' ...; f: frame; look: a code look. */
export function codeFrame(clip, f, look = LOOK) {
  const { action } = clipAction(clip);
  const F = T.frame(clip, phaseOf(T.STANDARD[action], f), {}, {});
  const g = new Surface(T.SIZE[0], T.SIZE[1]);
  F.draw(g, look, {});
  F.finish(g);
  return g;
}

/** The code rig's attach points for one frame of a clip, as a sprite's sockets() gives them. */
export function codeSockets(clip, f) {
  const { action } = clipAction(clip);
  return T.frame(clip, phaseOf(T.STANDARD[action], f), {}, {}).sockets();
}

/** How far two frames are apart: { differ, drawn, share } (pixels that differ, over the pixels the first one draws). */
export function pixelDiff(want, got) {
  let differ = 0, drawn = 0;
  for (let i = 0; i < want.data.length; i++) {
    if (want.data[i]) drawn++;
    if (want.data[i] !== got.data[i]) differ++;
  }
  return { differ, drawn, share: differ / Math.max(1, drawn) };
}

// ---- the skeleton ------------------------------------------------------------------------------------------------
// Bones (with a length) and nodes (length 0, screen-aligned: their absolute angle is keyed to 0, so a stamp or polygon
// on one is written in screen pixels as [down, right]). F is the weapon side, B the other (rigs/topdown.js).

const SKELETON = [
  { id: 'root', node: true, parent: null },          // the ground under the middle of the body; keys move it (pose root)
  { id: 'hip', parent: 'root' },                     // up to the hip line
  { id: 'waist', node: true, parent: 'hip' },        // belts, the lower torso, robes
  { id: 'spine', parent: 'hip' },                    // up to the first row of the torso (a row under the shoulder line)
  { id: 'chest', node: true, parent: 'spine' },      // the upper torso, collars
  { id: 'neck', parent: 'spine', rest: 2.5 },        // up towards the middle of the head (it sinks into the chest in a
  { id: 'nape', parent: 'neck', rest: 2.5 },         // crouch, so two bones that bend, as the arms; straight at rest)
  { id: 'head', node: true, parent: 'nape' },        // the head, face, hair and headgear
  ...['F', 'B'].flatMap((s) => [
    { id: `shoulder${s}`, parent: 'spine' },         // out to the shoulder (snapped as the code rig snaps a sleeve)
    { id: `armTop${s}`, node: true, parent: `shoulder${s}` },   // at the top of the sleeve, screen-aligned
    // the sleeve runs straight from shoulder to hand, 1.5 to 7.2 px: one bone cannot stretch that far, so there are two
    // (a long and a short one) and each frame shows the one that reaches
    { id: `arm${s}`, parent: `shoulder${s}`, rest: 6, fit: true },        // the sleeve when the hand is 3 px or more away
    { id: `armI${s}`, parent: `shoulder${s}`, rest: 2, fit: true },      // the sleeve of a hand drawn in close
    { id: `elb${s}`, parent: `shoulder${s}`, rest: 3.6 },               // shoulder to an elbow that is not drawn ...
    { id: `wri${s}`, parent: `elb${s}`, rest: 3.6 },                  // ... and on to the hand: what carries the hand
    { id: `cuff${s}`, node: true, parent: `wri${s}` },   // at the hand, screen-aligned
    // hung from the screen-aligned cuff, so their angles are screen angles that seldom change (few keys)
    { id: `hand${s}`, node: true, parent: `cuff${s}` },    // turned the way a held thing points (F) or along the arm (B)
    { id: `grp${s}`, parent: `cuff${s}` },          // from the hand to the fist's corner
    { id: `fist${s}`, node: true, parent: `grp${s}` },
    { id: `rimS${s}`, parent: `armTop${s}` }, // the sleeve's rim: the same sleeve a pixel nearer the body
    { id: `rimA${s}`, parent: `rimS${s}`, rest: 6, fit: true },
    { id: `rimI${s}`, parent: `rimS${s}`, rest: 2, fit: true },
    { id: `hip${s}`, parent: 'hip' },                // out to the top of the leg
    // hip to a knee that is not drawn, and on to the sole under the ankle: what carries the boot. It ends on the ground,
    // so a slider that scales the hip and these two together (Height, a stoop) keeps the feet on it
    { id: `thi${s}`, parent: `hip${s}`, rest: 6 },
    { id: `shn${s}`, parent: `thi${s}`, rest: 6 },
    // seen from the side the leg is drawn straight from hip to ankle, 2.8 to 8.6 px: a long and a short bone, as the sleeves
    { id: `leg${s}`, parent: `hip${s}`, rest: 6, fit: true },
    { id: `legI${s}`, parent: `hip${s}`, rest: 2.5, fit: true },
    { id: `toe${s}`, parent: `shn${s}` },           // from the sole to the boot's corner
    { id: `foot${s}`, node: true, parent: `toe${s}` },
  ]),
];
const BY_ID = new Map(SKELETON.map((b) => [b.id, b]));
const ROOT_AT = [T.CX + 0.5, T.GROUND];
// how far above the ground a standing sole is, facing each way: the leg chain ends that much lower (on the ground at
// rest), so scaling the hip and the leg chain together keeps a standing foot exactly where it was
const SOLE_DROP = Object.fromEntries(DIRECTIONS.map((dir) => { const F = T.frame(`idle_${dir}`, 0, {}, {}); const J = T.solve(dir, F.P, F.d); return [dir, { F: J.gy - J.legF.soleY, B: J.gy - J.legB.soleY }]; }));

const snapHalf = (p) => [Math.floor(p[0]) + 0.5, Math.floor(p[1]) + 0.5];
// a hand or foot is carried by two bones that bend at a joint (as two-bone IK) and keep their length, whatever the
// distance from shoulder to hand or hip to ankle (a lifted foot comes close to the hip)
/** The knee between a (hip) and c (foot) for bones of lengths la and lb, bent towards side sg (-1 left, 1 right). */
function knee(a, c, la, lb, sg) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dist = Math.hypot(dx, dy);
  if (dist >= la + lb - 1e-6) return [a[0] + (dx * la) / (la + lb), a[1] + (dy * la) / (la + lb)];
  const ux = dist > 1e-6 ? dx / dist : 0, uy = dist > 1e-6 ? dy / dist : 1;
  const x = (dist * dist + la * la - lb * lb) / (2 * Math.max(dist, 1e-6)), h = Math.sqrt(Math.max(0, la * la - x * x));
  return [a[0] + ux * x - uy * h * sg, a[1] + uy * x + ux * h * sg];
}

/** Where every bone of the skeleton must end (or which way every node must face) for one code pose, plus the face. */
function targetsOf(direction, P, d) {
  const J = T.solve(direction, P, d);
  const side = direction === 'side', back = direction === 'up';
  const t = { root: { at: [J.bx, J.gy], abs: 0 } };
  t.hip = { end: [J.bx, J.hip[1]] };
  t.waist = { abs: 0 };
  t.spine = { end: [J.neck[0], J.shoulderY + d.chin - 1] };
  t.chest = { abs: 0 };
  const top = [J.neck[0], J.shoulderY + d.chin - 1];
  t.neck = { end: knee(top, J.head, 2.5, 2.5, 1) };
  t.nape = { end: [J.head[0], J.head[1]] };
  t.head = { abs: 0 };
  for (const s of ['F', 'B']) {
    const A = J[`arm${s}`], L = J[`leg${s}`];
    const sh = snapHalf(A.shoulder), hd = snapHalf(A.hand);
    t[`shoulder${s}`] = { end: sh };
    t[`arm${s}`] = { end: hd };
    t[`armI${s}`] = { end: hd };
    t[`elb${s}`] = { end: knee(sh, hd, 3.6, 3.6, side ? 1 : sh[0] < J.bx ? -1 : 1) };
    t[`wri${s}`] = { end: hd };
    const reach = Math.hypot(hd[0] - sh[0], hd[1] - sh[1]);
    // long: 3 px or more; In: shorter; Dot: the hand is on the shoulder's own pixel (a sleeve of no length, a round blob)
    t[`hand${s}`] = { abs: s === 'F' ? P.item : A.angle, long: reach >= 3, size: reach >= 3 ? '' : reach > 0.25 ? 'In' : 'Dot' };
    t[`armTop${s}`] = { abs: 0 };
    t[`cuff${s}`] = { abs: 0 };
    const w = d.armW;
    const fx = w % 2 ? Math.floor(A.hand[0]) - (w - 1) / 2 : Math.round(A.hand[0]) - w / 2;
    t[`grp${s}`] = { end: [fx, Math.round(A.hand[1]) - 1] };
    t[`fist${s}`] = { abs: 0 };
    // facing down or up each sleeve's rim is on the side towards the body; seen from the side only the near sleeve
    // (F) has a rim, on both sides of it: the F chain carries its left one and the B chain its right one
    const toward = side ? (s === 'F' ? -1 : 1) : Math.sign(J.bx - sh[0]) || 1;
    const [rs, rh] = side ? [snapHalf(J.armF.shoulder), snapHalf(J.armF.hand)] : [sh, hd];
    t[`rimS${s}`] = { end: [rs[0] + toward, rs[1]] };
    t[`rimA${s}`] = { end: [rh[0] + toward, rh[1]] };
    t[`rimI${s}`] = { end: [rh[0] + toward, rh[1]] };
    t[`hip${s}`] = { end: [L.hip[0], L.hip[1]] };
    const ankle = snapHalf([L.x, L.soleY - 2]);       // where the code rig's leg limb ends, as it snaps it
    const sole = [ankle[0], L.soleY + SOLE_DROP[direction][s]];
    t[`thi${s}`] = { end: knee(L.hip, sole, 6, 6, side ? 1 : L.hip[0] < J.bx ? -1 : 1) };
    t[`shn${s}`] = { end: sole };
    // the side leg ends 0.3 px above the ankle's pixel centre: the renderer snaps it to the same centre, and a slider
    // that scales the hip and the legs (Height, Stoop) moves the end down by up to (1 - scale) x 1.5 px, which then
    // still snaps there instead of a row lower, under the boot
    const knot = [ankle[0], ankle[1] - 0.3];
    t[`leg${s}`] = { end: knot };
    t[`legI${s}`] = { end: knot, long: Math.hypot(ankle[0] - L.hip[0], ankle[1] - L.hip[1]) >= 3 };
    let corner;
    if (side) corner = [Math.floor(L.x) - 1, L.soleY - 2];
    else {
      const top = Math.round(L.hip[1]) - 1, bootH = Math.min(back ? 2 : 3, Math.max(1, L.soleY - top - 1));
      corner = [Math.round(L.x - d.legW / 2), L.soleY - bootH];
      t[`foot${s}`] = { abs: 0, bootH };
    }
    t[`toe${s}`] = { end: corner };
    t[`foot${s}`] = { ...(t[`foot${s}`] ?? {}), abs: 0, lifted: L.lifted };
  }
  return { J, t };
}

/** Lays the skeleton on one code pose: each bone's start, absolute angle and length, from the root out. */
function layOut(targets) {
  const out = {};
  for (const b of SKELETON) {
    const tg = targets[b.id];
    if (b.parent === null) { out[b.id] = { start: tg.at, abs: tg.abs * RAD, len: 0 }; continue; }
    const p = out[b.parent];
    const start = BY_ID.get(b.parent).node ? p.start : [p.start[0] + Math.sin(p.abs) * p.len, p.start[1] + Math.cos(p.abs) * p.len];
    if (b.node) { out[b.id] = { start, abs: tg.abs, len: 0, parentAbs: p.abs }; continue; }
    const dx = tg.end[0] - start[0], dy = tg.end[1] - start[1];
    let len = Math.hypot(dx, dy);
    // a bone that may not reach (the sleeve not shown this frame) points the right way at the nearest length it can take
    if (b.fit) len = Math.min(b.rest * 1.5, Math.max(b.rest * 0.5, len));
    out[b.id] = { start, abs: Math.hypot(dx, dy) > 1e-9 ? Math.atan2(dx, dy) : p.abs, len, parentAbs: p.abs };
  }
  return out;
}

const degOf = (L) => (L.abs - L.parentAbs) / RAD;
/** The same angle as a, turned by whole turns to lie within half a turn of near. */
const near = (a, ref) => a - 360 * Math.round((a - ref) / 360);

// ---- rest pose and lengths per direction -------------------------------------------------------------------------

const REST = Object.fromEntries(DIRECTIONS.map((dir) => {
  const F = T.frame(`idle_${dir}`, 0, {}, {});
  const { t } = targetsOf(dir, F.P, F.d);
  const L = layOut(t);
  const bones = {};
  for (const b of SKELETON) if (b.parent !== null) bones[b.id] = { angle: rA(degOf(L[b.id])), length: b.node ? 0 : b.rest ?? r5(L[b.id].len) };
  return [dir, bones];
}));

// ---- the torso seen from the side ---------------------------------------------------------------------------------
// The code rig shears it (each row's first column lerps from the shoulders' x to the hips'); a bone rig would turn it.
// So it is a stamp on the waist with a variant for each lean (pixels from hip to shoulder line) and height (rows) the
// standard poses take, baked from the code rig's own fill; a key picks the variant.

const TORSO_LETTERS = { top: 't', 'top.light': 'l', 'top.dark': 'd', 'top.deep': 'e' };
/** The side torso of one solved code pose: { name, rows } (rows: a 16 x 12 block whose top-left is 7.5 px left of the hip point and 12 rows up). */
function torsoVariant(J, d) {
  const lean = J.neck[0] - J.hip[0], n = J.hip[1] - (J.shoulderY + d.chin - 1);
  const name = `lean${lean < 0 ? 'm' : ''}${Math.abs(lean)}r${n}`;
  const bx0 = J.hip[0] - 7.5, by0 = J.hip[1] - 12;
  const st = stampOf((g) => {
    // rigs/topdown.js drawSide, the body
    const wide = Math.round(d.chestR * 1.7), nx = J.neck[0], hx = J.hip[0];
    const y0 = J.shoulderY + d.chin - 1, y1 = Math.round(J.hip[1]);
    const left = (py) => Math.round(lerp(nx, hx, clamp((py - y0) / (y1 - y0))) - wide / 2 + 0.3);
    g.fill(Math.min(nx, hx) - 8, y0, Math.max(nx, hx) + 8, y1, (px, py) => { const l = left(py) + (py < y0 + 1 ? 1 : 0); return py >= y0 && py < y1 && px >= l && px < left(py) + wide - (py < y0 + 1 ? 1 : 0); }, ramp(LOOK.top));
  }, { top: LOOK.top }, [bx0, by0, bx0 + 15, by0 + 11], TORSO_LETTERS);
  return { name, rows: st.rows };
}

let SIDE_TORSOS = null;
/** Every side torso the standard poses take, { name: rows }, the rest pose's first. */
function sideTorsos() {
  if (SIDE_TORSOS) return SIDE_TORSOS;
  const out = {};
  for (const [action, dirs] of Object.entries(ACTIONS)) {
    if (!dirs.includes('side') || action === 'hurt') continue;
    const s = T.STANDARD[action];
    for (let f = 0; f < s.frames; f++) {
      const F = T.frame(`${action}_side`, phaseOf(s, f), {}, {});
      const v = torsoVariant(T.solve('side', F.P, F.d), F.d);
      out[v.name] = v.rows;
    }
  }
  SIDE_TORSOS = out;
  return out;
}

// ---- keys --------------------------------------------------------------------------------------------------------

/**
 * The code rig paints a rim round a sleeve wherever it crosses something already drawn (rigs/topdown.js over() reads
 * the pixels back). The bone rig has, for each rimmed sleeve, the same sleeve a pixel to one side (facing down or up:
 * towards the body; from the side: both sides of the near sleeve), in two halves, and a row of three pixels above its
 * top and below its hand. This says, for one frame, which halves to show (those whose pixels mostly fall on the code
 * rig's rim) and which of the six pixels to set: { F: { L, L2, R, R2, top, low }, B: {...} } (top and low are variant
 * names of RIM_ROWS, or null).
 */
function rimPlan(direction, P, d, J) {
  const W = T.SIZE[0], H = T.SIZE[1];
  // record what each rim fill of the code rig paints (a flat fill in the sleeve's dark tone, unshaded)
  const rimHex = ramp(LOOK.top).dark;
  const rims = [];
  class Rec extends Surface {
    fill(x0, y0, x1, y1, inside, paint, opt = {}) {
      if (paint === rimHex && opt.shade === 0) {
        const before = this.data.slice();
        super.fill(x0, y0, x1, y1, inside, paint, opt);
        const set = new Set();
        for (let y = Math.max(0, Math.floor(y0) - 1); y <= Math.min(H - 1, Math.ceil(y1) + 1); y++) for (let x = Math.max(0, Math.floor(x0) - 1); x <= Math.min(W - 1, Math.ceil(x1) + 1); x++) {
          const i = y * W + x;
          if (before[i] && inside(x + 0.5, y + 0.5) && (!opt.clip || opt.clip(x + 0.5, y + 0.5))) set.add(i);
        }
        rims.push(set);
        return this;
      }
      return super.fill(x0, y0, x1, y1, inside, paint, opt);
    }
  }
  T.draw(new Rec(W, H), direction, P, d, LOOK, {});
  const side = direction === 'side';
  const mask = (a, b) => { const g = new Surface(W, H); g.limb(a[0], a[1], b[0], b[1], d.armW, '#ffffff'); return g.data; };
  const plan = {};
  const arms = side ? [['F', rims[0]]] : [['B', rims[0]], ['F', rims[1]]];
  for (const [s, R] of arms) {
    if (!R) continue;
    const A = J[`arm${s}`], sh = snapHalf(A.shoulder), hd = snapHalf(A.hand);
    const arm = mask(sh, hd);
    const good = (m) => { let on = 0, off = 0; for (let i = 0; i < m.length; i++) if (m[i] && !arm[i]) { if (R.has(i)) on++; else off++; } return on > 2 * off; };
    const half = (dx, part) => {
      const a = [sh[0] + dx, sh[1]], b = [hd[0] + dx, hd[1]], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return good(part === 1 ? mask(a, m) : part === 2 ? mask(m, b) : part === 3 ? mask(a, a) : mask(a, b));
    };
    const toward = Math.sign(J.bx - sh[0]) || 1;
    const p = {};
    if (side) { p.L = half(-1, 1); p.L2 = half(-1, 2); p.R = half(1, 1); p.R2 = half(1, 2); p.LIn = half(-1, 0); p.RIn = half(1, 0); p.LDot = half(-1, 3); p.RDot = half(1, 3); }
    else { p.L = half(toward, 1); p.L2 = half(toward, 2); p.LIn = half(toward, 0); p.LDot = half(toward, 3); }
    const row = (x0, y) => { let bits = ''; for (let x = x0; x < x0 + 3; x++) bits += x >= 0 && x < W && y >= 0 && y < H && R.has(y * W + x) && !arm[y * W + x] ? '1' : '0'; return bits === '000' ? null : `r${bits}`; };
    p.top = row(Math.floor(sh[0]) - 1, Math.floor(sh[1]) - 2);
    p.low = row(Math.floor(hd[0]) - 1, Math.floor(hd[1]) + 2);
    plan[s] = p;
  }
  return plan;
}

/** The key of one code pose: root offset, every bone's angle (degrees, relative) and stretch, stamp variants, shown shapes. */
function keyOf(direction, P, d, t, prev, map = null) {
  const { J, t: tg } = targetsOf(direction, P, d);
  // a body the code rig tips over or lays down (die): every place moved as its picture is; hands turned with it
  if (map) {
    const turn = P.lie ? -Math.PI / 2 : 0;
    for (const [id, x] of Object.entries(tg)) {
      if (x.end) x.end = map(x.end);
      if (x.at) x.at = map(x.at);
      if (id.startsWith('hand') && typeof x.abs === 'number') x.abs += turn;
    }
  }
  const L = layOut(tg);
  const rest = REST[direction];
  const R = map ? map([J.bx, J.gy]) : [J.bx, J.gy];
  const key = { t, root: [rA(R[0] - ROOT_AT[0]), rA(R[1] - ROOT_AT[1])], bones: {}, stretch: {} };
  const bad = [];
  for (const b of SKELETON) {
    if (b.parent === null) continue;
    const ref = prev?.bones?.[b.id] ?? rest[b.id].angle;
    key.bones[b.id] = rA(near(degOf(L[b.id]), ref));
    if (b.node) continue;
    const k = L[b.id].len / rest[b.id].length;
    if (!(k >= 0.5 - 1e-9 && k <= 1.5 + 1e-9)) bad.push(`${b.id} ${k.toFixed(3)}`);
    key.stretch[b.id] = rS(Math.min(1.5, Math.max(0.5, k)));
  }
  const side = direction === 'side', back = direction === 'up';
  const eye = P.eyes === 'shut' ? 'shut' : P.blink ? 'blink' : null;
  key.swap = {};
  if (side) {
    key.swap.eyeSide = eye;
    key.swap.mouthSide = P.mouth ? 'open' : null;
    for (const s of ['F', 'B']) key.swap[`boot${s}`] = (J[`leg${s}`].lifted ? 'lifted' : 'flat') + (s === 'B' ? 'Far' : '');
  } else {
    if (!back) {
      key.swap.eyeL = eye; key.swap.eyeR = eye;
      key.swap.mouth = P.mouth ? 'open' : P.eyes === 'shut' ? 'grim' : null;
    }
    for (const s of ['F', 'B']) key.swap[`boot${s}`] = `h${tg[`foot${s}`].bootH}`;
  }
  // the long or the short sleeve, whichever reaches the hand this frame, and the parts of its rim that show
  const plan = rimPlan(direction, P, d, J);
  key.show = []; key.hide = [];
  const put = (id, on) => (on ? key.show : key.hide).push(id);
  for (const s of ['F', 'B']) {
    const size = tg[`hand${s}`].size;
    for (const v of ['', 'In', 'Dot']) put(side && s === 'B' ? `sleeveBSide${v}` : `sleeve${s}${v}`, size === v);
    if (side) { const lg = tg[`legI${s}`].long; put(`leg${s}Side`, lg); put(`leg${s}SideIn`, !lg); }
  }
  for (const [s, ids] of side ? [['F', { L: 'rimFL', L2: 'rimFL2', LIn: 'rimFLIn', LDot: 'rimFLDot', R: 'rimFR', R2: 'rimFR2', RIn: 'rimFRIn', RDot: 'rimFRDot' }]]
    : [['F', { L: 'rimF', L2: 'rimF2', LIn: 'rimFIn', LDot: 'rimFDot' }], ['B', { L: 'rimB', L2: 'rimB2', LIn: 'rimBIn', LDot: 'rimBDot' }]]) {
    const p = plan[s] ?? {}, size = tg[`hand${s}`].size;
    for (const [k, id] of Object.entries(ids)) put(id, !!p[k] && (k.endsWith('In') ? size === 'In' : k.endsWith('Dot') ? size === 'Dot' : size === ''));
    key.swap[`rimTop${s}`] = p.top ?? null;
    key.swap[`rimLow${s}`] = p.low ?? null;
  }
  if (side) { key.swap.rimTopB = null; key.swap.rimLowB = null; }
  if (side) key.swap.torsoSide = torsoVariant(J, d).name;
  // the helper bones that carry only shapes this frame hides: their angle and stretch do not matter (see compactKeys)
  const hid = new Set(key.hide), shown = new Set(key.show), hiddenHere = SHAPE_INFO.hidden[direction];
  const off = (id) => hid.has(id) || (!shown.has(id) && hiddenHere.has(id));
  const free = FREE_BONES.filter((b) => (SHAPE_INFO.carried.get(b) ?? []).every(off));
  return { key, bad, free, flash: !!P.flash, torsoRows: J.hip[1] - (J.shoulderY + d.chin - 1) };
}

/** The clips the base holds, in the code rig's order: every action in three directions, then hurt and die facing down (as rigs/topdown.js clips() names them). */
export const BASE_CLIPS = Object.freeze([...Object.entries(ACTIONS).flatMap(([a, dirs]) => (dirs === DIRECTIONS ? dirs.map((dir) => `${a}_${dir}`) : [])), 'hurt', 'die']);
/** The code rig's { frames, fps, loop } of a clip name ('walk_side', 'die'). */
export function STANDARD_OF(clip) { return T.STANDARD[clipAction(clip).action]; }

/**
 * Sparse keys (docs/data-sprites.md 2.2; rigs/keypose.js: a key holds only what it changes): from keys written on every
 * frame, each track (a bone's angle or stretch, the root, a stamp's variant, a shape shown or hidden) is kept only on
 * the frames where it changes, and on the frame before a change, so that blending between the keys that are left gives
 * every frame the very value it had (a number between two equal keys is that number; a word or a shown shape steps).
 * A one-shot keeps every track on its first frame. Keys left with nothing but their time are dropped (one always stays).
 */
export function compactKeys(clip, frees = null) {
  const n = clip.keys.length, loop = clip.loop !== false;
  const flat = clip.keys.map((k) => {
    const o = new Map();
    for (const [f, v] of Object.entries(k)) {
      if (f === 't') continue;
      if (f === 'show' || f === 'hide') { for (const id of v) o.set(`vis\u0000${id}`, f); continue; }
      if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [id, x] of Object.entries(v)) o.set(`${f}\u0000${id}`, x); continue; }
      o.set(f, v);
    }
    return o;
  });
  const paths = [...new Set(flat.flatMap((m) => [...m.keys()]))];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = clip.keys.map((k) => ({ t: k.t }));
  const put = (i, path, v) => {
    const [f, id] = path.split('\u0000');
    if (f === 'vis') (out[i][v] ??= []).push(id);
    else if (id === undefined) out[i][f] = v;
    else (out[i][f] ??= {})[id] = v;
  };
  for (const path of paths) {
    const vals = flat.map((m) => (m.has(path) ? m.get(path) : undefined));
    if (vals.some((v) => v === undefined)) { vals.forEach((v, i) => { if (v !== undefined) put(i, path, v); }); continue; }
    const numeric = (v) => typeof v === 'number' || (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number'));
    const stepped = path.startsWith('vis\u0000') || !numeric(vals[0]);
    // a helper bone's value on a frame that hides everything it carries does not matter: such frames are skipped, and
    // blending between the frames that do matter fills them with whatever it gives
    const [f0, id0] = path.split('\u0000');
    const idx = vals.map((_, i) => i).filter((i) => stepped || !frees || !((f0 === 'bones' || f0 === 'stretch') && frees[i]?.includes(id0)));
    if (!idx.length) continue;
    const m = idx.length;
    let any = false;
    for (let j = 0; j < m; j++) {
      const i = idx[j];
      const prev = loop ? vals[idx[(j - 1 + m) % m]] : j > 0 ? vals[idx[j - 1]] : undefined;
      const next = loop ? vals[idx[(j + 1) % m]] : j < m - 1 ? vals[idx[j + 1]] : vals[i];
      const keep = (!loop && j === 0) || !same(vals[i], prev) || (!stepped && !same(vals[i], next));
      if (keep) { put(i, path, vals[i]); any = true; }
    }
    if (!any) put(idx[0], path, vals[idx[0]]);         // the same on every frame of a loop: written once
  }
  const keys = out.filter((k, i) => i === 0 || Object.keys(k).length > 1);
  for (const k of keys) for (const f of ['show', 'hide']) if (k[f]) k[f].sort();
  return { ...clip, keys };
}

/**
 * The code rig turns its whole picture in `die`: it tips over (each row moved sideways by its height) and then lies on
 * its side (the standing front turned a quarter turn). A rig of stamps that never turn cannot follow that, so from the
 * first tipping frame the base shows `dieTip`, then `dieLie`: stamps on the root holding the code rig's own drawing of each such
 * frame (one variant a frame, in the base's slots, so colours still follow the sprite), with every other base shape
 * hidden. The bones are still laid on the tipped or lying body, so the attach points and a sprite's parts follow it.
 */
function picturePoint(P, d, J, lying) {
  if (lying) {
    const X0 = (T.CX - Math.floor(d.tall / 2) + Math.round(P.rootX ?? 0)) + (P.lieShift?.[0] ?? 0);
    const Y0 = (T.GROUND - 1 - Math.ceil(d.chestR + d.armW) - Math.round(P.lift ?? 0)) + (P.lieShift?.[1] ?? 0);
    return ([px, py]) => [X0 + T.GROUND - py, Y0 + px - T.CX];
  }
  return ([px, py]) => [px + Math.round(P.tilt * (J.gy - py) - P.tilt * d.tall * 0.35), py];
}
let DIE_PICTURES = null;
/** The die frames drawn as pictures: { dieTip, dieLie }, each { at, key, variants: { f<n>: rows }, frames: [n] } (see picturePoint). */
function diePictures() {
  if (DIE_PICTURES) return DIE_PICTURES;
  const s = T.STANDARD.die, slots = { skin: LOOK.skin, top: LOOK.top, bottom: LOOK.bottom, boots: LOOK.boots };
  const groups = { dieTip: [], dieLie: [] };
  for (let f = 0; f < s.frames; f++) {
    const F = T.frame('die', phaseOf(s, f), {}, {});
    if (!F.P.lie && !F.P.tilt) continue;
    groups[F.P.lie ? 'dieLie' : 'dieTip'].push({ f, root: rootOf('die', F), st: stampOf((g) => F.draw(g, LOOK, {}), slots) });
  }
  const out = {};
  for (const [id, frames] of Object.entries(groups)) {
    // one block for every frame of the group, placed where the renderer puts a stamp on the root (its rounded point)
    const ox = Math.min(...frames.map((x) => x.st.x0 - x.root[0])), oy = Math.min(...frames.map((x) => x.st.y0 - x.root[1]));
    const at0 = [Math.floor(oy) - 0.5, Math.floor(ox) - 0.5];
    let w = 0, h = 0;
    for (const x of frames) { x.tl = [Math.round(x.root[0] + at0[1]), Math.round(x.root[1] + at0[0])]; w = Math.max(w, x.st.x0 + x.st.rows[0].length - x.tl[0]); h = Math.max(h, x.st.y0 + x.st.rows.length - x.tl[1]); }
    if (w > 32 || h > 32) throw new Error(`die: ${id} needs ${w} x ${h} pixels; a stamp is at most 32 x 32`);
    const key = {}, variants = {};
    for (const x of frames) {
      const st = stampOf((g) => T.frame('die', phaseOf(s, x.f), {}, {}).draw(g, LOOK, {}), slots, [x.tl[0], x.tl[1], x.tl[0] + w - 1, x.tl[1] + h - 1], DIE_LETTERS);
      Object.assign(key, st.key);
      variants[`f${x.f}`] = st.rows;
    }
    out[id] = { at: at0, key, variants, frames: frames.map((x) => x.f) };
  }
  DIE_PICTURES = out;
  return out;
}
// fixed letters for the die picture, so every frame's variant reads with one key
const DIE_LETTERS = { skin: 's', 'skin.light': 'S', 'skin.dark': 'k', 'skin.deep': 'K', top: 't', 'top.light': 'T', 'top.dark': 'd', 'top.deep': 'D',
  bottom: 'b', 'bottom.light': 'B', 'bottom.dark': 'n', 'bottom.deep': 'N', boots: 'o', 'boots.light': 'O', 'boots.dark': 'r', 'boots.deep': 'R', ink: 'i' };

/** Where the root node stands in one code frame (frame px): the ground under the body, moved as a tipping or lying body moves. */
function rootOf(clip, F) {
  const J = T.solve(F.direction, F.P, F.d);
  if (!F.P.lie && !F.P.tilt) return [J.bx, J.gy];
  return picturePoint(F.P, F.d, J, !!F.P.lie)([J.bx, J.gy]);
}

/**
 * A standard clip baked as key poses: { label, frames, fps, loop, keys, frameEdits? }. Each frame's pose is solved and
 * keyed, then the keys are made sparse (compactKeys); opt.dense keeps one full key a frame (what tests compare with).
 * Throws when a bone would have to stretch past what the renderer draws.
 */
export function bakeClip(clip, opt = {}) {
  const { action, direction } = clipAction(clip);
  const s = T.STANDARD[action];
  const keys = [], flash = {}, bad = [], rows = [], frees = [];
  let prev = null, pictured = false;
  const pics = action === 'die' ? diePictures() : {};
  const allShapes = action === 'die' ? baseShapes().shapes.map((x) => x.id).filter((id) => !(id in pics)) : [];
  for (let f = 0; f < s.frames; f++) {
    const t = phaseOf(s, f);
    const F = T.frame(clip, t, {}, {});
    const turned = !!(F.P.lie || F.P.tilt);
    const k = keyOf(direction, F.P, F.d, t, prev, turned ? picturePoint(F.P, F.d, T.solve(direction, F.P, F.d), !!F.P.lie) : null);
    if (action === 'die') {
      // the picture frames: every base shape hidden but the picture, which shows this frame's drawing
      const pic = turned ? (F.P.lie ? 'dieLie' : 'dieTip') : null;
      if (pic) { pictured = true; k.key.show = [pic]; k.key.hide = [...allShapes]; k.key.swap = {}; }
      for (const id of Object.keys(pics)) { if (id !== pic) k.key.hide.push(id); k.key.swap[id] = id === pic ? `f${f}` : null; }
    }
    keys.push(k.key); prev = k.key; frees.push(turned ? FREE_BONES : k.free);
    if (k.flash) flash[f] = { flash: true };
    if (!turned) { for (const b of k.bad) bad.push(`frame ${f}: ${b}`); rows.push(k.torsoRows); }
  }
  if (action === 'die' && !pictured) throw new Error('die: the code rig no longer turns its picture; bake die as plain keys');
  if (bad.length) throw new Error(`${clip}: stretch outside 0.5..1.5: ${bad.slice(0, 6).join('; ')}`);
  // a track that holds its rest value on every frame is left out (the rest value stands)
  const rest = REST[direction];
  for (const b of SKELETON) {
    if (b.parent === null) continue;
    if (keys.every((k) => k.bones[b.id] === rest[b.id].angle)) for (const k of keys) delete k.bones[b.id];
    if (!b.node && keys.every((k) => k.stretch[b.id] === 1)) for (const k of keys) delete k.stretch[b.id];
  }
  for (const k of keys) if (!Object.keys(k.stretch).length) delete k.stretch;
  // so are a shape that is shown (or hidden) on every frame as the direction has it anyway, and a stamp's variant that
  // is the direction's own on every frame
  const hiddenHere = SHAPE_INFO.hidden[direction], ownVariant = SHAPE_INFO.variants[direction];
  const ids = new Set(keys.flatMap((k) => [...k.show, ...k.hide]));
  for (const id of ids) {
    const asIs = hiddenHere.has(id) ? 'hide' : 'show';
    if (keys.every((k) => k[asIs].includes(id))) for (const k of keys) k[asIs] = k[asIs].filter((x) => x !== id);
  }
  const stamps = new Set(keys.flatMap((k) => Object.keys(k.swap ?? {})));
  for (const id of stamps) if (keys.every((k) => (k.swap?.[id] ?? null) === (ownVariant[id] ?? null) && Object.hasOwn(k.swap ?? {}, id))) for (const k of keys) delete k.swap[id];
  for (const k of keys) { for (const f of ['show', 'hide']) if (!k[f].length) delete k[f]; if (k.swap && !Object.keys(k.swap).length) delete k.swap; }
  if (Math.min(...rows) < 6 || Math.max(...rows) > 12) throw new Error(`${clip}: the torso is ${Math.min(...rows)} to ${Math.max(...rows)} rows; the two halves cover 6 to 12`);
  const label = `${action[0].toUpperCase()}${action.slice(1)}${clip.includes('_') ? ` (${direction})` : ''}`;
  const out = { label, frames: s.frames, fps: s.fps, loop: s.loop, keys };
  if (Object.keys(flash).length) out.frameEdits = flash;
  if (opt.dense) { Object.defineProperty(out, 'free', { value: frees }); return out; }
  return compactKeys(out, frees);
}

// ---- stamps baked from the code rig's own drawing ----------------------------------------------------------------

/**
 * Draws with a code function on a blank surface and reads the pixels back as a stamp: { rows, key, x0, y0 } where
 * (x0, y0) is the top-left of the block in frame pixels. slots: { slot: '#rrggbb' } the colours the code was given;
 * each pixel becomes the letter of the slot tone it is (base, light, dark, deep), ink, or another listed colour.
 */
export function stampOf(draw, slots, box = null, fixed = null) {
  const g = new Surface(T.SIZE[0], T.SIZE[1]);
  draw(g);
  const tones = new Map();
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').filter((c) => !fixed || !Object.values(fixed).includes(c));
  const key = {};
  let n = 0;
  const add = (hex, ref) => { const c = col(hex); if (!tones.has(c)) { const ch = fixed?.[ref] ?? letters[n++]; tones.set(c, ch); key[ch] = ref; } };
  for (const [slot, hex] of Object.entries(slots)) {
    const r = ramp(hex);
    add(hex, slot); add(r.light, `${slot}.light`); add(r.dark, `${slot}.dark`); add(r.deep, `${slot}.deep`);
  }
  add(INK, 'ink');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (box) [x0, y0, x1, y1] = box;
  if (x0 === Infinity) return { rows: ['.'], key: {}, x0: 0, y0: 0 };
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      const v = g.get(x, y);
      if (!v) { row += '.'; continue; }
      if (!tones.has(v)) throw new Error(`stampOf: a colour that is no tone of ${Object.keys(slots).join(', ')} at ${x},${y}`);
      row += tones.get(v);
    }
    rows.push(row);
  }
  const used = new Set(rows.join(''));
  for (const ch of Object.keys(key)) if (!used.has(ch)) delete key[ch];
  return { rows, key, x0, y0 };
}

/** A solved code pose at rest, for baking stamps: { J, P, d } facing a direction. */
export function restPose(direction) {
  const F = T.frame(`idle_${direction}`, 0, {}, {});
  return { J: T.solve(direction, F.P, F.d), P: F.P, d: F.d };
}

// ---- the base piece ----------------------------------------------------------------------------------------------

const SKIN = LOOK.skin;
// [down, right] offsets on a screen-aligned node
const at = (dx, dy) => [r5(dy), r5(dx)];

function headStamp() {
  const { J, d } = restPose('down');
  const s = stampOf((g) => { const C = ramp(SKIN); g.fill(J.head[0] - d.headW / 2, J.head[1] - d.headH / 2, J.head[0] + d.headW / 2, J.head[1] + d.headH / 2, T.headIn(J, d), C); }, { skin: SKIN });
  return { id: 'skull', kind: 'stamp', on: 'head', at: at(s.x0 - J.head[0], s.y0 - J.head[1]), rows: s.rows, key: s.key, z: 50 };
}

function eyeStamps() {
  const { J, d } = restPose('down');
  const col0 = Math.floor(J.head[0]), ex = d.headW >= 13 ? 3 : 2, ey = J.brow + 1;
  const eye = (sg) => {
    // two wide, so the shut eye's lid (a pixel of skin.dark beside it) fits: the eye is the column away from the lid
    const x = sg < 0 ? col0 - ex - 1 : col0 + ex;
    const open = sg < 0 ? ['.a', '.a'] : ['a.', 'a.'], blink = sg < 0 ? ['..', '.a'] : ['..', 'a.'], shut = sg < 0 ? ['..', 'da'] : ['..', 'ad'];
    return { id: sg < 0 ? 'eyeL' : 'eyeR', kind: 'stamp', on: 'head', at: at(x - J.head[0], ey - J.head[1]), rows: open, key: { a: 'ink', d: 'skin.dark' }, variants: { blink, shut }, z: 52 };
  };
  const mouth = { id: 'mouth', kind: 'stamp', on: 'head', at: at(col0 - 1 - J.head[0], ey + 3 - J.head[1]), rows: ['...', '...'], key: { m: 'skin.deep', g: 'skin.dark' },
    variants: { open: ['.m.', '.m.'], grim: ['...', 'ggg'] }, z: 53 };
  const S = restPose('side');
  const sc = Math.floor(S.J.head[0]), sx = sc + (d.headW >= 13 ? 3 : 2), sy = S.J.brow + 1;
  const eyeSide = { id: 'eyeSide', kind: 'stamp', on: 'head', at: at(sx - S.J.head[0], sy - S.J.head[1]), rows: ['a.', 'a.'], key: { a: 'ink', d: 'skin.dark' },
    variants: { blink: ['..', 'a.'], shut: ['..', 'ad'] }, z: 52, hidden: true };
  const mouthSide = { id: 'mouthSide', kind: 'stamp', on: 'head', at: at(sc + Math.floor(d.headW / 2) - 2 - S.J.head[0], sy + 3 - S.J.head[1]), rows: ['..', '..'], key: { m: 'skin.deep' },
    variants: { open: ['mm', 'mm'] }, z: 53, hidden: true };
  return [eye(-1), eye(1), mouth, eyeSide, mouthSide];
}

/** The shapes of the base (as drawn facing down) and each direction's overlay. */
function baseShapes() {
  const d = DIMS;
  const shapes = [];
  const sideOnly = [], frontOnly = [], downOnly = [], alwaysHidden = [];
  // legs: facing down or up a straight leg of cloth hung from the boot (its top runs on under the torso, which covers it)
  for (const [s, z] of [['B', 10], ['F', 12]]) {
    shapes.push({ id: `leg${s}`, kind: 'limb', on: `foot${s}`, from: at(1.5, -11.5), to: at(1.5, -1.5), width: d.legW, paint: 'bottom', z });
    shapes.push({ id: `leg${s}Side`, kind: 'limb', on: `leg${s}`, width: Math.min(3, d.legW), paint: s === 'B' ? 'bottomFar' : 'bottom', z, hidden: true });
    shapes.push({ id: `leg${s}SideIn`, kind: 'limb', on: `legI${s}`, width: Math.min(3, d.legW), paint: s === 'B' ? 'bottomFar' : 'bottom', z, hidden: true });
    alwaysHidden.push(`leg${s}SideIn`);
    shapes.push({ id: `boot${s}`, kind: 'stamp', on: `foot${s}`, at: [0, 0], rows: ['bbb', 'bbb', 'ddd'],
      key: { b: 'boots', d: 'boots.dark', B: 'boots.dark', D: 'boots.deep' },
      variants: { h3: ['bbb', 'bbb', 'ddd'], h2: ['bbb', 'ddd'], h1: ['ddd'], flat: ['bbbbb', 'ddddd'], lifted: ['bbbb', 'dddb'], flatFar: ['BBBBB', 'DDDDD'], liftedFar: ['BBBB', 'DDDB'] }, z: z + 1 });
    frontOnly.push(`leg${s}`); sideOnly.push(`leg${s}Side`);
  }
  // the torso: facing down or up the upper rows hang from the chest (two narrower rows at the top), the lower rows
  // from the waist; one body (group), as the code rig fills it in one go
  const n = d.chestR - 1 + 0.125, w = d.chestR + 0.125;
  shapes.push({ id: 'torso', kind: 'poly', on: 'chest', points: [at(-n, 0), at(n, 0), at(n, 2), at(w, 2), at(w, 6), at(-w, 6), at(-w, 2), at(-n, 2)], paint: 'top', group: 'torso', z: 20 });
  shapes.push({ id: 'torsoLow', kind: 'poly', on: 'waist', points: [at(-w, -6), at(w, -6), at(w, 0), at(-w, 0)], paint: 'top', group: 'torso', z: 20 });
  frontOnly.push('torso', 'torsoLow');
  // seen from the side: a stamp on the waist, one variant per lean and height (see torsoVariant)
  {
    const S = restPose('side'), rest = torsoVariant(S.J, d), all = sideTorsos();
    shapes.push({ id: 'torsoSide', kind: 'stamp', on: 'waist', at: at(-7.5, -12), rows: rest.rows,
      key: Object.fromEntries(Object.entries(TORSO_LETTERS).map(([ref, ch]) => [ch, ref])), variants: { ...all }, z: 20, hidden: true });
    sideOnly.push('torsoSide');
  }
  // sleeves: the rim under each (facing down or up), the sleeve, the fist
  const RIM_VARIANTS = Object.fromEntries(['001', '010', '011', '100', '101', '110', '111'].map((b) => [`r${b}`, [b.replace(/1/g, 'd').replace(/0/g, '.')]]));
  const rimRow = (id, on, pos, z) => ({ id, kind: 'stamp', on, at: pos, rows: ['...'], key: { d: 'top.dark' }, variants: RIM_VARIANTS, z });
  for (const [s, z] of [['B', 30], ['F', 33]]) {
    shapes.push({ id: `rim${s}`, kind: 'limb', on: `rimA${s}`, from: [0, 0], to: [3, 0], width: d.armW, paint: 'top.dark', z });
    shapes.push({ id: `rim${s}2`, kind: 'limb', on: `rimA${s}`, from: [3, 0], to: [6, 0], width: d.armW, paint: 'top.dark', z });
    shapes.push({ id: `rim${s}In`, kind: 'limb', on: `rimI${s}`, width: d.armW, paint: 'top.dark', z, hidden: true });
    shapes.push(rimRow(`rimTop${s}`, `armTop${s}`, at(-1.5, -2.5), z), rimRow(`rimLow${s}`, `cuff${s}`, at(-1.5, 1.5), z));
    frontOnly.push(`rim${s}2`);
    shapes.push({ id: `sleeve${s}`, kind: 'limb', on: `arm${s}`, width: d.armW, paint: 'top', z: z + 1 });
    shapes.push({ id: `sleeve${s}In`, kind: 'limb', on: `armI${s}`, width: d.armW, paint: 'top', z: z + 1, hidden: true });
    shapes.push({ id: `sleeve${s}Dot`, kind: 'limb', on: `armI${s}`, from: [0, 0], to: [0, 0], width: d.armW, paint: 'top', z: z + 1, hidden: true });
    shapes.push({ id: `rim${s}Dot`, kind: 'limb', on: `rimI${s}`, from: [0, 0], to: [0, 0], width: d.armW, paint: 'top.dark', z, hidden: true });
    alwaysHidden.push(`sleeve${s}Dot`, `rim${s}Dot`);
    shapes.push({ id: `fist${s}`, kind: 'stamp', on: `fist${s}`, at: [0, 0], rows: ['sss', 'sss'], key: { s: 'skin', S: 'skin.dark' }, variants: { far: ['SSS', 'SSS'] }, z: z + 2 });
    frontOnly.push(`rim${s}`);
    alwaysHidden.push(`rim${s}In`, `sleeve${s}In`);
  }
  shapes.push({ id: 'sleeveBSide', kind: 'limb', on: 'armB', width: d.armW, paint: 'topFar', z: 5, hidden: true });
  shapes.push({ id: 'sleeveBSideIn', kind: 'limb', on: 'armIB', width: d.armW, paint: 'topFar', z: 5, hidden: true });
  shapes.push({ id: 'sleeveBSideDot', kind: 'limb', on: 'armIB', from: [0, 0], to: [0, 0], width: d.armW, paint: 'topFar', z: 5, hidden: true });
  alwaysHidden.push('sleeveBSideDot');
  // seen from the side: the near sleeve's rim a pixel to its left (on the F rim chain) and to its right (on the B one)
  for (const [id, sd] of [['rimFL', 'F'], ['rimFR', 'B']]) {
    shapes.push({ id, kind: 'limb', on: `rimA${sd}`, from: [0, 0], to: [3, 0], width: d.armW, paint: 'top.dark', z: 70, hidden: true });
    shapes.push({ id: `${id}2`, kind: 'limb', on: `rimA${sd}`, from: [3, 0], to: [6, 0], width: d.armW, paint: 'top.dark', z: 70, hidden: true });
    shapes.push({ id: `${id}In`, kind: 'limb', on: `rimI${sd}`, width: d.armW, paint: 'top.dark', z: 70, hidden: true });
    shapes.push({ id: `${id}Dot`, kind: 'limb', on: `rimI${sd}`, from: [0, 0], to: [0, 0], width: d.armW, paint: 'top.dark', z: 70, hidden: true });
    sideOnly.push(id, `${id}2`); alwaysHidden.push(`${id}In`, `${id}Dot`);
  }
  sideOnly.push('sleeveBSide');
  alwaysHidden.push('sleeveBSideIn');
  // head and face
  shapes.push(headStamp());
  const face = eyeStamps();
  shapes.push(...face);
  downOnly.push('eyeL', 'eyeR', 'mouth');
  sideOnly.push('eyeSide', 'mouthSide');
  // die: the code rig's own drawing of the frames where it tips over and lies down (see picturePoint)
  for (const [id, pic] of Object.entries(diePictures())) { shapes.push({ id, kind: 'stamp', on: 'root', at: pic.at, rows: ['.'], key: pic.key, variants: pic.variants, z: 1, hidden: true }); alwaysHidden.push(id); }

  const hide = (ids, h) => Object.fromEntries(ids.map((id) => [id, { hidden: h }]));
  const shapesOf = (dir) => ({
    ...hide(frontOnly, dir === 'side'), ...hide(sideOnly, dir !== 'side'), ...hide(downOnly, dir !== 'down'), ...hide(alwaysHidden, true),
    ...(dir === 'side' ? { sleeveB: { hidden: true }, fistB: { z: 6 }, sleeveF: { z: 71 }, fistF: { z: 72 }, rimTopF: { z: 70 }, rimLowF: { z: 70 } } : {}),
    ...(dir === 'down' ? { fistB: { z: 60 }, fistF: { z: 62 } } : {}),
    ...(dir === 'up' ? { fistB: { z: 32 }, fistF: { z: 35 } } : {}),
  });
  // stamps' rows facing each way: the boots' depth and the far fist
  const stampsOf = (dir) => (dir === 'side' ? { bootF: { variant: 'flat' }, bootB: { variant: 'flatFar' }, fistB: { variant: 'far' } } : dir === 'up' ? { bootF: { variant: 'h2' }, bootB: { variant: 'h2' } } : {});
  // the shapes as written are the down view
  for (const s of shapes) { const o = shapesOf('down')[s.id]; if (o) Object.assign(s, o); }
  return { shapes, shapesOf, stampsOf };
}

// The helper bones whose only work is to carry a shape that some frames hide (the short sleeve, the rims, the short
// side leg): on such a frame their angle and stretch are left to the blend (compactKeys). Bones parts hang on are
// never among them, so a part always follows.
const FREE_BONES = SKELETON.filter((b) => /^(armI|rimA|rimI|rimS|legI)[FB]$/.test(b.id)).map((b) => b.id);
/** What the free bones carry and which shapes each direction hides by default: { carried: Map(bone -> shape ids), hidden: { dir: Set } }. */
const SHAPE_INFO = (() => {
  const { shapes, shapesOf, stampsOf } = baseShapes();
  const carried = new Map();
  const childOf = new Map(SKELETON.map((b) => [b.id, SKELETON.filter((c) => c.parent === b.id).map((c) => c.id)]));
  const under = (id) => [id, ...(childOf.get(id) ?? []).flatMap(under)];
  for (const b of FREE_BONES) { const ids = new Set(under(b)); carried.set(b, shapes.filter((x) => ids.has(x.on)).map((x) => x.id)); }
  const hidden = Object.fromEntries(DIRECTIONS.map((dir) => { const o = shapesOf(dir); return [dir, new Set(shapes.filter((x) => (o[x.id]?.hidden ?? x.hidden) === true).map((x) => x.id))]; }));
  const variants = Object.fromEntries(DIRECTIONS.map((dir) => [dir, Object.fromEntries(Object.entries(stampsOf(dir)).map(([id, o]) => [id, o.variant ?? null]))]));
  return { carried, hidden, variants };
})();

/** The clips of base:person-topdown-walker: a villager who stands, walks and talks (rigs/topdown.js clips() with no directed action and plain ['talk']). */
export const WALKER_CLIPS = Object.freeze(['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'talk']);

/**
 * The base piece, as plain data: base:person-topdown@1 with every standard clip (BASE_CLIPS), or with kind 'walker'
 * base:person-topdown-walker@1, the same rig with WALKER_CLIPS only. A sprite takes every clip of the base it extends
 * (engine/resolve.js clipNames) and has no way yet to pick some (extends.clips, asked of B1/B4), so a villager that
 * never fights extends the walker rather than inheriting rolls and falls its parts were never drawn for.
 */
export function basePiece(kind = 'all') {
  const { shapes, shapesOf, stampsOf } = baseShapes();
  const restDown = REST.down;
  const bones = [], nodes = [];
  for (const b of SKELETON) {
    if (b.parent === null) { nodes.push({ id: b.id, parent: null, at: ROOT_AT, angle: 0 }); continue; }
    const r = restDown[b.id];
    if (b.node) nodes.push({ id: b.id, parent: b.parent, angle: r.angle });
    else bones.push({ id: b.id, parent: b.parent, angle: r.angle, length: r.length });
  }
  const directions = {};
  for (const dir of DIRECTIONS) {
    const bo = {};
    for (const b of SKELETON) {
      if (b.parent === null) continue;
      const r = REST[dir][b.id];
      bo[b.id] = b.node ? { angle: r.angle } : { angle: r.angle, length: r.length };
    }
    directions[dir] = { bones: bo, shapes: shapesOf(dir), stamps: stampsOf(dir) };
  }
  const walker = kind === 'walker';
  const clips = Object.fromEntries((walker ? WALKER_CLIPS : BASE_CLIPS).map((c) => [c, bakeClip(c)]));
  const SK = ramp(LOOK.top), BT = ramp(LOOK.bottom);
  return {
    format: 'loadout-piece', version: 1, id: walker ? 'base:person-topdown-walker' : 'base:person-topdown', v: 1, name: walker ? 'Top-down walker' : 'Top-down person',
    about: walker ? 'base:person-topdown with idle, walk (three directions) and talk only, for villagers who never fight: the same rig, bald, nothing worn or held.'
      : 'A person seen from above in three directions, 48x48, with every standard clip of rigs/topdown.js: the body it draws, bald, nothing worn or held.',
    slots: [
      { id: 'skin', label: 'Skin', default: LOOK.skin, material: 'skin' },
      { id: 'top', label: 'Top', default: LOOK.top, material: 'cloth' },
      { id: 'bottom', label: 'Legs', default: LOOK.bottom, material: 'cloth' },
      { id: 'boots', label: 'Boots', default: LOOK.boots, material: 'cloth' },
      { id: 'topFar', label: 'Far sleeve', default: SK.dark, material: 'cloth' },
      { id: 'bottomFar', label: 'Far leg', default: BT.dark, material: 'cloth' },
    ],
    made: { by: 'tools/bake-topdown.mjs', from: 'rigs/topdown.js' },
    body: {
      rig: {
        view: 'top-down', size: [...T.SIZE], bones, nodes, shapes,
        points: [
          { id: 'hand', on: 'handF', at: [0, 0] },
          { id: 'offhand', on: 'handB', at: [0, 0] },
          { id: 'head', on: 'head', at: [-DIMS.headH / 2, 0], angle: 180 },
          { id: 'back', on: 'chest', at: [2, 0] },
          { id: 'feet', on: 'root', at: [0, 0] },
          { id: 'muzzle', on: 'handF', at: [6, 0] },
        ],
        directions,
      },
      clips,
    },
  };
}

// ---- part pieces -------------------------------------------------------------------------------------------------
// Worn and held things of the top-down family, each drawn on one node of the base for the three directions (items
// with `when: { direction }`), at the base's head and body size. What never changes shape is a stamp baked from the
// code rig's own drawing; what a slider sizes is shapes whose numbers are bound to the piece's args (tables made by
// sampling the code rig's sums, mapOf). Hair styles, hats and held things of the other sprites of the family follow
// the same pattern (not all baked yet: see the B16b report).

/** A binding of arg `from` that follows fn over lo..hi as a table: { from, map } (at most 32 points; steps kept as steps). */
export function mapOf(from, fn, lo, hi, tol = 0.02) {
  const N = 520, xs = [], ys = [];
  for (let i = 0; i <= N; i++) { const x = lo + ((hi - lo) * i) / N; xs.push(x); ys.push(fn(x)); }
  for (let tl = tol; ; tl *= 1.5) {
    const keep = [0];
    let a = 0;
    for (let b = 2; b <= N; b++) {
      const ok = (() => { for (let k = a + 1; k < b; k++) { const y = ys[a] + ((ys[b] - ys[a]) * (xs[k] - xs[a])) / (xs[b] - xs[a]); if (Math.abs(y - ys[k]) > tl) return false; } return true; })();
      if (!ok) { keep.push(b - 1); a = b - 1; }
    }
    keep.push(N);
    if (keep.length <= 32) return { from, map: keep.map((i) => [r5(xs[i]), r5(ys[i])]) };
  }
}

const HAIR = '#e8e0c8', CLOTH = '#8a8f99', TRIM = '#9a3a2e', GOLD = '#e0b040', WOOD = '#8a5a34', GLOW = '#f4e06a', IRON = '#7a6a5a';
const dirWhen = (dir) => ({ direction: [dir] });

/** A stamp of a code drawing at rest facing dir, placed on a node at `node` (frame px): an item of a piece's draw list. */
function stampItem(id, dir, node, draw, slots, z, extra = {}) {
  const st = stampOf(draw, slots);
  if (st.rows.length === 1 && st.rows[0] === '.') return null;
  return { id, kind: 'stamp', at: at(st.x0 - node[0], st.y0 - node[1]), rows: st.rows, key: st.key, z, when: dirWhen(dir), ...extra };
}

function piece(id, name, about, slots, args, draw) {
  return { format: 'loadout-piece', version: 1, id, v: 1, name, about, slots, ...(args ? { args } : {}), made: { by: 'tools/bake-topdown.mjs', from: 'rigs/topdown.js' }, body: { draw: draw.filter(Boolean) } };
}

function hairRing() {
  const draw = DIRECTIONS.map((dir) => { const { J, P, d } = restPose(dir); return stampItem(`ring-${dir}`, dir, J.head, (g) => T.baldingHair(g, J, P, d, { colour: HAIR }), { hair: HAIR }, 4); });
  return piece('part:topdown-hair-ring', 'Ring of hair', 'A bald crown ringed with hair at the temples and round the back, on the head of base:person-topdown.',
    [{ id: 'hair', label: 'Hair', default: HAIR, material: 'plant' }], null, draw);
}

function beardPiece() {
  const draw = [];
  for (const dir of ['down', 'side']) {
    const { J, P, d } = restPose(dir);
    const cx = J.head[0], rx = d.headW / 2, chin = J.headTop + d.headH, inH = T.headIn(J, d), top = J.brow + 4;
    // the jaw and the moustache row: what both kinds share (a stamp of the code rig's long beard, cut two rows above
    // the chin, where the short beard's tuft and the long beard's tail begin; cut lower, the short beard's tuft is in it,
    // a pixel wider than the jaw, and the long beard stood a pixel proud of the face line from the side)
    const jaw = stampOf((g) => { T.beard(g, J, { ...P, mouth: false, sway: 0 }, d, { kind: 'long', length: 0.65, colour: HAIR }); }, { hair: HAIR },
      [Math.floor(cx - rx) - 1, top - 1, Math.ceil(cx + rx) + 1, chin - 2]);
    draw.push({ id: `jaw-${dir}`, kind: 'stamp', at: at(jaw.x0 - J.head[0], jaw.y0 - J.head[1]), rows: jaw.rows, key: jaw.key, z: 2, when: dirWhen(dir) });
    const hy = (x) => r5(x - J.head[1]), hx = (x) => r5(x - J.head[0]);
    const longHang = (L) => Math.max(3, Math.round((d.torso - d.chin) * 0.75 * L));
    const shortHang = (L) => Math.max(1, Math.round(2 * L));
    if (dir === 'down') {
      draw.push({ id: 'tail-down', kind: 'poly', paint: 'hair', z: 1, when: [{ direction: ['down'], kind: ['long'] }],
        points: [[hy(chin - 1), hx(cx - rx + 1.5)], [hy(chin - 1), hx(cx + rx - 1.5)], [mapOf('length', (L) => hy(chin + longHang(L)), 0.65, 1.35), hx(cx + 1)], [mapOf('length', (L) => hy(chin + longHang(L)), 0.65, 1.35), hx(cx - 1)]] });
      draw.push({ id: 'tuft-down', kind: 'ellipse', paint: 'hair', z: 1, when: [{ direction: ['down'], kind: ['short'] }], at: [hy(chin - 0.5), hx(cx)], r: [mapOf('length', (L) => shortHang(L) + 0.5, 0.65, 1.35), rx - 1.5] });
    } else {
      const tip = cx + rx * 0.45;
      draw.push({ id: 'tail-side', kind: 'poly', paint: 'hair', z: 1, when: [{ direction: ['side'], kind: ['long'] }],
        points: [[hy(chin - 1), hx(cx - 1.5)], [hy(chin - 1.5), hx(cx + rx - 0.4)], [mapOf('length', (L) => hy(chin + longHang(L)), 0.65, 1.35), hx(tip + 1)], [mapOf('length', (L) => hy(chin + longHang(L)), 0.65, 1.35), hx(tip - 1)]] });
      draw.push({ id: 'tuft-side', kind: 'ellipse', paint: 'hair', z: 1, when: [{ direction: ['side'], kind: ['short'] }], at: [hy(chin - 0.5), hx(cx + rx * 0.35)], r: [mapOf('length', (L) => shortHang(L) + 0.5, 0.65, 1.35), r5(rx * 0.6)] });
    }
  }
  return piece('part:topdown-beard', 'Beard', 'A beard over the jaw, long down the chest or short round the chin, facing down and sideways (nothing shows from behind).',
    [{ id: 'hair', label: 'Beard', default: HAIR, material: 'plant' }],
    { kind: { type: 'word', options: ['long', 'short'], default: 'long' }, length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } }, draw);
}

function capPiece() {
  const draw = [];
  for (const dir of DIRECTIONS) {
    const { J, d } = restPose(dir);
    const cx = J.head[0], cy = J.head[1], brim = J.brow - 1, rx = d.headW / 2;
    // the crown: the head's outline grown by 0.2 + 0.7 x size, above the brim, as a polygon whose points follow the size
    const N = 14, pts = [];
    for (let i = 0; i <= N; i++) {
      const pt = (sz) => {
        const g = 0.2 + 0.7 * sz, RX = rx - 0.1 + g, RY = d.headH / 2 + g, yb = brim - cy;
        const th0 = Math.asin(Math.min(1, (Math.abs(yb) / RY) ** 1.25)), th = th0 + ((Math.PI - 2 * th0) * i) / N;
        const c = Math.cos(th), sn = Math.sin(th);
        return [-Math.sign(c) * RX * Math.abs(c) ** 0.8, -RY * sn ** 0.8];
      };
      pts.push([mapOf('size', (sz) => r5(pt(sz)[1]), 0.5, 1.8, 0.01), mapOf('size', (sz) => r5(pt(sz)[0]), 0.5, 1.8, 0.01)]);
    }
    draw.push({ id: `crown-${dir}`, kind: 'poly', points: pts, paint: 'cloth', z: 6, when: dirWhen(dir) });
    const peak = (sz) => 1 + Math.round(1.6 * sz), x0 = Math.floor(cx);
    if (dir === 'down') draw.push({ id: 'peak-down', kind: 'rect', at: [brim - cy, mapOf('size', (sz) => x0 - 1 - peak(sz) - cx, 0.5, 1.8, 0.001)], size: [mapOf('size', (sz) => 3 + 2 * peak(sz), 0.5, 1.8, 0.001), 1], paint: 'cloth.dark', z: 7, when: dirWhen(dir) });
    else if (dir === 'side') draw.push({ id: 'peak-side', kind: 'rect', at: [brim - 1 - cy, Math.floor(cx + rx) - 2 - cx], size: [mapOf('size', (sz) => 2 + peak(sz), 0.5, 1.8, 0.001), 2], paint: 'cloth.dark', z: 7, when: dirWhen(dir) });
    else draw.push({ id: 'band-up', kind: 'rect', at: [brim - 1 - cy, mapOf('size', (sz) => Math.round(-(rx - 0.1 + 0.2 + 0.7 * sz) * (1 - (1 / (d.headH / 2 + 0.2 + 0.7 * sz)) ** 2.5) ** 0.4 + 0.5) - 0.5, 0.5, 1.8, 0.001)],
      size: [mapOf('size', (sz) => 2 * Math.round((rx - 0.1 + 0.2 + 0.7 * sz) * (1 - (1 / (d.headH / 2 + 0.2 + 0.7 * sz)) ** 2.5) ** 0.4 - 0.5) + 1, 0.5, 1.8, 0.001), 1], paint: 'cloth.dark', z: 7, when: dirWhen(dir) });
  }
  return piece('part:topdown-cap-peaked', 'Peaked cap', 'A soft cap with a peak over the brow, a crown that puffs up with its size; worn over short or no hair.',
    [{ id: 'cloth', label: 'Cap', default: TRIM, material: 'cloth' }], { size: { type: 'px', lo: 0.5, hi: 1.8, default: 1 } }, draw);
}

function circletPiece() {
  const draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d } = restPose(dir);
    const cx = J.head[0], cy = J.head[1], rx = d.headW / 2, y1 = J.brow - 1;
    // the band: a stamp of the code rig's band one row deep, lifted a row from size 1.25 (where the code rig deepens it
    // to two), over a row of its shadow tone that the lifted band uncovers
    const one = stampOf((g) => T.circlet(g, J, P, d, { size: 1, metal: GOLD, gem: null }), { metal: GOLD });
    const two = stampOf((g) => T.circlet(g, J, P, d, { size: 1.5, metal: GOLD, gem: null }), { metal: GOLD }, [Math.floor(cx - rx) - 2, y1 - 1, Math.ceil(cx + rx) + 2, y1 - 1]);
    const lift = mapOf('size', (sz) => r5(one.y0 - cy - (sz >= 1.25 ? 1 : 0)), 0.5, 1.8, 0.001);
    draw.push({ id: `band-${dir}`, kind: 'stamp', at: [lift, r5(one.x0 - cx)], rows: one.rows, key: one.key, z: 5, when: dirWhen(dir) });
    draw.push({ id: `under-${dir}`, kind: 'stamp', at: at(two.x0 - cx, two.y0 - cy), rows: two.rows, key: two.key, z: 4, when: dirWhen(dir) });

    if (dir === 'up') continue;
    const w = (sz) => (sz < 0.8 ? 1 : sz < 1.5 ? 2 : 3), deep = (sz) => (sz >= 1.25 ? 2 : 1), h = (sz) => deep(sz) + (w(sz) > 1 ? 1 : 0);
    const gx = (sz) => (dir === 'side' ? Math.floor(cx + rx) - w(sz) : Math.floor(cx) - Math.floor((w(sz) - 1) / 2)) - cx;
    draw.push({ id: `stone-${dir}`, kind: 'rect', at: [mapOf('size', (sz) => y1 - h(sz) - cy, 0.5, 1.8, 0.001), mapOf('size', gx, 0.5, 1.8, 0.001)],
      size: [mapOf('size', w, 0.5, 1.8, 0.001), mapOf('size', h, 0.5, 1.8, 0.001)], paint: 'gem.base', z: 6, when: dirWhen(dir) });
  }
  return piece('part:topdown-circlet', 'Circlet', 'A thin band of metal round the brow with a stone at the front, hair or skin showing above it.',
    [{ id: 'metal', label: 'Metal', default: GOLD, material: 'metal' }, { id: 'gem', label: 'Stone', default: TRIM, material: 'magic' }],
    { size: { type: 'px', lo: 0.5, hi: 1.8, default: 1 } }, draw);
}

// what a held thing hangs from: the base's handF node, turned the way the code rig's carry 'up' points (the base is
// baked with nothing held); a thing carried another way turns its own points by the difference, per direction
const UP = T.CARRY.up;
function canePiece() {
  // planted as rigs/topdown.js plantStick() plants it at rest: the tip on the ground (half a pixel above the ground
  // row) out to the hand's side facing down or up and ahead of the body from the side, the top where the code rig puts
  // the hand for a stick of that length. It stands on the root (the ground under the body), so it stays planted
  // whatever the body does; the hand meets its top at rest (the base's hand still swings as it walks). The crook is a
  // pixel up and in from the top, under the fist.
  const draw = [];
  for (const dir of DIRECTIONS) {
    const side = dir === 'side';
    const geo = (L) => {
      const F = T.frame(`idle_${dir}`, 0, {}, {});
      const P = structuredClone(F.P);
      T.plantStick(P, dir, F.d, { action: 'idle', t: 0, length: L });
      const J = T.solve(dir, P, F.d), sx = J.armF.shoulder[0];
      const tip = side ? [sx + 5 + 1.5, J.gy - 0.5] : [sx + J.s * 3.5, J.gy - 0.5];
      return { tip, top: J.armF.hand, out: side ? 1 : J.s };
    };
    const g0 = geo(11), out = g0.out;
    const on = ([x, y]) => [r5(y - ROOT_AT[1]), r5(x - ROOT_AT[0])];
    const top = (L) => on(geo(L).top), tip = on(g0.tip);
    const z = dir === 'down' ? 1 : dir === 'up' ? -60 : -1;
    const B = (i, fn) => mapOf('length', (L) => fn(L)[i], 6, 16, 0.01);
    draw.push({ id: `stick-${dir}`, kind: 'line', from: tip, to: [B(0, top), B(1, top)], paint: 'wood', z, when: dirWhen(dir) });
    draw.push({ id: `crook-${dir}`, kind: 'line', from: [B(0, top), B(1, top)], to: [B(0, (L) => [top(L)[0] - 1, top(L)[1] - out]), B(1, (L) => [top(L)[0] - 1, top(L)[1] - out])], paint: 'wood', z, when: dirWhen(dir) });
  }
  return piece('held:topdown-cane', 'Walking stick', 'A walking stick planted on the ground beside the body (ahead of it from the side), its crook where the weapon hand rests; on the root node.',
    [{ id: 'wood', label: 'Wood', default: WOOD, material: 'wood' }], { length: { type: 'px', lo: 6, hi: 16, default: 11 } }, draw);
}

function lanternPiece() {
  // hung from the hand (the screen-aligned cuffF node at the hand): a ring, a cap, a pane of light between two posts, a base
  const draw = [];
  const hgt = (L) => Math.max(4, Math.round(L) - 2), wid = (L) => (L >= 10 ? 7 : 5), x = (L) => -0.5 - (wid(L) - 1) / 2;
  const B = (fn) => mapOf('length', fn, 6, 14, 0.001);
  for (const dir of DIRECTIONS) {
    const z = dir === 'up' ? -60 : dir === 'down' ? 1 : -1, w = dirWhen(dir);
    draw.push(
      { id: `ring-${dir}`, kind: 'line', from: [0, 0], to: [2, 0], paint: 'metal.dark', z, when: w },
      { id: `pane-${dir}`, kind: 'rect', at: [2.5, B(x)], size: [B(wid), B((L) => hgt(L) - 2)], paint: 'glow.base', z, when: w },
      { id: `light-${dir}`, kind: 'rect', at: [2.5, -0.5], size: [1, B((L) => hgt(L) - 2)], paint: 'glow.light', z, when: w },
      { id: `postL-${dir}`, kind: 'rect', at: [2.5, B(x)], size: [1, B((L) => hgt(L) - 2)], paint: 'metal.base', z, when: w },
      { id: `postR-${dir}`, kind: 'rect', at: [2.5, B((L) => x(L) + wid(L) - 1)], size: [1, B((L) => hgt(L) - 2)], paint: 'metal.base', z, when: w },
      { id: `cap-${dir}`, kind: 'rect', at: [1.5, B((L) => x(L) + 1)], size: [B((L) => wid(L) - 2), 1], paint: 'metal.dark', z, when: w },
      { id: `base-${dir}`, kind: 'rect', at: [B((L) => 1.5 + hgt(L) - 1), B(x)], size: [B(wid), 1], paint: 'metal.dark', z, when: w });
  }
  return piece('held:topdown-lantern', 'Lantern', 'A lantern hanging from the hand by a ring: a cap, a pane of light between two posts and a base; hang it on the cuffF node.',
    [{ id: 'metal', label: 'Metal', default: IRON, material: 'metal' }, { id: 'glow', label: 'Light', default: GLOW, material: 'light' }],
    { length: { type: 'px', lo: 6, hi: 14, default: 10 } }, draw);
}

// the half width of the chest (rigs/topdown.js dims chestR) at Build 0, 0.5 and 1: what a width argument spans
const CHEST = [T.dims({ build: 0 }).chestR, DIMS.chestR, T.dims({ build: 1 }).chestR];

/**
 * The rows a code drawing fills at rest facing dir, as a staircase polygon on the hip bone (u up from the ground under
 * the body, v to the screen's left of it), each corner bound to the piece's `width` arg (the chest's half width) by a
 * table: the polygon fills exactly the code rig's pixels at every width, and it follows the hip bone, so it shortens in
 * a crouch and lengthens with a taller body. draw(g, J, P, d) draws the code; rows: which rows to take (default all).
 */
function rowsOnHip(dir, draw, rows = null) {
  const { J, P } = restPose(dir);
  const at = (w) => { const g = new Surface(T.SIZE[0], T.SIZE[1]); draw(g, J, P, { ...DIMS, chestR: w }); return g; };
  const ext = (w) => {
    const g = at(w), out = new Map();
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) { const e = out.get(y) ?? [x, x]; out.set(y, [Math.min(e[0], x), Math.max(e[1], x)]); }
    return out;
  };
  const ys = [...ext(DIMS.chestR).keys()].filter((y) => !rows || rows(y)).sort((p, q) => p - q);
  const u = (y) => r5(ROOT_AT[1] - y), v = (x) => (w) => r5(ROOT_AT[0] - x);
  const bind = (fn) => { const m = mapOf('width', fn, CHEST[0], CHEST[2], 0.001); return m.map.every(([, y]) => y === m.map[0][1]) ? m.map[0][1] : m; };
  const left = [], right = [];
  for (const y of ys) {
    // the leftmost and rightmost pixel of the row at width w (a row the width empties keeps its neighbour's edge)
    const L = (w) => (ext(w).get(y) ?? ext(DIMS.chestR).get(y))[0], R = (w) => (ext(w).get(y) ?? ext(DIMS.chestR).get(y))[1] + 1;
    left.push([u(y), bind((w) => v(L(w))(w))], [u(y + 1), bind((w) => v(L(w))(w))]);
    right.push([u(y), bind((w) => v(R(w))(w))], [u(y + 1), bind((w) => v(R(w))(w))]);
  }
  return [...left, ...right.reverse()];
}

function robePiece() {
  const draw = [];
  for (const dir of DIRECTIONS) {
    const robe = (g, J, P, d) => T.robe(g, J, P, d, { colour: CLOTH, length: 0.55 });
    const { J, P } = restPose(dir);
    const g = new Surface(T.SIZE[0], T.SIZE[1]); robe(g, J, P, DIMS);
    let hem = 0; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) hem = Math.max(hem, y);
    draw.push({ id: `robe-${dir}`, kind: 'poly', points: rowsOnHip(dir, robe), paint: 'cloth', z: 0, when: dirWhen(dir) });
    // the hem: its row, 1.45 rows deep, so a pixel row's centre falls in it however the hip bone is scaled (0.53 to
    // 1.2: Height and Stoop together); at a scale over 1 it may take two rows
    const top = r5(ROOT_AT[1] - hem);
    draw.push({ id: `hem-${dir}`, kind: 'poly', points: rowsOnHip(dir, robe, (y) => y === hem).map(([u, v]) => [u === top ? r5(top + 0.45) : u, v]), paint: 'trim.base', z: 1, when: dirWhen(dir) });
  }
  return piece('part:topdown-robe', 'Robe', 'A robe that hides the legs to above the ankle, with a band of trim along its hem; on the hip bone, so it follows a crouch and the body\'s height.',
    [{ id: 'cloth', label: 'Robe', default: CLOTH, material: 'cloth' }, { id: 'trim', label: 'Hem', default: TRIM, material: 'cloth' }],
    { width: { type: 'px', lo: r5(CHEST[0]), hi: r5(CHEST[2]), default: r5(DIMS.chestR) } }, draw);
}

function beltPiece() {
  const draw = DIRECTIONS.map((dir) => {
    const { J, P, d } = restPose(dir);
    return stampItem(`belt-${dir}`, dir, [J.bx, J.hip[1]], (g) => { const u = new Surface(g.w, g.h); T.robe(u, J, P, d, { colour: CLOTH }); T.belt(u, J, P, d, { colour: TRIM });
      const r = new Surface(g.w, g.h); T.robe(r, J, P, d, { colour: CLOTH }); for (let i = 0; i < g.data.length; i++) if (u.data[i] !== r.data[i]) g.data[i] = u.data[i]; }, { belt: TRIM }, 1);
  });
  return piece('part:topdown-belt', 'Belt', 'A belt round the waist in the shadow tone of its colour, on the waist node; worn over a robe or a tunic.',
    [{ id: 'belt', label: 'Belt', default: TRIM, material: 'cloth' }], null, draw);
}

function hunchPiece() {
  const draw = [];
  { // seen from the side: a hump behind the neck
    const { J, d } = restPose('side');
    const top = J.shoulderY + d.chin, wide = Math.round(d.chestR * 1.7), x = J.neck[0] - wide / 2 + 0.6, node = [J.neck[0], J.shoulderY + d.chin - 1];
    draw.push({ id: 'hump-side', kind: 'ellipse', at: [r5(top + 1.6 - node[1]), r5(x - node[0])], r: [mapOf('amount', (a) => 2.2 + 1.4 * a, 0, 1), mapOf('amount', (a) => 1.2 + 1.6 * a, 0, 1)], paint: 'cloth', z: 2, when: dirWhen('side') });
  }
  { // from behind: rounded shoulders that rise over the bottom of the head, and the back below them down to where the
    // head ends (it hides the bottom of the head and the sleeves between, as the code rig's front hook does). Below an
    // amount of 0.15 the code rig draws nothing: the shapes fold flat there.
    const { J, d } = restPose('up');
    const top = J.shoulderY + d.chin, rx = d.chestR + d.armW - 0.6, node = [J.neck[0], J.shoulderY + d.chin - 1];
    const on = (a) => a >= 0.15;
    // the upper half of an ellipse on the shoulder line (the code rig's fill above top + 1), its height following the amount
    const N = 12, pts = [];
    // (a row taller than the code rig's: on this base a stoop sinks the body more and the head less than stoop() does,
    // so the head sits a row higher over the shoulders, and the shoulders still rise over its bottom)
    for (let i = 0; i <= N; i++) { const th = (Math.PI * i) / N; pts.push([mapOf('amount', (a) => r5(top + 1 - node[1] - (on(a) ? 1.8 + 2.6 * a : 0) * Math.sin(th)), 0, 1, 0.01), r5(-rx * Math.cos(th))]); }
    draw.push({ id: 'shoulders-up', kind: 'poly', points: pts, paint: 'cloth.base', z: 30, when: dirWhen('up') });
    // the back: from the shoulder line to a row under the head, which sinks as the body stoops (rigs/topdown.js stoop)
    const low = (a) => { const F = T.frame('idle_up', 0, {}, {}); const P = T.stoop({ ...F.P }, 'up', a); const K = T.solve('up', P, F.d); return K.headTop + F.d.headH + 1 - (K.shoulderY + F.d.chin); };
    const half = d.headW / 2 + 0.5, y0 = top + 1 - node[1];
    const bottom = mapOf('amount', (a) => r5(on(a) ? y0 + low(a) - 1 : y0), 0, 1, 0.01);
    draw.push({ id: 'back-up', kind: 'poly', points: [[y0, -half], [y0, half], [bottom, half], [bottom, -half]], paint: 'cloth.base', z: 30, when: dirWhen('up') });
  }
  return piece('part:topdown-hunch', 'Stooped back', 'The rounded back of a stooped body: a hump behind the neck from the side, shoulders up over the head from behind; on the chest node.',
    [{ id: 'cloth', label: 'Back', default: CLOTH, material: 'cloth' }], { amount: { type: 'share', lo: 0, hi: 1, default: 0.5 } }, draw);
}

/** The part pieces of the top-down family (B16b's first set: what the village elder wears and holds). */
export function partPieces() {
  return [hairRing(), beardPiece(), capPiece(), circletPiece(), canePiece(), lanternPiece(), robePiece(), beltPiece(), hunchPiece()];
}

// ---- the sprite the base is compared through ---------------------------------------------------------------------

/** A sprite that is the base and nothing else, in the colours of LOOK, with extra clips (key poses) beside the base's. */
export function bareSprite(clips = {}) {
  return {
    format: 'loadout-sprite', version: 2, id: 'topdown-bare', name: 'Bare person', blurb: 'The top-down base piece with nothing added, for tests.',
    size: [...T.SIZE], pivot: [...T.PIVOT], preview: 'walk_down',
    meta: { type: 'character', role: 'characters/npc', themes: ['neutral'], gameTypes: ['turn-based-rpg'], view: 'top-down', words: ['person', 'human', 'villager', 'walk', 'idle', 'top-down'], license: 'draft' },
    palette: [
      { id: 'skin', label: 'Skin', default: LOOK.skin, material: 'skin' },
      { id: 'top', label: 'Top', default: LOOK.top, material: 'cloth' },
      { id: 'bottom', label: 'Legs', default: LOOK.bottom, material: 'cloth' },
      { id: 'boots', label: 'Boots', default: LOOK.boots, material: 'cloth' },
    ],
    body: { rig: { extends: { use: 'base:person-topdown', v: 1, paint: { topFar: 'top.dark', bottomFar: 'bottom.dark' } } } },
    clips,
  };
}

// ---- the village elder, rebuilt from the base and pieces only ------------------------------------------------------

/**
 * sprites/village-elder.js as data (the B16b proof, tests/fixtures/v2/topdown/village-elder.json): the walker base,
 * the part pieces above and cuffs on the fists; its clips are the base's. Not the same pixels as the code sprite (a
 * redraw): the arms keep the base's poses (the code elder holds the stick hand still, the lantern up, the free hand up
 * as he talks); from the side the stoop sinks the body and head but does not lean them; Bounce is not a control (data
 * has no way yet to scale a clip's movement by a slider); every other control key, every clip and every sound cue is kept.
 */
export async function elderFixture() {
  const { swatches } = await import('../engine/palettes.js');
  const HV = (await import('../engine/palettes.js')).PALETTE.hearthvale;
  const steps = () => [{ sound: 'footstep-grass', frame: 0, preset: 'Dirt path', volume: 0.45 }, { sound: 'footstep-grass', frame: 4, preset: 'Dirt path', volume: 0.45 }];
  const cuff = (s, dir, z, paint = 'trim') => ({ id: `cuff${s}-${dir}`, kind: 'stamp', on: `fist${s}`, at: [-1, 0], rows: ['ccc'], key: { c: paint }, z, when: { direction: [dir] } });
  const use = (id, piece, on, z, paint, more = {}) => ({ id, kind: 'use', use: piece, v: 1, on, z, paint, ...more });
  return {
    format: 'loadout-sprite', version: 2, id: 'village-elder', name: 'Village elder',
    blurb: 'An old villager bent over a walking stick, who walks slowly and talks. Change the stoop, beard, cap, what is held and the colours.',
    meta: { type: 'character', role: 'characters/npc', themes: ['fantasy', 'farm'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
      words: ['elder', 'old man', 'villager', 'grandfather', 'sage', 'quest giver', 'beard', 'cane', 'walk', 'talk', 'village', 'wise'], license: 'draft' },
    size: [...T.SIZE], pivot: [...T.PIVOT], preview: 'walk_down',
    palette: [
      { id: 'skin', label: 'Skin', default: HV.skin, material: 'skin', swatches: swatches('hearthvale', 'skin', { lead: 'skin' }) },
      { id: 'hair', label: 'Hair', default: HV.cream, material: 'plant', swatches: swatches('hearthvale', 'hair', { lead: 'cream' }) },
      { id: 'outfit', label: 'Robe', default: HV.cobble, material: 'cloth', swatches: swatches('hearthvale', 'outfit', { lead: 'cobble' }) },
      { id: 'trim', label: 'Trim', default: HV.roof, material: 'cloth', swatches: swatches('hearthvale', 'trim', { lead: 'roof' }) },
      { id: 'bottom', derive: { rule: 'tone', of: 'outfit', by: -0.6 }, material: 'cloth' },
      { id: 'wood', default: HV.wood, material: 'wood', detail: true },
      { id: 'gold', default: HV.gold, material: 'metal', detail: true },
      { id: 'rust', default: HV.rust, material: 'metal', detail: true },
      { id: 'glow', default: HV.thunder, material: 'light', detail: true },
    ],
    body: { rig: {
      extends: { use: 'base:person-topdown-walker', v: 1, paint: { top: 'outfit', bottom: 'bottom', boots: 'wood', topFar: 'outfit.dark', bottomFar: 'bottom.dark' } },
      shapes: [
        cuff('B', 'down', 60.5), cuff('F', 'down', 62.5), cuff('B', 'up', 32.5), cuff('F', 'up', 35.5), cuff('B', 'side', 6.5, 'trim.dark'), cuff('F', 'side', 72.5),
        use('robe', 'part:topdown-robe', 'hip', 40, { cloth: 'outfit', trim: 'trim' }, { args: { width: { from: 'build', map: [[0, r5(CHEST[0])], [1, r5(CHEST[2])]] } } }),
        use('belt', 'part:topdown-belt', 'waist', 40, { belt: 'trim' }),
        use('hunch', 'part:topdown-hunch', 'chest', 40, { cloth: 'outfit' }, { args: { amount: { from: 'stoop', map: [[0, 0], [1, 1]] } } }),
        use('hair', 'part:topdown-hair-ring', 'head', 50, { hair: 'hair' }),
        use('beard', 'part:topdown-beard', 'head', 54, { hair: 'hair' }, { args: { kind: { from: 'beard', pick: { long: 'long', short: 'short', none: 'long' } }, length: { from: 'beardLength', map: [[0.65, 0.65], [1.35, 1.35]] } }, when: { beard: ['long', 'short'] } }),
        use('cap', 'part:topdown-cap-peaked', 'head', 50, { cloth: 'trim' }, { args: { size: { from: 'headgearSize', map: [[0.5, 0.5], [1.8, 1.8]] } }, when: { headgear: ['cap'] } }),
        use('circlet', 'part:topdown-circlet', 'head', 50, { metal: 'gold', gem: 'trim' }, { args: { size: { from: 'headgearSize', map: [[0.5, 0.5], [1.8, 1.8]] } }, when: { headgear: ['circlet'] } }),
        use('cane', 'held:topdown-cane', 'root', 60, { wood: 'wood' }, { args: { length: { from: 'heldSize', map: [[0.65, 7.15], [1.35, 14.85]] } }, when: { held: ['cane'] } }),
        use('lantern', 'held:topdown-lantern', 'cuffF', 60, { metal: 'rust', glow: 'glow' }, { args: { length: { from: 'heldSize', map: [[0.65, 6.5], [1.35, 11.5]] } }, when: { held: ['lantern'] } }),
      ] } },
    controls: [
      // Height: the legs, the hip line and the torso together (rigs/topdown.js shares extra height between legs and torso);
      // the leg chain ends on the ground, so the feet stay; the robe hangs on the hip bone, so it follows. Within 18%
      // either way: the side torso is a stamp, and the chin's two rows hide what a longer spine opens under the head
      { key: 'height', kind: 'range', label: 'Height', lo: 'Short', hi: 'Tall', default: 0.5, scales: { bones: ['hip', 'spine', 'thiF', 'thiB', 'shnF', 'shnB', 'legF', 'legB', 'legIF', 'legIB'], by: [0.82, 1.18] } },
      // Build: the shoulders move in and out (the arms, hands and rims with them) and the robe widens (its width
      // argument is the chest's half width, rigs/topdown.js dims chestR); a control scales bones or shapes, not both
      { key: 'build', kind: 'range', label: 'Build', lo: 'Slim', hi: 'Stocky', default: 0.5, scales: { bones: ['shoulderF', 'shoulderB'], by: [0.6, 1.3] } },
      // Stoop: the body sinks at the hips (the leg chain with it, so the feet stay down) and the head sinks into the
      // shoulders, as rigs/topdown.js stoop() bobs the body and drops the head; the part hunch rounds the back
      { key: 'stoop', kind: 'range', label: 'Stoop', lo: 'Upright', hi: 'Bent', default: 0.55, scales: { bones: ['hip', 'thiF', 'thiB', 'shnF', 'shnB', 'legF', 'legB', 'legIF', 'legIB', 'neck', 'nape'], by: [1, 0.65] } },
      { key: 'held', kind: 'choice', label: 'Held', options: ['cane', 'lantern', 'none'], default: 'cane' },
      { key: 'heldSize', kind: 'range', label: 'Size', lo: 'Small', hi: 'Big', min: 0.65, max: 1.35, step: 0.05, default: 1 },
      { key: 'beard', kind: 'choice', label: 'Beard', options: ['long', 'short', 'none'], default: 'long' },
      { key: 'beardLength', kind: 'range', label: 'Length', lo: 'Short', hi: 'Long', min: 0.65, max: 1.35, step: 0.05, default: 1 },
      { key: 'headgear', kind: 'choice', label: 'Headgear', options: ['none', 'cap', 'circlet'], default: 'none' },
      { key: 'headgearSize', kind: 'range', label: 'Size', lo: 'Small', hi: 'Big', min: 0.5, max: 1.8, step: 0.05, default: 1 },
      { key: 'speed', standard: 'speed' },
    ],
    parts: {
      held: { label: 'Held', params: ['held', 'heldSize'], none: 'none', socket: 'hand', shapes: ['cane', 'lantern'] },
      beard: { label: 'Beard', params: ['beard', 'beardLength'], none: 'none', socket: 'head', shapes: ['beard'] },
      headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head', shapes: ['cap', 'circlet'] },
    },
    clips: {
      idle_down: { from: 'idle_down' }, idle_up: { from: 'idle_up' }, idle_side: { from: 'idle_side' },
      walk_down: { from: 'walk_down', sounds: steps() }, walk_up: { from: 'walk_up', sounds: steps() }, walk_side: { from: 'walk_side', sounds: steps() },
      talk: { from: 'talk' },
    },
    made: { in: 'library', from: 'code:village-elder', by: 'tools/bake-topdown.mjs (B16b)' },
  };
}

// ---- writing -----------------------------------------------------------------------------------------------------

/** Every piece this baker makes, as { file: data }. */
export function allPieces() {
  const out = { 'base-person-topdown.v1.json': basePiece(), 'base-person-topdown-walker.v1.json': basePiece('walker') };
  for (const p of partPieces()) out[`${p.id.replace(':', '-')}.v${p.v}.json`] = p;
  return out;
}

/** One piece as the text of its file: one line per bone, shape, overlay entry and key, so a review can read it. */
export function pieceText(p) {
  const lines = (x, ind, depth) => {
    if (depth >= 4 || x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((v) => v === null || typeof v !== 'object'))) return JSON.stringify(x);
    const pad = ' '.repeat(ind + 1);
    if (Array.isArray(x)) return `[\n${x.map((v) => pad + lines(v, ind + 1, depth + 1)).join(',\n')} ]`;
    return `{\n${Object.entries(x).map(([k, v]) => `${pad}${JSON.stringify(k)}: ${lines(v, ind + 1, depth + 1)}`).join(',\n')} }`;
  };
  return `${lines(p, 0, 0)}\n`;
}

async function main(argv) {
  if (argv[0] === '--write') {
    const dir = path.resolve(argv[1] ?? path.join(ROOT, 'pieces'));
    for (const [f, p] of Object.entries(allPieces())) { fs.writeFileSync(path.join(dir, f), pieceText(p)); console.log(`wrote ${path.relative(ROOT, path.join(dir, f))}`); }
    return;
  }
  if (argv[0] === '--elder') {
    const f = path.resolve(argv[1] ?? path.join(ROOT, 'tests/fixtures/v2/topdown/village-elder.json'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, pieceText(await elderFixture()));
    console.log(`wrote ${path.relative(ROOT, f)}`);
    return;
  }
  if (argv[0] === '--sheet') {
    const { encodePNG } = await import('./png.mjs');
    const { renderFrame, defaultParams } = await import('../engine/sprite.js');
    const { nodePieceStore } = await import('./lib/pieces-index.mjs');
    const { dataSprite } = await import('../engine/data-sprite.js');
    const def = argv[2] ? JSON.parse(fs.readFileSync(argv[2], 'utf8')) : await elderFixture();
    const store = nodePieceStore();
    const r = await store.loadFor(def);
    if (!r.ok) throw new Error(r.errors.join('; '));
    const data = dataSprite(def, { pieces: store, strict: true });
    const code = await (await import('../tests/helpers/library.mjs')).codeSprite(def.id);   // the code sprite, or its frozen copy once redrawn
    const settings = JSON.parse(argv[3] ?? '{}');
    const clips = Object.keys(code.clips), Z = 3, W = 48, cols = Math.max(...clips.map((c) => code.clips[c].frames));
    const w = cols * W * Z, h = clips.length * 2 * W * Z, rgba = new Uint8Array(w * h * 4);
    const put = (g, cx, cy) => { for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const v = g.data[y * W + x]; const rr = v ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, 255] : (((x >> 2) + (y >> 2)) % 2 ? [40, 40, 48, 255] : [52, 52, 60, 255]);
      for (let k = 0; k < Z * Z; k++) { const i = ((cy * W + y) * Z + Math.floor(k / Z)) * w + (cx * W + x) * Z + (k % Z); rgba.set(rr, i * 4); } } };
    clips.forEach((c, i) => { for (let f = 0; f < code.clips[c].frames; f++) { put(renderFrame(code, c, f, { ...defaultParams(code), ...settings }), f, 2 * i); put(renderFrame(data, c, f, { ...defaultParams(data), ...settings }), f, 2 * i + 1); } });
    fs.writeFileSync(argv[1], encodePNG(w, h, rgba));
    console.log(`wrote ${argv[1]}: each clip, the code sprite above and the data redraw below`);
    return;
  }
  if (argv[0] === '--clip') { console.log(JSON.stringify(bakeClip(argv[1]))); return; }
  // check: every base clip against the code rig, drawn through a sprite that is the base and nothing else
  const { renderFrame } = await import('../engine/sprite.js');
  const { nodePieceStore } = await import('./lib/pieces-index.mjs');
  const { dataSprite } = await import('../engine/data-sprite.js');
  const store = nodePieceStore(), def = bareSprite();
  const r = await store.loadFor(def);
  if (!r.ok) throw new Error(r.errors.join('; '));
  const s = dataSprite(def, { pieces: store, strict: true });
  let worst = [0, ''];
  for (const clip of BASE_CLIPS) {
    const shares = [];
    for (let f = 0; f < s.clips[clip].frames; f++) {
      const dd = pixelDiff(codeFrame(clip, f), renderFrame(s, clip, f, {}));
      shares.push(`${dd.differ}/${dd.drawn}`);
      if (dd.share > worst[0]) worst = [dd.share, `${clip}#${f}`];
    }
    console.log(`${clip.padEnd(12)} ${shares.join(' ')}`);
  }
  console.log(`worst: ${worst[1]} ${(100 * worst[0]).toFixed(2)}%; the base file is ${pieceText(basePiece()).length} bytes`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
