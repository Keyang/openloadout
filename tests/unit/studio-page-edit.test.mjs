// What the studio page does to a definition (docs/studio.md section 5, journeys a and c; item S9). Every change is a
// pure function from a definition to a new one; the result must still pass the validator (engine/data-sprite.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../app/studio/edit.js';
import { studioTemplate, STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';
import { validateDataSprite, framePose } from '../../engine/data-sprite.js';
import { solveRig } from '../../rigs/bones.js';
import { framePhase } from '../../rigs/keypose.js';

const valid = (d, what) => { const v = validateDataSprite(d); assert.equal(v.ok, true, `${what}: ${v.errors.join('; ')}`); return v.value; };
const four = () => valid(studioTemplate('four-legs'), 'four legs');
const close = (a, b, eps = 0.6) => assert.ok(Math.abs(a - b) <= eps, `${a} is about ${b}`);

test('starting bodies: every template (the Hero, a library body, is gone), as a fresh draft named by the person', () => {
  const starts = E.startingBodies();
  assert.deepEqual(starts.filter((s) => s.kind === 'template').map((s) => s.id), [...STUDIO_TEMPLATE_IDS]);
  assert.deepEqual(starts.map((s) => s.id), [...STUDIO_TEMPLATE_IDS], 'templates only: no library body to start from (build item R1)');
  assert.ok(starts.some((s) => s.view === 'top-down'), 'the top-down bodies are offered (Q4)');
  for (const s of starts) {
    const d = E.startFrom(s.id, 'Moss newt');
    assert.equal(d.name, 'Moss newt');
    assert.equal(d.id, 'moss-newt');
    assert.equal(d.made.in, 'studio');
    valid(d, s.id);
  }
  assert.equal(E.startFrom('nope', 'x'), null);
  assert.equal(E.startFrom('hero', 'x'), null, 'the Hero preset is gone');
});

test('the bones as a tree, parents first, with their depth and everyday names', () => {
  const tree = E.boneTree(four());
  assert.equal(tree[0].id, 'spine');
  assert.equal(tree[0].depth, 0);
  const head = tree.find((b) => b.id === 'head');
  assert.equal(head.depth, 2);
  assert.equal(head.label, 'Head');
});

test('Body: dragging a bone\'s tip changes its length and its angle; joint limits hold', () => {
  const d = four();
  const ctx = { mode: 'body' };
  const hs = E.handles(d, ctx);
  const tail = hs.find((h) => h.id === 'bone:tail1');
  assert.ok(tail, 'every bone has a tip handle in Body');
  const J = solveRig(d.body.rig, {});
  const B = J.bones.tail1;
  // drag the tip twice as far along the bone: longer, same direction
  const far = [B.start[0] + (B.end[0] - B.start[0]) * 2, B.start[1] + (B.end[1] - B.start[1]) * 2];
  const longer = valid(E.dragHandle(d, ctx, 'bone:tail1', far), 'longer');
  const tl = longer.body.rig.bones.find((b) => b.id === 'tail1');
  close(tl.length, B.length * 2);
  close(tl.angle, d.body.rig.bones.find((b) => b.id === 'tail1').angle, 1);
  // the rest angle is free in Body (joint limits are measured from it): a drag straight down points the tail down
  const swung = valid(E.dragHandle(d, ctx, 'bone:tail1', [B.start[0], B.start[1] + 10]), 'swung');
  const tip = E.handles(swung, ctx).find((h) => h.id === 'bone:tail1');
  close(tip.at[0], B.start[0], 0.6);
  assert.ok(tip.at[1] > B.start[1] + 3);
  // in Move, a drag far past the joint's limit stops at it (limits are measured from the rest angle)
  const bone = d.body.rig.bones.find((b) => b.id === 'tail1');
  const mctx = { mode: 'move', clip: 'walk', frame: 0 };
  const Bm = E.handles(d, mctx).find((h) => h.id === 'bone:tail1');
  const posed = valid(E.dragHandle(d, mctx, 'bone:tail1', [Bm.from[0], Bm.from[1] + 10]), 'posed past the limit');
  const a = posed.clips.walk.keys.find((k) => k.t === 0).bones.tail1;
  assert.ok(a >= bone.angle + bone.min - 1e-9 && a <= bone.angle + bone.max + 1e-9, `angle ${a} within ${bone.angle + bone.min}..${bone.angle + bone.max}`);
});

test('Body: the root bone\'s start moves the whole body', () => {
  const d = four();
  const out = valid(E.dragHandle(d, { mode: 'body' }, 'root', [22, 30]), 'moved');
  assert.deepEqual(out.body.rig.bones[0].at, [22, 30]);
});

test('Body: add a bone on the head, then a shape on it; remove it again and nothing points at it', () => {
  const d = four();
  const { def: withBone, id } = E.addBone(d, 'head');
  valid(withBone, 'added bone');
  const nb = withBone.body.rig.bones.find((b) => b.id === id);
  assert.equal(nb.parent, 'head');
  assert.ok(nb.length >= 2);
  for (const kind of E.SHAPE_CHOICES.map((c) => c.id)) {
    const { def: withShape, id: sid } = E.addShape(withBone, id, kind);
    const v = valid(withShape, `shape ${kind}`);
    const s = v.body.rig.shapes.find((x) => x.id === sid);
    assert.equal(s.bone, id);
    assert.ok(v.body.rig.colours.some((c) => c.id === s.paint));
  }
  const { def: withShape, id: sid } = E.addShape(withBone, id, 'round');
  const back = valid(E.removeBone(withShape, id).def, 'removed');
  assert.ok(!back.body.rig.bones.some((b) => b.id === id));
  assert.ok(!back.body.rig.shapes.some((s) => s.id === sid));
});

test('Body: removing a bone takes its children, its shapes, its chains, its points and every key of it', () => {
  const d = four();
  const r = E.removeBone(d, 'neck');
  const v = valid(r.def, 'no neck');
  assert.ok(!v.body.rig.bones.some((b) => ['neck', 'head'].includes(b.id)));
  assert.ok(!v.body.rig.points.some((p) => p.bone === 'head'));
  for (const c of Object.values(v.clips)) for (const k of c.keys) assert.ok(!k.bones || (!('neck' in k.bones) && !('head' in k.bones)));
  assert.ok(r.removed.bones >= 2);
  assert.ok(r.removed.shapes >= 1);
  const legs = valid(E.removeBone(d, 'legFN1').def, 'no near foreleg');
  assert.ok(!legs.body.rig.ik.some((c) => c.id === 'foreN'));
  for (const c of Object.values(legs.clips)) for (const k of c.keys) assert.ok(!k.ik || !('foreN' in k.ik));
  assert.equal(E.removeBone(d, 'spine').error !== undefined, true, 'the only root cannot go');
});

test('Body: shapes change colour, front/back, size and the darker side; a shape can be removed', () => {
  const d = four();
  const s = d.body.rig.shapes.find((x) => x.kind === 'capsule');
  const v = valid(E.setShape(d, s.id, { paint: 'belly', z: s.z + 3, far: true }), 'shape set');
  const s2 = v.body.rig.shapes.find((x) => x.id === s.id);
  assert.equal(s2.paint, 'belly');
  assert.equal(s2.z, s.z + 3);
  assert.equal(s2.far, true);
  const bigger = valid(E.resizeShape(d, s.id, 1), 'bigger');
  assert.ok(bigger.body.rig.shapes.find((x) => x.id === s.id).r[0] > s.r[0]);
  const gone = valid(E.removeShape(d, s.id), 'removed shape');
  assert.ok(!gone.body.rig.shapes.some((x) => x.id === s.id));
  assert.match(E.shapeLabel(s, d), /Long|Round|Pointed|Dot|Limb/);
});

test('Move: dragging a foot on a frame puts it in that frame\'s key; the other frames keep their keys', () => {
  const d = four();
  const ctx = { mode: 'move', clip: 'walk', frame: 0 };
  const h = E.handles(d, ctx).find((x) => x.id === 'ik:foreN');
  assert.ok(h, 'an IK foot has a handle');
  const out = valid(E.dragHandle(d, ctx, 'ik:foreN', [h.at[0] + 3, h.at[1] - 2]), 'foot moved');
  const k0 = out.clips.walk.keys.find((k) => k.t === 0);
  const was = d.clips.walk.keys.find((k) => k.t === 0).ik.foreN;
  assert.deepEqual(k0.ik.foreN, [was[0] + 3, was[1] - 2]);
  const moved = E.handles(out, ctx).find((x) => x.id === 'ik:foreN');
  close(moved.at[0], h.at[0] + 3, 1);
  close(moved.at[1], h.at[1] - 2, 1);
  assert.deepEqual(out.clips.walk.keys.find((k) => k.t === 0.5), d.clips.walk.keys.find((k) => k.t === 0.5));
});

test('Move: posing a frame without a key adds one there holding only what changed', () => {
  const d = four();
  const ctx = { mode: 'move', clip: 'walk', frame: 1 };
  assert.equal(E.keyIndexAt(d, 'walk', 1), -1);
  const h = E.handles(d, ctx).find((x) => x.id === 'bone:head');
  const out = valid(E.dragHandle(d, ctx, 'bone:head', [h.at[0] + 2, h.at[1] + 2]), 'head posed');
  const i = E.keyIndexAt(out, 'walk', 1);
  assert.ok(i >= 0);
  const k = out.clips.walk.keys[i];
  close(k.t, framePhase(out.clips.walk, 1), 1e-6);
  assert.deepEqual(Object.keys(k).sort(), ['bones', 't']);
  assert.deepEqual(Object.keys(k.bones), ['head']);
});

test('Move: the whole body moves by whole pixels; turning a bone by 5 degrees', () => {
  const d = four();
  const ctx = { mode: 'move', clip: 'walk', frame: 0 };
  const out = valid(E.nudgeHandle(d, ctx, 'root', 1, -1), 'root nudged');
  const k0 = out.clips.walk.keys.find((k) => k.t === 0);
  assert.deepEqual(k0.root, [1, 0]);
  const turned = valid(E.turnBone(d, ctx, 'tail1', 5), 'tail turned');
  close(turned.clips.walk.keys.find((k) => k.t === 0).bones.tail1, 140, 0.01);
});

test('Move: keys are added, eased, copied, pasted and deleted', () => {
  const d = four();
  const added = valid(E.addKey(d, 'walk', 3), 'key added');
  const i = E.keyIndexAt(added, 'walk', 3);
  assert.ok(i >= 0);
  assert.ok(Object.keys(added.clips.walk.keys[i]).length > 1, 'a new key holds the pose as it is there');
  const eased = valid(E.setKeyEase(added, 'walk', 3, 'hold'), 'eased');
  assert.equal(eased.clips.walk.keys[E.keyIndexAt(eased, 'walk', 3)].ease, 'hold');
  const copied = E.copyKey(d, 'walk', 0);
  assert.equal(copied.t, undefined);
  const pasted = valid(E.pasteKey(d, 'walk', 2, copied), 'pasted');
  const kp = pasted.clips.walk.keys[E.keyIndexAt(pasted, 'walk', 2)];
  assert.deepEqual(kp.ik, d.clips.walk.keys[0].ik);
  const gone = valid(E.deleteKey(d, 'walk', 2), 'deleted');
  assert.equal(E.keyIndexAt(gone, 'walk', 2), -1);
  assert.equal(gone.clips.walk.keys.length, d.clips.walk.keys.length - 1);
});

test('Move: what a key changes, in everyday names', () => {
  const d = four();
  const names = E.keyChanges(d, 'walk', 0);
  assert.ok(names.includes('Near forefoot'));
  assert.ok(names.includes('Whole body'));
  assert.ok(names.includes('Tail'));
});

test('Move: a new animation by its everyday name, a copy of Idle, with the standard frames', () => {
  const d = four();
  const offered = E.newClipChoices(d);
  assert.ok(!offered.some((c) => c.name === 'walk'), 'what exists is not offered');
  assert.equal(E.clipFromWords(d, 'Bite'), null, 'it has an attack already');
  const noIdle = valid(E.removeClip(d, 'attack'), 'no attack');
  const bite = E.clipFromWords(noIdle, 'Bite');
  assert.deepEqual(bite, { name: 'attack', label: 'Bite' });
  const r = E.addClip(noIdle, 'attack', { label: 'Bite' });
  const v = valid(r.def, 'bite added');
  assert.equal(v.clips.attack.label, 'Bite');
  assert.equal(v.clips.attack.frames, 8);
  assert.equal(v.clips.attack.loop, false);
  assert.deepEqual(v.clips.attack.keys.map((k) => k.bones), noIdle.clips.idle.keys.map((k) => k.bones));
  const wave = E.clipFromWords(d, 'Wave');
  assert.deepEqual(wave, { name: 'wave', label: 'Wave' });
  valid(E.addClip(d, 'wave', { label: 'Wave' }).def, 'wave');
  assert.equal(E.clipFromWords(d, 'two words here'), null);
  assert.equal(E.clipFromWords(d, 'walk'), null, 'already there');
});

test('Frames (journey c): 8 frames to 6 keeps the keys in the motion, snaps them to frames and says what merged', () => {
  const d = four();
  const r = E.setFrames(d, 'walk', 6);
  const v = valid(r.def, 'six frames');
  assert.equal(v.clips.walk.frames, 6);
  for (const k of v.clips.walk.keys) {
    const f = Math.round(k.t * 6);
    close(k.t, f / 6, 1e-9);
  }
  assert.ok(Array.isArray(r.merged));
  const three = E.setFrames(d, 'walk', 2);
  assert.ok(three.merged.length > 0, 'four keys on two frames merge');
  valid(three.def, 'two frames');
  // frame edits and sounds past the end go
  const edits = valid(E.setFrameEdit(d, 'walk', 7, { flash: true }), 'flash on 7');
  const cut = valid(E.setFrames(edits, 'walk', 6).def, 'cut');
  assert.equal(cut.clips.walk.frameEdits?.['7'], undefined);
  assert.ok((cut.clips.walk.sounds ?? []).every((s) => s.frame < 6));
});

test('Frames: speed, looping, the anchor, snap to the feet, standing on the ground, frame size', () => {
  const d = four();
  assert.equal(valid(E.setFps(d, 'walk', 99), 'fps').clips.walk.fps, 30);
  assert.equal(valid(E.setFps(d, 'walk', 6), 'fps').clips.walk.fps, 6);
  assert.equal(valid(E.setLoop(d, 'walk', false).def, 'loop').clips.walk.loop, false);
  const moved = valid(E.setPivot(d, [10, 20]), 'pivot');
  assert.deepEqual(moved.pivot, [10, 20]);
  assert.deepEqual(valid(E.setPivot(d, [999, -5]), 'pivot clamped').pivot, [63, 0]);
  const feet = E.feetPivot(d);
  assert.equal(feet[1], solveRig(d.body.rig, {}).ground);
  assert.deepEqual(valid(E.setPivot(moved, feet), 'snapped').pivot, feet);
  assert.equal(valid(E.setGrounded(d, false), 'floating').grounded, false);
  const sizes = E.frameSizes(d);
  assert.ok(sizes.some(([w, h]) => w === 64 && h === 64));
  const big = valid(E.setFrameSize(d, [64, 64]), 'resized');
  assert.deepEqual(big.size, [64, 64]);
  assert.deepEqual(big.body.rig.size, [64, 64]);
  assert.equal(big.body.rig.bones[0].at[1] - d.body.rig.bones[0].at[1], big.pivot[1] - d.pivot[1], 'the body moves with the anchor');
});

test('Frames: one frame moved, flashed, a hidden shape shown', () => {
  const d = four();
  const v = valid(E.setFrameEdit(d, 'walk', 3, { nudge: [1, -2], flash: true }), 'edit');
  assert.deepEqual(v.clips.walk.frameEdits['3'].nudge, [1, -2]);
  assert.equal(v.clips.walk.frameEdits['3'].flash, true);
  const pose = framePose(v, 'walk', 3);
  assert.deepEqual(pose.nudge, [1, -2]);
  const cleared = valid(E.setFrameEdit(v, 'walk', 3, { nudge: null, flash: false }), 'cleared');
  assert.equal(cleared.clips.walk.frameEdits?.['3'], undefined);
  const shapes = E.switchableShapes(d);
  if (shapes.length) {
    const sid = shapes[0].id;
    const shown = valid(E.setFrameShape(d, 'walk', 2, sid, 'show'), 'shown');
    assert.deepEqual(shown.clips.walk.frameEdits['2'].show, [sid]);
  }
});

test('Look & name: name and file name, one sentence, what it is, colours, words', () => {
  const d = four();
  const named = valid(E.setName(d, 'Moss newt'), 'named');
  assert.equal(named.name, 'Moss newt');
  assert.equal(named.id, 'moss-newt');
  assert.equal(valid(E.setName(d, 'Knight', ['knight']), 'taken').id, 'knight-mine', 'a library id is not taken');
  assert.equal(valid(E.setBlurb(d, 'A small green newt.'), 'blurb').blurb, 'A small green newt.');
  const kinds = E.WHAT_IS_IT;
  assert.ok(kinds.some((k) => k.label === 'Enemy'));
  const enemy = valid(E.setWhat(d, 'enemy'), 'enemy');
  assert.equal(enemy.meta.role, 'characters/enemy');
  const player = valid(E.setWhat(d, 'player'), 'player');
  assert.equal(player.meta.role, 'characters/player');
  assert.equal(player.meta.type, 'character');
  const green = valid(E.setColour(d, 'fur', '#4f9d57'), 'colour');
  assert.equal(green.colours.fur, '#4f9d57');
  assert.equal(valid(E.setColour(d, 'fur', 'javascript:alert(1)'), 'bad colour').colours.fur, d.colours.fur, 'not a colour: no change');
  const words = valid(E.setWords(d, 'Newt, lizard,  swamp , NEWT'), 'words');
  assert.deepEqual(words.meta.words, ['newt', 'lizard', 'swamp']);
});

test('Look & name: sliders people get and parts that can be switched off', () => {
  const d = four();
  const r = E.addSlider(d, { label: 'Head size', bone: 'head' });
  const v = valid(r.def, 'slider');
  const c = v.controls.find((x) => x.key === r.key);
  assert.equal(c.label, 'Head size');
  assert.deepEqual(c.scales, { bones: ['head'] });
  const gone = valid(E.removeControl(v, r.key), 'slider removed');
  assert.ok(!gone.controls.some((x) => x.key === r.key));
  const tailShapes = d.body.rig.shapes.filter((s) => s.bone === 'tail1' || s.bone === 'tail2').map((s) => s.id);
  const p = E.addPart(d, { label: 'Tail', shapes: tailShapes });
  const pv = valid(p.def, 'part');
  assert.deepEqual(pv.parts[p.key].shapes, tailShapes);
  assert.equal(valid(E.setPartDefault(pv, p.key, false), 'off').parts[p.key].default, false);
  assert.ok(!(p.key in valid(E.removePart(pv, p.key), 'part gone').parts));
});

test('every change keeps every template valid (a smoke pass over the bodies)', () => {
  for (const id of STUDIO_TEMPLATE_IDS) {
    let d = valid(E.startFrom(id, `Test ${id}`), id);
    const clip = Object.keys(d.clips)[0];
    for (const h of E.handles(d, { mode: 'move', clip, frame: 0 })) d = valid(E.nudgeHandle(d, { mode: 'move', clip, frame: 0 }, h.id, 1, 0), `${id} ${h.id}`);
    for (const h of E.handles(d, { mode: 'body' })) d = valid(E.nudgeHandle(d, { mode: 'body' }, h.id, 0, 1), `${id} body ${h.id}`);
    d = valid(E.setFrames(d, clip, 4).def, `${id} frames`);
  }
});

// Review S9 issue 4: a clip name is one of the definition's own, never a name every object has.
test('names every object has are never clips: lookups, new animations and changes all refuse them', () => {
  const d = four();
  for (const n of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(E.hasClip(d, n), false, n);
    assert.equal(E.keyIndexAt(d, n, 0), -1, n);
    assert.equal(E.keyFrames(d, n).size, 0, n);
    assert.deepEqual(E.handles(d, { mode: 'move', clip: n, frame: 0 }), [], n);
    const r = E.addClip(d, n, { label: 'X' });
    assert.ok(r.error, `${n} refused`);
    assert.doesNotMatch(r.error, /one word/, `${n}: the reason is the right one`);
    for (const change of [() => E.setFrames(d, n, 4).def, () => E.setLoop(d, n, false).def, () => E.setFps(d, n, 3), () => E.removeClip(d, n), () => E.setClipLabel(d, n, 'Y'), () => E.setFrameEdit(d, n, 0, { flash: true }), () => E.setFrameShape(d, n, 0, 'x', 'hide'), () => E.addKey(d, n, 0)]) {
      assert.deepEqual(change(), d, `${n}: nothing changes`);
    }
  }
  assert.equal(Object.hasOwn(Object, 'frames'), false, 'nothing was written onto Object');
  assert.equal(E.hasClip(d, 'walk'), true);
  assert.equal(E.clipFromWords(d, 'Constructor'), null);
  assert.equal(E.clipFromWords(d, 'Prototype'), null);
  assert.match(E.whyNotClip(d, 'Constructor'), /kept|another word/i);
  assert.match(E.whyNotClip(d, 'two words'), /one word/i);
  assert.match(E.whyNotClip(d, 'walk'), /already/i);
  assert.match(E.whyNotClip(d, ''), /Type a name/i);
});
