// The bone renderer (rigs/bones.js), part 1: where the bones are. docs/studio.md sections 2.1, 2.2 and 4 (S3).
// Forward kinematics from data angles (degrees, rig convention: 0 down, 90 forward, 180 up), joint limits,
// two-bone IK that equals engine/motion.js ik2, the ground, attach points. S1/S2 do not exist yet: the rigs
// here are small local stand-ins written to the format of section 2.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ik2 } from '../../engine/motion.js';
import * as B from '../../rigs/bones.js';

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} is not ${b}`);
const nearPt = (p, q, eps = 1e-6, msg) => { near(p[0], q[0], eps, msg); near(p[1], q[1], eps, msg); };
const RAD = Math.PI / 180;

/** The newt of docs/studio.md 2.1, with the back legs the example trims. */
const NEWT = {
  format: 'loadout-rig', version: 1, id: 'newt', name: 'Newt', view: 'side', size: [48, 48],
  colours: [{ id: 'skin', label: 'Skin', default: '#4f9d57', material: 'skin' }, { id: 'belly', label: 'Belly', default: '#e6c545', material: 'skin' }, { id: 'eye', label: 'Eyes', default: '#231b33', detail: true }],
  bones: [
    { id: 'body', parent: null, at: [20, 36], angle: 90, length: 12 },
    { id: 'head', parent: 'body', angle: 0, length: 7, min: -30, max: 30 },
    { id: 'tail1', parent: 'body', from: 0, angle: 180, length: 7, min: -45, max: 45 },
    { id: 'tail2', parent: 'tail1', angle: 0, length: 6, min: -60, max: 60 },
    { id: 'thighF', parent: 'body', from: 0.8, angle: -90, length: 4 },
    { id: 'shinF', parent: 'thighF', angle: 20, length: 3 },
    { id: 'thighB', parent: 'body', from: 0.15, angle: -90, length: 4 },
    { id: 'shinB', parent: 'thighB', angle: 20, length: 3 },
  ],
  shapes: [
    { id: 'legF1', bone: 'thighF', kind: 'limb', width: 2, paint: 'skin', z: 12 },
    { id: 'legF2', bone: 'shinF', kind: 'limb', width: 2, paint: 'skin', z: 12 },
    { id: 'legB1', bone: 'thighB', kind: 'limb', width: 2, paint: 'skin', z: 5, far: true },
    { id: 'legB2', bone: 'shinB', kind: 'limb', width: 2, paint: 'skin', z: 5, far: true },
  ],
  ik: [{ id: 'footF', label: 'Front foot', bones: ['thighF', 'shinF'], bend: -1 }, { id: 'footB', label: 'Back foot', bones: ['thighB', 'shinB'], bend: -1 }],
  points: [{ id: 'head', bone: 'head', at: [7, 0] }, { id: 'feet', ground: true }],
};

// ---- the ground --------------------------------------------------------------------------------------

test('bones: groundOf gives the style guide pivot row for each frame size it lists', () => {
  assert.equal(B.groundOf({ size: [48, 48] }), 42);
  assert.equal(B.groundOf({ size: [64, 48] }), 43);
  assert.equal(B.groundOf({ size: [64, 64] }), 58);
  assert.equal(B.groundOf({ size: [32, 32] }), 28);
  assert.equal(B.groundOf({ size: [96, 96] }), 90);
  assert.equal(B.groundOf({ size: [128, 96] }), 90);
  const odd = B.groundOf({ size: [40, 40] });
  assert.ok(Number.isInteger(odd) && odd > 20 && odd < 40, `a frame size the guide does not list still gets a ground row (${odd})`);
});

// ---- forward kinematics -------------------------------------------------------------------------------

test('bones: forward kinematics places every bone from its parent, `from` and its relative angle', () => {
  const J = B.solveRig(NEWT);
  const b = J.bones;
  nearPt(b.body.start, [20, 36]); nearPt(b.body.end, [32, 36]);
  nearPt(b.head.start, [32, 36]); nearPt(b.head.end, [39, 36]);           // from defaults to 1, angle 0 = straight on
  nearPt(b.tail1.start, [20, 36]); nearPt(b.tail1.end, [13, 36]);        // from 0, turned 180: points backward
  nearPt(b.tail2.end, [7, 36]);
  nearPt(b.thighF.start, [29.6, 36]); nearPt(b.thighF.end, [29.6, 40]);  // -90 from forward = straight down
  near(b.body.angle, 90 * RAD); near(b.thighF.angle, 0); near(b.tail1.angle, 270 * RAD);
  near(b.shinF.angle, 20 * RAD);
  assert.deepEqual(J.order, NEWT.bones.map((x) => x.id));
});

test('bones: a pose replaces rest angles, moves every root by `root`, and stretches bone lengths', () => {
  const J = B.solveRig(NEWT, { root: [3, -1], bones: { tail1: 170, body: 100 }, stretch: { body: 1.5 } });
  const b = J.bones;
  nearPt(b.body.start, [23, 35]);
  near(b.body.length, 18);
  near(b.body.angle, 100 * RAD);
  near(b.tail1.angle, 270 * RAD, 1e-9);                                  // 100 + 170
  nearPt(b.head.start, [23 + Math.sin(100 * RAD) * 18, 35 + Math.cos(100 * RAD) * 18]);
  near(b.tail1.deg, 170);
});

test('bones: joint limits, measured from the rest angle, clamp a posed angle; a bone without limits can spin past a full turn', () => {
  const J = B.solveRig(NEWT, { bones: { head: 50, tail2: -90, tail1: 100 } });
  near(J.bones.head.deg, 30); near(J.bones.tail2.deg, -60);
  near(J.bones.tail1.deg, 135, 1e-9, 'tail1 rests at 180 with limits -45..45: 135..225');
  near(B.solveRig(NEWT, { bones: { tail1: 170 } }).bones.tail1.deg, 170, 1e-9, 'the newt walk key 170 is inside');
  const spin = B.solveRig(NEWT, { bones: { body: 90 + 360 } });
  nearPt(spin.bones.body.end, [32, 36], 1e-9);
});

test('bones: several roots, and a bone whose parent is missing or comes later is left out without throwing', () => {
  const rig = { size: [48, 48], bones: [
    { id: 'a', parent: null, at: [10, 10], angle: 0, length: 5 },
    { id: 'b', parent: null, at: [30, 10], angle: 180, length: 4 },
    { id: 'c', parent: 'zzz', angle: 0, length: 3 },
    { id: 'd', parent: 'e', angle: 0, length: 3 },
    { id: 'e', parent: 'a', angle: 0, length: 3 },
  ], shapes: [] };
  const J = B.solveRig(rig);
  nearPt(J.bones.a.end, [10, 15]); nearPt(J.bones.b.end, [30, 6]);
  assert.equal(J.bones.c, undefined); assert.equal(J.bones.d, undefined);
  nearPt(J.bones.e.end, [10, 18]);
});

// ---- two-bone IK ----------------------------------------------------------------------------------------

test('bones: an IK target places the chain exactly as motion.ik2 does', () => {
  const g = B.groundOf(NEWT);
  for (const [tx, ty] of [[4, 0], [0, -2], [-4, 0], [9, 0], [0, -30]]) {
    const J = B.solveRig(NEWT, { ik: { footF: [tx, ty] } });
    const hip = J.bones.thighF.start;
    // the target is measured from the ground point under the chain's rest hip; the end sits footR above the ground
    const target = [29.6 + tx, g - 1 + ty];
    const s = ik2(hip[0], hip[1], target[0], target[1], 4, 3, -1);
    nearPt(J.bones.thighF.end, s.mid, 1e-9, `knee for ${tx},${ty}`);
    nearPt(J.bones.shinF.start, s.mid, 1e-9);
    nearPt(J.bones.shinF.end, s.end, 1e-9, `foot for ${tx},${ty}`);
  }
});

test('bones: IK targets move with the root offset but not with a turned body, so feet stay planted', () => {
  const g = B.groundOf(NEWT);
  const tilted = B.solveRig(NEWT, { bones: { body: 80 }, ik: { footB: [0, 0] } });
  nearPt(tilted.bones.shinB.end, [20 + 0.15 * 12, g - 1], 1e-6);
  const moved = B.solveRig(NEWT, { root: [2, 0], ik: { footB: [0, 0] } });
  nearPt(moved.bones.shinB.end, [20 + 0.15 * 12 + 2, g - 1], 1e-6);
  const low = B.solveRig(NEWT, { ik: { footB: [0, 0] } }, { ground: 43 });
  near(low.bones.shinB.end[1], 42, 1e-6, 'opt.ground moves the ground');
});

test('bones: the foot end sits so its lowest pixels are on the row above the ground, whatever the limb width', () => {
  const rig = (w) => ({ size: [48, 48], bones: [{ id: 'hip', parent: null, at: [24, 30], angle: 90, length: 2 }, { id: 'up', parent: 'hip', angle: -90, length: 6 }, { id: 'lo', parent: 'up', angle: 0, length: 6 }],
    shapes: [{ id: 'a', bone: 'up', kind: 'limb', width: w, paint: 'c' }, { id: 'b', bone: 'lo', kind: 'limb', width: w, paint: 'c' }],
    colours: [{ id: 'c', label: 'C', default: '#8a6a4a' }], ik: [{ id: 'f', bones: ['up', 'lo'], bend: 1 }] });
  for (const w of [1, 2, 3, 4]) {
    const r = rig(w);
    const { g } = B.renderRig(r, { ik: { f: [0, 0] } }, { outline: false });
    const box = g.bounds();
    assert.equal(box.y1, 41, `width ${w}: lowest pixel row ${box.y1}`);
  }
});

test('bones: a chain without a target in the pose keeps its angles', () => {
  const J = B.solveRig(NEWT, { ik: { footB: [0, 0] } });
  nearPt(J.bones.shinF.end, B.solveRig(NEWT).bones.shinF.end, 1e-12);
});

// ---- attach points ----------------------------------------------------------------------------------------

test('bones: attach points come out as Contract 3 sockets (frame px, angle in radians)', () => {
  const J = B.solveRig(NEWT, { root: [1, 0] });
  const s = B.rigPoints(NEWT, J);
  nearPt([s.head.x, s.head.y], [40, 36]);
  near(s.head.angle, 90 * RAD);
  assert.deepEqual(s.feet, { x: 21, y: 42, angle: 0 });
  const turned = B.rigPoints({ ...NEWT, points: [{ id: 'tip', bone: 'tail2', at: [6, 1], angle: 90 }] }, B.solveRig(NEWT));
  // tail2 points back (270 deg): u runs to -x, v (to its left) runs down (+y)
  nearPt([turned.tip.x, turned.tip.y], [7, 37]);
  near(turned.tip.angle, 360 * RAD);
});

test('bones: boneLines lists one segment per solved bone, for drawing the skeleton over the picture', () => {
  const J = B.solveRig(NEWT);
  const L = B.boneLines(J);
  assert.equal(L.length, NEWT.bones.length);
  nearPt(L[0].a, [20, 36]); nearPt(L[0].b, [32, 36]); assert.equal(L[0].id, 'body');
});

test('bones: drawBoneLines draws the skeleton at any zoom, joints on top, one bone alone when asked', async () => {
  const { Surface } = await import('../../engine/surface.js');
  const { col, INK } = await import('../../engine/color.js');
  const J = B.solveRig(NEWT);
  const g = B.drawBoneLines(new Surface(48 * 4, 48 * 4), J, { scale: 4, colour: '#ff00ff' });
  assert.equal(g.get(20 * 4, 36 * 4), col(INK), 'the body joint, at 4x');
  assert.equal(g.get(26 * 4, 36 * 4), col('#ff00ff'), 'along the body bone, at 4x');
  const one = B.drawBoneLines(new Surface(48, 48), J, { only: 'head' });
  const lit = one.data.filter(Boolean).length;
  assert.ok(lit >= 7 && lit <= 9, `just the head bone (${lit} px)`);
});
