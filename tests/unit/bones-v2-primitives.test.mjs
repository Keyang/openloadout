// Bone rig v2 (rigs/bones.js, build item B5; docs/data-sprites.md 2.2 and 2.7), part 2: every primitive on a bone.
// A rig hands its shapes to engine/draw-list.js, so a shape on a bone paints exactly what the draw-list primitive it
// stands for paints once placed in the bone's frame (draw-list boneFrame + placeOn): rect, line, arc, ring, stamp,
// dither, bands, text, and the operations outline, tint, cut. Stamps are moved, never turned; their variants are
// swapped by the pose (keys and frame edits: `swap`) and by direction overlays. Nodes are bones of no length.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import * as D from '../../engine/draw-list.js';
import * as B from '../../rigs/bones.js';

const SKIN = '#e0a878', EYE = '#2a1d6e', METAL = '#b8c4cc', GLOW = '#4fd8ee';
const colours = [{ id: 'skin', default: SKIN }, { id: 'eye', default: EYE, detail: true }, { id: 'metal', default: METAL }, { id: 'glow', default: GLOW }];
const palette = { skin: { hex: SKIN, detail: false }, eye: { hex: EYE, detail: true }, metal: { hex: METAL, detail: false }, glow: { hex: GLOW, detail: false } };
/** A rig with one root bone at `at` turned `angle` and a child bone `tip`, carrying the shapes. */
const rigOf = (shapes, { angle = 90, at = [20, 24], length = 10, nodes } = {}) => ({
  version: 2, size: [48, 48], colours,
  bones: [{ id: 'arm', parent: null, at, angle, length }, { id: 'tip', parent: 'arm', angle: 30, length: 6 }],
  ...(nodes ? { nodes } : {}), shapes,
});
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const count = (g, c) => { let n = 0; const v = c === undefined ? null : col(c); for (const p of g.data) if (v === null ? p : p === v) n++; return n; };
/** What engine/draw-list.js paints for primitives placed by hand on the solved bones (outline at the end, as the rig adds it). */
function byHand(rig, pose, prims, { outline = true } = {}) {
  const J = B.solveRig(rig, pose);
  const list = prims.map(({ on, ...p }) => D.placeOn(p, D.boneFrame(J.bones[on].start, J.bones[on].angle)));
  if (outline) list.push({ kind: 'outline', paint: 'ink' });
  const g = new Surface(48, 48);
  const r = D.drawList(g, list, { palette });
  assert.deepEqual(r.skipped, []);
  return g;
}

test('bones v2: rect, line, arc, ring on a bone paint what the draw list paints for them placed in the bone frame', () => {
  const prims = [
    { id: 'plate', kind: 'rect', on: 'arm', at: [2, -2], size: [4, 3], paint: 'metal', z: 2 },
    { id: 'blade', kind: 'line', on: 'tip', from: [0, 0], to: [9, 0], paint: 'metal', z: 3 },
    { id: 'thick', kind: 'line', on: 'arm', from: [0, 3], to: [8, 3], thick: 2, paint: 'skin', z: 1 },
    { id: 'bow', kind: 'arc', on: 'arm', at: [5, 0], r: 6, a0: 0, a1: 120, paint: 'skin', z: 1 },
    { id: 'halo', kind: 'ring', on: 'tip', at: [3, 0], r: 3, paint: 'glow', z: 4 },
  ];
  for (const angle of [0, 37, 90, 145, 200, 290]) for (const pose of [{}, { bones: { tip: -50 }, root: [1, -2] }]) {
    const rig = rigOf(prims, { angle });
    assert.ok(same(B.renderRig(rig, pose).g, byHand(rig, pose, prims)), `angle ${angle} pose ${JSON.stringify(pose)}`);
  }
});

test('bones v2: dither, bands and text on a bone; their areas turn with it, their patterns stay screen-aligned', () => {
  const prims = [
    { id: 'body', kind: 'ellipse', on: 'arm', at: [5, 0], r: [6, 4], paint: 'skin', z: 0 },
    { id: 'fur', kind: 'dither', on: 'arm', area: { kind: 'ellipse', at: [5, 0], r: [5, 3] }, pattern: 'checker', amount: 0.5, paint: 'skin.dark', z: 1 },
    { id: 'sheen', kind: 'bands', on: 'tip', area: { kind: 'rect', at: [0, -2], size: [6, 5] }, dir: 'down', stops: ['metal.light', 'metal', 'metal.dark'], z: 2 },
    { id: 'tag', kind: 'text', on: 'arm', font: 'font:chunky@1', text: 'HI', at: [0, 10], paint: 'eye', z: 5 },
  ];
  for (const angle of [90, 120, 250]) {
    const rig = rigOf(prims, { angle });
    assert.ok(same(B.renderRig(rig, {}).g, byHand(rig, {}, prims)), `angle ${angle}`);
  }
});

test('bones v2: the version 1 kinds keep their version 1 meaning next to the new ones (limb along the bone, capsule from / to as shares)', () => {
  const v1 = [{ id: 'l', bone: 'arm', kind: 'limb', width: 3, paint: 'skin', z: 0 }, { id: 'c', bone: 'tip', kind: 'capsule', from: 0.2, to: 1, r: [2, 1.5], paint: 'skin', z: 0 }];
  const both = [...v1, { id: 'r', kind: 'rect', on: 'arm', at: [0, 4], size: [2, 2], paint: 'metal', z: 1 }];
  const g1 = B.renderRig({ ...rigOf(v1), version: undefined }).g, g2 = B.renderRig(rigOf(both)).g;
  let lost = 0;
  for (let i = 0; i < g1.data.length; i++) if (g1.data[i] && g1.data[i] !== col(INK) && !g2.data[i]) lost++;
  assert.equal(lost, 0, 'the version 1 shapes are all still there');
  assert.ok(count(g2, METAL) > 0, 'the rect is drawn');
});

test('bones v2: a stamp on a bone is moved, never turned: the same pixels at every angle, at the rounded point', () => {
  const stamp = { id: 'eye', kind: 'stamp', on: 'arm', at: [6, 1], rows: ['ab', 'b.'], key: { a: 'eye', b: 'metal.dark' }, z: 5 };
  let seen = 0;
  for (let angle = 0; angle < 360; angle += 15) {
    const rig = rigOf([stamp], { angle });
    const { g, J } = B.renderRig(rig, {}, { outline: false });
    const F = D.boneFrame(J.bones.arm.start, J.bones.arm.angle);
    const p = D.placeOn(stamp, F).at;
    const x0 = Math.round(p[0]), y0 = Math.round(p[1]);
    assert.equal(g.get(x0, y0), col(EYE), `angle ${angle}: a at the rounded point`);
    assert.notEqual(g.get(x0 + 1, y0), 0);
    assert.notEqual(g.get(x0, y0 + 1), 0);
    assert.equal(g.get(x0 + 1, y0 + 1), 0, 'the see-through cell');
    assert.equal(count(g), 3, 'three pixels, whatever the angle');
    seen++;
  }
  assert.equal(seen, 24);
});

test('bones v2: stamp variants are swapped by the pose (keys and frame edits: swap), by name; an unknown name keeps the rows', () => {
  const eye = { id: 'eye', kind: 'stamp', on: 'arm', at: [6, 0], rows: ['a', 'a'], key: { a: 'eye', b: 'metal' }, variants: { blink: ['.', 'b'], wide: ['a', 'b'] }, z: 5 };
  const rig = rigOf([eye]);
  const plain = B.renderRig(rig, {}, { outline: false }).g;
  assert.equal(count(plain, EYE), 2);
  const blink = B.renderRig(rig, { swap: { eye: 'blink' } }, { outline: false }).g;
  assert.equal(count(blink, EYE), 0);
  assert.equal(count(blink), 1, 'the blink is one pixel of metal');
  assert.equal(count(B.renderRig(rig, { swap: { eye: 'wide' } }, { outline: false }).g, EYE), 1);
  assert.ok(same(B.renderRig(rig, { swap: { eye: 'nope' } }, { outline: false }).g, plain), 'an unknown variant draws the rows');
  assert.ok(same(B.renderRig(rig, { swap: { other: 'blink' } }, { outline: false }).g, plain));
});

test('bones v2: stamps sort with shapes by z, hide and show like shapes, belong to parts, and are mirrored when they say so', () => {
  const skull = { id: 'skull', kind: 'ellipse', on: 'arm', at: [5, 0], r: [5, 4], paint: 'skin', z: 10 };
  const eye = { id: 'eye', kind: 'stamp', on: 'arm', at: [6, 0], rows: ['a'], key: { a: 'eye' }, z: 5 };
  assert.equal(count(B.renderRig(rigOf([skull, eye])).g, EYE), 0, 'under the skull (lower z)');
  assert.equal(count(B.renderRig(rigOf([skull, { ...eye, z: 20 }])).g, EYE), 1, 'over it');
  assert.equal(count(B.renderRig(rigOf([skull, { ...eye, z: 20 }]), { hide: ['eye'] }).g, EYE), 0);
  assert.equal(count(B.renderRig(rigOf([skull, { ...eye, z: 20, hidden: true }])).g, EYE), 0);
  assert.equal(count(B.renderRig(rigOf([skull, { ...eye, z: 20, hidden: true }]), { show: ['eye'] }).g, EYE), 1);
  assert.equal(count(B.renderRig(rigOf([skull, { ...eye, z: 20, part: 'face' }]), {}, { partsOff: ['face'] }).g, EYE), 0);
  const arrow = { id: 'arrow', kind: 'stamp', on: 'arm', at: [2, 0], rows: ['ab'], key: { a: 'eye', b: 'metal' }, z: 1 };
  const g = B.renderRig(rigOf([arrow]), {}, { outline: false }).g, m = B.renderRig(rigOf([{ ...arrow, mirror: 'x' }]), {}, { outline: false }).g;
  const at = (gg, c) => { for (let i = 0; i < gg.data.length; i++) if (gg.data[i] === col(c)) return i % gg.w; return null; };
  assert.equal(at(g, EYE) + 1, at(g, METAL));
  assert.equal(at(m, METAL) + 1, at(m, EYE), 'mirrored left to right');
});

test('bones v2: operations act where they stand in the list: outline only a group, a cut from a group, the rig\'s own outline replaces the automatic one', () => {
  const body = { id: 'body', kind: 'ellipse', on: 'arm', at: [5, 0], r: [6, 4], paint: 'skin', z: 0, group: 'b' };
  const hole = { id: 'hole', kind: 'cut', on: 'arm', shape: { kind: 'ellipse', at: [5, 0], r: [2, 2] }, from: 'b' };
  const holed = B.renderRig(rigOf([body, hole]), {}, { outline: false }).g, whole = B.renderRig(rigOf([body]), {}, { outline: false }).g;
  assert.ok(count(holed) < count(whole) - 4, 'the cut takes a hole out of the body');
  assert.ok(same(B.renderRig(rigOf([body, hole])).g, byHand(rigOf([]), {}, [body, hole])), 'as the draw list cuts it');
  // the rig's own outline (a colour of its palette): drawn once, the automatic INK one left out
  const own = B.renderRig(rigOf([body, { kind: 'outline', paint: 'metal.dark' }])).g;
  assert.equal(count(own, INK), 0, 'no INK outline on top of the rig\'s own');
  assert.ok(count(own) > count(whole), 'outlined');
  // outline only a group draws the rim of that group and the automatic outline still comes after
  const ring = B.renderRig(rigOf([body, { kind: 'outline', paint: 'metal', only: 'b' }])).g;
  assert.ok(count(ring, METAL) > 10);
  // a flash tints the body white before the rig's own outline, so the outline stays
  const flash = B.renderRig(rigOf([body, { kind: 'outline', paint: 'metal.dark' }]), { flash: true }).g;
  assert.ok(count(flash, '#ffffff') > 10);
  assert.equal(count(flash), count(flash, '#ffffff') + count(own) - count(B.renderRig(rigOf([body]), {}, { outline: false }).g), 'every body pixel white, the outline as before');
});

test('bones v2: glow on new kinds is drawn after the outline and never inked', () => {
  const rig = rigOf([{ id: 'b', kind: 'ellipse', on: 'arm', at: [4, 0], r: [4, 3], paint: 'skin' }, { id: 'spark', kind: 'stamp', on: 'tip', at: [6, 0], rows: ['aa'], key: { a: 'glow' }, glow: true, z: -5 }]);
  const g = B.renderRig(rig).g;
  assert.equal(count(g, GLOW), 2, 'the glowing stamp is on top although its z is low');
});

test('bones v2: nodes are pivots with no length: their children hang from them, a pose turns them, their shapes move with them', () => {
  const lid = { id: 'lidStamp', kind: 'stamp', on: 'lid', at: [3, 0], rows: ['a'], key: { a: 'eye' }, z: 5 };
  const nodes = [{ id: 'lid', parent: 'arm', from: 0.5, angle: 90 }];
  const rig = rigOf([lid], { nodes });
  const J = B.solveRig(rig, {});
  assert.equal(J.bones.lid.length, 0);
  assert.deepEqual(J.bones.lid.start, [J.bones.arm.start[0] + 5, J.bones.arm.start[1]]);
  assert.deepEqual(J.bones.lid.end, J.bones.lid.start);
  const turned = B.solveRig(rig, { bones: { lid: 0 } });
  assert.notEqual(turned.bones.lid.angle, J.bones.lid.angle, 'a pose turns a node');
  const a = B.renderRig(rig, {}, { outline: false }).g, b = B.renderRig(rig, { bones: { lid: 0 } }, { outline: false }).g;
  assert.equal(count(a), 1);
  assert.equal(count(b), 1);
  assert.ok(!same(a, b), 'the stamp moves with its node (and is not turned)');
  // a node listed before its parent bone, and a bone hanging from a node, still solve
  const chain = { version: 2, size: [48, 48], colours, bones: [{ id: 'root', parent: null, at: [24, 24], angle: 90, length: 6 }, { id: 'finger', parent: 'knuckle', angle: 0, length: 4 }],
    nodes: [{ id: 'knuckle', parent: 'root', angle: 0 }], shapes: [{ id: 'f', kind: 'limb', on: 'finger', width: 2, paint: 'skin' }] };
  const C = B.solveRig(chain, {});
  assert.ok(C.bones.finger, 'a bone may hang from a node');
  assert.deepEqual(C.bones.finger.start, C.bones.knuckle.start);
  assert.deepEqual(C.order, ['root', 'knuckle', 'finger'], 'parents first');
  assert.ok(B.boneLines(C).some((l) => l.id === 'knuckle'), 'the studio sees nodes too');
});

test('bones v2: attach points may name their bone or node with `on`', () => {
  const rig = { ...rigOf([], { nodes: [{ id: 'grip', parent: 'tip', angle: 0 }] }), points: [{ id: 'hand', on: 'tip', at: [6, 0] }, { id: 'held', on: 'grip', at: [0, 0] }, { id: 'old', bone: 'arm', at: [0, 0] }] };
  const J = B.solveRig(rig, {});
  const P = B.rigPoints(rig, J);
  assert.ok(Math.abs(P.hand.x - J.bones.tip.end[0]) < 1e-9 && Math.abs(P.hand.y - J.bones.tip.end[1]) < 1e-9);
  assert.deepEqual([P.held.x, P.held.y], J.bones.tip.end);
  assert.deepEqual([P.old.x, P.old.y], J.bones.arm.start);
});

test('bones v2: rigList is the frame\'s draw list in frame coordinates, with the palette and what was left out', () => {
  const rig = rigOf([
    { id: 'p', kind: 'rect', on: 'arm', at: [0, 0], size: [2, 2], paint: 'metal' },
    { id: 'lost', kind: 'rect', on: 'nowhere', at: [0, 0], size: [2, 2], paint: 'metal' },
    { id: 'g', gen: 'glint', v: 1, on: 'arm', every: 8, paint: 'glow' },
  ]);
  const J = B.solveRig(rig, {});
  const out = B.rigList(rig, J, {}, {});
  assert.equal(out.list.length, 2, 'the rect and the outline');
  assert.equal(out.list[0].kind, 'rect');
  assert.equal(out.list[0].on, undefined, 'placed: no bone left on it');
  assert.deepEqual(out.list[1], { kind: 'outline', paint: 'ink' });
  assert.equal(out.palette.metal.hex, METAL);
  assert.deepEqual(out.skipped.map((s) => s.id).sort(), ['g', 'lost']);
  assert.match(out.skipped.find((s) => s.id === 'g').why, /expand/);
});

test('bones v2: when a clip or direction condition is left on a shape (resolved definitions keep them), the frame decides', () => {
  const rig = rigOf([
    { id: 'a', kind: 'rect', on: 'arm', at: [0, 0], size: [2, 2], paint: 'metal', when: { clip: ['attack'] } },
    { id: 'b', kind: 'rect', on: 'arm', at: [4, 0], size: [2, 2], paint: 'skin', when: { direction: ['up'] } },
    { id: 'c', kind: 'rect', on: 'arm', at: [8, 0], size: [2, 2], paint: 'skin', clip: ['walk'] },
  ]);
  const J = B.solveRig(rig, {});
  const ids = (o) => B.rigList(rig, J, {}, { outline: false, ...o }).list.map((p) => p.id);
  assert.deepEqual(ids({}), [], 'no clip and no direction: no condition holds');
  assert.deepEqual(ids({ clip: 'attack' }), ['a']);
  assert.deepEqual(ids({ clip: 'walk', direction: 'up' }), ['b', 'c']);
});

test('bones v2: keys swap a stamp\'s variant through rigs/keypose.js (stepped, per stamp, wrapping in a loop)', async () => {
  const { clipPose } = await import('../../rigs/keypose.js');
  const eye = { id: 'eye', kind: 'stamp', on: 'arm', at: [6, 0], rows: ['a', 'a'], key: { a: 'eye', b: 'metal' }, variants: { blink: ['.', 'b'] }, z: 5 };
  const rig = rigOf([eye]);
  const clip = { frames: 8, loop: true, keys: [{ t: 0, swap: { eye: null } }, { t: 0.75, swap: { eye: 'blink' } }] };
  const eyes = Array.from({ length: 8 }, (_, f) => count(B.renderRig(rig, clipPose(clip, f), { outline: false }).g, EYE));
  assert.deepEqual(eyes, [2, 2, 2, 2, 2, 2, 0, 0], 'open, then shut on frames 6 and 7');
});
