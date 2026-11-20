#!/usr/bin/env node
// Bakes the worn and held things of the nine top-down people of migration batch M7 (docs/data-sprites.md section 7,
// sections 9 M1 to M40) into part and held pieces of base:person-topdown, the way tools/bake-topdown.mjs (B16b) baked
// the village elder's. TEMPORARY, like it: it goes with the code rigs in P4. What it makes is data:
//
//   - what never turns (hair, headgear, garments, packs, shields, gloves) is a stamp per direction read back from the
//     code rig's own drawing at rest (rigs/topdown.js, rigs/topdown-riot.js, rigs/topdown-sneak.js), on the node the
//     piece hangs on; a Size the code rig draws differently is a stamp per step, shown by a threshold on the piece's
//     `size` argument (a `when` with atLeast and below);
//   - what a hand holds and turns (blades, poles, staffs, guns) is shapes on the base's handF node, the code rig's own
//     heldItem() primitives written in the node's frame ([u along the held thing, v across]), their lengths bound to the
//     piece's `length` argument; a thing carried another way than the base's 'up' turns its points by the difference.
//
//   node tools/bake-topdown-m7.mjs                 list the pieces it makes and their sizes
//   node tools/bake-topdown-m7.mjs --write [dir]   write the piece files (default: pieces/); never rewrites a file that exists
//   node tools/bake-topdown-m7.mjs --bases2 [dir]  write version 2 of the eight bases, keyed at the code sprites' defaults
//   node tools/bake-topdown-m7.mjs --walker2       write base:person-topdown-walker@2 (the elder's talk, hand raised; M7c)
//   node tools/bake-topdown-m7.mjs --trooper3 [dir] write base:person-topdown-trooper@3 (version 2 and a raised baton; M7c)
//   node tools/bake-topdown-m7.mjs --replaced <dir> write the REPLACED versions it builds into a folder outside pieces/
//   node tools/bake-topdown-m7.mjs --fit <fit> [file]  fit one sprite file's data to its code sprite (M7c; "sprite data
//                                                  fitted to the code sprites" near the end): twinkles,
//                                                  cast-edges, shield-scan
// No mode writes a version in REPLACED (near the end) into pieces/ (--replaced writes them elsewhere, to look at):
// versions replaced before release (the halberd's read-backs, the held read-backs of M7c, the parts and bases that
// version 2 replaced) are built, for what starts from them, but never written there again; the held things that turn
// are made by tests/unit/m7-topdown-held.test.mjs and m7-topdown-pieces.
// Node names and z ranges: pieces/README.md ("The top-down person"). Each piece's draw items carry their z inside the
// use's z, as B16b's do: a sprite uses a head piece at z 50, a garment at 40, a held thing at 60, a thing on the back at 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as T from '../rigs/topdown.js';
import * as R from '../rigs/topdown-riot.js';
import * as S from '../rigs/topdown-sneak.js';
import { Surface } from '../engine/surface.js';
import { ramp, col, INK } from '../engine/color.js';
import { steps as fxSteps, sparkles as fxSparkles } from '../engine/fx.js';
import { restPose, mapOf, pieceText, DIRECTIONS, DIMS, LOOK } from './bake-topdown.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r5 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const PI = Math.PI;
const dirWhen = (dir) => ({ direction: [dir] });
const snapHalf = (p) => [Math.floor(p[0]) + 0.5, Math.floor(p[1]) + 0.5];

// ---- reading the code rig's drawing back as stamps ---------------------------------------------------------------

/** The rgb of a colour as [r, g, b]. */
const rgbOf = (c) => { const v = col(c); return [v & 255, (v >> 8) & 255, (v >> 16) & 255]; };

/**
 * The paint refs a set of slots offers, as [[surface value, ref]]: each slot's four tones (base, light, dark, deep) and
 * ink, then any extra [hex, ref] pairs (a colour the code rig works out, such as a tone of a tone).
 */
function refsOf(slots, extra = []) {
  const out = [];
  for (const [slot, hex] of Object.entries(slots)) {
    const r = ramp(hex);
    out.push([col(hex), slot], [col(r.light), `${slot}.light`], [col(r.dark), `${slot}.dark`], [col(r.deep), `${slot}.deep`]);
  }
  out.push([col(INK), 'ink']);
  for (const [hex, ref] of extra) out.push([col(hex), ref]);
  return out;
}

/** The nearest paint ref of refs to a surface value: the exact one, else the closest in rgb (a tone the code rig mixed). */
function refFor(v, refs) {
  const exact = refs.find(([c]) => c === v);
  if (exact) return exact[1];
  const [r, g, b] = [v & 255, (v >> 8) & 255, (v >> 16) & 255];
  let best = null, dist = Infinity;
  for (const [c, ref] of refs) { const dd = (r - (c & 255)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - ((c >> 16) & 255)) ** 2; if (dd < dist) { dist = dd; best = ref; } }
  return best;
}

/**
 * Draws with a code function on a blank 48x48 surface and reads its pixels back: { rows, key, x0, y0 } (x0, y0 the
 * block's top-left in frame px), or null when it draws nothing. refs: refsOf(...). keep(x, y): which pixels to take.
 */
function readBack(draw, refs, keep = null) {
  const g = new Surface(T.SIZE[0], T.SIZE[1]);
  draw(g);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const on = (x, y) => g.data[y * g.w + x] && (!keep || keep(x, y));
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (on(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x0 === Infinity) return null;
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const key = {}, byRef = new Map(), rows = [];
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      if (!on(x, y)) { row += '.'; continue; }
      const ref = refFor(g.data[y * g.w + x], refs);
      if (!byRef.has(ref)) { const ch = letters[byRef.size]; byRef.set(ref, ch); key[ch] = ref; }
      row += byRef.get(ref);
    }
    rows.push(row);
  }
  return { rows, key, x0, y0 };
}

/** A stamp item of a piece: the code drawing read back, placed on a screen-aligned node at `node` (frame px). */
function stampItem(id, node, draw, refs, z, when, keep = null) {
  const st = readBack(draw, refs, keep);
  if (!st) return null;
  return { id, kind: 'stamp', at: [r5(st.y0 - node[1]), r5(st.x0 - node[0])], rows: st.rows, key: st.key, z, when };
}

/**
 * The stamps of a drawing that a size argument changes: one stamp per step in `steps` (ascending), each shown from the
 * midpoint below it to the midpoint above it (a threshold on the piece's argument `arg`), with `when` for the rest. Steps
 * whose drawing is the same as the one before are merged into it.
 */
function steppedStamps(id, node, drawAt, refs, z, when, steps, arg = 'size') {
  const out = [];
  let prev = null;
  steps.forEach((s, i) => {
    const st = readBack((g) => drawAt(g, s), refs);
    const sig = st ? JSON.stringify(st) : 'none';
    const lo = i === 0 ? null : r5((steps[i - 1] + s) / 2);
    if (prev && prev.sig === sig) { prev.hi = i === steps.length - 1 ? null : r5((s + steps[i + 1]) / 2); return; }
    prev = { sig, st, lo, hi: i === steps.length - 1 ? null : r5((s + steps[i + 1]) / 2), s };
    out.push(prev);
  });
  return out.filter((o) => o.st).map((o) => {
    const th = {};
    if (o.lo !== null) th.atLeast = o.lo;
    if (o.hi !== null) th.below = o.hi;
    const w = Object.keys(th).length ? { ...when, [arg]: [th] } : { ...when };
    return { id: `${id}-${String(o.s).replace('.', '_')}`, kind: 'stamp', at: [r5(o.st.y0 - node[1]), r5(o.st.x0 - node[0])], rows: o.st.rows, key: o.st.key, z, when: w };
  });
}

// ---- where the base's nodes are at rest ---------------------------------------------------------------------------

/** The rest pose facing dir with the frame points of the base's screen-aligned nodes: { J, P, d, at: { head, chest, waist, root, cuffF, cuffB, fistF, fistB } }. */
function rest(dir) {
  const { J, P, d } = restPose(dir);
  const fist = (A) => { const w = d.armW; const fx = w % 2 ? Math.floor(A.hand[0]) - (w - 1) / 2 : Math.round(A.hand[0]) - w / 2; return [fx, Math.round(A.hand[1]) - 1]; };
  return {
    J, P, d,
    at: {
      head: J.head, chest: [J.neck[0], J.shoulderY + d.chin - 1], waist: [J.bx, J.hip[1]], root: [J.bx, J.gy],
      cuffF: snapHalf(J.armF.hand), cuffB: snapHalf(J.armB.hand), fistF: fist(J.armF), fistB: fist(J.armB),
    },
  };
}
const REST = Object.fromEntries(DIRECTIONS.map((dir) => [dir, rest(dir)]));

function piece(id, name, about, slots, args, draw) {
  if (about.length > 200) throw new Error(`${id}: about is ${about.length} characters; at most 200`);
  return { format: 'loadout-piece', version: 1, id, v: 1, name, about, slots, ...(args ? { args } : {}), made: { by: 'tools/bake-topdown-m7.mjs', from: 'rigs/topdown.js' }, body: { draw: draw.flat().filter(Boolean) } };
}

// sample colours the stamps are read in (a piece's slot defaults)
const HAIR = '#8a5a34', CLOTH = '#3a6ea5', TRIM = '#c9423a', METAL = '#c2c9d6', GOLD = '#f2c230', WOOD = '#9a6a3e', SKIN = '#e0a878', GLOW = '#5fe0f0', DARK = '#3f5068', LIGHT = '#f0ead8';
const SIZES = [0.5, 0.65, 0.8, 1, 1.2, 1.4, 1.6, 1.8];
const LENGTHS = [0.65, 0.8, 1, 1.2, 1.35];
// z inside a use: the head hook's things at use z 50 (+ these), garments at 40
const HEAD_Z = 6;

// ---- hair ------------------------------------------------------------------------------------------------------

/** part:topdown-hair: the code rig's hair styles, the back layer under the head and the front layer over it; `hatted` drops what rises above the skull. */
function hairPiece() {
  const styles = ['short', 'long', 'spiky', 'ponytail'];
  const draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    for (const style of styles) for (const hatted of [false, true]) {
      const when = { direction: [dir], style: [style], hatted: [hatted] };
      const refs = refsOf({ hair: HAIR });
      const h = ramp(HAIR);
      draw.push(stampItem(`back-${style}${hatted ? '-hatted' : ''}-${dir}`, at.head, (g) => T.drawHair(g, J, P, d, style, h, 'back', hatted), refs, -5, when));
      draw.push(stampItem(`front-${style}${hatted ? '-hatted' : ''}-${dir}`, at.head, (g) => T.drawHair(g, J, P, d, style, h, 'front', hatted), refs, 4, when));
    }
  }
  return piece('part:topdown-hair', 'Hair', 'The top-down person\'s hair: short, long (locks over the shoulders), spiky or a ponytail; with hatted, nothing rises above the skull (worn under a helmet or a hat). On the head node, use z 50.',
    [{ id: 'hair', label: 'Hair', default: HAIR, material: 'plant' }],
    { style: { type: 'word', options: styles, default: 'short' }, hatted: { type: 'flag', default: false } }, draw);
}

/** part:topdown-hairdo: a child's bowl cut or pigtails (rigs/topdown.js hairdo), with the tie colour. */
function hairdoPiece() {
  const draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    for (const style of T.HAIRDOS) {
      draw.push(stampItem(`${style}-${dir}`, at.head, (g) => T.hairdo(g, J, P, d, { style, colour: HAIR, tie: TRIM }), refsOf({ hair: HAIR, tie: TRIM }), 4, { direction: [dir], style: [style] }));
    }
  }
  return piece('part:topdown-hairdo', 'Bowl cut or pigtails', 'A child\'s bowl cut or two pigtails tied with a ribbon, on the head node (use z 50).',
    [{ id: 'hair', label: 'Hair', default: HAIR, material: 'plant' }, { id: 'tie', label: 'Ribbon', default: TRIM, material: 'cloth' }],
    { style: { type: 'word', options: [...T.HAIRDOS], default: 'bowl' } }, draw);
}

// ---- headgear -------------------------------------------------------------------------------------------------

/** A head piece made of one code function at each Size step, per direction. fn(g, J, P, d, size, colours). */
function sizedHead(id, name, about, slotList, fn, { steps = SIZES, z = HEAD_Z, extra = [] } = {}) {
  const slots = Object.fromEntries(slotList.map((s) => [s.id, s.default]));
  const draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    draw.push(steppedStamps(`${id.split(':')[1]}-${dir}`, at.head, (g, s) => fn(g, J, P, d, s, slots), refsOf(slots, extra), z, dirWhen(dir), steps));
  }
  return piece(id, name, about, slotList, { size: { type: 'px', lo: steps[0], hi: steps.at(-1), default: 1 } }, draw);
}

function helmetPiece() {
  return sizedHead('part:topdown-helmet', 'Open helmet', 'An open helmet a tone darker than its metal, with a nose guard and a plume whose height follows the size; on the head node (use z 50), worn over hatted hair.',
    [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }, { id: 'plume', label: 'Plume', default: TRIM, material: 'cloth' }],
    (g, J, P, d, size, c) => T.helmet(g, J, P, d, { size, metal: c.metal, plume: c.plume }));
}

function crownPiece() {
  return sizedHead('part:topdown-crown', 'Crown', 'A band of metal with points and a stone at the front, deeper and taller with its size; on the head node (use z 50).',
    [{ id: 'metal', label: 'Metal', default: GOLD, material: 'metal' }, { id: 'gem', label: 'Stone', default: TRIM, material: 'magic' }],
    (g, J, P, d, size, c) => T.crown(g, J, P, d, { size, metal: c.metal, gem: c.gem }));
}

function kettleHatPiece() {
  return sizedHead('part:topdown-kettle-hat', 'Kettle hat', 'A soldier\'s iron hat with a wide brim, wider with its size; on the head node (use z 50), over hatted hair.',
    [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }],
    (g, J, P, d, size, c) => T.kettleHat(g, J, P, d, { size, metal: c.metal }));
}

function hatPiece(kind, id, name, about, slotList) {
  return sizedHead(id, name, about, slotList, (g, J, P, d, size, c) => T.hat(g, J, P, d, { kind, size, colour: c.cloth, band: c.band ?? null }));
}

function hoodPiece() {
  // the hood's depth follows its size as the mage's does (0 at size 0.5, 2 at 1.8)
  return sizedHead('part:topdown-hood', 'Hood', 'A cloth hood round the head, the face open facing down and sideways, pulled lower over the brow with its size; on the head node (use z 50), over no hair.',
    [{ id: 'cloth', label: 'Hood', default: CLOTH, material: 'cloth' }],
    (g, J, P, d, size, c) => T.hood(g, J, P, d, { colour: c.cloth, depth: Math.max(0, Math.min(2, ((size - 0.5) / 1.3) * 2)) }));
}

// ---- the back and the torso ----------------------------------------------------------------------------------

/** part:topdown-cape: the cape on the back (rigs/topdown.js cape), plain or tattered, its hem at each length step; and its mantle with the clasp. */
function capePiece() {
  const steps = [0.3, 0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.65, 1.8];
  const draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    // down and side: behind the body (use z 0); up: over the back, under the arms' rims and the head
    const z = dir === 'up' ? 25 : 0;
    for (const kind of ['plain', 'tattered']) {
      draw.push(steppedStamps(`cape-${kind}-${dir}`, at.chest, (g, s) => T.cape(g, J, P, d, { kind, length: s, colour: TRIM }), refsOf({ cloth: TRIM }), z, { direction: [dir], kind: [kind] }, steps, 'length'));
    }
    // the mantle over the shoulders and the clasp (nothing from behind): over the torso, use z 0 + 45
    draw.push(stampItem(`mantle-${dir}`, at.chest, (g) => T.mantle(g, J, P, d, { colour: TRIM, clasp: GOLD }), refsOf({ cloth: TRIM, clasp: GOLD }), 45, dirWhen(dir)));
  }
  return piece('part:topdown-cape', 'Cape', 'A cape hanging from the shoulders, plain or with a torn hem, to above the knee at length 1 and to the floor at 1.8, with its mantle and clasp over the chest; on the chest node, use z 0.',
    [{ id: 'cloth', label: 'Cape', default: TRIM, material: 'cloth' }, { id: 'clasp', label: 'Clasp', default: GOLD, material: 'metal' }],
    { kind: { type: 'word', options: ['plain', 'tattered'], default: 'plain' }, length: { type: 'px', lo: 0.3, hi: 1.8, default: 1 } }, draw);
}

/** A garment piece read back from one torso-hook function per direction, on the chest node. */
function torsoStamp(id, name, about, slotList, fn, { node = 'chest', z = 0, extra = [] } = {}) {
  const slots = Object.fromEntries(slotList.map((s) => [s.id, s.default]));
  const draw = DIRECTIONS.map((dir) => { const { J, P, d, at } = REST[dir]; return stampItem(`${id.split(':')[1]}-${dir}`, at[node], (g) => fn(g, J, P, d, slots), refsOf(slots, extra), z, dirWhen(dir)); });
  return piece(id, name, about, slotList, null, draw);
}

function hemPiece() {
  return torsoStamp('part:topdown-hem', 'Tunic hem', 'A band of colour along the hem of the tunic, on the waist node (use z 40).',
    [{ id: 'trim', label: 'Hem', default: TRIM, material: 'cloth' }], (g, J, P, d, c) => T.hem(g, J, P, d, { colour: c.trim }), { node: 'waist' });
}

function tabardPiece() {
  // the tabard to the knee with a border, and the smock (to the hip, no border) of a child
  const draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    for (const [kind, o] of [['tabard', { length: 1, border: TRIM }], ['smock', { length: 0, border: null }]]) {
      draw.push(stampItem(`${kind}-${dir}`, at.chest, (g) => T.tabard(g, J, P, d, { colour: CLOTH, ...o }), refsOf({ cloth: CLOTH, trim: TRIM }), 0, { direction: [dir], kind: [kind] }));
    }
  }
  return piece('part:topdown-tabard', 'Tabard', 'A sleeveless panel of cloth over the chest and back: a tabard to the knee with a border, or a smock\'s bib to the hip; on the chest node (use z 40).',
    [{ id: 'cloth', label: 'Tabard', default: CLOTH, material: 'cloth' }, { id: 'trim', label: 'Border', default: TRIM, material: 'cloth' }],
    { kind: { type: 'word', options: ['tabard', 'smock'], default: 'tabard' } }, draw);
}

// ---- held things: shapes on the handF node ------------------------------------------------------------------------

/** A point d px from the hand, `turn` off the held thing's direction, in the node frame [u, v]; dist may be a binding of `length`. */
const P2 = (dist, turn = 0) => [r5(dist * Math.cos(turn)), r5(dist * Math.sin(turn))];

/** The point `dist` (a number, or fn(length) bound over lo..hi) from the hand, turned by `turn` and by the carry's difference delta, as [u, v] with bindings. */
function pt(dist, turn, delta, lo, hi, from = null) {
  const at = (L) => { const k = typeof dist === 'function' ? dist(L) : dist; const p = [k * Math.cos(turn + delta), k * Math.sin(turn + delta)]; if (from) { const f = from(L); p[0] += f[0]; p[1] += f[1]; } return p; };
  const fixed = typeof dist !== 'function' && (!from || from.fixed);
  if (fixed) { const p = at(lo); return [r5(p[0]), r5(p[1])]; }
  const b = (i) => { const m = mapOf('length', (L) => r5(at(L)[i]), lo, hi, 0.005); return m.map.every(([, y]) => y === m.map[0][1]) ? m.map[0][1] : m; };
  return [b(0), b(1)];
}

/** Item z inside a held use at z 60: facing down in front of the body under the weapon fist (61), from the side under the near arm (65), going up behind the body (1). */
const ITEM_Z = { down: 1, side: 5, up: -59 };

/**
 * The shapes of a held kind for one direction, ported from rigs/topdown.js heldItem() (and smallItem, townItem,
 * riotItem): `L` is the item's length in px as the piece's `length` argument gives it (lo..hi), delta the carry's turn.
 */
function heldShapes(kind, dir, delta, lo, hi, z) {
  const w = dirWhen(dir), id = (s) => `${s}-${dir}`;
  const at = (dist, turn = 0, from = null) => pt(dist, turn, delta, lo, hi, from);
  const L = (L) => L;
  const shapes = [];
  if (kind === 'sword') {
    shapes.push({ id: id('blade'), kind: 'limb', from: at(1.5), to: at(L), width: 2, paint: 'metal', z, when: w });
    shapes.push({ id: id('tip'), kind: 'dot', at: at(L), paint: 'metal.light', z: z + 0.1, when: w });
    const g0 = [1.5 * Math.cos(delta), 1.5 * Math.sin(delta)];
    const guard = (turn) => [r5(g0[0] + 2.2 * Math.cos(delta + turn)), r5(g0[1] + 2.2 * Math.sin(delta + turn))];
    shapes.push({ id: id('guard'), kind: 'line', from: guard(PI / 2), to: guard(-PI / 2), paint: 'hilt', z: z + 0.2, when: w });
    shapes.push({ id: id('pommel'), kind: 'dot', at: at(1.5, PI), paint: 'hilt', z: z + 0.2, when: w });
  } else if (kind === 'axe') {
    shapes.push({ id: id('haft'), kind: 'line', from: at(2, PI), to: at(L), paint: 'wood', z, when: w });
    // the head: a disc 2.9 px round, its centre 2 px to the side the swing leads with, 2.5 px from the tip (the code
    // rig clips the cap of it behind the haft, 0.6 px past it: a pixel at most, left whole here)
    const lead = dir === 'side' ? -PI / 2 : PI / 2;
    shapes.push({ id: id('head'), kind: 'ellipse', at: at((Lx) => Lx - 2.5, 0, () => [2 * Math.cos(lead + delta), 2 * Math.sin(lead + delta)]), r: [2.9, 2.9], paint: 'metal', z: z + 0.1, when: w });
  } else if (kind === 'spear' || kind === 'pike') {
    const back = kind === 'pike' ? 6 : 4;
    shapes.push({ id: id('shaft'), kind: 'line', from: at(back, PI), to: at(L), paint: 'wood', z, when: w });
    shapes.push({ id: id('point'), kind: 'capsule', from: at((Lx) => Math.max(1, Lx - 3.5)), to: at(L), r: [1.5, 0.5], paint: 'metal', z: z + 0.1, when: w });
  } else if (kind === 'halberd') {
    shapes.push({ id: id('shaft'), kind: 'line', from: at(6, PI), to: at(L), paint: 'wood', z, when: w });
    shapes.push({ id: id('point'), kind: 'capsule', from: at((Lx) => Lx - 3), to: at(L), r: [1.2, 0.5], paint: 'metal', z: z + 0.1, when: w });
    // the blade: a quarter moon on one side of the shaft below the point
    const side = dir === 'side' ? -1 : 1;
    shapes.push({ id: id('blade'), kind: 'poly', points: [at((Lx) => Lx - 3), at((Lx) => Lx - 3.5, 0, (Lx) => [3.2 * Math.cos(delta + side * PI / 2), 3.2 * Math.sin(delta + side * PI / 2)]), at((Lx) => Lx - 6, 0, (Lx) => [3.4 * Math.cos(delta + side * PI / 2), 3.4 * Math.sin(delta + side * PI / 2)]), at((Lx) => Lx - 6.5)], paint: 'metal', z: z + 0.1, when: w });
  }
  return shapes;
}

/** A held piece of the code rig's kinds, carried `carry` (CARRY), its length bound to the piece's length argument (lo..hi px). */
function heldPiece(id, name, about, slotList, kinds, carry, lo, hi, def) {
  const draw = [];
  for (const dir of DIRECTIONS) {
    const delta = T.CARRY[carry][dir] - T.CARRY.up[dir];
    for (const kind of kinds) for (const s of heldShapes(kind, dir, delta, lo, hi, ITEM_Z[dir])) draw.push(kinds.length > 1 ? { ...s, id: `${kind}-${s.id}`, when: { ...s.when, kind: [kind] } } : s);
  }
  const args = { length: { type: 'px', lo, hi, default: def } };
  if (kinds.length > 1) args.kind = { type: 'word', options: kinds, default: kinds[0] };
  return piece(id, name, about, slotList, args, draw);
}

function weaponPiece() {
  return heldPiece('held:topdown-weapon', 'Sword, axe or spear', 'A sword, an axe or a spear in the weapon hand, as shapes along the reachF bone of a base this baker makes (use z 60), so it turns and foreshortens with every swing.',
    [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }, { id: 'wood', label: 'Haft', default: WOOD, material: 'wood' }, { id: 'hilt', label: 'Hilt', default: GOLD, material: 'metal' }],
    ['sword', 'axe', 'spear'], 'up', 6, 19, 11);
}

// ---- held things read back from the code rig as lines along the hand ------------------------------------------------
// What the code rig draws for a held thing pointing straight down the screen (angle 0) from a hand at a pixel centre,
// read back pixel by pixel: each run of one paint down a column becomes a `line` in the frame of the bone it hangs on
// ([u down the thing, v across it]), so it turns as the bone turns (and on reachF foreshortens with its stretch).

const HAND = [24.5, 12.5];
/** The lines of a code drawing made from HAND pointing down, in a hand bone's frame; refs: refsOf(...). */
function linesOf(draw, refs, z, when, id) {
  const g = new Surface(T.SIZE[0], T.SIZE[1]);
  draw(g, { x: HAND[0], y: HAND[1], angle: 0, reach: 1 });
  const out = [];
  for (let x = 0; x < g.w; x++) {
    let y = 0;
    while (y < g.h) {
      const v = g.data[y * g.w + x];
      if (!v) { y++; continue; }
      const ref = refFor(v, refs);
      let y1 = y;
      while (y1 + 1 < g.h && g.data[(y1 + 1) * g.w + x] && refFor(g.data[(y1 + 1) * g.w + x], refs) === ref) y1++;
      const u0 = r5(y + 0.5 - HAND[1]), u1 = r5(y1 + 0.5 - HAND[1]), vv = r5(x + 0.5 - HAND[0]);
      out.push(y1 === y ? { id: `${id}-${out.length}`, kind: 'dot', at: [u0, vv], paint: ref, z, when } : { id: `${id}-${out.length}`, kind: 'line', from: [u0, vv], to: [u1, vv], paint: ref, z, when });
      y = y1 + 1;
    }
  }
  return out;
}

/**
 * A held piece read back from a code function draw(g, dir, at, length) for every kind, direction and length step;
 * each step shown by a threshold on the piece's `length` argument (its middle values); z per direction (ITEM_Z unless given).
 */
function heldFromCode(id, name, about, slotList, kinds, draw, steps, { z = ITEM_Z, extra = [] } = {}) {
  const slots = Object.fromEntries(slotList.map((x) => [x.id, x.default]));
  const refs = refsOf(slots, extra), items = [];
  for (const kind of kinds) steps.forEach((L, i) => {
    const th = {};
    if (i > 0) th.atLeast = r5((steps[i - 1] + L) / 2);
    if (i < steps.length - 1) th.below = r5((L + steps[i + 1]) / 2);
    // the directions that draw the same lines share them (one `direction` list); z goes with the direction
    const byDir = DIRECTIONS.map((dir) => ({ dir, lines: linesOf((g, at) => draw(g, dir, at, L, kind, slots), refs, 0, null, 'x') }));
    const groups = [];
    for (const b of byDir) {
      const sig = JSON.stringify(b.lines.map(({ id, ...x }) => x)) + z[b.dir];
      const g0 = groups.find((g) => g.sig === sig);
      if (g0) g0.dirs.push(b.dir); else groups.push({ sig, dirs: [b.dir], lines: b.lines, z: z[b.dir] });
    }
    for (const g of groups) {
      const when = { direction: g.dirs, ...(kinds.length > 1 ? { kind: [kind] } : {}), ...(steps.length > 1 ? { length: [th] } : {}) };
      for (const { id: _id, ...x } of g.lines) items.push({ ...x, z: g.z, when });
    }
  });
  const args = { length: { type: 'px', lo: steps[0], hi: steps.at(-1), default: steps[Math.floor(steps.length / 2)] } };
  if (kinds.length > 1) args.kind = { type: 'word', options: kinds, default: kinds[0] };
  return piece(id, name, about, slotList, args, items);
}
const stepsOf = (base, lo = 0.65, hi = 1.35, n = 5) => Array.from({ length: n }, (_, i) => r5(base * (lo + ((hi - lo) * i) / (n - 1))));

function poleArmsPiece() {
  return heldFromCode('held:topdown-polearm', 'Halberd or pike', 'A halberd or a long pike carried upright, as lines along the reachF bone of a base this baker makes (use z 60): rigs/topdown.js townItem read back.',
    [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }, { id: 'wood', label: 'Shaft', default: WOOD, material: 'wood' }],
    ['halberd', 'pike'], (g, dir, at, L, kind, c) => T.townItem(g, dir, at, { kind, length: L, metal: c.metal, wood: c.wood }), [15, 18.5, 22, 25.5, 29, 32.5]);
}

/** A village child's stick, basket (with apples) or flower: one piece each (rigs/topdown.js townItem read back), lines along the reachF bone (use z 60). */
function townThingPiece(kind) {
  if (kind === 'basket') return basketPiece();
  const slots = {
    stick: [{ id: 'wood', label: 'Wood', default: WOOD, material: 'wood' }],
    basket: [{ id: 'wicker', label: 'Wicker', default: '#c9a36a', material: 'wood' }, { id: 'fill', label: 'Fruit', default: TRIM, material: 'plant' }],
    flower: [{ id: 'stem', label: 'Stem', default: '#4f9d57', material: 'plant' }, { id: 'petal', label: 'Petals', default: LIGHT, material: 'plant' }, { id: 'heart', label: 'Heart', default: GOLD, material: 'plant' }],
  }[kind];
  const about = { stick: 'A stick with a twig, held up', basket: 'A basket of apples hanging from the hand by its handle', flower: 'A flower with a leaf on its stem, held up' }[kind];
  return heldFromCode(`held:topdown-${kind}`, `${kind[0].toUpperCase()}${kind.slice(1)}`, `${about}: rigs/topdown.js townItem read back as lines along the reachF bone of a base this baker makes (use z 60).`, slots, [kind],
    (g, dir, at, L, k, c) => T.townItem(g, dir, at, { kind: k, length: L * T.TOWN_ITEMS[k].length, wood: k === 'basket' ? c.wicker : c.wood, fill: c.fill, stem: c.stem, petal: c.petal, heart: c.heart }),
    [0.65, 0.825, 1, 1.175, 1.35]);
}

/** held:topdown-basket: a basket of apples hanging straight down from the hand by its handle (it does not turn): a stamp per length step on the cuffF node (use z 60). */
function basketPiece() {
  const steps = [0.65, 0.825, 1, 1.175, 1.35], slots = { wicker: '#c9a36a', fill: TRIM }, draw = [];
  for (const dir of DIRECTIONS) draw.push(steppedStamps(`basket-${dir}`, HAND, (g, L) => T.townItem(g, dir, { x: HAND[0], y: HAND[1], angle: 0, reach: 1 }, { kind: 'basket', length: L * 7, wood: slots.wicker, fill: slots.fill }), refsOf(slots), ITEM_Z[dir], dirWhen(dir), steps, 'length'));
  return piece('held:topdown-basket', 'Basket', 'A basket of apples hanging from the hand by its handle, bigger with its length: rigs/topdown.js townItem read back, on the cuffF node (use z 60).',
    [{ id: 'wicker', label: 'Wicker', default: slots.wicker, material: 'wood' }, { id: 'fill', label: 'Fruit', default: TRIM, material: 'plant' }], { length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } }, draw);
}

function magicThingsPiece() {
  return heldFromCode('held:topdown-magic', 'Staff, wand or orb', 'A staff with a glowing orb, a wand or an orb held up, as lines along the reachF bone of a base this baker makes (use z 60): rigs/topdown.js smallItem and heldItem read back.',
    [{ id: 'wood', label: 'Wood', default: WOOD, material: 'wood' }, { id: 'orb', label: 'Glow', default: GLOW, material: 'magic' }],
    ['staff', 'wand', 'orb'], (g, dir, at, L, kind, c) => T.smallItem(g, dir, at, { kind, length: L * (kind === 'staff' ? 12 : kind === 'wand' ? 9 : 5), wood: c.wood, orb: c.orb, glow: 0.3 }),
    [0.65, 0.825, 1, 1.175, 1.35]);
}

function bladesPiece() {
  return heldFromCode('held:topdown-blades', 'Dagger, short sword or claws', 'A dagger, a short sword or three claws in one hand, as lines along a hand bone (reachF, or handB for the other hand; use z 60): rigs/topdown.js smallItem read back.',
    [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }, { id: 'hilt', label: 'Hilt', default: GOLD, material: 'metal' }],
    Object.keys(S.BLADES), (g, dir, at, L, kind, c) => { const sz = S.bladeSize(kind, L); T.smallItem(g, dir, at, { kind: S.BLADES[kind].kind, length: sz.length, metal: ramp(c.metal), hilt: c.hilt }); },
    [0.65, 0.825, 1, 1.175, 1.35]);
}

/** held:topdown-blades-off: the second of a pair of blades in the other hand (rogue's daggers or claws), along the reachB bone (use z 60): under the fists facing down, behind the body otherwise; a tone darker from the side. */
function bladesOffPiece() {
  return heldFromCode('held:topdown-blades-off', 'Second dagger or claws', 'The second of a pair of daggers or claws, in the other hand, as lines along the reachB bone of a base this baker makes (use z 60): rigs/topdown-sneak.js blade read back.',
    [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }, { id: 'hilt', label: 'Hilt', default: GOLD, material: 'metal' }],
    ['daggers', 'claws'], (g, dir, at, L, kind, c) => { const sz = S.bladeSize(kind, L); T.smallItem(g, dir, at, { kind: S.BLADES[kind].kind, length: sz.length, metal: dir === 'side' ? ramp(c.metal).dark : c.metal, hilt: c.hilt }); },
    [0.65, 0.825, 1, 1.175, 1.35], { z: { down: -1, side: -53, up: -56 } });
}

// ---- the merchant's things ---------------------------------------------------------------------------------------

/** The merchant's frame options (rigs/topdown.js poseFrame): a head taller than the townsfolk, long arms, the head carried 3 rows high, counting and waving. */
export const MERCHANT = Object.freeze({ tall: [29, 35], neck: 2 });   // the code merchant's neck is 3 rows: the base's neck bones stretch at most 1.5 times (2 rows)
/** One code frame of a merchant at phase t; held: whether a trade good hangs from the hand; size: the turban's and the good's (none: version 1's fit to the biggest, 1.8 and 1.35). */
export function merchantFrame(clip, t, held = false, size = null) {
  const item = held ? T.tradeItemSize('purse', size ?? 1.35) : null;
  return T.poseFrame(clip, t, {}, {
    item, carry: 'hang', tall: MERCHANT.tall, rise: size === null ? T.turbanRise(1.8) + 2 : T.turbanRise(size), dims: (d) => ({ ...d, arm: d.arm + 2 }),
    pose: (action, direction, u, m, d) => (action === 'wave' ? T.gesture('wave', direction, u, m, d) : action === 'talk' ? T.gesture('count', direction, u, m, d) : null),
    manner(P) { P.headDy = Math.max(-MERCHANT.neck, (P.headDy ?? 0) - MERCHANT.neck); if (item) P.armF.o += 2.5; },
  });
}
/** A merchant's rest pose facing dir: { J, P, d, at } as rest() gives it, the head raised. */
function merchantRest(dir) {
  const F = merchantFrame(`idle_${dir}`, 0), J = T.solve(dir, F.P, F.d), d = F.d;
  return { J, P: F.P, d, at: { head: J.head, chest: [J.neck[0], J.shoulderY + d.chin - 1], waist: [J.bx, J.hip[1]], cuffF: snapHalf(J.armF.hand) } };
}

function neckPiece() {
  const draw = DIRECTIONS.map((dir) => { const { J, P, d, at } = merchantRest(dir); return stampItem(`neck-${dir}`, at.chest, (g) => T.neck(g, J, P, d, { skin: SKIN }), refsOf({ skin: SKIN }), 0, dirWhen(dir)); });
  return piece('part:topdown-neck', 'Long neck', 'The neck of a head carried two rows high, skin in the chin\'s shadow from under the head to the collar, on the chest node (use z 40) of base:person-topdown-merchant.',
    [{ id: 'skin', label: 'Skin', default: SKIN, material: 'skin' }], null, draw);
}

function apronPiece() {
  const draw = DIRECTIONS.map((dir) => { const { J, P, d, at } = merchantRest(dir); return stampItem(`apron-${dir}`, at.chest, (g) => T.apron(g, J, P, d, { colour: TRIM, length: 0.55 }), refsOf({ cloth: TRIM }), 0, dirWhen(dir)); });
  return piece('part:topdown-apron', 'Apron', 'An apron: a bib and a panel down the legs with a tie and a pocket facing down, its edge from the side, its strings from behind; on the chest node (use z 40).',
    [{ id: 'cloth', label: 'Apron', default: TRIM, material: 'cloth' }], null, draw);
}

function spectaclesPiece() {
  const draw = DIRECTIONS.map((dir) => { const { J, P, d, at } = REST[dir]; return stampItem(`spectacles-${dir}`, at.head, (g) => T.spectacles(g, J, P, d, { frame: DARK, lens: LIGHT }), refsOf({ wire: DARK, lens: LIGHT }), HEAD_Z + 2, dirWhen(dir)); });
  return piece('part:topdown-spectacles', 'Spectacles', 'Round spectacles: two rings across the nose facing down, one ring and its arm from the side, nothing from behind; on the head node (use z 50).',
    [{ id: 'wire', label: 'Frame', default: DARK, material: 'metal' }, { id: 'lens', label: 'Glint', default: LIGHT, material: 'light' }], null, draw);
}

function turbanPiece() {
  return sizedHead('part:topdown-turban', 'Turban', 'Wound cloth that bulges wider than the head with its folds, a jewel at the front and a loose end behind, taller and wider with its size; on the head node (use z 50).',
    [{ id: 'cloth', label: 'Turban', default: TRIM, material: 'cloth' }, { id: 'jewel', label: 'Jewel', default: GOLD, material: 'magic' }],
    (g, J, P, d, size, c) => T.turban(g, J, P, d, { size, colour: c.cloth, jewel: c.jewel }));
}

function travelPackPiece() {
  const steps = [0.65, 0.825, 1, 1.175, 1.35], draw = [];
  const slots = { cloth: '#c9a06a', wood: WOOD, rug: '#2f8f9d', light: '#f4e06a', strap: WOOD };
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = merchantRest(dir);
    for (const kind of T.TRAVEL_PACK_KINDS) draw.push(steppedStamps(`${kind}-${dir}`, at.chest, (g, sz) => T.travelPack(g, J, P, d, { kind, size: sz, colour: slots.cloth, wood: slots.wood, rug: slots.rug, lantern: slots.light }), refsOf(slots), dir === 'up' ? 45 : 0, { direction: [dir], kind: [kind] }, steps));
    draw.push(stampItem(`straps-${dir}`, at.chest, (g) => T.packStraps(g, J, P, d, { colour: slots.strap }), refsOf({ strap: slots.strap }), 44, dirWhen(dir)));
  }
  return piece('part:topdown-travel-pack', 'Travel pack', 'A backpack, crate or sack over one shoulder with a rolled rug and a lantern, bigger with its size, and its straps over the chest; on the chest node (use z 0).',
    [{ id: 'cloth', label: 'Pack', default: slots.cloth, material: 'cloth' }, { id: 'wood', label: 'Frame', default: WOOD, material: 'wood' }, { id: 'rug', label: 'Rug', default: slots.rug, material: 'cloth' },
      { id: 'light', label: 'Lantern', default: slots.light, material: 'light' }, { id: 'strap', label: 'Straps', default: WOOD, material: 'cloth' }],
    { kind: { type: 'word', options: [...T.TRAVEL_PACK_KINDS], default: 'backpack' }, size: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } }, draw);
}

/** held:topdown-trade-goods: a coin purse or a balance scale hanging from the hand (it does not turn): a stamp per length step on the cuffF node (use z 60). */
function tradeGoodsPiece() {
  const steps = [0.65, 0.825, 1, 1.175, 1.35], slots = { metal: GOLD, leather: WOOD, coins: GOLD }, draw = [];
  for (const kind of Object.keys(T.TRADE_ITEMS)) for (const dir of DIRECTIONS) draw.push(steppedStamps(`${kind}-${dir}`, HAND, (g, L) => T.tradeItem(g, dir, { x: HAND[0], y: HAND[1], angle: 0, reach: 1 }, { kind, length: L * T.TRADE_ITEMS[kind].length, metal: slots.metal, wood: slots.leather, hilt: slots.coins }), refsOf(slots), ITEM_Z[dir], { direction: [dir], kind: [kind] }, steps, 'length'));
  return piece('held:topdown-trade-goods', 'Purse or scale', 'A coin purse or a balance scale hanging from the hand, bigger with its length: rigs/topdown.js tradeItem read back, on the cuffF node (use z 60).',
    [{ id: 'metal', label: 'Scale', default: GOLD, material: 'metal' }, { id: 'leather', label: 'Purse', default: WOOD, material: 'cloth' }, { id: 'coins', label: 'Coins', default: GOLD, material: 'metal' }],
    { kind: { type: 'word', options: Object.keys(T.TRADE_ITEMS), default: 'purse' }, length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } }, draw);
}

// ---- the station's suits: the ranger and the troopers ---------------------------------------------------------------

function visorHelmetPiece() {
  return sizedHead('part:topdown-visor-helmet', 'Visor helmet', 'A closed helmet with a lit visor over the eyes and the jaw open, standing further off the skull with its size, a light on the back; on the head node (use z 50).',
    [{ id: 'shell', label: 'Shell', default: '#c8ccd8', material: 'metal' }, { id: 'visor', label: 'Visor', default: GLOW, material: 'light' }],
    (g, J, P, d, size, c) => T.visorHelmet(g, J, P, d, { size, shell: c.shell, visor: c.visor }));
}

function visorPiece() {
  return sizedHead('part:topdown-visor', 'Visor', 'A band of lit glass over the eyes on a strap, deeper and wider with its size, only the strap from behind; on the head node (use z 50).',
    [{ id: 'glass', label: 'Glass', default: GLOW, material: 'light' }, { id: 'strap', label: 'Strap', default: DARK, material: 'cloth' }],
    (g, J, P, d, size, c) => T.visor(g, J, P, d, { size, colour: c.glass, strap: c.strap }));
}

function lensMaskPiece() {
  return sizedHead('part:topdown-lens-mask', 'Lens mask', "A trooper's mask over the face with two lit lenses, bigger with its size, its straps from behind; on the head node (use z 50).",
    [{ id: 'mask', label: 'Mask', default: '#5d6475', material: 'metal' }, { id: 'lens', label: 'Lenses', default: '#e2473f', material: 'light' }],
    (g, J, P, d, size, c) => R.lensMask(g, J, P, d, { size, colour: c.mask, lens: c.lens }));
}

function suitPackPiece() {
  const steps = [0.65, 0.825, 1, 1.175, 1.35], slots = { casing: '#6b7896', light: GLOW }, draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    for (const kind of T.PACK_KINDS) draw.push(steppedStamps(`${kind}-${dir}`, at.chest, (g, sz) => T.pack(g, J, P, d, { kind, size: sz, colour: slots.casing, glow: slots.light, thrust: 0 }), refsOf(slots), dir === 'up' ? 45 : 0, { direction: [dir], kind: [kind] }, steps));
  }
  return piece('part:topdown-suit-pack', 'Suit pack', 'An air tank, a radio with its antenna or a jet pack on the back, bigger with its size; on the chest node (use z 0).',
    [{ id: 'casing', label: 'Casing', default: slots.casing, material: 'metal' }, { id: 'light', label: 'Light', default: GLOW, material: 'light' }],
    { kind: { type: 'word', options: [...T.PACK_KINDS], default: 'tank' }, size: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } }, draw);
}

/** part:topdown-suit-trim: what a station suit has: the belt stripe (four rows above the hip), the stripe down the back, the pack straps, the suit lights and the trooper's shoulder plates, each turned on by a flag. */
function suitTrimPiece() {
  const draw = [];
  const slots = { trim: '#3f86e0', strap: '#3a3f5a', light: GLOW, plate: '#5d6475' };
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    const refs = refsOf(slots);
    draw.push(stampItem(`belt-${dir}`, at.waist, (g) => T.stripe(g, J, P, d, { colour: slots.trim, up: 4 }), refs, 0, dirWhen(dir)));
    for (const wide of [1, 3]) draw.push(stampItem(`spine${wide}-${dir}`, at.chest, (g) => T.spine(g, J, P, d, { colour: slots.trim, wide }), refs, 0, { direction: [dir], spine: [wide === 3 ? 'wide' : 'narrow'] }));
    draw.push(stampItem(`straps-${dir}`, at.chest, (g) => T.packStraps(g, J, P, d, { colour: slots.strap }), refs, 1, { direction: [dir], straps: [true] }));
    draw.push(stampItem(`lights-${dir}`, at.chest, (g) => T.suitLights(g, J, P, d, { colour: slots.light, layer: 'torso' }), refs, 2, { direction: [dir], lights: [true] }));
    draw.push(stampItem(`lightsNear-${dir}`, at.chest, (g) => T.suitLights(g, J, P, d, { colour: slots.light, layer: 'front' }), refs, 40, { direction: [dir], lights: [true] }));
    draw.push(stampItem(`plates-${dir}`, at.chest, (g) => R.shoulderPlates(g, J, P, d, { colour: slots.plate, layer: 'torso' }), refs, 3, { direction: [dir], plates: [true] }));
    draw.push(stampItem(`platesNear-${dir}`, at.chest, (g) => R.shoulderPlates(g, J, P, d, { colour: slots.plate, layer: 'front' }), refs, 40, { direction: [dir], plates: [true] }));
  }
  return piece('part:topdown-suit-trim', 'Suit trim', "A station suit's belt stripe, the stripe down the back, and when set its pack straps, small lights and shoulder plates; on the chest and waist nodes (use z 40).",
    [{ id: 'trim', label: 'Stripes', default: slots.trim, material: 'cloth' }, { id: 'strap', label: 'Straps', default: slots.strap, material: 'cloth' }, { id: 'light', label: 'Lights', default: GLOW, material: 'light' }, { id: 'plate', label: 'Plates', default: slots.plate, material: 'metal' }],
    { spine: { type: 'word', options: ['narrow', 'wide'], default: 'narrow' }, straps: { type: 'flag', default: false }, lights: { type: 'flag', default: true }, plates: { type: 'flag', default: false } }, draw);
}

function gunsPiece() {
  return heldFromCode('held:topdown-guns', 'Station guns', 'A blaster, a scatter gun, a beam gun, a rifle, a pistol or a baton, as lines along the reachF bone (use z 60): rigs/topdown.js heldGun and topdown-riot.js riotItem read back.',
    [{ id: 'metal', label: 'Metal', default: '#6b7896', material: 'metal' }, { id: 'grip', label: 'Grip', default: '#3a3f5a', material: 'metal' }, { id: 'cell', label: 'Light', default: GLOW, material: 'light' }],
    ['blaster', 'scatter', 'beam', 'rifle', 'pistol', 'baton'], (g, dir, at, L, kind, c) => {
      if (['rifle', 'pistol', 'baton'].includes(kind)) R.riotItem(g, dir, at, { kind, length: R.riotItemSize(kind, L).length, metal: c.metal, grip: c.grip });
      else T.heldGun(g, dir, at, { kind, length: T.gunSize(kind, L).length, metal: c.metal, glow: c.cell });
    }, [0.65, 1, 1.35]);
}

/** part:topdown-body-shield: a shield as tall as the body on the off arm (rigs/topdown-riot.js bodyShield), riot, energy or round, a stamp per Size step on the cuffB node, its back layer and its front layer (use z 50). */
function bodyShieldPiece() {
  const steps = [0.65, 0.825, 1, 1.175, 1.35], slots = { face: '#3a4258', glow: '#e2473f', inset: '#5d6475', core: LIGHT }, draw = [];
  const zBack = { down: -45, up: -46, side: -43 }, zFront = { down: 30, up: -46, side: 30 };
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    for (const kind of R.BODY_SHIELD_KINDS) for (const layer of ['offhand', 'front', 'light']) {
      draw.push(steppedStamps(`${kind}-${layer}-${dir}`, dir === 'side' ? at.cuffB : at.root, (g, sz) => R.bodyShield(g, J, P, d, { kind, size: sz, layer, colour: slots.face, glow: slots.glow, inset: slots.inset, core: slots.core, t: 0 }), refsOf(slots), layer === 'offhand' ? zBack[dir] : zFront[dir] + (layer === 'light' ? 1 : 0), { direction: [dir], kind: [kind] }, steps));
    }
  }
  return piece('part:topdown-body-shield', 'Body shield', 'A body-tall shield on the off arm: riot (with a window), a lit energy pane or round, bigger with its size; on the root node facing down or up, the cuffB node from the side (use z 50).',
    [{ id: 'face', label: 'Face', default: slots.face, material: 'metal' }, { id: 'glow', label: 'Lit edge', default: slots.glow, material: 'light' }, { id: 'inset', label: 'Window', default: slots.inset, material: 'metal' }, { id: 'core', label: 'Core', default: LIGHT, material: 'light' }],
    { kind: { type: 'word', options: [...R.BODY_SHIELD_KINDS], default: 'riot' }, size: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } }, draw);
}

/** part:topdown-shield: a round or kite shield on the other arm (rigs/topdown.js shield), a stamp per Size step on the cuffB node (use z 50). */
function shieldPiece() {
  const steps = [0.65, 0.825, 1, 1.175, 1.35], draw = [];
  const zOf = { down: 9, up: -46, side: -43 };     // + use z 50: over the head facing down (59), behind the body going up (4) and from the side (7)
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    for (const kind of T.SHIELD_KINDS) draw.push(steppedStamps(`${kind}-${dir}`, at.cuffB, (g, sz) => T.shield(g, J, P, d, { kind, size: sz, metal: METAL, boss: TRIM }), refsOf({ metal: METAL, boss: TRIM }), zOf[dir], { direction: [dir], kind: [kind] }, steps));
  }
  return piece('part:topdown-shield', 'Shield', 'A round or kite shield on the other arm with a boss or cross on its face, bigger with its size; on the cuffB node (use z 50).',
    [{ id: 'metal', label: 'Metal', default: METAL, material: 'metal' }, { id: 'boss', label: 'Boss', default: TRIM, material: 'metal' }],
    { kind: { type: 'word', options: [...T.SHIELD_KINDS], default: 'round' }, size: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } }, draw);
}

/** part:topdown-robe-long: a robe or skirt (rigs/topdown.js robe) whose length runs from the knee to the floor, with a trim band; a stamp per length step on the waist node (use z 40). */
function robeLongPiece() {
  const steps = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.85, 1], draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    for (const trim of [true, false]) draw.push(steppedStamps(`robe-${trim ? 'trim' : 'plain'}-${dir}`, at.waist, (g, L) => T.robe(g, J, P, d, { colour: CLOTH, length: L, trim: trim ? TRIM : null }), refsOf({ cloth: CLOTH, trim: TRIM }), 0, { direction: [dir], trimmed: [trim] }, steps, 'length'));
  }
  return piece('part:topdown-robe-long', 'Long robe', 'A robe or skirt over the legs from the hips, to the knee at length 0 and the floor at 1, with or without a band of trim at its hem; on the waist node (use z 40).',
    [{ id: 'cloth', label: 'Robe', default: CLOTH, material: 'cloth' }, { id: 'trim', label: 'Hem', default: TRIM, material: 'cloth' }],
    { length: { type: 'share', lo: 0, hi: 1, default: 0.85 }, trimmed: { type: 'flag', default: true } }, draw);
}

function collarPiece() {
  return torsoStamp('part:topdown-collar', 'Collar', 'A collar of cloth over the shoulders, the front of a cape with no clasp (nothing shows from behind); on the chest node (use z 40).',
    [{ id: 'cloth', label: 'Collar', default: TRIM, material: 'cloth' }], (g, J, P, d, c) => T.mantle(g, J, P, d, { colour: c.cloth, clasp: null }), { z: 5 });
}

function hairBowPiece() {
  return sizedHead('part:topdown-hair-bow', 'Hair bow', 'A ribbon bow with two loops and a knot on top of the head, bigger with its size; on the head node (use z 50).',
    [{ id: 'ribbon', label: 'Ribbon', default: TRIM, material: 'cloth' }], (g, J, P, d, size, c) => T.hairBow(g, J, P, d, { size, colour: c.ribbon }));
}

function strawHatPiece() {
  return hatPiece('wide', 'part:topdown-straw-hat', 'Wide-brimmed hat', 'A hat with a wide round brim and a band above it, the brim wider with its size; on the head node (use z 50), over hatted hair.',
    [{ id: 'cloth', label: 'Hat', default: '#e6c96a', material: 'plant' }, { id: 'band', label: 'Band', default: TRIM, material: 'cloth' }]);
}

function pointedHatPiece() {
  return hatPiece('pointed', 'part:topdown-hat-pointed', 'Pointed hat', 'A wizard\'s cone of a hat with a narrow brim and a band, taller with its size; on the head node (use z 50), over hatted hair.',
    [{ id: 'cloth', label: 'Hat', default: '#7a4fc4', material: 'cloth' }, { id: 'band', label: 'Band', default: GOLD, material: 'cloth' }]);
}

function sneakHeadPiece() {
  // the rogue's hood, bandana and mask (rigs/topdown-sneak.js headCloth), each a stamp per Size step
  const draw = [];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    for (const kind of S.HEAD_CLOTHS) draw.push(steppedStamps(`${kind}-${dir}`, at.head, (g, size) => S.headCloth(g, J, P, d, { kind, size, colour: CLOTH }), refsOf({ cloth: CLOTH }), HEAD_Z, { direction: [dir], kind: [kind] }, SIZES));
  }
  return piece('part:topdown-head-cloth', 'Hood, bandana or mask', 'A rogue\'s cloth for the head: a hood, a bandana knotted at the back or a mask over the mouth, sized by its size; on the head node (use z 50).',
    [{ id: 'cloth', label: 'Cloth', default: CLOTH, material: 'cloth' }], { kind: { type: 'word', options: [...S.HEAD_CLOTHS], default: 'hood' }, size: { type: 'px', lo: 0.5, hi: 1.8, default: 1 } }, draw);
}

function scarfPiece() {
  // the tail as the code rig hangs it at rest (rigs/topdown-sneak.js scarfTail, standing still), and the wrap round the neck
  const draw = [];
  const steps = [0.65, 0.825, 1, 1.175, 1.35];
  for (const dir of DIRECTIONS) {
    const { J, P, d, at } = REST[dir];
    const z = dir === 'up' ? 45 : 0;
    for (const kind of ['short', 'long']) draw.push(steppedStamps(`tail-${kind}-${dir}`, at.chest, (g, L) => S.scarfTail(g, J, P, d, { kind, length: L, colour: CLOTH, action: 'idle', t: 0 }), refsOf({ cloth: CLOTH }), z, { direction: [dir], kind: [kind] }, steps, 'length'));
    draw.push(stampItem(`wrap-${dir}`, at.chest, (g) => T.scarfWrap(g, J, P, d, { colour: CLOTH }), refsOf({ cloth: CLOTH }), 46, dirWhen(dir)));
  }
  return piece('part:topdown-scarf', 'Scarf', 'A scarf wrapped round the neck with a short or long tail hanging down the back, longer with its length; on the chest node (use z 0).',
    [{ id: 'cloth', label: 'Scarf', default: CLOTH, material: 'cloth' }], { kind: { type: 'word', options: ['short', 'long'], default: 'long' }, length: { type: 'px', lo: 0.65, hi: 1.35, default: 1 } }, draw);
}

function buckleBeltPiece() {
  return torsoStamp('part:topdown-belt-buckle', 'Belt with a buckle', 'A belt round the waist with a metal buckle at the front, on the waist node (use z 40).',
    [{ id: 'belt', label: 'Belt', default: '#5d6475', material: 'cloth' }, { id: 'buckle', label: 'Buckle', default: METAL, material: 'metal' }],
    (g, J, P, d, c) => T.belt(g, J, P, d, { colour: c.belt, buckle: c.buckle }), { node: 'waist' });
}

// ---- bases posed the way a character carries what it holds --------------------------------------------------------
// tools/bake-topdown.mjs bakes every clip with nothing held (T.frame(clip, t, {}, {})). A character who carries a
// sword, a pole at attention or a gun in both hands moves differently: the code rig poses it with its options (frame,
// frameWith and its manners, bracedFrame, poseFrame, rigs/topdown-riot.js shieldFrame). The same baker is loaded with
// that one call made a hook (a copy of its text in the system's temporary folder, nothing in this folder changes), so
// each clip below is keyed exactly as B16b keys the standard ones, from the pose the code rig gives with those options.

let PATCHED = null;
const BODIES = new Map();
/**
 * patchedBaker() for a body other than the code rig's default one (second review of M7): every code pose the baker
 * makes (the rest pose the rig is laid out on, DIMS, the soles, the side torsos, the die pictures) is made with the
 * values p and options o ({ tall }), so the bones and shapes are the child's (slight, 22 to 27 px), not an adult's.
 * Each body is its own copy of the module. Null: the default body (patchedBaker()).
 */
async function bakerFor(body = null) {
  if (!body) return patchedBaker();
  const key = JSON.stringify(body);
  if (BODIES.has(key)) return BODIES.get(key);
  const base = await patchedBaker();
  void base;
  const os = await import('node:os');
  const src = fs.readFileSync(PATCHED_FILE, 'utf8');
  const P = JSON.stringify(body.p ?? {}), O = JSON.stringify(body.o ?? {});
  const dims = 'export const DIMS = Object.freeze(T.dims({}));';
  if (src.split(dims).length !== 2) throw new Error('tools/bake-topdown.mjs changed: DIMS is no longer T.dims({})');
  const text = src.replace(dims, `export const DIMS = Object.freeze(T.dims(${P}, ${O}));`).replace(/(T\.frame\([^;]*?), \{\}, \{\}\)/g, `$1, ${P}, ${O})`);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-m7-body-')), 'bake-topdown.mjs');
  fs.writeFileSync(f, text);
  const B = await import(pathToFileURL(f).href);
  BODIES.set(key, B);
  return B;
}
let PATCHED_FILE = null;
/** tools/bake-topdown.mjs with bakeClip's pose taken from globalThis.__M7_FRAME(clip, t) when it is set. */
async function patchedBaker() {
  if (PATCHED) return PATCHED;
  const os = await import('node:os');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'bake-topdown.mjs'), 'utf8');
  const call = '    const F = T.frame(clip, t, {}, {});';
  if (src.split(call).length !== 2) throw new Error('tools/bake-topdown.mjs changed: bakeClip no longer poses with one T.frame call');
  const up = pathToFileURL(ROOT).href, here = pathToFileURL(path.join(ROOT, 'tools')).href;
  // two more changes: bones `reachF` and `reachB` from each hand along what it holds (the other hand's thing as
  // rigs/topdown.js offGrip turns it: mirrored facing down or up), 10 px at rest, stretched by the pose's reach (a held
  // thing pointing at the camera looks shorter: heldItem draws len x reach), so a held piece on one turns and
  // foreshortens as the code rig draws it
  const bone = "    { id: `hand${s}`, node: true, parent: `cuff${s}` },";
  const target = "    t[`hand${s}`] = {";
  for (const x of [call, bone, target]) if (src.split(x).length !== 2) throw new Error(`tools/bake-topdown.mjs changed: ${x.trim()} is no longer there once`);
  const text = src.replace(call, '    const F = (globalThis.__M7_FRAME ?? ((c, u) => T.frame(c, u, {}, {})))(clip, t);')
    .replace(bone, `${bone}\n    { id: \`reach\${s}\`, parent: \`hand\${s}\`, rest: 10 },`)
    .replace(target, "    { const ang = s === 'F' || direction === 'side' ? P.item : -P.item; t[`reach${s}`] = { end: [hd[0] + Math.sin(ang) * 10 * Math.max(0.5, P.reach ?? 1), hd[1] + Math.cos(ang) * 10 * Math.max(0.5, P.reach ?? 1)] }; }\n" + target)
    .replace(/(from |import\()'\.\.\//g, `$1'${up}/`).replace(/(from |import\()'\.\//g, `$1'${here}/`);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-m7-')), 'bake-topdown.mjs');
  fs.writeFileSync(f, text);
  PATCHED_FILE = f;
  PATCHED = await import(pathToFileURL(f).href);
  return PATCHED;
}

/**
 * A base piece: base:person-topdown's rig with the clips listed, each [name, standard clip, frame(clip, t)] (frame
 * returns the code rig's F for that clip at phase t; null: nothing held, as B16b bakes it).
 */
async function bakedBase(id, name, about, list, { v = 1, body = null } = {}) {
  if (about.length > 200) throw new Error(`${id}: about is ${about.length} characters; at most 200`);
  const B = await bakerFor(body);
  const p = { ...B.basePiece('walker'), v };
  const clips = {};
  for (const [out, std, frame] of list) {
    globalThis.__M7_FRAME = frame ?? null;
    try { clips[out] = B.bakeClip(std); } finally { globalThis.__M7_FRAME = null; }
    const { action, direction } = T.parseClip(std);
    const pretty = out.replace(/[_-](down|up|side)$/, '').replace(/[-_]/g, ' ');
    clips[out].label = `${pretty[0].toUpperCase()}${pretty.slice(1)}${out.match(/[_-](down|up|side)$/) ? ` (${direction})` : ''}`;
    void action;
  }
  return { ...p, id, name, about, made: { by: 'tools/bake-topdown-m7.mjs', from: 'rigs/topdown.js' }, body: { ...p.body, clips } };
}

const dirs3 = (action, out = action, frame = null) => DIRECTIONS.map((dir) => [`${out}_${dir}`, `${action}_${dir}`, frame]);
// a clip a sprite's `from` picks by a setting is named with a dash before its direction ('swing-down'): the validator
// checks a picked name against plain clip names when it has no pieces (catalog/sprite-schema.js pickedFrom, CLIP_NAME)
const picked3 = (action, out, frame = null) => DIRECTIONS.map((dir) => [`${out}-${dir}`, `${action}_${dir}`, frame]);

/** base:person-topdown-sword: a sword carried 'up' in the weapon hand: idle, walk, the armed swing, and the punch with nothing held. */
async function swordBase() {
  // fitted as the code rig fits each at 1.5 times its length under the biggest helmet with 2 px to spare, so every length a sprite
  // binds stays inside the frame (the code rig fits each setting; a baked clip has one fit)
  const held = (kind) => (clip, t) => T.frame(clip, t, {}, { item: T.itemSize(kind, 1.5), rise: T.headgearRise('helmet', 1.8) + 2 });
  const sword = held('sword');
  return bakedBase('base:person-topdown-sword', 'Top-down swordsman', 'base:person-topdown with a sword held: idle, walk and the swing (swing-*; swing-axe-*, swing-spear-* fitted to those) in three directions, the punch with nothing held (punch-*), hurt and die.',
    [...dirs3('idle', 'idle', sword), ...dirs3('walk', 'walk', sword), ...picked3('attack', 'swing', sword), ...picked3('attack', 'swing-axe', held('axe')), ...picked3('attack', 'swing-spear', held('spear')), ...picked3('attack', 'punch'), ['hurt', 'hurt', sword], ['die', 'die', sword]]);
}

/** base:person-topdown-guard: a guard with a pole weapon at attention (barring the way with it in block), a sword, or nothing (barring with an arm). */
async function guardBase() {
  const rise = T.headgearRise('helmet', 1.8) + 2;
  const pole = (clip, t) => T.frameWith(clip, t, {}, { item: T.townItemSize('halberd', 1.35), carry: 'upright', rise, manner: [T.MANNERS.attention, T.MANNERS.bar] });
  const sword = (clip, t) => T.frame(clip, t, {}, { item: T.itemSize('sword', 1.5), carry: 'up', rise });
  const bare = (clip, t) => T.frameWith(clip, t, {}, { rise, manner: T.MANNERS.bar });
  const set = (name, f) => [...picked3('idle', `idle-${name}`, f), ...picked3('walk', `walk-${name}`, f), [`block-${name}`, 'block_down', f]];
  return bakedBase('base:person-topdown-guard', 'Top-down guard', 'base:person-topdown as a guard: idle, walk and block with a pole weapon at attention (-pole), a sword (-sword) or nothing held, barring with an arm (-bare).',
    [...set('pole', pole), ...set('sword', sword), ...set('bare', bare)]);
}

/** base:person-topdown-mage: a staff used as a walking stick, a wand or orb held up, or nothing: idle, walk and cast. */
async function mageBase() {
  const rise = T.headgearRise('hat-pointed', 1.8) + 4;
  const staff = (clip, t) => T.frameWith(clip, t, {}, { item: T.smallItemSize('staff', 1.35), carry: 'upright', rise, manner: T.walkingStickManner });
  const small = (clip, t) => T.frameWith(clip, t, {}, { item: T.smallItemSize('wand', 1.35), carry: 'up', rise });
  const bare = (clip, t) => T.frame(clip, t, {}, { rise });
  const set = (name, f) => [...picked3('idle', `idle-${name}`, f), ...picked3('walk', `walk-${name}`, f), [`cast-${name}`, 'cast_down', f]];
  return bakedBase('base:person-topdown-mage', 'Top-down mage', 'base:person-topdown as a mage: idle, walk and cast with a staff that walks like a stick (-staff), a wand or orb held up (-small) or nothing (-bare).',
    [...set('staff', staff), ...set('small', small), ...set('bare', bare)]);
}

/** base:person-topdown-child: a child three quarters of an adult's height, slight, who rocks on its heels and runs flailing: idle, walk, run, carrying something or not. */
async function childBase() {
  const opt = { tall: [24, 29], manner: [T.MANNERS.rock, T.MANNERS.flail], rise: T.headgearRise('hat-wide', 1.8) + 1 };
  const held = (clip, t) => T.frameWith(clip, t, {}, { ...opt, item: T.townItemSize('stick', 1.35), carry: 'up' });
  const bare = (clip, t) => T.frameWith(clip, t, {}, opt);
  const set = (name, f) => [...picked3('idle', `idle-${name}`, f), ...picked3('walk', `walk-${name}`, f), ...picked3('run', `run-${name}`, f)];
  return bakedBase('base:person-topdown-child', 'Top-down child', 'base:person-topdown as a slight child (22 to 27 px tall) who rocks on its heels and runs flailing: idle, walk, run, carrying something (-held) or not (-bare).',
    [...set('held', held), ...set('bare', bare)]);
}

/** base:person-topdown-rogue: blades held low, the run a low leaning dash with the arms swept back: idle, walk, run, armed or not. */
async function rogueBase() {
  const rise = S.headRise({ headgear: 'hood', size: 1.8, hairStyle: 'spiky' }) + 1;
  const armed = (clip, t) => T.frameWith(clip, t, {}, { item: S.bladeSize('short sword', 1.35), carry: 'low', rise, manner: T.dashManner });
  const bare = (clip, t) => T.frameWith(clip, t, {}, { rise, manner: T.dashManner });
  const set = (name, f) => [...picked3('idle', `idle-${name}`, f), ...picked3('walk', `walk-${name}`, f), ...picked3('run', `run-${name}`, f)];
  return bakedBase('base:person-topdown-rogue', 'Top-down rogue', 'base:person-topdown as a rogue: idle, walk and a low leaning dash for a run, with blades held low (-armed) or none (-bare).',
    [...set('armed', armed), ...set('bare', bare)]);
}

/** base:person-topdown-merchant: a tall, long-armed trader with the head carried high, who stands, counts on his fingers (talk) and waves (wave), with a trade good in hand (-held) or not (-bare). */
async function merchantBase() {
  const held = (clip, t) => merchantFrame(clip, t, true), bare = (clip, t) => merchantFrame(clip, t, false);
  const set = (name, f) => [...picked3('idle', `idle-${name}`, f), [`talk-${name}`, 'talk_down', f], [`wave-${name}`, 'wave_down', f]];
  const list = [...set('held', held), ...set('bare', bare)];
  // the wave is a gesture the code rig's standard table lacks: 8 frames, 10 a second, once (the merchant's clip); it is
  // added to the table while this base is baked so the baker times it as it times a standard clip
  T.STANDARD.wave = { frames: 8, fps: 10, loop: false };
  try { return await bakedBase('base:person-topdown-merchant', 'Top-down merchant', 'base:person-topdown as a tall, long-armed trader with the head carried high: idle, talk (counting) and wave, a trade good in hand (-held) or not (-bare).', list); } finally { delete T.STANDARD.wave; }
}

/** base:person-topdown-ranger: a gun held in both hands (rigs/topdown.js bracedFrame): idle, walk, shoot, dodge, hurt and die; with nothing held a shove for the shot (shoot-bare-*). */
async function rangerBase() {
  const rise = Math.max(T.visorHelmetRise(1.8), T.packRise('antenna', 1.35)) + 2;
  const gun = (clip, t) => T.bracedFrame(clip, t, {}, { item: T.gunSize('beam', 1.35), rise, far: T.packFar('jet', 1.35) });
  const bare = (clip, t) => T.bracedFrame(clip.replace(/^shoot_/, 'attack_'), t, {}, { item: null, rise, far: T.packFar('jet', 1.35) });
  return bakedBase('base:person-topdown-ranger', 'Top-down gunner', 'base:person-topdown holding a gun in both hands: idle, walk, shoot (shoot-gun-*), dodge, hurt and die; with nothing held the shot is a shove (shoot-bare-*).',
    [...dirs3('idle', 'idle', gun), ...dirs3('walk', 'walk', gun), ...picked3('shoot', 'shoot-gun', gun), ...picked3('shoot', 'shoot-bare', bare), ['dodge', 'dodge_down', gun], ['hurt', 'hurt', gun], ['die', 'die', gun]]);
}

/** base:person-topdown-trooper: a soldier behind a body shield (rigs/topdown-riot.js shieldFrame): idle, walk, shoot (a gun: shoot-gun-*; a baton or nothing: a jab, shoot-jab-*), block (the shield planted), hurt and die. */
async function trooperBase() {
  const rise = T.visorHelmetRise(1.8) + 2, shield = { kind: 'riot', size: 1.35 };
  const gun = (clip, t) => R.shieldFrame(clip, t, {}, { item: R.riotItemSize('rifle', 1.35), shield, rise });
  const jab = (clip, t) => R.shieldFrame(clip, t, {}, { item: R.riotItemSize('baton', 1.35), shield, rise });
  return bakedBase('base:person-topdown-trooper', 'Top-down trooper', 'base:person-topdown behind a body shield: idle, walk, shoot (a gun: shoot-gun-*; a baton or a fist: shoot-jab-*), block with the shield planted, hurt and die.',
    [...dirs3('idle', 'idle', gun), ...dirs3('walk', 'walk', gun), ...picked3('shoot', 'shoot-gun', gun), ...picked3('shoot', 'shoot-jab', jab), ['block', 'block_down', gun], ['hurt', 'hurt', gun], ['die', 'die', gun]]);
}

/** The bases this baker makes (async: each is keyed from the code rig). */
export async function m7Bases() {
  return [await swordBase(), await guardBase(), await mageBase(), await childBase(), await rogueBase(), await merchantBase(), await rangerBase(), await trooperBase()];
}

// ---- version 2 of the eight bases: keyed at the code sprites' defaults (second review of M7, issues 2 to 5) -------------
// Version 1 keyed every clip from the code rig fitted to the biggest headgear and the longest weapon (2 px to spare),
// so that every setting stayed inside the frame. But the code rig fits each setting by itself: for a big hat it
// crouches the body (a lower jump, then bent knees) and for a long pole it moves the whole body aside, and only at
// those settings. Keyed that way the mage stood 4 px shorter with his robe in the ground at every setting, the guard
// stood 7 px off the pivot from the side, the merchant 3 px shorter. Version 2 keys each clip from the code rig at
// the code sprite's own defaults (its headgear and weapon at size 1, its bounce, the child's height and build), so
// the defaults stand where the code puts them; the few settings that then reach the frame's edge are held in by the
// sprite's own tables (a smaller top end), as the code would have crouched there.

/**
 * The child's body (farm-kid): bouncy (0.7, the code sprite's default Bounce) and 24 to 29 px tall, as at version 1.
 * The code child is 22 to 27 px (25 at its defaults): at 25 its torso is 7 rows and the base's two torso halves need 6
 * to 12 when keyed (tools/bake-topdown.mjs bakeClip), so the sprite's Height slider scales it down from 27 instead.
 * Its clips are keyed at the code child's slight build (0.2: the shoulders and hands closer in), but with arms and legs
 * 3 px wide, not 2: base:person-topdown's fists and boots are 3 px stamps whose bones assume an odd width
 * (tools/bake-topdown.mjs), and its torso keeps the standard width (under the smock, the same skin as the arms).
 */
export const CHILD_BODY = Object.freeze({ p: Object.freeze({ build: 0.2, bounce: 0.7 }), o: Object.freeze({ tall: Object.freeze([24, 29]) }) });

/** The code rig's frame of each version 2 base's sets, at the code sprite's defaults: { base: { set: (clip, t) => F } }. */
export const AT_DEFAULTS = Object.freeze({
  sword: (() => {
    const rise = T.headgearRise('helmet', 1);
    const held = (kind) => (clip, t) => T.frame(clip, t, {}, { item: T.itemSize(kind, 1), rise });
    return { sword: held('sword'), axe: held('axe'), spear: held('spear'), punch: (clip, t) => T.frame(clip, t, {}, { rise }) };
  })(),
  guard: (() => {
    const rise = T.headgearRise('helmet', 1);
    return {
      pole: (clip, t) => T.frameWith(clip, t, {}, { item: T.townItemSize('halberd', 1), carry: 'upright', rise, manner: [T.MANNERS.attention, T.MANNERS.bar] }),
      sword: (clip, t) => T.frameWith(clip, t, {}, { item: T.townItemSize('sword', 1), carry: 'up', rise, manner: null }),
      bare: (clip, t) => T.frameWith(clip, t, {}, { rise, manner: T.MANNERS.bar }),
    };
  })(),
  mage: (() => {
    const rise = T.headgearRise('hat-pointed', 1), manner = T.walkingStickManner;
    return {
      staff: (clip, t) => T.frameWith(clip, t, {}, { item: T.smallItemSize('staff', 1), carry: 'upright', rise, manner }),
      small: (clip, t) => T.frameWith(clip, t, {}, { item: T.smallItemSize('wand', 1), carry: 'up', rise, manner }),
      bare: (clip, t) => T.frameWith(clip, t, {}, { rise, manner }),
    };
  })(),
  child: (() => {
    // the code child's slight build (0.2) places the shoulders and hands; the arms and legs stay 3 px wide (CHILD_BODY)
    const opt = { tall: [...CHILD_BODY.o.tall], manner: [T.MANNERS.rock, T.MANNERS.flail], rise: 0, dims: (d) => ({ ...d, armW: 3, legW: 3 }) };
    return {
      held: (clip, t) => T.poseFrame(clip, t, { ...CHILD_BODY.p }, { ...opt, item: T.townItemSize('stick', 1), carry: 'up' }),
      bare: (clip, t) => T.poseFrame(clip, t, { ...CHILD_BODY.p }, opt),
    };
  })(),
  rogue: (() => {
    const rise = S.headRise({ headgear: 'hood', size: 1, hairStyle: 'short' });
    return {
      armed: (clip, t) => T.frameWith(clip, t, {}, { item: S.bladeSize('daggers', 1), carry: 'low', rise, manner: T.dashManner }),
      bare: (clip, t) => T.frameWith(clip, t, {}, { rise, manner: T.dashManner }),
    };
  })(),
  merchant: {
    held: (clip, t) => merchantFrame(clip, t, true, 1),
    bare: (clip, t) => merchantFrame(clip, t, false, 1),
  },
  ranger: (() => {
    const rise = T.visorHelmetRise(1);
    return {
      gun: (clip, t) => T.bracedFrame(clip, t, {}, { item: T.gunSize('blaster', 1), rise, far: T.packFar('none', 1) }),
      // the beam gun, longer: shot from the side the code rig moves the body back to keep its muzzle in the frame
      beam: (clip, t) => T.bracedFrame(clip, t, {}, { item: T.gunSize('beam', 1), rise, far: T.packFar('none', 1) }),
      bare: (clip, t) => T.bracedFrame(clip.replace(/^shoot_/, 'attack_'), t, {}, { item: null, rise, far: T.packFar('none', 1) }),
    };
  })(),
  trooper: (() => {
    const rise = T.visorHelmetRise(1), shield = { kind: 'riot', size: 1 };
    return {
      gun: (clip, t) => R.shieldFrame(clip, t, {}, { item: R.riotItemSize('rifle', 1), shield, rise }),
      // the jab (a baton, or a fist) fitted to the longest baton, as at version 1: its tip reaches the frame's right edge otherwise
      jab: (clip, t) => R.shieldFrame(clip, t, {}, { item: R.riotItemSize('baton', 1.35), shield, rise }),
    };
  })(),
});

/**
 * The child's smock as farm-kid's own stamps (second review of M7, issue 4): the bib and collar on the chest node, the
 * skirt to the knee and the belt on the waist node, read back from the code child (rigs/topdown.js tabard, robe, hem
 * and mantle at its height and slight build) facing each way. Version 1 used the adult tabard, robe, hem and collar
 * pieces, read on an adult: a skirt 2 rows longer and a bib 2 px wider than the child's. In the sprite's slots
 * `outfit` and `accent`; ids <garment>-<direction>, z as the pieces were used (40, 40, 41, 46).
 */
export function m7ChildGarments() {
  const slots = { outfit: CLOTH, accent: TRIM }, refs = refsOf(slots), out = [];
  for (const dir of DIRECTIONS) {
    const F = T.frame(`idle_${dir}`, 0, { build: 0.2 }, { tall: [22, 27] }), J = T.solve(dir, F.P, F.d), P = F.P, d = F.d;
    const chest = [J.neck[0], J.shoulderY + d.chin - 1], waist = [J.bx, J.hip[1]], when = dirWhen(dir);
    out.push(stampItem(`smock-${dir}`, chest, (g) => T.tabard(g, J, P, d, { colour: slots.outfit, length: 0 }), refs, 40, when));
    out.push(stampItem(`skirt-${dir}`, waist, (g) => T.robe(g, J, P, d, { colour: slots.outfit, length: 0 }), refs, 40, when));
    out.push(stampItem(`belt-${dir}`, waist, (g) => T.hem(g, J, P, d, { colour: slots.accent }), refs, 41, when));
    out.push(stampItem(`collar-${dir}`, chest, (g) => T.mantle(g, J, P, d, { colour: slots.accent, clasp: null }), refs, 46, when));
  }
  return out.filter(Boolean).map((x) => ({ ...x, on: chestOrWaist(x.id) }));
}
const chestOrWaist = (id) => (/^(smock|collar)-/.test(id) ? 'chest' : 'waist');

/** Seven of the eight bases at version 2 (all but the sword base): version 1's clips (same names), keyed from AT_DEFAULTS; the child's with CHILD_BODY. */
export async function m7BasesV2() {
  const A = AT_DEFAULTS, two = { v: 2 };
  const note = ' Keyed at the code sprite\'s defaults (v2).';
  const sw = A.sword;
  const g = A.guard, gset = (name, f) => [...picked3('idle', `idle-${name}`, f), ...picked3('walk', `walk-${name}`, f), [`block-${name}`, 'block_down', f]];
  const m = A.mage, mset = (name, f) => [...picked3('idle', `idle-${name}`, f), ...picked3('walk', `walk-${name}`, f), [`cast-${name}`, 'cast_down', f]];
  const c = A.child, cset = (name, f) => [...picked3('idle', `idle-${name}`, f), ...picked3('walk', `walk-${name}`, f), ...picked3('run', `run-${name}`, f)];
  const r = A.rogue, rset = cset;
  const mc = A.merchant, mcset = (name, f) => [...picked3('idle', `idle-${name}`, f), [`talk-${name}`, 'talk_down', f], [`wave-${name}`, 'wave_down', f]];
  const out = [];
  // the sword base stays at version 1 (fitted to the longest weapon and the biggest helmet): the hero matched its code
  // sprite at the defaults on it, and keyed at the defaults its swing, hurt and die reach the frame's edge at the
  // biggest settings in 270 frames that only a much shorter weapon and helmet range would cure (second review of M7)
  void sw;
  out.push(await bakedBase('base:person-topdown-guard', 'Top-down guard', 'base:person-topdown as a guard: idle, walk and block with a pole at attention (-pole), a sword (-sword) or nothing, barring with an arm (-bare).' + note,
    [...gset('pole', g.pole), ...gset('sword', g.sword), ...gset('bare', g.bare)], two));
  out.push(await bakedBase('base:person-topdown-mage', 'Top-down mage', 'base:person-topdown as a mage: idle, walk and cast with a staff that walks like a stick (-staff), a wand or orb (-small) or nothing (-bare).' + note,
    [...mset('staff', m.staff), ...mset('small', m.small), ...mset('bare', m.bare)], two));
  out.push(await bakedBase('base:person-topdown-child', 'Top-down child', 'base:person-topdown as a bouncy child (keyed 27 px tall) who rocks on its heels and runs flailing: idle, walk, run, holding something (-held) or not (-bare).' + note,
    [...cset('held', c.held), ...cset('bare', c.bare)], two));
  out.push(await bakedBase('base:person-topdown-rogue', 'Top-down rogue', 'base:person-topdown as a rogue: idle, walk and a low leaning dash for a run, with blades held low (-armed) or none (-bare).' + note,
    [...rset('armed', r.armed), ...rset('bare', r.bare)], two));
  T.STANDARD.wave = { frames: 8, fps: 10, loop: false };
  try {
    out.push(await bakedBase('base:person-topdown-merchant', 'Top-down merchant', 'base:person-topdown as a tall, long-armed trader, head carried high: idle, talk (counting) and wave, a trade good in hand (-held) or not (-bare).' + note,
      [...mcset('held', mc.held), ...mcset('bare', mc.bare)], two));
  } finally { delete T.STANDARD.wave; }
  const rg = A.ranger;
  out.push(await bakedBase('base:person-topdown-ranger', 'Top-down gunner', 'A gun in both hands: idle, walk, shoot (shoot-gun-*, beam gun shoot-beam-*), dodge, hurt, die (beam gun: -beam); nothing held: a shove (shoot-bare-*).' + note,
    [...dirs3('idle', 'idle', rg.gun), ...dirs3('walk', 'walk', rg.gun), ...picked3('shoot', 'shoot-gun', rg.gun), ...picked3('shoot', 'shoot-beam', rg.beam), ...picked3('shoot', 'shoot-bare', rg.bare), ['dodge', 'dodge_down', rg.gun], ['dodge-beam', 'dodge_down', rg.beam], ['hurt', 'hurt', rg.gun], ['die', 'die', rg.gun], ['die-beam', 'die', rg.beam]], two));
  const tr = A.trooper;
  out.push(await bakedBase('base:person-topdown-trooper', 'Top-down trooper', 'base:person-topdown behind a body shield: idle, walk, shoot (shoot-gun-*; a baton or a fist: shoot-jab-*), block, hurt and die.' + note,
    [...dirs3('idle', 'idle', tr.gun), ...dirs3('walk', 'walk', tr.gun), ...picked3('shoot', 'shoot-gun', tr.gun), ...picked3('shoot', 'shoot-jab', tr.jab), ['block', 'block_down', tr.gun], ['hurt', 'hurt', tr.gun], ['die', 'die', tr.gun]], two));
  return out;
}

/** Every piece this baker makes. */
export function m7Pieces() {
  return [hairPiece(), hairdoPiece(), helmetPiece(), crownPiece(), kettleHatPiece(), hoodPiece(), capePiece(), hemPiece(), tabardPiece(), weaponPiece(),
    poleArmsPiece(), townThingPiece('stick'), townThingPiece('basket'), townThingPiece('flower'), magicThingsPiece(), bladesPiece(), bladesOffPiece(), shieldPiece(), robeLongPiece(), collarPiece(), hairBowPiece(), strawHatPiece(), pointedHatPiece(), sneakHeadPiece(), scarfPiece(), buckleBeltPiece(),
    neckPiece(), apronPiece(), spectaclesPiece(), turbanPiece(), travelPackPiece(), tradeGoodsPiece(),
    visorHelmetPiece(), visorPiece(), lensMaskPiece(), suitPackPiece(), suitTrimPiece(), gunsPiece(), bodyShieldPiece()];
}

// ---- lying down in `die` (review of M7, issue 2) -------------------------------------------------------------------
// From its third frame `die` shows the base's pictures `dieTip` and `dieLie` on the root (the code rig tips and turns
// its whole picture, and stamps never turn). A worn thing's stamps stand upright on the head or chest node, so they
// cannot follow: version 2 of each worn piece a dying character wears has an argument `pose`: 'stand' (the default,
// version 1's drawing), 'f2' or 'f3' (the tipping frames) or 'lie' (frames 4 to 7), drawing only its picture then:
// a stamp on the root node, read back as what the code rig draws differently with the thing on (the drawing with it
// against the same drawing without it), at each of its arguments' steps. A sprite uses the piece standing on its node
// and once more per turned frame on the root (hidden), and its die clip's frame edits hide the standing use and show
// that frame's (frame edits show and hide uses; they swap only a sprite's own stamps).

const DIE = T.STANDARD.die;
const diePhase = (f) => f / (DIE.frames - 1);
/** The die frames the code rig draws turned (tipping or lying): [2, 3, 4, 5, 6, 7]. */
export const DIE_TURNED = Object.freeze([...Array(DIE.frames).keys()].filter((f) => { const F = T.frame('die', diePhase(f), {}, {}); return !!(F.P.lie || F.P.tilt); }));
/** Where the base's root node is in a turned die frame (frame px): tools/bake-topdown.mjs rootOf and picturePoint. */
function dieRootOf(F) {
  const J = T.solve(F.direction, F.P, F.d), P = F.P, d = F.d;
  if (P.lie) {
    const X0 = (T.CX - Math.floor(d.tall / 2) + Math.round(P.rootX ?? 0)) + (P.lieShift?.[0] ?? 0);
    const Y0 = (T.GROUND - 1 - Math.ceil(d.chestR + d.armW) - Math.round(P.lift ?? 0)) + (P.lieShift?.[1] ?? 0);
    return [X0 + T.GROUND - J.gy, Y0 + J.bx - T.CX];
  }
  return [J.bx + Math.round(P.tilt * (J.gy - J.gy) - P.tilt * d.tall * 0.35), J.gy];
}
const plainFrame = (clip, t) => T.frame(clip, t, {}, {});

/**
 * Two stamps on the root (`<id>-tip` for the tipping frames, `<id>-lie` for the lying ones, as the base splits its
 * pictures), each with a variant for every turned die frame (clear where the other one shows) and clear default rows:
 * the pixels drawWith(g, F) paints that drawWithout(g, F) does not paint the same, as paint refs (refsOf). Null when
 * nothing differs. frameFn(clip, t): the code frame (default: the code rig's own, nothing held).
 */
function lyingStamps(id, drawWith, drawWithout, refs, z, when, frameFn = plainFrame, perFrame = false) {
  const frames = DIE_TURNED.map((f) => {
    const F = frameFn('die', diePhase(f));
    const a = new Surface(T.SIZE[0], T.SIZE[1]), b = new Surface(T.SIZE[0], T.SIZE[1]);
    drawWith(a, F); if (drawWithout) drawWithout(b, F);
    const px = [];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const v = a.data[y * a.w + x]; if (v && v !== b.data[y * b.w + x]) px.push([x, y, v]); }
    return { f, lie: !!F.P.lie, root: dieRootOf(F), px };
  });
  if (!frames.some((x) => x.px.length)) return null;
  const out = [];
  if (perFrame) {
    // one stamp per tipping frame and one for the body lying (the last frame's: the lying body only bounces on the
    // root, which carries it), shown by the piece's `pose` argument: a use each, since frame edits show and hide uses
    // and swap only a sprite's own stamps, and a sprite may use pieces 24 times
    const last = frames.filter((x) => x.lie).at(-1);
    for (const x of frames) {
      if (!x.px.length || (x.lie && x !== last)) continue;
      const pose = x.lie ? 'lie' : `f${x.f}`;
      const ox = Math.min(...x.px.map((p) => p[0])) - x.root[0], oy = Math.min(...x.px.map((p) => p[1])) - x.root[1];
      const at0 = [Math.floor(oy) - 0.5, Math.floor(ox) - 0.5], tl = [Math.round(x.root[0] + at0[1]), Math.round(x.root[1] + at0[0])];
      let w = 1, h = 1;
      for (const [px, py] of x.px) { w = Math.max(w, px - tl[0] + 1); h = Math.max(h, py - tl[1] + 1); }
      if (w > 32 || h > 32) throw new Error(`${id}-f${x.f}: the picture needs ${w} x ${h} pixels; a stamp is at most 32 x 32`);
      const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', key = {}, byRef = new Map();
      const letter = (v) => { const ref = refFor(v, refs); if (!byRef.has(ref)) { const ch = letters[byRef.size]; byRef.set(ref, ch); key[ch] = ref; } return byRef.get(ref); };
      const grid = Array.from({ length: h }, () => Array(w).fill('.'));
      for (const [px, py, v] of x.px) grid[py - tl[1]][px - tl[0]] = letter(v);
      out.push({ id: `${id}-${pose}`, kind: 'stamp', at: at0, rows: grid.map((r) => r.join('')), key, z, when: { ...(when ?? {}), pose: [pose] } });
    }
    return out;
  }
  for (const [part, group] of [['tip', frames.filter((x) => !x.lie)], ['lie', frames.filter((x) => x.lie)]]) {
    const drawn = group.filter((x) => x.px.length);
    if (!drawn.length) continue;
    const ox = Math.min(...drawn.map((x) => Math.min(...x.px.map((p) => p[0])) - x.root[0])), oy = Math.min(...drawn.map((x) => Math.min(...x.px.map((p) => p[1])) - x.root[1]));
    const at0 = [Math.floor(oy) - 0.5, Math.floor(ox) - 0.5];
    let w = 1, h = 1;
    for (const x of drawn) { x.tl = [Math.round(x.root[0] + at0[1]), Math.round(x.root[1] + at0[0])]; for (const [px, py] of x.px) { w = Math.max(w, px - x.tl[0] + 1); h = Math.max(h, py - x.tl[1] + 1); } }
    if (w > 32 || h > 32) throw new Error(`${id}-${part}: the picture needs ${w} x ${h} pixels; a stamp is at most 32 x 32`);
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', key = {}, byRef = new Map();
    const letter = (v) => { const ref = refFor(v, refs); if (!byRef.has(ref)) { const ch = letters[byRef.size]; byRef.set(ref, ch); key[ch] = ref; } return byRef.get(ref); };
    const clear = Array.from({ length: h }, () => '.'.repeat(w));
    const variants = {};
    for (const x of frames) {
      if (!group.includes(x) || !x.px.length) { variants[`f${x.f}`] = clear; continue; }
      const grid = Array.from({ length: h }, () => Array(w).fill('.'));
      for (const [px, py, v] of x.px) grid[py - x.tl[1]][px - x.tl[0]] = letter(v);
      variants[`f${x.f}`] = grid.map((r) => r.join(''));
    }
    out.push({ id: `${id}-${part}`, kind: 'stamp', at: at0, rows: clear, key, variants, z, ...(when ? { when } : {}) });
  }
  return out;
}

/** lyingStamps at each step of a size argument (thresholds at the midpoints, as steppedStamps), merging steps that draw the same. */
function steppedLying(id, drawWithAt, drawWithout, refs, z, when, steps, arg = 'size', frameFn = plainFrame) {
  const out = [];
  let prev = null;
  steps.forEach((s, i) => {
    const st = lyingStamps(`${id}-${String(s).replace('.', '_')}`, (g, F) => drawWithAt(g, F, s), drawWithout, refs, z, null, frameFn, true);
    const sig = st ? JSON.stringify(st.map(({ id: _i, ...x }) => x)) : 'none';
    const hi = i === steps.length - 1 ? null : r5((s + steps[i + 1]) / 2);
    if (prev && prev.sig === sig) { prev.hi = hi; return; }
    prev = { sig, st, lo: i === 0 ? null : r5((steps[i - 1] + s) / 2), hi };
    out.push(prev);
  });
  return out.filter((o) => o.st).flatMap((o) => {
    const th = {};
    if (o.lo !== null) th.atLeast = o.lo;
    if (o.hi !== null) th.below = o.hi;
    const w = Object.keys(th).length ? { ...when, [arg]: [th] } : { ...when };
    return o.st.map((x) => ({ ...x, when: { ...w, ...x.when } }));
  });
}

/** The code rig's drawing of a die frame with nothing worn (the base's own look), and with a look and hooks. */
const bareDie = (look = {}) => (g, F) => F.draw(g, { ...LOOK, ...look }, {});
const dieWith = (look, hooks) => (g, F) => F.draw(g, { ...LOOK, ...look }, hooks);

/** Version 2 of a worn piece: version 1's drawing at pose 'stand' and its lying pictures at poses 'f2' ... 'f7'. */
function lyingVersion(p1, lying, about) {
  if (about.length > 200) throw new Error(`${p1.id}@2: about is ${about.length} characters; at most 200`);
  const stand = p1.body.draw.map((x) => ({ ...x, when: { ...(x.when ?? {}), pose: ['stand'] } }));
  return { ...p1, v: 2, about, args: { ...(p1.args ?? {}), pose: { type: 'word', options: LIE_POSES, default: 'stand' } }, body: { draw: [...stand, ...lying.flat().filter(Boolean)] } };
}
const LIE_ABOUT = ' Pose f2, f3, lie: its picture in die frame 2, 3, or 4 to 7, on root.';
/** The poses of a worn piece's version 2: standing, the two tipping die frames, and lying (die frames 4 to 7). */
export const LIE_POSES = Object.freeze(['stand', ...DIE_TURNED.filter((f) => !T.frame('die', diePhase(f), {}, {}).P.lie).map((f) => `f${f}`), 'lie']);

function hairLying() {
  const p1 = hairPiece(), items = [];
  for (const style of ['short', 'long', 'spiky', 'ponytail']) for (const hatted of [false, true]) {
    items.push(lyingStamps(`lie-${style}${hatted ? '-hatted' : ''}`, dieWith({ hairStyle: style, hatted, hair: HAIR }, {}), bareDie({ hatted }), refsOf({ hair: HAIR }), 0, { style: [style], hatted: [hatted] }, plainFrame, true));
  }
  return lyingVersion(p1, items, "The top-down person's hair: short, long, spiky or a ponytail; hatted keeps it under the skull." + LIE_ABOUT);
}
/** A head piece's version 2 from the same code function sizedHead was given: fn(g, J, P, d, size, colours). */
function headLying(p1, fn, slotList, about, steps = SIZES, extra = []) {
  const slots = Object.fromEntries(slotList.map((s) => [s.id, s.default]));
  const items = steppedLying(`lie-${p1.id.split(':')[1]}`, (g, F, s) => F.draw(g, { ...LOOK, hatted: true }, { head: (g2, J, P, d) => fn(g2, J, P, d, s, slots) }), bareDie({ hatted: true }), refsOf(slots, extra), 0, {}, steps);
  return lyingVersion(p1, items, about + LIE_ABOUT);
}
function capeLying() {
  const p1 = capePiece(), steps = [0.3, 0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.65, 1.8], items = [];
  for (const kind of ['plain', 'tattered']) {
    items.push(steppedLying(`lie-${kind}`, (g, F, s) => F.draw(g, LOOK, { behind: (g2, J, P, d) => T.cape(g2, J, P, d, { kind, length: s, colour: TRIM }), torso: (g2, J, P, d) => T.mantle(g2, J, P, d, { colour: TRIM, clasp: GOLD }) }),
      bareDie(), refsOf({ cloth: TRIM, clasp: GOLD }), 0, { kind: [kind] }, steps, 'length'));
  }
  return lyingVersion(p1, items, 'A cape, plain or torn, to the knee at length 1 and the floor at 1.8, with mantle and clasp; on the chest node, use z 0.' + LIE_ABOUT);
}
function suitPackLying() {
  const p1 = suitPackPiece(), steps = [0.65, 0.825, 1, 1.175, 1.35], slots = { casing: '#6b7896', light: GLOW }, items = [];
  for (const kind of T.PACK_KINDS) items.push(steppedLying(`lie-${kind}`, (g, F, s) => F.draw(g, LOOK, { behind: (g2, J, P, d) => T.pack(g2, J, P, d, { kind, size: s, colour: slots.casing, glow: slots.light, thrust: P.tuck ?? 0 }) }), bareDie(), refsOf(slots), 0, { kind: [kind] }, steps));
  return lyingVersion(p1, items, 'An air tank, a radio or a jet pack on the back, bigger with its size; on the chest node (use z 0).' + LIE_ABOUT);
}
function bodyShieldLying() {
  const p1 = bodyShieldPiece(), steps = [0.65, 0.825, 1, 1.175, 1.35], slots = { face: '#3a4258', glow: '#e2473f', inset: '#5d6475', core: LIGHT }, items = [];
  const riot = (clip, t) => R.shieldFrame(clip, t, {}, { shield: { kind: 'riot', size: 1 } });
  for (const kind of R.BODY_SHIELD_KINDS) {
    const sh = (s, layer) => (g2, J, P, d) => R.bodyShield(g2, J, P, d, { kind, size: s, layer, colour: slots.face, glow: slots.glow, inset: slots.inset, core: slots.core, t: 0 });
    items.push(steppedLying(`lie-${kind}`, (g, F, s) => F.draw(g, LOOK, { offhand: sh(s, 'offhand'), front: (g2, J, P, d) => { sh(s, 'front')(g2, J, P, d); sh(s, 'light')(g2, J, P, d); } }), bareDie(), refsOf(slots), 0, { kind: [kind] }, steps, 'size', riot));
  }
  return lyingVersion(p1, items, 'A body-tall shield: riot, energy or round, bigger with its size; on root facing down or up, cuffB from the side (use z 50).' + LIE_ABOUT);
}

/**
 * part:topdown-scarf@2 (review of M7, issue 6): version 1's tail hanging still (pose 'rest') and, for poses 'run0' to
 * 'run7', the tail as the code rig whips it out behind the rogue's dash in that run frame (rigs/topdown-sneak.js
 * scarfTail with the run's phase), read back from the rogue's dash (frameWith, dashManner) on the chest node of that
 * frame. A sprite uses it once standing and once per run frame (hidden; its run clips' frame edits show that frame's).
 */
export const SCARF_POSES = Object.freeze(['rest', ...Array.from({ length: T.STANDARD.run.frames }, (_, f) => `run${f}`)]);
function scarfRunPiece() {
  const p1 = scarfPiece(), steps = [0.65, 0.825, 1, 1.175, 1.35], s = T.STANDARD.run, items = [];
  const rise = S.headRise({ headgear: 'hood', size: 1.8, hairStyle: 'spiky' }) + 1;
  for (const dir of DIRECTIONS) for (let f = 0; f < s.frames; f++) {
    const t = s.loop ? f / s.frames : f / (s.frames - 1);
    const F = T.frameWith(`run_${dir}`, t, {}, { item: S.bladeSize('short sword', 1.35), carry: 'low', rise, manner: T.dashManner });
    const J = T.solve(dir, F.P, F.d), chest = [J.neck[0], J.shoulderY + F.d.chin - 1];
    for (const kind of ['short', 'long']) {
      items.push(steppedStamps(`run-${kind}-${dir}-${f}`, chest, (g, L) => S.scarfTail(g, J, F.P, F.d, { kind, length: L, colour: CLOTH, action: 'run', t }), refsOf({ cloth: CLOTH }), dir === 'up' ? 45 : 0, { direction: [dir], kind: [kind], pose: [`run${f}`] }, steps, 'length'));
    }
  }
  const stand = p1.body.draw.map((x) => ({ ...x, when: { ...(x.when ?? {}), ...(x.id.startsWith('wrap-') ? {} : { pose: ['rest'] }) } }));
  const about = 'A scarf round the neck with a short or long tail, longer with its length; on the chest node (use z 0). Pose run0 to run7: the tail whipped out in that run frame.';
  return { ...p1, v: 2, about, args: { ...p1.args, pose: { type: 'word', options: SCARF_POSES, default: 'rest' } }, body: { draw: [...stand, ...items.flat().filter(Boolean)] } };
}

/** The worn pieces a dying character wears, at version 2 (lying pictures added). */
export function m7LyingPieces() {
  const head = (p1, fn, slots, about) => headLying(p1, fn, slots, about);
  return [
    hairLying(), capeLying(), suitPackLying(), bodyShieldLying(), scarfRunPiece(),
    head(helmetPiece(), (g, J, P, d, size, c) => T.helmet(g, J, P, d, { size, metal: c.metal, plume: c.plume }), [{ id: 'metal', default: METAL }, { id: 'plume', default: TRIM }], 'An open helmet with a nose guard and a plume, bigger with its size; on the head node (use z 50).'),
    head(crownPiece(), (g, J, P, d, size, c) => T.crown(g, J, P, d, { size, metal: c.metal, gem: c.gem }), [{ id: 'metal', default: GOLD }, { id: 'gem', default: TRIM }], 'A crown with points and a stone, bigger with its size; on the head node (use z 50).'),
    head(visorHelmetPiece(), (g, J, P, d, size, c) => T.visorHelmet(g, J, P, d, { size, shell: c.shell, visor: c.visor }), [{ id: 'shell', default: '#c8ccd8' }, { id: 'visor', default: GLOW }], 'A closed helmet with a lit visor, bigger with its size; on the head node (use z 50).'),
    head(visorPiece(), (g, J, P, d, size, c) => T.visor(g, J, P, d, { size, colour: c.glass, strap: c.strap }), [{ id: 'glass', default: GLOW }, { id: 'strap', default: DARK }], 'Lit glass over the eyes on a strap, bigger with its size; on the head node (use z 50).'),
    head(hoodPiece(), (g, J, P, d, size, c) => T.hood(g, J, P, d, { colour: c.cloth, depth: Math.max(0, Math.min(2, ((size - 0.5) / 1.3) * 2)) }), [{ id: 'cloth', default: CLOTH }], 'A cloth hood, pulled lower over the brow with its size; on the head node (use z 50).'),
    head(lensMaskPiece(), (g, J, P, d, size, c) => R.lensMask(g, J, P, d, { size, colour: c.mask, lens: c.lens }), [{ id: 'mask', default: '#5d6475' }, { id: 'lens', default: '#e2473f' }], "A trooper's mask with two lit lenses, bigger with its size; on the head node (use z 50)."),
  ];
}

/**
 * A dying character's own `dieTip` and `dieLie` (they replace the base's by id): the code rig's drawing of its body in
 * die frames 2 to 7 with what it always wears (a tunic's hem and cuffs, a suit's gloves, stripes, lights and plates)
 * and none of what its controls choose (hair, headgear, cape, pack, shield, weapon: their lying pictures are the pieces'
 * own, above), in the sprite's palette slots. hex: the sprite's slot colours at its defaults ({ slot: '#rrggbb' }).
 */
export function m7DiePicture(id, hex) {
  const base = { hairStyle: 'bald', hatted: false };
  const recipes = {
    'hero-walker': () => ({ p: {}, look: { skin: hex.skin, top: hex.outfit, bottom: hex.bottom, boots: hex.wood, cuffs: hex.trim }, hooks: { torso: (g, J, P, d) => T.hem(g, J, P, d, { colour: hex.trim }) }, slots: ['skin', 'outfit', 'bottom', 'wood', 'trim'] }),
    'void-ranger': () => ({ p: {}, look: { skin: hex.skin, top: hex.outfit, bottom: hex.outfit, boots: hex.trim },
      hooks: {
        offhand: (g, J, P, d) => T.gloves(g, J, P, d, { colour: hex.trim, layer: 'offhand' }),
        torso: (g, J, P, d) => { T.gloves(g, J, P, d, { colour: hex.trim, layer: 'torso' }); T.stripe(g, J, P, d, { colour: hex.trim, up: 4 }); T.spine(g, J, P, d, { colour: hex.trim }); T.suitLights(g, J, P, d, { colour: hex.glow, layer: 'torso' }); },
        front: (g, J, P, d) => { T.gloves(g, J, P, d, { colour: hex.trim, layer: 'front' }); T.suitLights(g, J, P, d, { colour: hex.glow, layer: 'front' }); },
      }, slots: ['skin', 'outfit', 'trim', 'glow'] }),
    'shield-trooper': () => ({ p: { build: 0.8 }, look: { skin: hex.skin, top: hex.outfit, bottom: hex.bottom, boots: hex.trim },
      hooks: {
        offhand: (g, J, P, d) => T.gloves(g, J, P, d, { colour: hex.trim, layer: 'offhand' }),
        torso: (g, J, P, d) => { T.gloves(g, J, P, d, { colour: hex.trim, layer: 'torso' }); T.stripe(g, J, P, d, { colour: hex.trim, up: 4 }); T.spine(g, J, P, d, { colour: hex.trim, wide: 3 }); R.shoulderPlates(g, J, P, d, { colour: hex.trim, layer: 'torso' }); },
        front: (g, J, P, d) => { T.gloves(g, J, P, d, { colour: hex.trim, layer: 'front' }); R.shoulderPlates(g, J, P, d, { colour: hex.trim, layer: 'front' }); },
      }, slots: ['skin', 'outfit', 'bottom', 'trim'] }),
  };
  if (!recipes[id]) throw new Error(`m7DiePicture: no recipe for ${id}`);
  const r = recipes[id]();
  const refs = refsOf(Object.fromEntries(r.slots.map((s) => [s, hex[s]])));
  const st = lyingStamps('die', (g, F) => F.draw(g, { ...base, ...r.look }, r.hooks), null, refs, 1, null, (clip, t) => T.frame(clip, t, r.p, {}));
  return st.map((x) => {
    const own = Object.fromEntries(Object.entries(x.variants).filter(([, rows]) => rows.some((row) => /[^.]/.test(row))));
    return { id: x.id === 'die-tip' ? 'dieTip' : 'dieLie', kind: 'stamp', on: 'root', at: x.at, rows: Object.values(own)[0], key: x.key, variants: own, z: 1, hidden: true };
  });
}

// ---- light drawn after the outline (review of M7, issue 3) ----------------------------------------------------------
// The code sprites draw a few things after the outline: the hero's slash arc, the gunners' muzzle flare, the ranger's
// dodge streaks, the mage's glowing orb and its cast (a growing glow, twinkles, a burst and a ring). In data these are
// shapes and fx generator calls with `glow: true` (rigs/bones.js draws them after the outline), hidden unless the
// sprite's frame edits show them on the frames the code draws them; their numbers are read from the code rig here.

const deg = (a) => r5((a * 180) / PI);
/** The arcs rigs/topdown.js slashTrail draws for one attack frame: [{ at: [u, v] from the hand, r, a0, a1, thick }] (degrees: 0 down, 90 right). */
function slashArcs(dir, f, kind, wl) {
  const s = T.STANDARD.attack, t = f / (s.frames - 1);
  const F = T.frame(`attack_${dir}`, t, {}, { item: T.itemSize(kind, wl), rise: T.headgearRise('helmet', 1) });
  const rec = [], J = T.solve(dir, F.P, F.d), [hx, hy] = J.armF.hand;
  // a0, a1 here are screen angles (0 down, 90 right), as the code draws them; m7Effects turns them into the node's
  T.slashTrail({ arc: (x, y, r, a0, a1, thick) => rec.push({ at: [r5(y - hy), r5(x - hx)], r: r5(r), a0: deg(a0), a1: deg(a1), thick }), get: () => 0 }, dir, F.poseAt, t, F.d, F.item.length, '#ffffff');
  return rec;
}

/** The effects of one M7 sprite: { palette (slots to add), shapes, edits: { clip: { frame: { show, hide } } }, drop (shape ids to take out) }. */
/** From this Height up, the mage's cast leaves out its twinkles, burst and ring (they would reach the frame's top; the code clips them). */
const FAR_HEIGHT = 0.55;
export function m7Effects(id) {
  const out = { palette: [], shapes: [], edits: {}, drop: [] };
  const edit = (clip, f, k, ids) => { const e = ((out.edits[clip] ??= {})[f] ??= {}); (e[k] ??= []).push(...ids); };
  const shine = { id: 'shine', default: '#ffffff', material: 'light', detail: true };
  if (id === 'hero-walker') {
    out.palette.push(shine);
    const s = T.STANDARD.attack;
    for (const dir of DIRECTIONS) for (const kind of ['sword', 'axe', 'spear']) for (let f = 0; f < s.frames; f++) {
      const at1 = slashArcs(dir, f, kind, 1);
      at1.forEach((a, i) => {
        const lo = slashArcs(dir, f, kind, 0.65)[i], hi = slashArcs(dir, f, kind, 1.35)[i];
        // the code clips the arc to the frame; a data arc cannot be clipped, so its radius is held down until the arc
        // stays 2 px inside the frame where the base's hand is in this frame with the tallest body (and, failing that,
        // its ends are pulled in)
        const B = T.frame(`attack_${dir}`, f / (s.frames - 1), {}, { item: T.itemSize('sword', 1.5), rise: T.headgearRise('helmet', 1.8) + 2 });
        const hand = T.solve(dir, B.P, B.d).armF.hand, lift = 1;
        const inside = (deg1, R) => { const q = (deg1 * PI) / 180, R1 = R + a.thick / 2 + 0.5, x = hand[0] + a.at[1] + Math.sin(q) * R1, y = hand[1] + a.at[0] + Math.cos(q) * R1 - lift; return x >= 2.5 && y >= 2.5 && x <= T.SIZE[0] - 3.5 && y <= T.SIZE[1] - 3.5; };
        const step = a.a1 > a.a0 ? 1 : -1;
        const fits = (R) => { for (let q = a.a0; (a.a1 - q) * step >= 0; q += step * 2) if (!inside(q, R)) return false; return inside(a.a1, R); };
        let cap = Math.max(a.r, hi?.r ?? 0);
        while (cap > 6 && !fits(cap)) cap -= 0.5;
        while (!fits(cap) && (a.a1 - a.a0) * step > 20) { if (!inside(a.a0, cap)) a.a0 = r5(a.a0 + step * 2); else a.a1 = r5(a.a1 - step * 2); }
        if (!fits(cap)) return;
        const m = (v) => r5(Math.min(v, cap));
        const r = lo && hi ? { from: 'weaponLength', map: [[0.65, m(lo.r)], [1, m(a.r)], [1.35, m(hi.r)]] } : m(a.r);
        const sid = `slash-${kind}-${dir}-${f}-${i}`;
        // on a screen-aligned node an arc's angle a points sin(a) along u (down) and cos(a) along v (right)
        // (engine/draw-list.js mapAngle): a screen angle s (0 down, 90 right) is 90 - s there
        out.shapes.push({ id: sid, kind: 'arc', on: 'cuffF', at: a.at, r, a0: r5(90 - a.a1), a1: r5(90 - a.a0), thick: a.thick, paint: 'shine', glow: true, z: 95, hidden: true, when: { weapon: [kind] } });
        edit(`attack_${dir}`, f, 'show', [sid]);
      });
    }
  }
  if (id === 'void-ranger' || id === 'shield-trooper') {
    // the muzzle flare on the shot's frame (shoot frame 1): a cross of light just past the muzzle, white at its middle,
    // and a ray on along the barrel except facing down (rigs/topdown.js muzzleFlare, size 2)
    const ranger = id === 'void-ranger';
    const kinds = ranger ? ['blaster', 'scatter', 'beam'] : ['rifle', 'pistol'];
    const len = (k, wl) => (ranger ? T.gunSize(k, wl).length : R.riotItemSize(k, wl).length);
    const [paint, core] = ranger ? ['glow', 'cream'] : ['glow', 'core'];
    for (const k of kinds) {
      // past the standard length the flare stops following the muzzle out (the code clips it to the frame; data cannot)
      // (on the version 2 bases, which stand where the code does, the ranger's beam gun's flare drawn at the gun's length
      // sits a pixel past the code's and on the frame's right edge: it is drawn a pixel back, and its ray and the
      // trooper's a pixel shorter, so each ends where the code's does)
      const back = ranger && k === 'beam' ? 1 : 0, ray = ranger && k !== 'beam' ? 6.5 : 5.5;
      const u = (d) => ({ from: 'weaponLength', map: [[0.65, r5(len(k, 0.65) + d - back)], [1, r5(len(k, 1) + d - back)], [1.35, r5(len(k, 1) + d - back)]] });
      const base = { on: 'reachF', glow: true, z: 95, hidden: true };
      const ids = [];
      const add = (sid, x) => { out.shapes.push({ id: sid, ...x, ...base, when: { ...(x.when ?? {}), weapon: [k] } }); ids.push(sid); };
      add(`flare-${k}-ray`, { kind: 'line', from: [u(2.5), 0], to: [u(ray), 0], paint, when: { direction: ['up', 'side'] } });
      add(`flare-${k}-arms`, { kind: 'line', from: [u(-0.5), 0], to: [u(3.5), 0], paint });
      add(`flare-${k}-bar`, { kind: 'line', from: [u(1.5), -2], to: [u(1.5), 2], paint });
      add(`flare-${k}-core`, { kind: 'line', from: [u(0.5), 0], to: [u(2.5), 0], paint: core });
      add(`flare-${k}-coreBar`, { kind: 'line', from: [u(1.5), -1], to: [u(1.5), 1], paint: core });
      for (const dir of DIRECTIONS) edit(`shoot_${dir}`, 1, 'show', ids);
    }
    if (ranger) {
      // dodge: two streaks of light above the tucked body, shortening as it lands (rigs/topdown.js dashStreaks), read
      // back at the defaults (helmet, size 1) as a stamp per frame on the root node
      const s = T.STANDARD.dodge, rise = T.visorHelmetRise(1);
      for (let f = 0; f < s.frames; f++) {
        const t = f / (s.frames - 1);
        const F = T.bracedFrame('dodge_down', t, {}, { item: T.gunSize('blaster', 1), rise });
        if (!(F.P.tuck > 0.95)) continue;
        const J = T.solve('down', F.P, F.d), root = [J.bx, J.gy];
        const st = readBack((g) => T.dashStreaks(g, J, F.P, F.d, { colour: '#5fe0f0', core: '#f0ead8', fade: (t - 2 / 7) * 1.4, rise }), refsOf({ glow: '#5fe0f0', cream: '#f0ead8' }));
        if (!st) continue;
        const sid = `dodgeStreaks-${f}`;
        out.shapes.push({ id: sid, kind: 'stamp', on: 'root', at: [r5(st.y0 - root[1] - 0.5), r5(st.x0 - root[0] - 0.5)], rows: st.rows, key: st.key, glow: true, z: 95, hidden: true });
        edit('dodge', f, 'show', [sid]);
      }
    }
  }
  if (id === 'mage-walker') {
    // the orb's glow at rest, growing through the cast (engine/fx.js glow: hard discs from the rim in, as ellipses:
    // the fx generators draw only at 0 and up on a node), twinkles gathering, a four-point burst at its brightest, and a
    // ring opening on the release
    out.palette.push(shine, { id: 'glowHot', material: 'magic', derive: { rule: 'tone', of: 'glow', by: 1.6 } });
    const C = ['shine', 'glowHot', 'glow.light', 'glow', 'glow.dark'];
    const s = T.STANDARD.cast, heat = [];
    for (let f = 0; f < s.frames; f++) heat.push(r5(T.frameWith('cast_down', f / (s.frames - 1), {}, { item: T.smallItemSize('staff', 1), carry: 'upright' }).P.glow));
    const disc = (id, on, at, r, w, hidden) => {
      const ids = [];
      if (out.shapes.some((x) => x.id === `${id}-0`)) return out.shapes.filter((x) => x.id.startsWith(`${id}-`)).map((x) => x.id);
      const add = (k, rr, paint) => { if (rr < 0.5) return; const sid = `${id}-${k}`; ids.push(sid); out.shapes.push({ id: sid, kind: 'ellipse', on, at, r: [r5(rr), r5(rr)], paint, glow: true, z: 95 + k * 0.01, ...(hidden ? { hidden: true } : {}), when: w }); };
      // three of fx.js glow's five discs (the rim, the middle and the hot heart), which read the same at this size
      add(0, r, C[4]);
      add(1, ((r - 1) * 3) / 4, C[2]);
      add(2, (r - 1) / 2, C[1]);
      return ids;
    };
    const TW = { 1: [[-6, 4], [5, -7]], 2: [[7, 3], [-4, -6], [2, 8]], 3: [[-8, -2], [4, 6], [6, -5]], 4: [[-5, 6], [8, -1]] };
    const kinds = { staff: [12, 3.4], wand: [9, 1.9], orb: [5, 3.4] };
    const fx = (k, at, on) => {
      const w = { weapon: [k] }, small = k === 'wand', tag = k;
      // the code clips its light to the frame; data cannot, so the long staff's twinkles, burst and ring (which reach
      // past the frame's top-left with the longest staff) are left out from Length 1.15, and its ring opens less far
      // (version 2 of the base stands the body where the code does, so the tallest body lifts the light 3 to 4 px
      // nearer the top than version 1's crouched one: the same light is also left out from Height FAR_HEIGHT up)
      const tall = { height: [{ below: FAR_HEIGHT }] };
      const far = k === 'staff' ? { ...w, weaponLength: [{ below: 1.025 }], ...tall } : { ...w, ...tall }, ringTo = k === 'staff' ? 7 : 11;
      const rest = k !== 'none' ? disc(`orbGlow-${tag}`, on, at, kinds[k][1], w, false) : [];
      const plus = (u0, v0) => (Array.isArray(at) ? [typeof at[0] === 'object' ? { ...at[0], map: at[0].map.map(([x, y]) => [x, r5(y + u0)]) } : at[0] + u0, at[1] + v0] : at);
      for (let f = 0; f < s.frames; f++) {
        if (!(heat[f] > 0.05)) continue;
        // three sizes: the frames whose glow is about the same share one (heat 0.29 and 0.36, 0.6 and 0.7, 0.8 and 1)
        const step = heat[f] < 0.45 ? 0 : heat[f] < 0.75 ? 1 : 2, hs = [0.33, 0.65, 0.9][step];
        const r = k === 'none' ? 1.5 + hs * 3 : (small ? 1.9 : 3.4) + hs * 1.6;
        if (step === 0 || k !== 'staff') edit('cast', f, 'show', disc(`castGlow-${tag}-${step}`, on, at, r, w, true));
        else {
          // the long staff on the tallest body holds its light up to the frame's top: there the glow stays at its resting size
          // (from Length 1.075 and Height 0.7 together: measured on a grid of both, every 0.05)
          const r0 = 3.4, longTall = { weaponLength: [{ atLeast: 1.075 }], height: [{ atLeast: 0.7 }] };
          edit('cast', f, 'show', disc(`castGlow-${tag}-${step}`, on, at, r, [{ ...w, weaponLength: [{ below: 1.075 }] }, { ...w, height: [{ below: 0.7 }] }], true));
          edit('cast', f, 'show', disc(`castGlowTall-${tag}`, on, at, r0, { ...w, ...longTall }, true));
        }
        edit('cast', f, 'hide', rest);
        const t = f / (s.frames - 1), ids = [];
        if (t < 0.6) for (const [n, [du, dv]] of (TW[f] ?? []).entries()) {
          const sid = `castSparks-${tag}-${f}-${n}`;
          out.shapes.push({ id: sid, kind: 'dot', on, at: plus(du, dv), paint: n % 2 ? 'glow.light' : 'shine', glow: true, z: 96.1, hidden: true, when: far });
          ids.push(sid);
        } else {
          const sid = `castRing-${tag}-${f}`, u = Math.min(1, (t - 0.6) / 0.4);
          out.shapes.push({ id: sid, kind: 'ring', on, at, r: r5(5 + (ringTo - 5) * u), thick: u < 0.5 ? 2 : 1, paint: u < 0.5 ? 'glow.light' : 'glow', glow: true, z: 96, hidden: true, when: far });
          ids.push(sid);
        }
        if (heat[f] > 0.9) {
          const R = k === 'none' ? 7 : k === 'staff' ? 6 : 8;    // the staff's arms 2 px short of the code's 8, which the code clips at the frame's top
          for (const [n, [du, dv]] of [[1, 0], [-1, 0], [0, 1], [0, -1]].entries()) {
            const sid = `castBurst-${tag}-${n}`;
            out.shapes.push({ id: sid, kind: 'line', on, from: at, to: plus(du * R, dv * R), thick: 1, paint: 'glowHot', glow: true, z: 94, hidden: true, when: far });
            ids.push(sid);
          }
        }
        edit('cast', f, 'show', ids);
      }
    };
    // DROP: drawn where the code puts it, the light lands 1.5 px higher than the code's (measured against the code
    // sprite at rest and through the cast, every held kind and the empty hand; second review of M7), so it is moved
    // 1.5 px down: back along a held thing, which points up, and down the screen on the cuffF node
    const DROP = 1.5;
    for (const k of Object.keys(kinds)) fx(k, [{ from: 'weaponLength', map: [[0.65, r5(kinds[k][0] * 0.65 - DROP)], [1.35, r5(kinds[k][0] * 1.35 - DROP)]] }, 0], 'reachF');
    // an empty hand: the light over the raised palm (2 px out, 4 up from the hand)
    fx('none', [-4 + DROP, -2], 'cuffF');
    out.drop.push('palmGlow');
  }
  return out;
}

// ---- versions replaced before release (M7b, M7c) ---------------------------------------------------------------------
// What this baker makes first was replaced, piece by piece, by later versions (made by the tests that hold them, or by
// the modes above); the old versions were never released, nothing names them, and they were removed with their pins
// (docs/data-sprites.md 3.1). The baker still builds them (later versions start from some), but never writes them again.

/** The versions this baker makes that are not to be written: 'id@v' -> what replaced it. */
export const REPLACED = Object.freeze({
  'held:topdown-polearm@1': 'held:topdown-polearm@4 (tests/unit/m7-topdown-pieces.test.mjs: shapes at the bone angle)',
  'held:topdown-magic@1': 'held:topdown-magic@3 (tests/unit/m7-topdown-held.test.mjs)',
  'held:topdown-blades@1': 'held:topdown-blades@2 (tests/unit/m7-topdown-held.test.mjs)',
  'held:topdown-blades-off@1': 'held:topdown-blades-off@2 (tests/unit/m7-topdown-held.test.mjs)',
  'held:topdown-guns@1': 'held:topdown-guns@2 (tests/unit/m7-topdown-held.test.mjs)',
  'held:topdown-stick@1': 'held:topdown-stick@2 (tests/unit/m7-topdown-held.test.mjs)',
  'held:topdown-flower@1': 'held:topdown-flower@2 (tests/unit/m7-topdown-held.test.mjs)',
  ...Object.fromEntries(['body-shield', 'cape', 'crown', 'lens-mask', 'scarf', 'suit-pack', 'visor-helmet', 'visor'].map((p) => [`part:topdown-${p}@1`, `part:topdown-${p}@2 (--lying)`])),
  'part:topdown-collar@1': 'nothing (no sprite wears it)',
  ...Object.fromEntries(['child', 'guard', 'mage', 'merchant', 'ranger', 'rogue', 'trooper'].map((b) => [`base:person-topdown-${b}@1`, `base:person-topdown-${b}@2 (--bases2)`])),
});
/** True when a piece this baker makes is one it must not write (REPLACED), saying so. */
function replaced(p) {
  const by = REPLACED[`${p.id}@${p.v}`];
  if (by) console.log(`skipped ${p.id}@${p.v}: replaced by ${by}`);
  return !!by;
}

/**
 * base:person-topdown-walker@2 (M7c, the third review of M7b, issue 4): version 1 (B16b's, which the elder's B16b fixture
 * keeps) with its talk keyed again so the free hand comes right up as the code elder speaks (tests/fixtures/code-sprites/
 * village-elder.js: P.armB.u += 2.5, P.armB.o += 2 in talk). A sprite's own keys cannot swap the base's stamps (the
 * mouth, the eyes, the boots), so the raised talk is the base's. Keyed by tools/bake-topdown.mjs bakeClip itself, its one
 * T.frame call taken from globalThis.__WALKER_FRAME (the rest of version 1 is rebuilt the same, byte for byte).
 */
export async function walkerV2() {
  const os = await import('node:os');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'bake-topdown.mjs'), 'utf8');
  const call = '    const F = T.frame(clip, t, {}, {});';
  if (src.split(call).length !== 2) throw new Error('tools/bake-topdown.mjs changed: bakeClip no longer poses with one T.frame call');
  const up = pathToFileURL(ROOT).href, here = pathToFileURL(path.join(ROOT, 'tools')).href;
  const text = src.replace(call, '    const F = (globalThis.__WALKER_FRAME ?? ((c, u) => T.frame(c, u, {}, {})))(clip, t);')
    .replace(/(from |import\()'\.\.\//g, `$1'${up}/`).replace(/(from |import\()'\.\//g, `$1'${here}/`);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-walker-')), 'bake-topdown.mjs');
  fs.writeFileSync(f, text);
  const B = await import(pathToFileURL(f).href);
  const raise = (P, F) => { if (F.action === 'talk') { P.armB.u += 2.5; P.armB.o += 2; } };
  globalThis.__WALKER_FRAME = (c, u) => (c === 'talk' ? T.frameWith(c, u, {}, { manner: raise }) : T.frame(c, u, {}, {}));
  try {
    const p = B.basePiece('walker');
    return {
      ...p, v: 2,
      about: 'base:person-topdown-walker@1 with the free hand raised as the person talks (the code elder\'s gesture): idle, walk (three directions) and talk, bald, nothing worn or held.',
      made: { by: 'tools/bake-topdown-m7.mjs walkerV2 (tools/bake-topdown.mjs basePiece, talk posed with the hand raised; migration batch M7c)', from: 'rigs/topdown.js' },
    };
  } finally { delete globalThis.__WALKER_FRAME; }
}

/**
 * base:person-topdown-trooper@3 (M7c review issue 3): version 2's clips, byte for byte, and the same clips again for a
 * baton (idle-baton-*, walk-baton-*, block-baton, hurt-baton, die-baton); idle and walk also as idle-gun-* and walk-gun-*
 * (the same keys as idle_* and walk_*: a name a setting picks has no underscore, catalog/sprite-schema.js CLIP_NAME). rigs/topdown-riot.js shieldFrame carries a
 * baton 'up' (raised, tip up and out) and a gun 'ready' (at the hip, tip down); version 2 keyed every clip but the jab
 * for the gun, so a baton hung tip down like the rifle. shield-trooper picks these clips for a baton.
 */
export async function trooperV3() {
  const tr = AT_DEFAULTS.trooper, rise = T.visorHelmetRise(1), shield = { kind: 'riot', size: 1 };
  const baton = (clip, t) => R.shieldFrame(clip, t, {}, { item: R.riotItemSize('baton', 1), shield, rise });
  return bakedBase('base:person-topdown-trooper', 'Top-down trooper', 'base:person-topdown behind a body shield: idle, walk, shoot (gun: shoot-gun-*; baton or fist: shoot-jab-*), block, hurt and die; a raised baton: *-baton.',
    [...dirs3('idle', 'idle', tr.gun), ...dirs3('walk', 'walk', tr.gun), ...picked3('shoot', 'shoot-gun', tr.gun), ...picked3('shoot', 'shoot-jab', tr.jab), ['block', 'block_down', tr.gun], ['hurt', 'hurt', tr.gun], ['die', 'die', tr.gun],
      ...picked3('idle', 'idle-gun', tr.gun), ...picked3('walk', 'walk-gun', tr.gun),
      ...picked3('idle', 'idle-baton', baton), ...picked3('walk', 'walk-baton', baton), ['block-baton', 'block_down', baton], ['hurt-baton', 'hurt', baton], ['die-baton', 'die', baton]], { v: 3 });
}

// ---- sprite data fitted to the code sprites (M7c) ------------------------------------------------------------------------
// Some of the nine sprites' data is fitted to the code sprite's pixels after the pieces are made, not baked into a piece.
// Each fit reads one sprite file, changes only its own entries, and writes it back in the pieces' compact layout
// (pieceText), so it can be made again from the repository:
//
//   node tools/bake-topdown-m7.mjs --fit twinkles [file]     mage-walker: the cast's twinkles (castSparks-*), the code's
//                                                             own pixels (engine/fx.js sparkles round the light, upright
//                                                             on screen) as glowing 1 px lines on the light's bone
//   node tools/bake-topdown-m7.mjs --fit cast-edges [file]   mage-walker: where the cast's light (its glow, twinkles,
//                                                             star burst and ring) would reach the frame's edge at some
//                                                             Height, Length and Build, a copy with the rows and columns
//                                                             that would touch it left out, shown there instead (the
//                                                             code clips its light at the frame; a data sprite may not
//                                                             touch the frame's edge, quality/sprite.js)
//   node tools/bake-topdown-m7.mjs --fit shield-scan [file]  shield-trooper: the energy shield's climbing scan line
//                                                             (rigs/topdown-riot.js lightPane), a line a phase
// [file] defaults to the sprite in sprites/; the mage's two run in that order (cast-edges keeps the twinkles twinkles
// made off the frame's edge). The merchant's Bounce travel and the guard's sideways move were fitted by searching factors
// against the code's pixels; their values are data in the sprites, held by tests/unit/m7-topdown-gestures.test.mjs
// (the guard's measured in tests/fixtures/m7-topdown-gaps.json).

const MAGE_FRAMES = 8;
/** The twinkles of the code mage's cast at frame f (engine/fx.js sparkles, as tests/fixtures/code-sprites/mage-walker.js draws them): [[dx, dy, colour index of steps(glow)]] from the light's centre pixel. */
export function mageSparkPixels(f) {
  const C = fxSteps('#4fd8ee'), g = new Surface(64, 64), x = 32.5, y = 32.5, t = f / (MAGE_FRAMES - 1), px = [];
  if (!(t < 0.6)) return px;
  fxSparkles(g, { t: t * 1.5, count: 5, seed: 3, big: false, area: [x - 9, y - 9, x + 10, y + 10], colours: C });
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { const v = g.data[j * 64 + i]; if (v >>> 24) px.push([i - 32, j - 32, C.findIndex((c) => col(c) === v)]); }
  return px;
}
/** The paint refs of the mage's slots for the colour steps of engine/fx.js steps(glow), hottest first. */
export const MAGE_GLOW_REFS = Object.freeze(['shine', 'glowHot', 'glow.light', 'glow', 'glow.dark']);

/** Pixels [[x, y, k]] as layered straight runs [{ cells, k }], the coolest colour first and a hotter one painted over it. */
function sparkRuns(px) {
  const at = new Map(px.map(([x, y, k]) => [`${x},${y}`, k]));
  const order = [...new Set(px.map((p) => p[2]))].sort((a, b) => b - a);
  const out = [];
  order.forEach((k, li) => {
    const later = new Set(order.slice(li + 1));
    const ok = (x, y) => { const v = at.get(`${x},${y}`); return v === k || later.has(v); };
    const todo = new Set(px.filter((p) => p[2] === k).map(([x, y]) => `${x},${y}`));
    while (todo.size) {
      let best = null;
      for (const key of todo) {
        const [x, y] = key.split(',').map(Number);
        for (const [sx, sy] of [[1, 0], [0, 1]]) {
          let a = 0, b = 0;
          while (ok(x - sx * (a + 1), y - sy * (a + 1))) a++;
          while (ok(x + sx * (b + 1), y + sy * (b + 1))) b++;
          const cells = [];
          for (let i = -a; i <= b; i++) cells.push([x + sx * i, y + sy * i]);
          const gain = cells.filter(([cx, cy]) => todo.has(`${cx},${cy}`)).length;
          if (!best || gain > best.gain) best = { cells, gain };
        }
      }
      for (const [cx, cy] of best.cells) todo.delete(`${cx},${cy}`);
      out.push({ cells: best.cells, k });
    }
  });
  return out;
}

/** A sprite definition loaded from a temporary copy (the engine, the project's pieces), with extra shapes pushed on. */
async function loadDef(def, id, extra = []) {
  const os = await import('node:os');
  const { loadDataSprite } = await import('./lib/assets.mjs');
  const d = structuredClone(def);
  d.body.rig.shapes.push(...extra);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-fit-')), f = path.join(dir, `${id}.json`);
  fs.writeFileSync(f, JSON.stringify(d));
  try { return await loadDataSprite(ROOT, f); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const settingsOf = async (s, set) => { const E = await import('../engine/sprite.js'); return E.cleanParams(s, { ...E.defaultParams(s), ...set }); };

/**
 * mage-walker's cast twinkles, made again from the code (third review of M7b, issue 1b; M7c review issue 1): for each
 * held kind and cast frame 1 to 4, the code's sparkle pixels as straight runs, each a glowing 1 px line (a single pixel
 * is a line from a point to itself: a glowing 1 px line is drawn last and flat, with no rim, as the code's pixels are;
 * a glowing dot would get a darker rim) on the light's node, the bone's turn at that frame taken out, so they stand
 * upright round the light. Returns the changed definition (twinkles first shown for the weapon only: --fit cast-edges
 * then sets where each may show).
 */
export async function fitMageTwinkles(def) {
  const { dataFrameList } = await import('../engine/data-sprite.js');
  const probes = [0, 8].map((u, k) => ({ id: `fitProbe${k}`, kind: 'dot', on: 'reachF', at: [u, 0], paint: 'ink', z: 99 }));
  const s = await loadDef(def, 'mage-walker', probes), turn = {};
  for (const weapon of ['staff', 'wand', 'orb']) {
    const p = await settingsOf(s, { weapon });
    turn[weapon] = {};
    for (let f = 1; f <= 4; f++) {
      const r = dataFrameList(s, 'cast', f, p), a = r.list.find((x) => x.id === 'fitProbe0'), b = r.list.find((x) => x.id === 'fitProbe1');
      turn[weapon][f] = Math.atan2(b.at[0] - a.at[0], b.at[1] - a.at[1]);
    }
  }
  const out = structuredClone(def), shapes = out.body.rig.shapes, fe = out.clips.cast.frameEdits;
  const first = shapes.findIndex((x) => x.id.startsWith('castSparks-'));
  const kept = shapes.filter((x) => !x.id.startsWith('castSparks-')), add = [];
  for (const kind of ['staff', 'wand', 'orb', 'none']) {
    const burst = shapes.find((x) => x.id === `castBurst-${kind}`);
    for (let f = 1; f <= 4; f++) {
      const a = kind === 'none' ? 0 : turn[kind][f], sn = Math.sin(a), cs = Math.cos(a);
      // a screen offset (dx, dy) from the light as [u, v] on its bone: u = dx sin a + dy cos a, v = dx cos a - dy sin a;
      // a cell's corner a hair inside it, so floor(light + cell) is the light's pixel moved by the cell
      const place = (dx, dy) => {
        const u = dx * sn + dy * cs, v = dx * cs - dy * sn, [u0, v0] = burst.at;
        return [typeof u0 === 'object' ? { ...u0, map: u0.map.map(([x, y]) => [x, r5(y + u)]) } : r5(u0 + u), r5(v0 + v)];
      };
      const c = ([x, y]) => place(x + 0.001, y + 0.001), ids = [];
      sparkRuns(mageSparkPixels(f)).forEach(({ cells, k }, n) => {
        const sid = `castSparks-${kind}-${f}-${n}`;
        add.push({ id: sid, kind: 'line', on: burst.on, from: c(cells[0]), to: c(cells.at(-1)), paint: MAGE_GLOW_REFS[k], glow: true, z: r5(96.1 + (4 - k) * 0.01), hidden: true, when: { weapon: [kind] } });
        ids.push(sid);
      });
      const e = fe[String(f)];
      e.show = [...e.show.filter((x) => !x.startsWith(`castSparks-${kind}-${f}-`)), ...ids];
    }
  }
  kept.splice(first, 0, ...add);
  out.body.rig.shapes = kept;
  return out;
}

/** The cast shapes --fit cast-edges keeps off the frame's edge: the light (its glows), twinkles, star burst and ring. */
const CAST_LIGHT = /^cast(Sparks|Burst|Ring\d|Glow|GlowFirst)-(staff|wand|orb|none)(-\d+-\d+)?$/;
/** A stamp's piece split off by --fit cast-edges: <stamp>-at<row>-<column>, its rows placed at that cell of the stamp. */
const STRIP = /^(cast(?:Burst|Ring\d)-(?:staff|wand|orb|none))-at(\d+)-(\d+)$/;
/** Stamps shown on several frames, where the bone turns between them, are not split: where they would reach the edge another, smaller stamp stands in. */
const STAND_IN = Object.freeze({ 'castGlow-staff': 'castGlowTall-staff' });
/** The settings the light's place depends on, at their extremes: Build moves it 3.5 px across and 1 down (Bounce does not move it: the cast has no travel). */
const CAST_BUILDS = Object.freeze([0, 1]);
const CAST_LENGTHS = Object.freeze([0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35]);
const r7 = (v) => Math.round(v * 1e7) / 1e7 + 0;

/**
 * mage-walker's cast light kept off the frame's edge (M7c review issue 2). The code draws its light and lets the frame
 * clip it; the data may not touch the edge (quality/sprite.js), so from M7 to M7c every twinkle, burst and ring was left
 * out from Height 0.55 up (and for a staff from Length 1.025): half the Height range cast with no light. Now each shape
 * is measured at every Length step and Height (to 0.001), at Build 0 and 1 (the light's highest and leftmost):
 *   - a twinkle (a 1 px line) shows wherever it stays a pixel inside the frame;
 *   - a burst or ring (a stamp shown on one frame) is split: the rows at its top and the columns at its left that can
 *     reach the edge become stamps of their own (<stamp>-at<row>-<column>, a row or column each, placed where they were
 *     in it, the bone's turn at that frame taken out), each shown wherever it stays inside the frame, the rest always:
 *     the code's clipped light, a row short. Stamp cells are capped (8,192 a sprite), so a cut copy of each is not made;
 *     the split costs a few cells; a column at the left (the light 3.5 px further left at Build 1 than at 0) also
 *     shows below the least Build that takes it to the edge;
 *   - castGlow-staff, shown on five frames as the bone turns, shows where it fits, castGlowTall-staff (the resting glow)
 *     elsewhere.
 * Where each shows is a `when` of Height bands (each switching early, to the safe side) for groups of Length steps (at
 * most 8 alternatives). Returns { def: the changed definition, report: [what each shape got] }.
 */
export async function fitMageCastEdges(def) {
  const { dataFrameList } = await import('../engine/data-sprite.js');
  const { drawList } = await import('../engine/draw-list.js');
  // start again from the whole shapes, each shown for its weapon only: a split stamp's pieces go back into it
  const out = structuredClone(def), strips = new Set(), shapes = out.body.rig.shapes;
  for (const x of shapes) {
    const m = STRIP.exec(x.id);
    if (!m) continue;
    const whole = shapes.find((y) => y.id === m[1]), j0 = +m[2], i0 = +m[3];
    x.rows.forEach((row, k) => { const r = [...whole.rows[j0 + k]]; [...row].forEach((ch, i) => { if (ch !== '.') r[i0 + i] = ch; }); whole.rows[j0 + k] = r.join(''); });
    strips.add(x.id);
  }
  out.body.rig.shapes = shapes.filter((x) => !strips.has(x.id));
  for (const e of Object.values(out.clips.cast.frameEdits)) if (e.show) e.show = e.show.filter((x) => !strips.has(x));
  const light = out.body.rig.shapes.filter((x) => CAST_LIGHT.test(x.id) || Object.values(STAND_IN).includes(x.id));
  for (const x of light) x.when = { weapon: [/-(staff|wand|orb|none)/.exec(x.id)[1]] };
  const framesOf = new Map();
  for (const [f, e] of Object.entries(out.clips.cast.frameEdits)) for (const id of e.show ?? []) { if (!framesOf.has(id)) framesOf.set(id, []); framesOf.get(id).push(+f); }
  // the turn of the light's bones at each frame (as fitMageTwinkles): probes at u 0 and 8
  const probes = ['reachF', 'cuffF'].flatMap((on) => [0, 8].map((u, k) => ({ id: `fitProbe${k}-${on}`, kind: 'dot', on, at: [u, 0], paint: 'ink', z: 99 })));
  const s = await loadDef(out, 'mage-walker', probes), [W, H] = s.size, M = 24;
  const params = new Map(), lists = new Map();
  const P = async (set) => { const k = JSON.stringify(set); if (!params.has(k)) params.set(k, await settingsOf(s, set)); return params.get(k); };
  const listAt = async (f, set) => { const k = `${f}|${JSON.stringify(set)}`; if (!lists.has(k)) { if (lists.size > 4000) lists.clear(); lists.set(k, dataFrameList(s, 'cast', f, await P(set))); } return lists.get(k); };
  const turnAt = async (on, f, weapon) => { const r = await listAt(f, { weapon }), a = r.list.find((x) => x.id === `fitProbe0-${on}`), b = r.list.find((x) => x.id === `fitProbe1-${on}`); return Math.atan2(b.at[0] - a.at[0], b.at[1] - a.at[1]); };
  const moved = (x) => { const o = { ...x, hidden: false }; for (const k of ['at', 'from', 'to']) if (Array.isArray(o[k])) o[k] = [o[k][0] + M, o[k][1] + M]; return o; };
  const width = (rows) => Math.max(...rows.map((row) => row.length));
  // what a shape needs left out at one setting: [rows at the top, columns at the left, at the right, rows at the
  // bottom] (a 1 px line: [1, 0, 0, 0] when it touches the edge at all), the most over Build 0 and 1 and its frames
  const need = async (shape, kind, h, L, builds = CAST_BUILDS) => {
    let n = [0, 0, 0, 0];
    for (const build of builds) for (const f of framesOf.get(shape.id) ?? []) {
      const r = await listAt(f, { weapon: kind, weaponLength: L, height: h, build }), it = r.list.find((x) => x.id === shape.id);
      if (!it) continue;
      const g = new Surface(W + 2 * M, H + 2 * M);
      drawList(g, [moved(it)], { palette: r.palette });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x] >>> 24) { x0 = Math.min(x0, x - M); x1 = Math.max(x1, x - M); y0 = Math.min(y0, y - M); y1 = Math.max(y1, y - M); }
      if (x0 === Infinity) continue;
      if (shape.kind !== 'stamp') { if (x0 < 1 || y0 < 1 || x1 > W - 2 || y1 > H - 2) n = [1, 0, 0, 0]; continue; }
      // counted in the stamp's own rows and columns (its first row and column with a pixel give its corner)
      const r0 = shape.rows.findIndex((row) => /[^. ]/.test(row)), c0 = Math.min(...shape.rows.map((row) => row.search(/[^. ]/)).filter((v) => v >= 0));
      const top = y0 - r0, left = x0 - c0;
      n = [Math.max(n[0], 1 - top), Math.max(n[1], 1 - left), Math.max(n[2], left + width(shape.rows) - 1 - (W - 2)), Math.max(n[3], top + shape.rows.length - 1 - (H - 2))].map((v) => Math.max(0, v));
    }
    return n;
  };
  const report = [], add = [], showAlso = new Map();
  for (const shape of light.filter((x) => CAST_LIGHT.test(x.id))) {
    const kind = CAST_LIGHT.exec(shape.id)[2], Ls = kind === 'none' ? [1] : CAST_LENGTHS;
    // the cuts each Length step needs from each Height up: levels (the distinct cuts, a chain, each cutting at least
    // as much as the one before), and for each Length the Height from which each level is needed
    const grid = [];
    for (const L of Ls) { const row = []; for (let i = 0; i <= 20; i++) row.push(await need(shape, kind, i / 20, L)); grid.push(row); }
    const key = (n) => n.join(','), seen = new Map();
    for (const row of grid) for (const n of row) seen.set(key(n), n);
    const levels = [...seen.values()].sort((a, b) => a.reduce((x, y) => x + y) - b.reduce((x, y) => x + y));
    levels.forEach((n, i) => { if (i && !n.every((v, j) => v >= levels[i - 1][j])) throw new Error(`${shape.id}: the cuts ${levels.map(key).join(' / ')} are not one inside the next`); });
    if (levels.length === 1 && levels[0].every((v) => !v)) { report.push(`${shape.id}: fits everywhere`); continue; }
    if (levels[0].some((v) => v)) throw new Error(`${shape.id}: it fits nowhere whole`);
    const levelOf = (n) => levels.findIndex((m) => key(m) === key(n));
    // from (Height) for each Length step and level: just below the first Height that needs it, found to 0.001
    const from = [];
    for (const [li, L] of Ls.entries()) {
      const at = [0];
      for (let c = 1; c < levels.length; c++) {
        const i = grid[li].findIndex((n) => levelOf(n) >= c);
        if (i < 0) { at.push(Infinity); continue; }
        if (i === 0) { at.push(0); continue; }
        let lo = (i - 1) / 20, hi = i / 20;
        while (hi - lo > 0.001) { const mid = (lo + hi) / 2; if (levelOf(await need(shape, kind, mid, L)) >= c) hi = mid; else lo = mid; }
        at.push(Math.floor(lo * 1000) / 1000);
      }
      for (let c = at.length - 2; c >= 1; c--) at[c] = Math.min(at[c], at[c + 1]);
      from.push(at);
    }
    // Length bands: steps with the same thresholds together, then the closest neighbours merged (a band takes the
    // lower threshold of its steps, so a cut never comes late) until no `when` needs more than 8 alternatives
    let bands = [];
    Ls.forEach((L, li) => { const last = bands.at(-1); if (last && key(last.at) === key(from[li])) last.to = L; else bands.push({ from: L, to: L, at: [...from[li]] }); });
    while (bands.length > 8) {
      let best = 0, cost = Infinity;
      for (let i = 0; i + 1 < bands.length; i++) { const d = bands[i].at.reduce((a, v, c) => a + Math.abs(Math.min(v, 2) - Math.min(bands[i + 1].at[c], 2)), 0); if (d < cost) { cost = d; best = i; } }
      const [a, b] = bands.splice(best, 2, null);
      bands[best] = { from: a.from, to: b.to, at: a.at.map((v, c) => Math.min(v, b.at[c])) };
    }
    const Lmin = Ls[0], Lmax = Ls.at(-1);
    // where the levels lo to hi - 1 are what is needed (hi = levels.length: to the top)
    const whenFor = (lo, hi) => {
      const alt = [];
      let prevBand = -2;
      for (const [bi, b] of bands.entries()) {
        const h0 = b.at[lo], h1 = b.at[hi] ?? Infinity;
        if (!(h0 < h1) || h0 >= 1) continue;
        const w = { weapon: [kind] };
        if (kind !== 'none' && (b.from > Lmin || b.to < Lmax)) w.weaponLength = [{ ...(b.from > Lmin ? { atLeast: r5(b.from - 0.025) } : {}), ...(b.to < Lmax ? { below: r5(b.to + 0.025) } : {}) }];
        if (h0 > 0 || h1 < 1) w.height = [{ ...(h0 > 0 ? { atLeast: h0 } : {}), ...(h1 < 1 ? { below: h1 } : {}) }];
        // the band before it with the same Heights takes this one's Lengths too
        const prev = alt.at(-1);
        if (prev && prevBand === bi - 1 && JSON.stringify(prev.height) === JSON.stringify(w.height)) {
          const least = prev.weaponLength?.[0]?.atLeast;
          if (least === undefined && !(b.to < Lmax)) delete prev.weaponLength;
          else prev.weaponLength = [{ ...(least !== undefined ? { atLeast: least } : {}), ...(b.to < Lmax ? { below: r5(b.to + 0.025) } : {}) }];
        } else alt.push(w);
        prevBand = bi;
      }
      return alt.length === 0 ? null : alt.length === 1 ? alt[0] : alt;
    };
    const whole = whenFor(0, 1);
    if (shape.kind !== 'stamp') { shape.when = whole; report.push(`${shape.id}: shown where it fits: ${JSON.stringify(whole)}`); continue; }
    if (STAND_IN[shape.id]) {
      const other = out.body.rig.shapes.find((x) => x.id === STAND_IN[shape.id]);
      shape.when = whole; other.when = whenFor(1, levels.length);
      report.push(`${shape.id}: whole where it fits (${JSON.stringify(whole)}), ${other.id} elsewhere (${JSON.stringify(other.when)})`);
      continue;
    }
    const fr = framesOf.get(shape.id);
    if (fr.length !== 1) throw new Error(`${shape.id}: shown on ${fr.length} frames; only a stamp shown on one frame is split (the bone turns between frames)`);
    // the split: rows 0 to T - 1 (each from its first pixel to its last) and columns 0 to C - 1 below them, each shown
    // while every pixel of it is kept (the first level that cuts one of them hides it)
    const top = Math.max(...levels.map((n) => n[0])), lft = Math.max(...levels.map((n) => n[1]));
    if (levels.some((n) => n[2] || n[3])) throw new Error(`${shape.id}: cut at its right or bottom, which this fit does not split`);
    const w = width(shape.rows), h = shape.rows.length, rows = shape.rows.map((row) => [...row.padEnd(w, '.')]);
    const pieces = [];
    for (let j = 0; j < top; j++) { const i0 = rows[j].findIndex((ch) => ch !== '.'); if (i0 < 0) continue; const i1 = rows[j].findLastIndex((ch) => ch !== '.'); pieces.push({ j0: j, i0, cells: [rows[j].slice(i0, i1 + 1).join('')] }); }
    for (let i = 0; i < lft; i++) { const col = rows.slice(top).map((r) => r[i]), k0 = col.findIndex((ch) => ch !== '.'); if (k0 < 0) continue; const k1 = col.findLastIndex((ch) => ch !== '.'); pieces.push({ j0: top + k0, i0: i, cells: col.slice(k0, k1 + 1) }); }
    const a = await turnAt(shape.on, fr[0], kind), sn = Math.sin(a), cs = Math.cos(a);
    // a screen offset (dx, dy) from the stamp's point as [u, v] on its bone, as fitMageTwinkles places a twinkle
    const place = (dx, dy) => { const u = dx * sn + dy * cs, v = dx * cs - dy * sn, [u0, v0] = shape.at; return [typeof u0 === 'object' ? { ...u0, map: u0.map.map(([x, y]) => [x, r7(y + u)]) } : r7(u0 + u), r7(v0 + v)]; };
    const ids = [];
    // a column at the left reaches the edge only with a broad build (the light 3.5 px further left at Build 1 than at
    // 0): it also shows below the least Build that takes it to the edge at any Length and Height (found to 0.001)
    const buildBelow = async (i) => {
      let least = 1;
      for (const L of Ls) for (let k = 0; k <= 20; k++) {
        const at = async (b) => (await need(shape, kind, k / 20, L, [b]))[1] > i;
        if (!(await at(least))) continue;
        let lo = 0, hi = least;
        if (await at(0)) return 0;
        while (hi - lo > 0.001) { const mid = (lo + hi) / 2; if (await at(mid)) hi = mid; else lo = mid; }
        least = lo;
      }
      return least >= 1 ? null : Math.floor(least * 1000) / 1000;
    };
    for (const p of pieces) {
      const cutBy = levels.findIndex((n) => p.j0 < n[0] || p.i0 < n[1]);
      const id = `${shape.id}-at${p.j0}-${p.i0}`;
      let when = whenFor(0, cutBy);
      if (p.j0 >= top) {
        const b = await buildBelow(p.i0), alt = [].concat(when ?? []);
        if (b > 0 && alt.length < 8) when = [...alt, { weapon: [kind], build: [{ below: b }] }];
      }
      // placed top-left: round(point - w / 2) + i0 is the column it held in the stamp (anchor c: round(point - w / 2))
      add.push([shape.id, { ...structuredClone(shape), id, at: place(-w / 2 + p.i0, -h / 2 + p.j0), anchor: 'tl', rows: p.cells, when }]);
      for (let k = 0; k < p.cells.length; k++) for (let i = 0; i < p.cells[k].length; i++) rows[p.j0 + k][p.i0 + i] = '.';
      ids.push(id);
    }
    shape.rows = rows.map((r) => r.join(''));
    showAlso.set(shape.id, ids);
    report.push(`${shape.id}: ${levels.length - 1} cuts (${levels.slice(1).map(key).join(' / ')}), split into ${ids.length} rows and columns that show where they fit`);
  }
  for (const [id, piece] of add) { const i = out.body.rig.shapes.findIndex((x) => x.id === id); let j = i + 1; while (STRIP.exec(out.body.rig.shapes[j]?.id ?? '')?.[1] === id) j++; out.body.rig.shapes.splice(j, 0, piece); }
  for (const e of Object.values(out.clips.cast.frameEdits)) if (e.show) e.show = e.show.flatMap((x) => [x, ...(showAlso.get(x) ?? [])]);
  return { def: out, report };
}

// shield-trooper's energy shield: the bright line that climbs the pane (rigs/topdown-riot.js lightPane `scan`: the row
// round(y1 - 1 - fract(t) * (h - 1)) in the `core` colour), which the piece's light stamps hold only at t = 0 (the
// bottom row). Lines on the shield's node, one a direction and phase, their ends bound to the shield's Size step, and
// lines that give the bottom row its pane colour back on every frame whose phase is not 0, shown by frame edits (third
// review of M7b, issue 2; moved here from a scratch script in M7c review issue 6d).
const SCAN_SLOTS = Object.freeze({ face: '#3a4258', glow: '#e2473f', inset: '#5d6475', core: '#f0ead8' });   // the piece's defaults (bodyShieldPiece)
const SCAN_PAINT = Object.freeze({ face: 'outfit', glow: 'glow', inset: 'trim', core: 'core' });             // as the sprite's shield use maps them
const SCAN_STEPS = Object.freeze([0.65, 0.825, 1, 1.175, 1.35]);
const scanRefs = Object.entries(SCAN_SLOTS).flatMap(([k, hex]) => { const r = ramp(hex), n = SCAN_PAINT[k]; return [[col(hex), n], [col(r.light), `${n}.light`], [col(r.dark), `${n}.dark`], [col(r.deep), `${n}.deep`]]; });
/** The slot tone of a colour: exact, else the nearest (the pane's light band, tone(glow, 0.9), is glow.light). */
const scanRef = (v) => refFor(v, scanRefs);
function scanRest(dir) { const { J, P, d } = restPose(dir); return { J, P, d, node: dir === 'side' ? snapHalf(J.armB.hand) : [J.bx, J.gy] }; }
/** The pane's light at phase t: Map 'x,y' -> colour. */
function scanLight(dir, size, t) {
  const { J, P, d } = scanRest(dir), g = new Surface(T.SIZE[0], T.SIZE[1]);
  R.bodyShield(g, J, P, d, { kind: 'energy', size, layer: 'light', colour: SCAN_SLOTS.face, glow: SCAN_SLOTS.glow, inset: SCAN_SLOTS.inset, core: SCAN_SLOTS.core, t });
  const m = new Map();
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const v = g.data[y * g.w + x]; if (v) m.set(`${x},${y}`, v); }
  return m;
}
/** The pixels that differ from phase 0 as horizontal runs of one paint: [{ y, x0, x1, paint }] in frame px. */
function scanRuns(dir, size, t) {
  const a = scanLight(dir, size, 0), b = scanLight(dir, size, t), px = [];
  for (const [k, v] of b) if (a.get(k) !== v && (a.get(k) === undefined || scanRef(a.get(k)) !== scanRef(v))) { const [x, y] = k.split(',').map(Number); px.push([x, y, scanRef(v)]); }
  for (const k of a.keys()) if (!b.has(k)) throw new Error('shield scan: a pixel of the light went out');
  px.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  const out = [];
  for (const [x, y, paint] of px) { const r = out.at(-1); if (r && r.y === y && r.paint === paint && r.x1 === x - 1) r.x1 = x; else out.push({ y, x0: x, x1: x, paint }); }
  return out;
}
/** A value per Size step as a binding of shieldSize (a step at each midpoint), or the number when all agree. */
function scanStepped(vals) {
  if (vals.every((v) => v === vals[0])) return vals[0];
  const map = [];
  SCAN_STEPS.forEach((st, i) => { const lo = i ? r5((SCAN_STEPS[i - 1] + st) / 2) : st, hi = i < SCAN_STEPS.length - 1 ? r5((st + SCAN_STEPS[i + 1]) / 2 - 0.0001) : st; map.push([lo, vals[i]]); if (hi !== lo) map.push([hi, vals[i]]); });
  return { from: 'shieldSize', map };
}
/** One line a run, its ends at pixel centres, as [u, v] from the node, bound over the Size steps. */
function scanLine(dir, perStep) {
  const { node } = scanRest(dir);
  const u = scanStepped(perStep.map((r) => r5(r.y - node[1] + 0.5))), v0 = scanStepped(perStep.map((r) => r5(r.x0 - node[0] + 0.5))), v1 = scanStepped(perStep.map((r) => r5(r.x1 - node[0] + 0.5)));
  return { from: [u, v0], to: [u, v1] };
}
/** The scan lines for the phases each set of the shield reaches: { shapes, ids: { set: { t<phase>: [id], back: [ids] } } }. */
function scanShapes(phases) {
  const shapes = [], ids = {};
  const sets = [['down', 'shieldCarryAt', 81.5, 'scan-down'], ['up', 'shieldCarryAt', 5.5, 'scan-up'], ['side', 'cuffB', 81.5, 'scan-side'], ['down', 'shieldPlantAt', 81.5, 'scanP']];
  for (const [dir, on, z, name] of sets) {
    if (!phases[name]) continue;
    ids[name] = {};
    const when = { shield: ['energy'], direction: [dir] };
    for (const t of phases[name]) {
      const per = SCAN_STEPS.map((st) => scanRuns(dir, st, t));
      // the climbing line (core) and the bottom row given back (every other paint), each one run in every step
      const core = per.map((rs) => rs.filter((r) => r.paint === 'core')), back = per.map((rs) => rs.filter((r) => r.paint !== 'core'));
      if (core.some((c) => c.length !== 1)) throw new Error(`${name} t ${t}: the line is not one run in every step`);
      const key = `t${Math.round(t * 1000)}`, id = `${name}-${key}`;
      shapes.push({ id, kind: 'line', on, ...scanLine(dir, core.map((c) => c[0])), paint: 'core', z, hidden: true, when });
      ids[name][key] = [id];
      // the bottom row: the same at every phase but 0, so one set of lines shown with every climbing one
      const sig = JSON.stringify(back);
      if (!ids[name].back) {
        const n = back[0].length;
        if (back.some((b) => b.length !== n || b.some((r, i) => r.paint !== back[0][i].paint))) throw new Error(`${name}: the bottom row differs between steps`);
        ids[name].back = []; ids[name].backSig = sig;
        for (let i = 0; i < n; i++) { const bid = `${name}-row${i}`; shapes.push({ id: bid, kind: 'line', on, ...scanLine(dir, back.map((b) => b[i])), paint: back[0][i].paint, z: r5(z - 0.01), hidden: true, when }); ids[name].back.push(bid); }
      } else if (ids[name].backSig !== sig) throw new Error(`${name} t ${t}: the bottom row differs from the other phases'`);
    }
  }
  return { shapes, ids };
}

/**
 * shield-trooper's energy-shield scan lines made again (a fit, as fitMageTwinkles): the old ones and their frame-edit
 * entries are taken out, and the lines for every frame of every clip but die whose phase is not 0 put back, the planted
 * set on the frames that show shieldPlanted. Frames and loops are the base clips' (`pieces/`, the version extended).
 */
export function fitShieldScan(def) {
  const out = structuredClone(def), ext = out.body.rig.extends;
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'pieces', `${ext.use.replace(':', '-')}.v${ext.v}.json`), 'utf8')).body.clips;
  const isScan = (id) => /^scan(P|-)/.test(id);
  out.body.rig.shapes = out.body.rig.shapes.filter((x) => !isScan(x.id));
  for (const c of Object.values(out.clips)) for (const e of Object.values(c.frameEdits ?? {})) if (e.show) e.show = e.show.filter((x) => !isScan(x));
  const phaseOf = (c, f) => (c.loop ? f / c.frames : c.frames > 1 ? f / (c.frames - 1) : 0);
  const plan = [];
  for (const name of ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'shoot_down', 'shoot_up', 'shoot_side', 'block', 'hurt']) {
    const c0 = out.clips[name], from = typeof c0.from === 'string' ? c0.from : Object.values(c0.from.pick)[0], c = base[from];
    const dir = name.endsWith('_up') ? 'up' : name.endsWith('_side') ? 'side' : 'down';
    for (let f = 0; f < c.frames; f++) {
      const t = phaseOf(c, f) % 1;
      if (t < 1e-9) continue;
      const planted = (c0.frameEdits?.[String(f)]?.show ?? []).includes('shieldPlanted');
      plan.push([name, f, planted ? 'scanP' : `scan-${dir}`, t]);
    }
  }
  const phases = {};
  for (const [, , set, t] of plan) if (!(phases[set] ??= []).includes(t)) phases[set].push(t);
  for (const k of Object.keys(phases)) phases[k].sort((a, b) => a - b);
  const { shapes, ids } = scanShapes(phases);
  out.body.rig.shapes.push(...shapes);
  for (const [name, f, set, t] of plan) {
    const e = ((out.clips[name].frameEdits ??= {})[String(f)] ??= {});
    e.show = [...(e.show ?? []), ...ids[set][`t${Math.round(t * 1000)}`], ...ids[set].back];
  }
  for (const c of Object.values(out.clips)) if (c.frameEdits) c.frameEdits = Object.fromEntries(Object.entries(c.frameEdits).sort((a, b) => +a[0] - +b[0]));
  return out;
}

/** Reads a sprite file, runs one fit on it and writes it back in the compact layout (pieceText). */
async function runFit(name, file) {
  const def = JSON.parse(fs.readFileSync(file, 'utf8'));
  let next;
  if (name === 'twinkles') next = await fitMageTwinkles(def);
  else if (name === 'cast-edges') { const r = await fitMageCastEdges(def); for (const l of r.report) console.log(l); next = r.def; }
  else if (name === 'shield-scan') next = fitShieldScan(def);
  else throw new Error(`--fit: no fit "${name}" (twinkles, cast-edges, shield-scan)`);
  const text = pieceText(next);
  fs.writeFileSync(file, text);
  console.log(`wrote ${path.relative(ROOT, file)} (${text.length} bytes)`);
}

async function main(argv) {
  if (argv[0] === '--replaced') {
    // the versions replaced before release that this baker still builds, written into a folder outside pieces/ (to
    // look at, or to compare): they are not kept anywhere else (pieces/README.md, "Replaced before release")
    const dir = path.resolve(argv[1] ?? '');
    if (!argv[1] || dir === path.join(ROOT, 'pieces') || dir.startsWith(path.join(ROOT, 'pieces') + path.sep)) throw new Error('--replaced <dir>: a folder outside pieces/');
    fs.mkdirSync(dir, { recursive: true });
    const built = [...m7Pieces(), ...(await m7Bases()), ...m7LyingPieces(), ...(await m7BasesV2())];
    for (const p of built) {
      if (!REPLACED[`${p.id}@${p.v}`]) continue;
      const f = path.join(dir, `${p.id.replace(':', '-')}.v${p.v}.json`);
      fs.writeFileSync(f, pieceText(p));
      console.log(`wrote ${f}`);
    }
    const missing = Object.keys(REPLACED).filter((ref) => !built.some((p) => `${p.id}@${p.v}` === ref));
    if (missing.length) console.log(`not built here (kept in tests/fixtures/m7-replaced/): ${missing.join(', ')}`);
    return;
  }
  if (argv[0] === '--trooper3') {
    const p = await trooperV3(), f = path.join(path.resolve(argv[1] ?? path.join(ROOT, 'pieces')), 'base-person-topdown-trooper.v3.json'), text = pieceText(p);
    if (fs.existsSync(f)) { console.log(`kept ${path.relative(ROOT, f)} (exists)`); return; }
    fs.writeFileSync(f, text);
    console.log(`wrote ${path.relative(ROOT, f)} (${text.length} bytes)`);
    return;
  }
  if (argv[0] === '--fit') { await runFit(argv[1], path.resolve(argv[2] ?? path.join(ROOT, 'sprites', argv[1] === 'shield-scan' ? 'shield-trooper.json' : 'mage-walker.json'))); return; }
  if (argv[0] === '--fx') { console.log(JSON.stringify(m7Effects(argv[1]), null, 1)); return; }
  if (argv[0] === '--walker2') {
    const p = await walkerV2(), f = path.join(ROOT, 'pieces', 'base-person-topdown-walker.v2.json'), text = pieceText(p);
    if (fs.existsSync(f)) { console.log(`kept ${path.relative(ROOT, f)} (exists)`); return; }
    fs.writeFileSync(f, text);
    console.log(`wrote ${path.relative(ROOT, f)} (${text.length} bytes)`);
    return;
  }
  if (argv[0] === '--die') {
    const hex = JSON.parse(argv[2]);
    console.log(JSON.stringify(m7DiePicture(argv[1], hex)));
    return;
  }
  if (argv[0] === '--lying') {
    const dir = path.resolve(argv[1] ?? path.join(ROOT, 'pieces'));
    for (const p of m7LyingPieces()) {
      if (replaced(p)) continue;
      const f = path.join(dir, `${p.id.replace(':', '-')}.v${p.v}.json`), text = pieceText(p);
      if (fs.existsSync(f) && !argv.includes('--over')) { console.log(`kept ${path.relative(ROOT, f)} (exists)`); continue; }
      if (argv.includes('--dry')) { console.log(`${p.id}@${p.v} ${text.length} bytes`); continue; }
      fs.writeFileSync(f, text);
      console.log(`wrote ${path.relative(ROOT, f)} (${text.length} bytes)`);
    }
    return;
  }
  if (argv[0] === '--bases2') {
    const dir = path.resolve(argv[1] && !argv[1].startsWith('--') ? argv[1] : path.join(ROOT, 'pieces'));
    for (const p of await m7BasesV2()) {
      if (replaced(p)) continue;
      const f = path.join(dir, `${p.id.replace(':', '-')}.v${p.v}.json`), text = pieceText(p);
      if (fs.existsSync(f) && !argv.includes('--over')) { console.log(`kept ${path.relative(ROOT, f)} (exists)`); continue; }
      fs.writeFileSync(f, text);
      console.log(`wrote ${path.relative(ROOT, f)} (${text.length} bytes)`);
    }
    return;
  }
  const all = [...m7Pieces(), ...(await m7Bases())];
  if (argv[0] === '--write') {
    const dir = path.resolve(argv[1] ?? path.join(ROOT, 'pieces'));
    for (const p of all) {
      if (replaced(p)) continue;
      const f = path.join(dir, `${p.id.replace(':', '-')}.v${p.v}.json`);
      if (fs.existsSync(f) && !argv.includes('--over')) { console.log(`kept ${path.relative(ROOT, f)} (exists)`); continue; }
      fs.writeFileSync(f, pieceText(p));
      console.log(`wrote ${path.relative(ROOT, f)}`);
    }
    return;
  }
  for (const p of all) console.log(`${p.id}@${p.v}  ${p.body.draw ? `${p.body.draw.length} items` : `${Object.keys(p.body.clips).length} clips`}, ${pieceText(p).length} bytes${REPLACED[`${p.id}@${p.v}`] ? ` (replaced by ${REPLACED[`${p.id}@${p.v}`]}: not written)` : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2)).catch((e) => { console.error(e.stack); process.exit(1); });
