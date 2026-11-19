// The studio page, part 2: the Hero and other library bodies (docs/studio.md sections 3 and 5, journey b; item S10).
// Proportions and the way he moves change the stored figure through refigure (hand changes kept as offsets); handles on
// the picture for the hands, feet, hips, head, upper body and held thing, dragged by the pose numbers
// rigs/humanoid-studio.js exposes (a hand drag turns the shoulder and the elbow: the arm follows); "Start this clip over
// from" a rig pose; the attach points as the body places them.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../app/studio/library-body.js';
import * as X from '../../app/studio/edit.js';
import { hero, bake, figureFor, spriteSockets } from '../../rigs/humanoid-studio.js';
import { validateDataSprite } from '../../engine/data-sprite.js';
import { framePhase } from '../../rigs/keypose.js';

const valid = (d, what) => { const v = validateDataSprite(d); assert.equal(v.ok, true, `${what}: ${v.errors.join('; ')}`); return v.value; };
const theHero = () => valid(hero(), 'the hero');
const near = (a, b, eps, what) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps, `${what}: ${a} is within ${eps} of ${b}`);
const at = (def, clip, frame, id) => L.libraryHandles(def, clip, frame).find((h) => h.id === id)?.at;

test('a library body is told apart from a bone rig', () => {
  assert.equal(L.isLibrary(theHero()), true);
  assert.equal(L.isLibrary(X.startFrom('four-legs', 'x')), false);
  assert.equal(L.isLibrary(null), false);
});

test('proportions and the way he moves: the figure\'s numbers in everyday words', () => {
  const rows = L.proportionsOf(theHero());
  assert.deepEqual(rows.map((r) => r.id), ['height', 'build', 'head', 'bounce', 'stride']);
  for (const r of rows) { assert.ok(r.label && r.lo && r.hi, r.id); assert.ok(r.value >= 0 && r.value <= 1, r.id); }
  assert.equal(rows.find((r) => r.id === 'height').label, 'Height');
  assert.equal(rows.find((r) => r.id === 'bounce').label, 'Liveliness');
  assert.deepEqual(L.STANCES.map((s) => s.value), ['upright', 'crouched', 'slouched']);
  assert.equal(L.stanceOf(theHero()), 'upright');
});

test('a taller Hero: the stored figure and the slider\'s starting value change; clips nobody touched are the new formula', () => {
  const was = theHero();
  const r = L.setProportion(was, 'height', 0.9);
  const d = valid(r, 'taller');
  assert.equal(d.body.figure.body.height, 0.9);
  assert.equal(d.controls.find((c) => c.key === 'height').default, 0.9, 'what the bag draws at its defaults is what the studio shows');
  assert.equal(was.body.figure.body.height, 0.5, 'the input is not changed');
  // an untouched clip is the formula at the new figure (keysFor, docs/studio.md 3)
  const fresh = bake(d.body.figure, 'walk', { frames: d.clips.walk.frames, loop: d.clips.walk.loop, from: 'walk' });
  assert.equal(d.clips.walk.keys.length, fresh.length);
  for (let i = 0; i < fresh.length; i++) {
    assert.ok(Math.abs(d.clips.walk.keys[i].footF.x - fresh[i].footF.x) < 0.01, `key ${i} foot`);
    assert.ok(Math.abs(d.clips.walk.keys[i].lift - fresh[i].lift) < 0.01, `key ${i} lift`);
  }
  // a value posed by hand keeps its distance from the formula
  const posed = X.nudgeLibrary(was, 'idle', 2, 'armF', 4, 0);
  const da = posed.clips.idle.keys[2].armF.a - was.clips.idle.keys[2].armF.a;
  const tall = L.setProportion(posed, 'height', 0.9);
  const plain = L.setProportion(was, 'height', 0.9);
  assert.ok(Math.abs((tall.clips.idle.keys[2].armF.a - plain.clips.idle.keys[2].armF.a) - da) < 0.01, 'the hand change rides along');
  // out of range is held to the field's range; an unknown one changes nothing
  assert.equal(L.setProportion(was, 'height', 7).body.figure.body.height, 1);
  assert.deepEqual(L.setProportion(was, 'nope', 0.2), was);
  // the way he moves: liveliness and stride
  const lively = valid(L.setProportion(was, 'bounce', 1), 'lively');
  assert.equal(lively.body.figure.motion.bounce, 1);
  const stance = valid(L.setStance(was, 'crouched'), 'crouched');
  assert.equal(stance.body.figure.stance, 'crouched');
  // the Hero is posed as sprites/knight.js poses him, which has no stance: it is not offered where it changes nothing
  assert.equal(L.stanceMatters(was), false);
  assert.deepEqual(L.setStance(was, 'upside down'), was);
});

test('handles: hands, feet, hips, upper body, head and the sword, where they are drawn', () => {
  const d = theHero();
  const hs = L.libraryHandles(d, 'idle', 2);
  assert.deepEqual(hs.map((h) => h.id), ['lib:hip', 'lib:armF', 'lib:armB', 'lib:footF', 'lib:footB', 'lib:head', 'lib:lean', 'lib:item']);
  for (const h of hs) { assert.ok(h.label && !/arm[FB]|foot[FB]/.test(h.label), `${h.id} has everyday words`); assert.ok(h.at.every(Number.isFinite)); }
  const s = spriteSockets(d, { clip: 'idle', frame: 2 });
  near(at(d, 'idle', 2, 'lib:armF'), [s.hand.x, s.hand.y], 1.5, 'the near hand is where the hand socket is');
  near(at(d, 'idle', 2, 'lib:armB'), [s.offhand.x, s.offhand.y], 1.5, 'the far hand is where the offhand socket is');
  // nothing in the hand: no sword handle
  const bare = { ...d, body: { ...d.body, figure: { ...d.body.figure, held: { ...d.body.figure.held, kind: 'none' } } } };
  assert.ok(!L.libraryHandles(bare, 'idle', 2).some((h) => h.id === 'lib:item'));
  // a frame nudged on the Frames tab moves its handles with it
  const moved = X.setFrameEdit(d, 'idle', 2, { nudge: [2, -1] });
  near(at(moved, 'idle', 2, 'lib:armF'), [s.hand.x + 2, s.hand.y - 1], 1.5, 'nudged');
  assert.deepEqual(L.libraryHandles(d, 'nope', 0), []);
  assert.deepEqual(L.libraryHandles(X.startFrom('blob', 'x'), 'idle', 0), []);
});

test('dragging the near hand up: the arm follows (shoulder and elbow), only that frame\'s key changes', () => {
  const d = theHero();
  const h0 = at(d, 'idle', 2, 'lib:armF');
  const target = [h0[0] + 2, h0[1] - 8];
  const r = valid(L.dragLibrary(d, 'idle', 2, 'lib:armF', target), 'hand up');
  near(at(r, 'idle', 2, 'lib:armF'), target, 1.5, 'the hand reached the point');
  const k = r.clips.idle.keys[2], k0 = d.clips.idle.keys[2];
  assert.ok(k.armF.a !== k0.armF.a && k.armF.e !== k0.armF.e, 'both the shoulder and the elbow turned');
  for (const i of [0, 1, 3, 4]) assert.deepEqual(r.clips.idle.keys[i], d.clips.idle.keys[i], `key ${i} unchanged`);
  assert.equal(L.libraryChanged(r, 'idle', 2).includes('lib:armF'), true);
  // a point it cannot reach: the hand goes as far as the arm does, nothing breaks
  const far = valid(L.dragLibrary(d, 'idle', 2, 'lib:armF', [h0[0] + 60, h0[1] - 60]), 'out of reach');
  assert.ok(Math.hypot(...at(far, 'idle', 2, 'lib:armF').map((v, i) => v - h0[i])) > 4, 'it reached toward it');
  // not a number: nothing changes
  assert.deepEqual(L.dragLibrary(d, 'idle', 2, 'lib:armF', [NaN, 3]), d);
});

test('dragging a foot, the hips, the head and the sword', () => {
  const d = theHero();
  const f0 = at(d, 'walk', 0, 'lib:footF');
  const r = valid(L.dragLibrary(d, 'walk', 0, 'lib:footF', [f0[0] + 3, f0[1] - 2]), 'foot');
  near(at(r, 'walk', 0, 'lib:footF'), [f0[0] + 3, f0[1] - 2], 1.2, 'the foot went there');
  const hip0 = at(d, 'idle', 0, 'lib:hip');
  const crouch = valid(L.dragLibrary(d, 'idle', 0, 'lib:hip', [hip0[0] + 2, hip0[1] + 3]), 'hips down');
  near(at(crouch, 'idle', 0, 'lib:hip'), [hip0[0] + 2, hip0[1] + 3], 1.2, 'the hips went there');
  for (const id of ['lib:head', 'lib:lean', 'lib:item']) {
    const a = at(d, 'idle', 0, id);
    const moved = valid(L.dragLibrary(d, 'idle', 0, id, [a[0] + 3, a[1]]), id);
    assert.ok(at(moved, 'idle', 0, id)[0] > a[0] + 0.5, `${id} moved toward the point`);
  }
  // the arrows: one press moves a handle, never nothing
  for (const id of ['lib:armF', 'lib:footB', 'lib:hip', 'lib:head', 'lib:item']) {
    const n = L.nudgeLibraryHandle(d, 'idle', 0, id, 1, 0);
    assert.notDeepEqual(n.clips.idle.keys[0], d.clips.idle.keys[0], `${id} nudged`);
    valid(n, `${id} nudged`);
  }
  // edit.js hands library handles over: the same handles and drags as for a bone rig
  assert.deepEqual(X.handles(d, { mode: 'move', clip: 'idle', frame: 2 }).map((h) => h.id), L.libraryHandles(d, 'idle', 2).map((h) => h.id));
  assert.deepEqual(X.handles(d, { mode: 'body' }), []);
  const viaEdit = X.dragHandle(d, { mode: 'move', clip: 'idle', frame: 2 }, 'lib:armF', [at(d, 'idle', 2, 'lib:armF')[0], at(d, 'idle', 2, 'lib:armF')[1] - 5]);
  assert.notDeepEqual(viaEdit.clips.idle.keys[2], d.clips.idle.keys[2]);
  const nudged = X.nudgeHandle(d, { mode: 'move', clip: 'idle', frame: 2 }, 'lib:footF', 0, -1);
  assert.notDeepEqual(nudged.clips.idle.keys[2], d.clips.idle.keys[2]);
});

test('posing a frame without a key adds one there holding only the field moved', () => {
  const d = theHero();
  const c = d.clips.idle;
  const one = { ...d, clips: { ...d.clips, idle: { ...c, keys: [c.keys[0], c.keys[4]] } } };
  const h = at(one, 'idle', 2, 'lib:footF');
  const r = valid(L.dragLibrary(one, 'idle', 2, 'lib:footF', [h[0] + 2, h[1]]), 'new key');
  assert.equal(r.clips.idle.keys.length, 3);
  const k = r.clips.idle.keys.find((x) => Math.abs(x.t - framePhase(c, 2)) < 1e-9);
  assert.deepEqual(Object.keys(k).sort(), ['footF', 't']);
});

test('a new animation on the Hero starts as a copy of Idle, made from the idle pose (so body changes move it too)', () => {
  const d = theHero();
  const r = X.addClip(d, 'wave', { label: 'Wave' });
  assert.ok(!r.error, r.error);
  const v = valid(r.def, 'wave');
  assert.equal(v.clips.wave.from, 'idle');
  assert.equal(v.clips.wave.keys.length, 8);
  assert.equal(v.clips.wave.label, 'Wave');
  const lively = valid(L.setProportion(v, 'bounce', 1), 'livelier with wave');
  assert.ok(lively.clips.wave.keys.some((k, i) => Math.abs(k.crouch - v.clips.wave.keys[i].crouch) > 0.05), 'the new animation moved with the body');
});

test('start this clip over from a pose of the body (bake)', () => {
  const d = theHero();
  const choices = L.startOverChoices(d, 'walk');
  assert.ok(choices.options.some((o) => o.value === 'walk' && o.label === 'Walk'));
  assert.ok(choices.options.some((o) => o.value === 'victory'));
  assert.equal(choices.value, 'walk');
  for (const o of choices.options) assert.ok(!/[_]/.test(o.label) && o.label[0] === o.label[0].toUpperCase(), o.label);
  // hand changes go, the formula comes back, the sounds stay
  const posed = X.nudgeLibrary(d, 'walk', 2, 'footF', 3, 0);
  const r = L.startOver(posed, 'walk', 'walk');
  assert.ok(!r.error);
  assert.deepEqual(valid(r.def, 'started over').clips.walk.keys, d.clips.walk.keys);
  assert.deepEqual(r.def.clips.walk.sounds, d.clips.walk.sounds);
  assert.equal(r.keys, 8);
  // another pose, at this clip's own frame count; a swing gets its light keys
  const six = X.setFrames(d, 'block', 6).def;
  const s = L.startOver(six, 'block', 'attack');
  const v = valid(s.def, 'block from attack');
  assert.equal(v.clips.block.from, 'attack');
  assert.equal(v.clips.block.frames, 6);
  assert.ok(s.light > 0, 'the swing light needs keys between frames');
  // hurt starts on its white flash, as a frame edit, never a key
  const h = L.startOver(d, 'hurt', 'hurt');
  assert.equal(h.def.clips.hurt.frameEdits['0'].flash, true);
  assert.ok(!h.def.clips.hurt.keys.some((k) => 'flash' in k));
  // a pose the body does not have, or a bone rig: refused in words
  assert.match(L.startOver(d, 'walk', 'moonwalk').error, /not a way/i);
  assert.match(L.startOver(X.startFrom('blob', 'x'), 'idle', 'idle').error, /library/i);
});

test('attach points where the body puts them, on the rest pose', () => {
  const d = theHero();
  const pts = L.librarySockets(d);
  assert.deepEqual(pts.map((p) => p.id).sort(), ['back', 'feet', 'hand', 'head', 'offhand']);
  for (const p of pts) { assert.ok(p.label); assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); }
  const s = spriteSockets(d, { clip: 'idle', frame: 0 });
  assert.deepEqual(pts.find((p) => p.id === 'hand'), { id: 'hand', label: 'Hand', x: s.hand.x, y: s.hand.y });
  assert.ok(figureFor(d).held, 'the figure is unchanged by reading it');
});
