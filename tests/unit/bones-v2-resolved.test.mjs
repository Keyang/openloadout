// Bone rig v2 (rigs/bones.js, build item B5), part 3: a version 2 rig sprite as engine/resolve.js (B4) hands it over:
// a base piece merged in (`extends`), parts and held things drawn in from pieces with their variants, stamps, scales
// from sliders, generator calls on bones expanded through the hook the caller gives (engine/resolve.js expandFrame),
// top-down direction overlays (bones, shapes and stamps) and attach points. drawResolvedRig and resolvedRigPoints are
// what engine/data-sprite.js (B6) calls; the pose comes from rigs/keypose.js with the frame's edits on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import * as B from '../../rigs/bones.js';
import { clipPose } from '../../rigs/keypose.js';
import { resolveSprite, expandFrame } from '../../engine/resolve.js';
import { loadV2, testPieces, testRegistry } from '../fixtures/resolve/helpers.mjs';

const store = testPieces();
const reg = testRegistry();
const R = (def, settings = {}) => {
  const r = resolveSprite(def, settings, { pieces: store, generators: reg });
  assert.equal(r.ok, true, r.errors?.join('; '));
  return r;
};
/** The pose of one frame of a resolved clip, with the frame's edits (as engine/data-sprite.js puts them on). */
function poseOf(resolved, clip, frame) {
  const c = resolved.clips[clip];
  const pose = clipPose(c, frame);
  const e = c.frameEdits?.[String(frame)];
  if (e?.swap) pose.swap = { ...(pose.swap ?? {}), ...e.swap };
  if (e?.flash) pose.flash = true;
  return pose;
}
const expandWith = (resolved) => (list, ctx) => expandFrame(resolved, list, ctx);
function draw(resolved, clip, frame, more = {}) {
  const [w, h] = resolved.size;
  const g = new Surface(w, h);
  const out = B.drawResolvedRig(g, resolved, poseOf(resolved, clip, frame), { clip, frame, frames: resolved.clips[clip].frames, expand: expandWith(resolved), ...more });
  return { g, ...out };
}
const count = (g, c) => { let n = 0; const v = c === undefined ? null : col(c); for (const p of g.data) if (v === null ? p : p === v) n++; return n; };
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);

test('bones v2: the knight (a base, a helmet part, a held sword, stamps) draws every frame of every clip, nothing left out', () => {
  const knight = R(loadV2('knight'));
  for (const [clip, c] of Object.entries(knight.clips)) for (let f = 0; f < c.frames; f++) {
    const out = draw(knight, clip, f);
    assert.deepEqual(out.errors, [], `${clip} ${f}`);
    assert.deepEqual(out.skipped, [], `${clip} ${f}`);
    assert.ok(count(out.g) > 60, `${clip} ${f} draws a body`);
  }
  const { g } = draw(knight, 'idle', 0);
  assert.ok(count(g, knight.palette.metal.hex) > 0 || Object.values(knight.palette).some((s) => count(g, s.hex)), 'the helmet and sword metal');
});

test('bones v2: the knight\'s eye stamp sits on the head and blinks on the frame whose edit swaps it', () => {
  const knight = R(loadV2('knight'));
  const J = B.solveRig(knight.body.rig, poseOf(knight, 'attack', 2), { scale: knight.scales });
  const eyeOf = (frame) => B.rigList(knight.body.rig, B.solveRig(knight.body.rig, poseOf(knight, 'attack', frame), { scale: knight.scales }), poseOf(knight, 'attack', frame), { palette: knight.palette, clip: 'attack', outline: false })
    .list.find((p) => p.id === 'eye');
  assert.equal(eyeOf(2).variant, undefined);
  assert.equal(eyeOf(3).variant, 'blink', 'frame 3 of attack swaps the eye (frameEdits)');
  assert.ok(J.bones.head);
  const open = draw(knight, 'attack', 2, { outline: false }).g;
  const at = eyeOf(2).at, x = Math.round(at[0]), y = Math.round(at[1]);
  assert.equal(open.get(x, y), col(knight.palette.eye.hex), 'the eye\'s top pixel at its rounded point');
  assert.equal(open.get(x, y + 1), col(knight.palette.eye.hex));
});

test('bones v2: the sword (a held piece on handF) swings with the arm and goes when the weapon part is off', () => {
  const knight = R(loadV2('knight'));
  const edge = (r, clip, f) => B.rigList(r.body.rig, B.solveRig(r.body.rig, poseOf(r, clip, f), { scale: r.scales }), poseOf(r, clip, f), { palette: r.palette, clip }).list.find((p) => p.id === 'sword' && p.kind === 'line');
  const a = edge(knight, 'attack', 0), b = edge(knight, 'attack', 6);
  assert.ok(a && b);
  assert.notDeepEqual(a.to, b.to, 'the blade turns with the arm');
  const none = R(loadV2('knight'), { weapon: 'none' });
  assert.equal(edge(none, 'attack', 0), undefined);
  assert.ok(!same(draw(knight, 'attack', 0).g, draw(none, 'attack', 0).g));
});

test('bones v2: a piece\'s style chosen by a setting (the knight\'s hair, drawn under no helmet) reaches the drawing', () => {
  const short = R(loadV2('knight'), { headgear: 'none', hair: 'short' }), long = R(loadV2('knight'), { headgear: 'none', hair: 'long', hairLength: 1 });
  const items = (r) => B.rigList(r.body.rig, B.solveRig(r.body.rig, poseOf(r, 'idle', 0), { scale: r.scales }), poseOf(r, 'idle', 0), { palette: r.palette, clip: 'idle' }).list.filter((p) => p.id === 'hair');
  assert.deepEqual(items(short).map((p) => p.kind), ['ellipse'], 'crop: the cap only');
  assert.deepEqual(items(long).map((p) => p.kind), ['ellipse', 'rect'], 'fall: the cap and the fall');
  assert.equal(items(long)[1].size[1], 7, 'hairLength 1 -> length 7 -> the piece maps it to 7.4, whole pixels: 7 tall');
  const a = draw(short, 'idle', 0), b = draw(long, 'idle', 0);
  assert.deepEqual([a.skipped, b.skipped], [[], []]);
  // (the test piece's fall hangs behind the torso and skull, lower z, so the two pictures may be the same)
  assert.ok(!same(draw(R(loadV2('knight')), 'idle', 0).g, a.g), 'the helmet and the hair are different pictures');
});

test('bones v2: sliders that scale bones reach the drawing (the knight\'s height)', () => {
  const tall = R(loadV2('knight'), { height: 1 }), short = R(loadV2('knight'), { height: 0 });
  const a = draw(tall, 'idle', 0), b = draw(short, 'idle', 0);
  assert.ok(Math.abs(a.J.bones.spine.length - 10 * 1.15) < 1e-9);
  assert.ok(Math.abs(b.J.bones.spine.length - 10 * 0.85) < 1e-9);
  assert.ok(!same(a.g, b.g));
});

test('bones v2: a generator call on a bone is expanded through the hook, placed on the bone, and moves with the frame', () => {
  const def = loadV2('knight');
  def.body.rig.shapes.push({ id: 'shine', gen: 'glint', v: 1, on: 'head', every: 4, paint: 'metal', z: 40 });
  const knight = R(def);
  const listOf = (frame, expand) => {
    const pose = poseOf(knight, 'idle', frame);
    return B.rigList(knight.body.rig, B.solveRig(knight.body.rig, pose, { scale: knight.scales }), pose, { palette: knight.palette, clip: 'idle', frame: { frame, frames: 8 }, expand, outline: false });
  };
  const with0 = listOf(0, expandWith(knight)), with1 = listOf(1, expandWith(knight));
  const dot0 = with0.list.find((p) => p.id === 'shine'), dot1 = with1.list.find((p) => p.id === 'shine');
  assert.ok(dot0 && dot1, 'the glint is drawn (and keeps the call\'s id)');
  assert.equal(dot0.kind, 'dot');
  assert.equal(dot0.z, 40, 'the call\'s z carried');
  assert.notDeepEqual(dot0.at, dot1.at, 'the generator sees the frame');
  const bare = listOf(0, undefined);
  assert.equal(bare.list.find((p) => p.id === 'shine'), undefined);
  assert.deepEqual(bare.skipped.map((s) => s.id), ['shine'], 'without a hook the call is left out and reported');
  const out = draw(knight, 'idle', 0);
  assert.deepEqual(out.skipped, []);
  assert.deepEqual(out.errors, []);
  // a hook that fails reports its errors and the rest still draws
  const bad = draw(knight, 'idle', 0, { expand: () => ({ ok: false, primitives: [], errors: ['no such generator'] }) });
  assert.ok(bad.errors.some((e) => /no such generator/.test(e)));
  assert.ok(count(bad.g) > 60);
});

test('bones v2: attach points of a resolved rig (from the base) follow the pose', () => {
  const knight = R(loadV2('knight'));
  const p0 = B.resolvedRigPoints(knight, poseOf(knight, 'attack', 0), { clip: 'attack' });
  const p6 = B.resolvedRigPoints(knight, poseOf(knight, 'attack', 6), { clip: 'attack' });
  assert.ok(p0.hand && p6.hand);
  assert.notDeepEqual([p0.hand.x, p0.hand.y], [p6.hand.x, p6.hand.y]);
  const J = B.solveRig(knight.body.rig, poseOf(knight, 'attack', 0), { scale: knight.scales });
  assert.ok(Math.abs(p0.hand.x - J.bones.handF.end[0]) < 1e-9 && Math.abs(p0.hand.y - J.bones.handF.end[1]) < 1e-9, 'hand at [5, 0] on handF: its end');
});

// ---- top-down: direction overlays for bones, shapes and stamps -----------------------------------------------------

const beetle = () => ({
  format: 'loadout-sprite', version: 2, id: 'test-bug', name: 'Test bug', blurb: 'A bug seen from above, for tests.', size: [32, 32], pivot: [16, 28],
  meta: { type: 'creature', role: 'characters/enemy', view: 'top-down', themes: ['fantasy'], gameTypes: ['top-down-rpg'], words: ['bug'], license: 'draft' },
  palette: [{ id: 'shell', label: 'Shell', default: '#7a4fc4', material: 'paint' }, { id: 'eye', default: '#f0ead8', detail: true }],
  body: { rig: {
    view: 'top-down',
    bones: [{ id: 'body', parent: null, at: [16, 14], angle: 0, length: 8 }, { id: 'head', parent: 'body', angle: 0, length: 3 }],
    shapes: [
      { id: 'shell', kind: 'ellipse', on: 'body', at: [4, 0], r: [5, 4], paint: 'shell', z: 0 },
      { id: 'eyes', kind: 'stamp', on: 'head', at: [1, 1], rows: ['a.a'], key: { a: 'eye' }, anchor: 'c', z: 5, variants: { side: ['..a'] } },
      { id: 'tail', kind: 'rect', on: 'body', at: [0, 0], size: [2, 2], paint: 'eye', z: 6, when: { direction: ['up'] } } ],
    directions: {
      down: {},
      up: { bones: { body: { angle: 180 } }, stamps: { eyes: { hidden: true } } },
      side: { bones: { body: { angle: 90 } }, stamps: { eyes: { variant: 'side', at: [1, 0] } }, shapes: { shell: { r: [5, 3] } } } } } },
  clips: { walk_down: { frames: 2, fps: 6 }, walk_up: { frames: 2, fps: 6 }, walk_side: { frames: 2, fps: 6 } },
  made: { in: 'studio', from: 'new' },
});

test('bones v2: rigFacing applies a direction\'s overlay to bones, shapes and stamps (at, variant, hidden, mirror)', () => {
  const rig = R(beetle()).body.rig;
  const up = B.rigFacing(rig, 'up'), side = B.rigFacing(rig, 'side'), down = B.rigFacing(rig, 'down');
  assert.equal(up.directions, undefined);
  assert.equal(up.bones.find((b) => b.id === 'body').angle, 180);
  assert.equal(up.shapes.find((s) => s.id === 'eyes').hidden, true);
  const eyes = side.shapes.find((s) => s.id === 'eyes');
  assert.equal(eyes.variant, 'side');
  assert.deepEqual(eyes.at, [1, 0]);
  assert.deepEqual(side.shapes.find((s) => s.id === 'shell').r, [5, 3]);
  assert.deepEqual(down.shapes, rig.shapes, 'no overlay: the rig as it is');
  assert.equal(rig.shapes.find((s) => s.id === 'eyes').variant, undefined, 'the rig itself is not changed');
});

test('bones v2: a top-down resolved rig draws each clip from its direction: eyes facing down, none facing up, one in profile', () => {
  const bug = R(beetle());
  const eye = bug.palette.eye.hex;
  const down = draw(bug, 'walk_down', 0), up = draw(bug, 'walk_up', 0), side = draw(bug, 'walk_side', 0);
  for (const o of [down, up, side]) { assert.deepEqual(o.errors, []); assert.deepEqual(o.skipped, []); }
  assert.equal(count(down.g, eye), 2, 'two eyes facing down');
  assert.equal(count(up.g, eye), 4, 'no eyes facing up: only the 2x2 tail that shows only facing up');
  assert.equal(count(side.g, eye), 1, 'one eye in profile (the side variant)');
  assert.ok(!same(down.g, side.g));
  // a direction given outright wins over the clip's name
  assert.equal(count(draw(bug, 'walk_down', 0, { direction: 'side' }).g, eye), 1);
  // the pose may still swap a stamp the overlay set
  const g = new Surface(32, 32);
  B.drawResolvedRig(g, bug, { swap: { eyes: null } }, { clip: 'walk_side' });
  assert.equal(count(g, eye), 2, 'swap to null: back to the rows');
});

test('bones v2: drawResolvedRig refuses what is not a resolved rig sprite, without throwing', () => {
  const g = new Surface(8, 8);
  for (const bad of [null, {}, { ok: false }, { ok: true, body: { kind: 'pictures', pictures: {} } }]) {
    const out = B.drawResolvedRig(g, bad, {}, {});
    assert.ok(out.errors.length > 0);
    assert.equal(count(g), 0);
    assert.deepEqual(B.resolvedRigPoints(bad, {}, {}), {});
  }
});
