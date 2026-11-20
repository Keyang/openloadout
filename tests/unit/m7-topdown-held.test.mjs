// The things the nine top-down people of migration batch M7 hold in a turning hand (M7c, after M7b review 3, issue 2).
//
// Version 1 of held:topdown-blades, -blades-off, -guns, -stick and -flower, and version 2 of held:topdown-magic, were
// pixel read-backs: the code rig's drawing made with the thing pointing straight down, read back as one-pixel columns in
// the hand bone's frame and then turned with the bone. Turned, those columns broke up: the rogue's dagger became a
// checkerboard of single pixels with outline gaps and loose guard dots, the trooper's rifle a fork of strokes, the
// mage's two-pixel staff two thin lines. The new versions here are the code's own primitives written in the bone's
// frame ([u along the thing from the hand, v across it, v = u turned a quarter]: a code point to(dist, turn) is
// [dist cos(turn), dist sin(turn)]), so the renderer draws them at the bone's angle as the code does (as
// held:topdown-polearm@4 does for the halberd and pike). They are made here, from the code functions themselves, by a
// recorder that stands in for the Surface: the code draws a thing at { x: 0, y: 0, angle: 0, reach: 1 } and each limb,
// line, dot, capsule and ellipse call is written down in the bone's frame, its paint named by slot and tone, at a run of
// lengths whose coordinates become bindings of the piece's `length` argument. Three things the recorder cannot write as
// turning shapes are made so:
//   - a round thing the code centres on a pixel (a flower's bloom: Math.floor(tip) + 0.5) is a stamp on the tip, which
//     the renderer places on the pixel the tip falls in, read back from the code drawn at a pixel centre;
//   - a gun the code sees end on (reach under 0.7, facing down, pointing within 17.5 degrees of the camera) is the
//     piece's `view: "end"`, the code's end-on block written at reach 0.5 (its u divided by 0.5, since the base's reachF
//     stretch at those frames is 0.5 and stretches u); the sprites show it on those frames with frame edits;
//   - the scatter gun's twin barrels, which the code fills with a ramp of its own (light, light, base), are the metal's
//     light, flat.
//
// Held here:
//   1. each new piece file is what its builder here writes, byte for byte (M7_PIECES=write writes a missing one);
//   2. the sprites use the new versions, and the old ones are gone with their pins (nothing names them);
//   3. at every frame of every clip, at the looks that draw each held node (each kind, each end of its length and the
//      default), the node's own pixels (drawn alone with the outline, from the data sprite's frame list) against the
//      code function drawn at the same bone frame (origin, angle and stretch read from two probe dots on the bone):
//      a) no pixel of the thing stands alone (no neighbour of the thing among its 8) where the code's has none there,
//         and no outline pixel is wedged between two pixels of the thing (left and right, or above and below) where the
//         code has none: the orphan pixels and outline gaps of review 3 (one of each allowed on a stretched bone, see
//         STRETCHED);
//      b) the pixels that differ from the code's (drawn by one and not the other, or in colours more than NEAR apart) are
//         at most DIFF_SHARE of the code's pixels, plus DIFF_PAD (on a stretched bone: each node's measured ceiling, STRETCH_CEILING).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import * as T from '../../rigs/topdown.js';
import * as R from '../../rigs/topdown-riot.js';
import * as SN from '../../rigs/topdown-sneak.js';
import { Surface } from '../../engine/surface.js';
import { ramp, tone, col, INK } from '../../engine/color.js';
import { PIECE_LIMITS } from '../../engine/pieces.js';
import { drawList } from '../../engine/draw-list.js';
import { dataFrameList } from '../../engine/data-sprite.js';
import { cleanParams, defaultParams } from '../../engine/sprite.js';

const PIECES = path.join(ROOT, 'pieces');
const read = (f) => fs.readFileSync(path.join(PIECES, f), 'utf8');
const r5 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const PI = Math.PI;
const DIRECTIONS = ['down', 'side', 'up'];
/** Item z inside a held use at z 60, as the M7 baker's: facing down in front of the body (61), from the side under the near arm (65), going up behind the body (1). */
const ITEM_Z = { down: 1, side: 5, up: -59 };
/** The second blade's z (tools/bake-topdown-m7.mjs bladesOffPiece): under the fists facing down, behind the body otherwise. */
const OFF_Z = { down: -1, side: -53, up: -56 };
/** The lengths (the pieces' length argument, a scale) each binding is sampled at: 0.65 to 1.35 by 0.05. */
const SCALES = Array.from({ length: 15 }, (_, i) => r5(0.65 + 0.05 * i));

/** A piece as the bakers write it (tools/bake-topdown.mjs pieceText): nested to depth 4, one entry a line. */
function pieceText(p) {
  const lines = (x, ind, depth) => {
    if (depth >= 4 || x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((v) => v === null || typeof v !== 'object'))) return JSON.stringify(x);
    const pad = ' '.repeat(ind + 1);
    if (Array.isArray(x)) return `[\n${x.map((v) => pad + lines(v, ind + 1, depth + 1)).join(',\n')} ]`;
    return `{\n${Object.entries(x).map(([k, v]) => `${pad}${JSON.stringify(k)}: ${lines(v, ind + 1, depth + 1)}`).join(',\n')} }`;
  };
  return `${lines(p, 0, 0)}\n`;
}

// ---- the recorder: the code's drawing calls written in the bone's frame ------------------------------------------

/** The paint ref of a colour the code drew with: exact slot tones first, else the nearest. refs: [[colour int, ref]]. */
function nearest(v, refs) {
  const exact = refs.find(([c]) => c === v); if (exact) return exact[1];
  const [r, g, b] = [v & 255, (v >> 8) & 255, (v >> 16) & 255];
  let best = null, dist = Infinity;
  for (const [c, ref] of refs) { const d = (r - (c & 255)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - ((c >> 16) & 255)) ** 2; if (d < dist) { dist = d; best = ref; } }
  return best;
}
/** [colour int, ref] for each slot's four tones (the base as 'slot.base' when flat is wanted) and the outline. */
function refsOf(slots, base = '') {
  const out = [];
  for (const [slot, hex] of Object.entries(slots)) { const r = ramp(hex); out.push([col(hex), slot + base], [col(r.light), `${slot}.light`], [col(r.dark), `${slot}.dark`], [col(r.deep), `${slot}.deep`]); }
  out.push([col(INK), 'ink']);
  return out;
}
const sameRamp = (a, b) => ['light', 'base', 'dark', 'deep'].every((k) => col(a[k]) === col(b[k]));
/**
 * The paint of a code call, as { paint, shade? }: a ramp of a slot is the slot (three tones); the ramp of a slot's colour a
 * tone darker (the rogue's far blade) is the slot's `far` ramp; any other ramp (the scatter's barrels) is its base,
 * flat; a plain colour is the slot tone it is (exact, else the nearest), flat ('slot.base' for a slot's own colour on an
 * area, so it is not shaded).
 */
function paintOfCall(c, slots, area) {
  if (c && typeof c === 'object') {
    for (const [slot, hex] of Object.entries(slots)) {
      if (sameRamp(c, ramp(hex))) return { paint: slot };
      if (sameRamp(c, ramp(tone(hex, -1)))) return { paint: `${slot}.far` };
    }
    return { paint: nearest(col(c.base), refsOf(slots, area ? '.base' : '')), flat: true };
  }
  return { paint: nearest(col(c), refsOf(slots, area ? '.base' : '')), flat: true };
}
/** World (as drawn at { x: 0, y: 0, angle: 0 }) to the bone frame: [u, v] = [y, x]. */
const uv = (x, y) => [y, x];
/**
 * The drawing calls draw(g, at) makes, written in the bone's frame: [{ kind, ...points, ...sizes, paint, shade?, light? }].
 * slots: { slot: hex } the code was given; at: the attach point (reach 1 but for an end-on gun).
 */
function record(draw, slots, at = { x: 0, y: 0, angle: 0, reach: 1 }) {
  const calls = [];
  const opts = (o = {}, p) => ({ ...(o.shade !== undefined ? { shade: o.shade } : {}), ...(o.light ? { light: o.light } : {}), ...(o.clip ? { clip: true } : {}), ...p });
  const g = {
    limb(x0, y0, x1, y1, w, c, o) { const p = paintOfCall(c, slots, true); calls.push(opts(o, { kind: 'limb', from: uv(x0, y0), to: uv(x1, y1), width: w, paint: p.paint })); return g; },
    capsule(x0, y0, x1, y1, r0, r1, c, o) { const p = paintOfCall(c, slots, true); calls.push(opts(o, { kind: 'capsule', from: uv(x0, y0), to: uv(x1, y1), r: [r0, r1], paint: p.paint })); return g; },
    ellipse(cx, cy, rx, ry, c, o) { const p = paintOfCall(c, slots, true); calls.push(opts(o, { kind: 'ellipse', at: uv(cx, cy), r: [rx, ry], paint: p.paint })); return g; },
    line(x0, y0, x1, y1, c) { calls.push({ kind: 'line', from: uv(x0, y0), to: uv(x1, y1), paint: paintOfCall(c, slots, false).paint }); return g; },
    dot(x, y, c) { calls.push({ kind: 'dot', at: uv(x, y), paint: paintOfCall(c, slots, false).paint }); return g; },
    get: () => 0,
    fill() { throw new Error('the recorder cannot write a fill as shapes'); },
  };
  draw(g, at);
  for (const c of calls) if (c.clip) throw new Error('the recorder cannot write a clipped shape');
  return calls;
}

/** One number of a call as it runs over the lengths: the number itself when it does not change, else a binding of `length` through its corners. */
function bound(values, scales) {
  if (values.every((v) => Math.abs(v - values[0]) < 1e-9)) return r5(values[0]);
  const keep = [0];
  for (let i = 1; i < values.length - 1; i++) {
    const a = keep.at(-1), y = values[a] + ((values[i + 1] - values[a]) * (scales[i] - scales[a])) / (scales[i + 1] - scales[a]);
    if (Math.abs(y - values[i]) > 1e-6) keep.push(i);
  }
  keep.push(values.length - 1);
  return { from: 'length', map: keep.map((i) => [scales[i], r5(values[i])]) };
}
const POINTS = ['from', 'to', 'at'];
/**
 * The calls of drawAt(g, at, scale) at every scale, merged into one list whose coordinates are bindings of `length`.
 * The code makes the same calls in the same order at every length (checked).
 */
function shapesOver(drawAt, slots, scales = SCALES, at) {
  const runs = scales.map((s) => record((g, a) => drawAt(g, a, s), slots, at));
  const sig = (run) => run.map((c) => `${c.kind}:${c.paint}`).join(' ');
  for (const run of runs) assert.equal(sig(run), sig(runs[0]), 'the code makes other calls at another length');
  return runs[0].map((c0, i) => {
    const out = { ...c0 };
    for (const f of POINTS) if (c0[f]) out[f] = [0, 1].map((k) => bound(runs.map((run) => run[i][f][k]), scales));
    return out;
  });
}

/** The shapes of one kind in every direction, ids and z added, the directions that draw the same shapes sharing them. */
function byDirection(name, kindWhen, make, z = ITEM_Z) {
  const groups = [];
  for (const dir of DIRECTIONS) {
    const shapes = make(dir), key = JSON.stringify(shapes) + z[dir];
    const g0 = groups.find((g) => g.key === key);
    if (g0) g0.dirs.push(dir); else groups.push({ key, dirs: [dir], shapes, z: z[dir] });
  }
  const out = [];
  for (const g of groups) g.shapes.forEach((s, i) => {
    out.push({ id: `${name}-${g.dirs.join('-')}-${i}`, ...s, z: r5(g.z + i * 0.01), when: { direction: g.dirs, ...kindWhen } });
  });
  return out;
}

// ---- the pieces --------------------------------------------------------------------------------------------------

const METAL = '#c2c9d6', GOLD = '#f2c230', WOOD = '#9a6a3e';

/** held:topdown-blades@2: rigs/topdown-sneak.js blade (T.smallItem's dagger and claws, T.heldItem's sword at 0.85) in the weapon hand. */
function blades() {
  const slots = { metal: METAL, hilt: GOLD }, draw = [];
  for (const kind of Object.keys(SN.BLADES)) {
    const k = SN.BLADES[kind].kind;
    draw.push(...byDirection(kind.replace(' ', '-'), { kind: [kind] }, (dir) => shapesOver((g, at, s) => T.smallItem(g, dir, at, { kind: k, length: SN.bladeSize(kind, s).length, metal: METAL, hilt: GOLD }), slots)));
  }
  return {
    format: 'loadout-piece', version: 1, id: 'held:topdown-blades', v: 2, name: 'Dagger, short sword or claws',
    about: 'A dagger, a short sword or three claws in the weapon hand, as shapes along the reachF bone (use z 60), drawn at the bone angle as rigs/topdown-sneak.js blade draws them.',
    slots: [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }, { id: 'hilt', label: 'Hilt', default: GOLD, material: 'metal' }],
    args: { length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 }, kind: { type: 'word', options: Object.keys(SN.BLADES), default: 'daggers' } },
    made: { by: 'tests/unit/m7-topdown-held.test.mjs blades(): the code calls written in the reachF frame (migration batch M7c; M7_PIECES=write)', from: 'rigs/topdown-sneak.js' },
    body: { draw },
  };
}
/** held:topdown-blades-off@2: the second of a pair, in the other hand (reachB), a tone darker (the metal's far ramp) from the side. */
function bladesOff() {
  const slots = { metal: METAL, hilt: GOLD }, draw = [];
  for (const kind of ['daggers', 'claws']) {
    const k = SN.BLADES[kind].kind;
    draw.push(...byDirection(kind, { kind: [kind] }, (dir) => shapesOver((g, at, s) => T.smallItem(g, dir, at, { kind: k, length: SN.bladeSize(kind, s).length, metal: dir === 'side' ? tone(METAL, -1) : METAL, hilt: GOLD }), slots), OFF_Z));
  }
  return {
    format: 'loadout-piece', version: 1, id: 'held:topdown-blades-off', v: 2, name: 'Second dagger or claws',
    about: 'The second of a pair of daggers or claws, in the other hand, as shapes along the reachB bone (use z 60), drawn at the bone angle as rigs/topdown-sneak.js blade draws them; a tone darker from the side.',
    slots: [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }, { id: 'hilt', label: 'Hilt', default: GOLD, material: 'metal' }],
    args: { length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 }, kind: { type: 'word', options: ['daggers', 'claws'], default: 'daggers' } },
    made: { by: 'tests/unit/m7-topdown-held.test.mjs bladesOff(): the code calls written in the reachB frame (migration batch M7c; M7_PIECES=write)', from: 'rigs/topdown-sneak.js' },
    body: { draw },
  };
}

const GUN_SLOTS = { metal: '#6b7896', grip: '#3a3f5a', cell: '#5fe0f0' };
const RIOT = ['rifle', 'pistol', 'baton'], RANGER = ['blaster', 'scatter', 'beam'];
/** What the code draws for a gun kind: the ranger's (T.heldGun, its cell lit) or the trooper's (rigs/topdown-riot.js riotItem). */
function gunCode(g, dir, at, kind, s) {
  if (RIOT.includes(kind)) R.riotItem(g, dir, at, { kind, length: R.riotItemSize(kind, s).length, metal: GUN_SLOTS.metal, grip: GUN_SLOTS.grip });
  else T.heldGun(g, dir, at, { kind, length: T.gunSize(kind, s).length, metal: GUN_SLOTS.metal, glow: GUN_SLOTS.cell });
}
/** The reach the code sees a gun end on at in every frame the M7 bases draw it so (their reachF stretch there). */
const END_REACH = 0.5;
/**
 * A gun seen end on, as the code draws it at reach END_REACH facing down and pointing at the camera, its u divided by
 * END_REACH (the bone's stretch puts it back): the ranger's guns a flat block `wide` across from the hand to the end
 * (T.over with no rim, since what it rims is the body under it), two bore pixels in its face each two deep, the cell; the
 * trooper's rifle and pistol (riotItem's own end-on block, recorded). A baton is never seen end on: its usual drawing,
 * at reach 1.
 */
function gunEnd(kind, s) {
  const r = END_REACH, at = { x: 0, y: 0, angle: 0, reach: r };
  const unstretch = (calls) => calls.map((c) => { const o = { ...c }; for (const f of POINTS) if (c[f]) o[f] = [c[f][0] / r, c[f][1]]; return o; });
  if (kind === 'baton') return record((g, a) => gunCode(g, 'down', a, kind, s), GUN_SLOTS);
  if (RIOT.includes(kind)) return unstretch(record((g, a) => gunCode(g, 'down', a, kind, s), GUN_SLOTS, at));
  const len = T.gunSize(kind, s).length * r, wide = kind === 'scatter' ? 5 : kind === 'beam' ? 3 : 4, end = Math.max(len, 4.5);
  const block = { kind: 'limb', from: [0, 0], to: [end, 0], width: wide, paint: 'metal', shade: 0 };
  const rest = record((g, a) => {
    // the code's end-on branch without its block (T.over), which the recorder cannot write
    const to = (dist, turn = 0, from = [0, 0]) => [from[0] + Math.sin(turn) * dist, from[1] + Math.cos(turn) * dist];
    const [ex, ey] = to(end - 0.5), metal = ramp(GUN_SLOTS.metal), lit = GUN_SLOTS.cell;
    const bore = (x, y, c) => { const [qx, qy] = to(1, PI, [x, y]); g.dot(x, y, c); g.dot(qx, qy, c); };
    if (kind === 'scatter') { for (const k of [-1, 1]) bore(...to(1.3, k * PI / 2, [ex, ey]), metal.deep); }
    else { const [qx, qy] = to(0.5, -PI / 2, [ex, ey]), [px, py] = to(0.5, PI / 2, [ex, ey]); bore(qx, qy, kind === 'beam' ? lit : metal.deep); bore(px, py, kind === 'beam' ? lit : metal.deep); }
    if (kind !== 'beam') { const [lx, ly] = to(end - 3); g.dot(lx, ly, lit); }
  }, GUN_SLOTS, at);
  return unstretch([block, ...rest]);
}
/** held:topdown-guns@2: the ranger's blaster, scatter and beam and the trooper's rifle, pistol and baton, along reachF; view "end" for a gun seen end on. */
function guns() {
  const kinds = [...RANGER, ...RIOT], draw = [];
  for (const kind of kinds) {
    draw.push(...byDirection(`${kind}-along`, { kind: [kind], view: ['along'] }, (dir) => shapesOver((g, at, s) => gunCode(g, dir, at, kind, s), GUN_SLOTS)));
    // end on: facing down only (the code's test); the other directions draw nothing in this view
    const end = (() => {
      const runs = SCALES.map((s) => gunEnd(kind, s));
      return runs[0].map((c0, i) => { const o = { ...c0 }; for (const f of POINTS) if (c0[f]) o[f] = [0, 1].map((k) => bound(runs.map((run) => run[i][f][k]), SCALES)); return o; });
    })();
    end.forEach((s, i) => draw.push({ id: `${kind}-end-${i}`, ...s, z: r5(ITEM_Z.down + i * 0.01), when: { direction: ['down'], kind: [kind], view: ['end'] } }));
  }
  return {
    format: 'loadout-piece', version: 1, id: 'held:topdown-guns', v: 2, name: 'Station guns',
    about: 'A blaster, scatter gun, beam gun, rifle, pistol or baton as shapes along the reachF bone (use z 60) at the bone angle, as heldGun and riotItem draw them; view end: a gun seen end on.',
    slots: [{ id: 'metal', label: 'Metal', default: GUN_SLOTS.metal, material: 'metal' }, { id: 'grip', label: 'Grip', default: GUN_SLOTS.grip, material: 'metal' }, { id: 'cell', label: 'Light', default: GUN_SLOTS.cell, material: 'light' }],
    args: { length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 }, kind: { type: 'word', options: kinds, default: 'blaster' }, view: { type: 'word', options: ['along', 'end'], default: 'along' } },
    made: { by: 'tests/unit/m7-topdown-held.test.mjs guns(): the code calls written in the reachF frame (migration batch M7c; M7_PIECES=write)', from: 'rigs/topdown.js' },
    body: { draw },
  };
}

/** held:topdown-stick@2: rigs/topdown.js townItem's stick and its twig. */
function stick() {
  const slots = { wood: WOOD };
  return {
    format: 'loadout-piece', version: 1, id: 'held:topdown-stick', v: 2, name: 'Stick',
    about: 'A stick with a twig, held up, as shapes along the reachF bone (use z 60), drawn at the bone angle as rigs/topdown.js townItem draws it.',
    slots: [{ id: 'wood', label: 'Wood', default: WOOD, material: 'wood' }],
    args: { length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } },
    made: { by: 'tests/unit/m7-topdown-held.test.mjs stick(): the code calls written in the reachF frame (migration batch M7c; M7_PIECES=write)', from: 'rigs/topdown.js' },
    body: { draw: byDirection('stick', {}, (dir) => shapesOver((g, at, s) => T.townItem(g, dir, at, { kind: 'stick', length: T.townItemSize('stick', s).length, wood: WOOD }), slots)) },
  };
}

const FLOWER = { stem: '#4f9d57', petal: '#f0ead8', heart: GOLD };
/**
 * held:topdown-flower@2: rigs/topdown.js townItem's flower: the stem and its leaf as lines; the bloom (a disc r 2.4 the
 * code centres on the pixel the tip is in, with its heart) a stamp on the tip, anchored at its centre, so it lands on
 * that pixel and stays upright as the code's does.
 */
function flower() {
  const slots = FLOWER, refs = refsOf(slots);
  const draw = byDirection('flower', {}, (dir) => shapesOver((g, at, s) => T.townItem({ ...g, ellipse: () => g, dot: (x, y, c) => (c === FLOWER.heart ? g : g.dot(x, y, c)) }, dir, at, { kind: 'flower', length: T.townItemSize('flower', s).length, stem: FLOWER.stem, petal: FLOWER.petal, heart: FLOWER.heart }), slots));
  // the bloom, as the code paints it round a pixel centre
  const g = new Surface(9, 9);
  g.ellipse(4.5, 4.5, 2.4, 2.4, ramp(FLOWER.petal));
  g.dot(4.5, 4.5, FLOWER.heart);
  const keyOf = new Map(), rows = [];
  for (let y = 2; y <= 6; y++) {
    let row = '';
    for (let x = 2; x <= 6; x++) {
      const v = g.data[y * 9 + x];
      if (!v) { row += '.'; continue; }
      const ref = nearest(v, refs);
      if (!keyOf.has(ref)) keyOf.set(ref, 'abcdefgh'[keyOf.size]);
      row += keyOf.get(ref);
    }
    rows.push(row);
  }
  const key = Object.fromEntries([...keyOf].map(([ref, ch]) => [ch, ref]));
  for (const dir of DIRECTIONS) draw.push({ id: `bloom-${dir}`, kind: 'stamp', at: [bound(SCALES.map((s) => T.townItemSize('flower', s).length), SCALES), 0], anchor: 'c', rows, key, z: r5(ITEM_Z[dir] + 0.5), when: { direction: [dir] } });
  return {
    format: 'loadout-piece', version: 1, id: 'held:topdown-flower', v: 2, name: 'Flower',
    about: 'A flower with a leaf on its stem, held up, as shapes along the reachF bone (use z 60), drawn at the bone angle as rigs/topdown.js townItem draws it; the bloom upright on the tip.',
    slots: [{ id: 'stem', label: 'Stem', default: FLOWER.stem, material: 'plant' }, { id: 'petal', label: 'Petals', default: FLOWER.petal, material: 'plant' }, { id: 'heart', label: 'Heart', default: FLOWER.heart, material: 'plant' }],
    args: { length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } },
    made: { by: 'tests/unit/m7-topdown-held.test.mjs flower(): the code calls written in the reachF frame, the bloom a stamp (migration batch M7c; M7_PIECES=write)', from: 'rigs/topdown.js' },
    body: { draw },
  };
}

/** held:topdown-magic@3: rigs/topdown.js smallItem's staff (heldItem's, a two-pixel shaft of wood) and wand, without the lit end (the sprite draws the light); an orb is all light, so it draws nothing here. */
function magic() {
  const slots = { wood: WOOD }, draw = [];
  for (const kind of ['staff', 'wand']) {
    draw.push(...byDirection(kind, { kind: [kind] }, (dir) => shapesOver((g, at, s) => T.smallItem({ ...g, ellipse: () => g }, dir, at, { kind, length: T.smallItemSize(kind, s).length, wood: WOOD, orb: '#ffffff', glow: 0 }), slots)));
  }
  return {
    format: 'loadout-piece', version: 1, id: 'held:topdown-magic', v: 3, name: 'Staff, wand or orb',
    about: 'A staff or a wand without its lit end, as shapes along the reachF bone (use z 60) at the bone angle, as rigs/topdown.js smallItem draws them; the sprite draws the light.',
    slots: [{ id: 'wood', label: 'Wood', default: WOOD, material: 'wood' }],
    args: { length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 }, kind: { type: 'word', options: ['staff', 'wand', 'orb'], default: 'staff' } },
    made: { by: 'tests/unit/m7-topdown-held.test.mjs magic(): the code calls written in the reachF frame (migration batch M7c; M7_PIECES=write)', from: 'rigs/topdown.js' },
    body: { draw },
  };
}

const MADE = {
  'held-topdown-blades.v2.json': blades, 'held-topdown-blades-off.v2.json': bladesOff, 'held-topdown-guns.v2.json': guns,
  'held-topdown-stick.v2.json': stick, 'held-topdown-flower.v2.json': flower, 'held-topdown-magic.v3.json': magic,
};
/** The versions these replace: never released, named by nothing once the sprites moved on, removed with their pins. */
const REPLACED = ['held:topdown-blades@1', 'held:topdown-blades-off@1', 'held:topdown-guns@1', 'held:topdown-stick@1', 'held:topdown-flower@1', 'held:topdown-magic@2'];

if (process.env.M7_PIECES === 'write') for (const [f, make] of Object.entries(MADE)) if (!fs.existsSync(path.join(PIECES, f))) fs.writeFileSync(path.join(PIECES, f), pieceText(make()));

for (const [f, make] of Object.entries(MADE)) {
  test(`pieces/${f} is what its builder here writes, byte for byte`, () => {
    const text = pieceText(make());
    assert.ok(fs.existsSync(path.join(PIECES, f)), `${f} is missing (M7_PIECES=write node --test tests/unit/m7-topdown-held.test.mjs)`);
    assert.equal(read(f), text, `${f}: differs from its rebuild`);
    assert.ok(text.length <= PIECE_LIMITS.jsonBytes, `${f}: ${text.length} bytes, over ${PIECE_LIMITS.jsonBytes}`);
  });
}

/** Every "use" of a piece version in a JSON text, as "id@v". */
const usesIn = (text) => [...text.matchAll(/"use":\s*"([a-z]+:[a-z0-9-]+)"[^{}\]]*?"v":\s*(\d+)/g)].map((m) => `${m[1]}@${m[2]}`);

test('the sprites hold the new versions, and the replaced read-backs are gone with their pins', () => {
  const want = {
    'rogue-walker': ['held:topdown-blades@2', 'held:topdown-blades-off@2'], 'void-ranger': ['held:topdown-guns@2'], 'shield-trooper': ['held:topdown-guns@2'],
    'farm-kid': ['held:topdown-stick@2', 'held:topdown-flower@2'], 'mage-walker': ['held:topdown-magic@3'],
  };
  for (const [id, refs] of Object.entries(want)) {
    const uses = new Set(usesIn(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8')));
    for (const ref of refs) assert.ok(uses.has(ref), `${id} does not use ${ref}`);
    for (const ref of REPLACED) assert.ok(!uses.has(ref), `${id} still uses ${ref}`);
  }
  const pins = JSON.parse(read('_pins.json')).pins;
  for (const ref of REPLACED) {
    const [id, v] = ref.split('@');
    assert.ok(!fs.existsSync(path.join(PIECES, `${id.replace(':', '-')}.v${v}.json`)), `${ref}: its file is still there`);
    assert.ok(!(ref in pins), `${ref}: still pinned`);
  }
});

// ---- the pixels: each held node against the code at the same bone frame --------------------------------------------

/**
 * How far apart (summed over r, g and b) two colours may be and still count as the same: the far ramp against the code's
 * toned ramp (2 to 5 apart), and the far hand's light tone from the side (the code's ramp of the metal a tone darker),
 * which no slot tone matches: the metal's base is the nearest, 54 apart.
 */
const NEAR = 60;
/** The share of the code's pixels, and the pixels over it, a held thing may differ by in one frame. */
const DIFF_SHARE = 0.15, DIFF_PAD = 3;
/**
 * On a stretched bone (the code's reach under 1: a gun aimed or a baton jabbing towards the camera, the ranger's idle
 * facing down at 0.9) the stretch scales every u of the piece, where the code scales the length and keeps its fixed
 * offsets (a guard 1.5 px from the hand, a baton's grip 2 px up it): the parts slide up to a pixel against each other. There a
 * frame may have one more pixel alone or wedged than the code's, and differ by up to the node's measured ceiling.
 */
const STRETCHED = 0.02;
/**
 * The stretched frames' ceilings, each node's own, measured (M7c review issue 4: one loose share of 75 % let a baton
 * differ in 21 of 29 pixels): [the most pixels one stretched frame may differ from the code's, all its stretched
 * frames together]. A node whose worst falls well under its ceiling must have it lowered (as m7-topdown-pixels).
 * M7_HELD=measure prints what each node measures.
 */
const STRETCH_CEILING = {
  'rogue-walker:blade': [0, 0], 'rogue-walker:bladeOff': [0, 0],
  // the baton at Length 1.35 jabbing up (shoot_up:4): 23 of the code's 32 pixels; facing down, end on: 9 of 17
  'shield-trooper:weapon': [23, 55], 'shield-trooper:weaponEnd': [9, 65],
  // the blaster at Length 1.35 held facing down at reach 0.9 (idle_down:2): 22 of 41; end on, shoot_down:4: 14 of 28
  'void-ranger:gun': [22, 842], 'void-ranger:gunEnd': [14, 36],
  'farm-kid:stick': [0, 0], 'farm-kid:flower': [0, 0],
  'mage-walker:magic': [0, 0],
};
/** How far under its ceiling a node's worst frame (or total) may fall before the ceiling must come down. */
const CEILING_SLACK = (n) => Math.ceil(n * 0.05) + 2;
const hexOf = (v) => (typeof v === 'string' ? v : v?.hex);
/** The held nodes of each sprite, the code that draws each from its bone frame, and the looks that show it. */
const HELD = {
  'rogue-walker': {
    blade: { looks: ['daggers', 'short sword', 'claws'].map((weapon) => ({ weapon })), draw: (g, dir, at, p, P, L) => { const b = SN.BLADES[p.weapon]; T.smallItem(g, dir, at, { kind: b.kind, length: SN.bladeSize(p.weapon, L).length, metal: hexOf(P.steel), hilt: hexOf(P.gold) }); } },
    bladeOff: { looks: ['daggers', 'claws'].map((weapon) => ({ weapon })), draw: (g, dir, at, p, P, L) => { const b = SN.BLADES[p.weapon]; T.smallItem(g, dir, at, { kind: b.kind, length: SN.bladeSize(p.weapon, L).length, metal: dir === 'side' ? tone(hexOf(P.steel), -1) : hexOf(P.steel), hilt: hexOf(P.gold) }); } },
  },
  'shield-trooper': Object.fromEntries(['weapon', 'weaponEnd'].map((n) => [n, { looks: RIOT.map((weapon) => ({ weapon })), draw: (g, dir, at, p, P, L) => R.riotItem(g, dir, at, { kind: p.weapon, length: R.riotItemSize(p.weapon, L).length, metal: hexOf(P.steel), grip: hexOf(P.plate) }) }])),
  'void-ranger': Object.fromEntries(['gun', 'gunEnd'].map((n) => [n, { looks: RANGER.map((weapon) => ({ weapon })), draw: (g, dir, at, p, P, L) => T.heldGun(g, dir, at, { kind: p.weapon, length: T.gunSize(p.weapon, L).length, metal: hexOf(P.panel), glow: hexOf(P.glow) }) }])),
  'farm-kid': {
    stick: { looks: [{ held: 'stick' }], size: 'heldSize', draw: (g, dir, at, p, P, L) => T.townItem(g, dir, at, { kind: 'stick', length: T.townItemSize('stick', L).length, wood: hexOf(P.wood) }) },
    flower: { looks: [{ held: 'flower' }], size: 'heldSize', draw: (g, dir, at, p, P, L) => T.townItem(g, dir, at, { kind: 'flower', length: T.townItemSize('flower', L).length, stem: hexOf(P.leaf), petal: hexOf(P.petal), heart: hexOf(P.gold) }) },
  },
  'mage-walker': {
    magic: { looks: [{ weapon: 'staff' }, { weapon: 'wand' }], draw: (g, dir, at, p, P, L) => T.smallItem({ ...bound2(g), ellipse: () => g }, dir, at, { kind: p.weapon, length: T.smallItemSize(p.weapon, L).length, wood: hexOf(P.wood), orb: '#ffffff', glow: 0 }) },
  },
};
/** A Surface's drawing methods bound to it, to spread into a stand-in that leaves some out. */
function bound2(g) { const o = {}; for (const k of ['limb', 'capsule', 'ellipse', 'line', 'dot', 'fill', 'get', 'rect', 'blob', 'poly']) o[k] = g[k].bind(g); return o; }

/** The sprite with two probe dots on each held node's bone (u 0 and u 8, under the node's own `when`), loaded from a copy outside sprites/. */
async function probed(id, nodes) {
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
  for (const n of nodes) {
    const node = def.body.rig.shapes.find((s) => s.id === n);
    assert.ok(node, `${id}: no node ${n}`);
    for (const [k, u] of [[0, 0], [1, 8]]) def.body.rig.shapes.push({ id: `probe${k}-${n}`, kind: 'dot', on: node.on, at: [u, 0], paint: 'ink', z: 99, ...(node.when ? { when: node.when } : {}) });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm7-held-')), f = path.join(dir, `${id}.json`);
  fs.writeFileSync(f, JSON.stringify(def));
  try { return await loadDataSprite(ROOT, f); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
/** The bone frame of node n in a frame list: its origin, angle (rig convention) and stretch, from the probe dots. */
function frameOf(list, n) {
  const a = list.find((x) => x.id === `probe0-${n}`), b = list.find((x) => x.id === `probe1-${n}`);
  if (!a || !b) return null;
  const dx = b.at[0] - a.at[0], dy = b.at[1] - a.at[1];
  return { x: a.at[0], y: a.at[1], angle: Math.atan2(dx, dy), reach: Math.hypot(dx, dy) / 8 };
}
const INK_C = col(INK) & 0xffffff;
const isThing = (v) => (v >>> 24) !== 0 && (v & 0xffffff) !== INK_C;
const isInk = (v) => (v >>> 24) !== 0 && (v & 0xffffff) === INK_C;
/** Pixels of the thing with no pixel of the thing among their 8 neighbours. */
function alone(g) {
  const out = new Set(), { w, h, data } = g;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isThing(data[y * w + x])) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && isThing(data[Y * w + X])) n++; }
    if (!n) out.add(y * w + x);
  }
  return out;
}
/** Outline pixels wedged between two pixels of the thing, left and right or above and below. */
function wedged(g) {
  const out = new Set(), { w, h, data } = g, at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? data[y * w + x] : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isInk(at(x, y)) && ((isThing(at(x - 1, y)) && isThing(at(x + 1, y))) || (isThing(at(x, y - 1)) && isThing(at(x, y + 1))))) out.add(y * w + x);
  return out;
}
const apart = (a, b) => Math.abs((a & 255) - (b & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs(((a >> 16) & 255) - ((b >> 16) & 255));

/** The length the sprite gives node n's piece at settings p (its `length` binding: the mage's staff stops at 1.25, the ranger's guns at 1.15), which the code is drawn at. */
function lengthOf(def, n, p) {
  const b = def.body.rig.shapes.find((x) => x.id === n).args.length;
  if (typeof b === 'number') return b;
  const v = p[b.from], m = b.map;
  if (v <= m[0][0]) return m[0][1];
  for (let i = 1; i < m.length; i++) if (v <= m[i][0]) return m[i - 1][1] + ((m[i][1] - m[i - 1][1]) * (v - m[i - 1][0])) / (m[i][0] - m[i - 1][0]);
  return m.at(-1)[1];
}
/** Every frame of every clip at a look: [{ clip, f, data (Surface), code (Surface) }] for the frames that draw node n. */
function framesOf(s, def, n, entry, look) {
  const p = cleanParams(s, { ...defaultParams(s), ...look }), out = [], L = lengthOf(def, n, p);
  for (const clip of Object.keys(s.clips)) for (let f = 0; f < s.clips[clip].frames; f++) {
    const r = dataFrameList(s, clip, f, p), at = frameOf(r.list, n), mine = r.list.filter((x) => x.id === n);
    if (!at || !mine.length) continue;
    const dir = clip.endsWith('_up') ? 'up' : clip.endsWith('_side') ? 'side' : clip.endsWith('_down') ? 'down' : null;
    const data = new Surface(s.size[0], s.size[1]), code = new Surface(s.size[0], s.size[1]);
    drawList(data, [...mine, { kind: 'outline', paint: 'ink' }], { palette: r.palette });
    entry.draw(code, dir ?? directionOf(r.list), at, p, r.palette, L);
    code.outline(INK);
    out.push({ clip, f, data, code, at, stretched: Math.abs(at.reach - 1) > STRETCHED });
  }
  return out;
}
/** A clip without a direction in its name (block, hurt, die) faces down in these sprites' code. */
const directionOf = () => 'down';

for (const [id, nodes] of Object.entries(HELD)) {
  test(`${id}: each held thing is clean at every angle a clip turns it to, and drawn as the code draws it there`, async () => {
    const s = await probed(id, Object.keys(nodes)), bad = [], badFrames = new Set(), def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
    let frames = 0;
    for (const [n, entry] of Object.entries(nodes)) {
      const ceiling = STRETCH_CEILING[`${id}:${n}`] ?? [0, 0];
      let worst = 0, total = 0, worstAt = '';
      const size = entry.size ?? 'weaponLength', d = s.params[size];
      for (const base of entry.looks) for (const len of [d.min, d.def, d.max]) {
        const look = { ...base, [size]: len };
        for (const { clip, f, data, code, stretched } of framesOf(s, def, n, entry, look)) {
          frames++;
          const where = `${n} ${JSON.stringify(look)} ${clip}:${f}`, before = bad.length;
          const ca = alone(code), cw = wedged(code);
          const extraAlone = [...alone(data)].filter((i) => !ca.has(i)), extraWedged = [...wedged(data)].filter((i) => !cw.has(i));
          const room = stretched ? 1 : 0;
          if (extraAlone.length > room) bad.push(`${where}: ${extraAlone.length} pixel(s) standing alone the code has not`);
          if (extraWedged.length > room) bad.push(`${where}: ${extraWedged.length} outline pixel(s) wedged inside the thing the code has not`);
          let diff = 0, codePx = 0;
          for (let i = 0; i < code.data.length; i++) {
            const a = data.data[i], b = code.data[i];
            if (isThing(b)) codePx++;
            if (!(a >>> 24) !== !(b >>> 24) || ((a >>> 24) && apart(a, b) > NEAR)) diff++;
          }
          if (stretched) {
            total += diff;
            if (diff > worst) { worst = diff; worstAt = `${where} (${diff} of the code's ${codePx})`; }
            if (diff > ceiling[0]) bad.push(`${where}: ${diff} pixels differ from the code's ${codePx}, over the node's ceiling of ${ceiling[0]} on a stretched bone`);
          } else if (diff > Math.ceil(codePx * DIFF_SHARE) + DIFF_PAD) bad.push(`${where}: ${diff} pixels differ from the code's ${codePx}`);
          if (bad.length > before) badFrames.add(where);
        }
      }
      if (process.env.M7_HELD === 'measure') console.log(`'${id}:${n}': [${worst}, ${total}],   // worst ${worstAt}`);
      if (total > ceiling[1]) bad.push(`${n}: its stretched frames differ from the code's in ${total} pixels, over the ${ceiling[1]} recorded`);
      if (worst < ceiling[0] - CEILING_SLACK(ceiling[0])) bad.push(`${n}: its worst stretched frame differs in ${worst} pixels, well under the ceiling of ${ceiling[0]}: lower it`);
      if (total < ceiling[1] - CEILING_SLACK(ceiling[1])) bad.push(`${n}: its stretched frames differ in ${total} pixels, well under the ${ceiling[1]} recorded: lower it`);
    }
    assert.ok(frames > 0, `${id}: no frame drew a held thing`);
    assert.deepEqual(bad.slice(0, 40), [], `${badFrames.size} of ${frames} frames fail (${bad.length} problems)`);
  });
}

export { blades, bladesOff, guns, stick, flower, magic, record, shapesOver };
