// The studio page, part 2: what the Move and Frames tabs add for every body (docs/studio.md sections 3 and 5; item
// S10): the keys between frames (the Hero's swing light) shown and removable, Mirror legs where the body has two
// sides, and Sounds on this frame chosen from the library's sound effects by name.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../app/studio/clip-tools.js';
import * as X from '../../app/studio/edit.js';
import { hero } from '../../rigs/humanoid-studio.js';
import { validateDataSprite } from '../../engine/data-sprite.js';
import { framePhase } from '../../rigs/keypose.js';

const valid = (d, what) => { const v = validateDataSprite(d); assert.equal(v.ok, true, `${what}: ${v.errors.join('; ')}`); return v.value; };
const theHero = () => valid(hero(), 'the hero');
const start = (id) => valid(X.startFrom(id, 'Test'), id);

test('keys between frames: the Hero\'s swing light, each between the two frames it sits between', () => {
  const d = theHero();
  const light = C.lightKeys(d, 'attack');
  assert.equal(light.length, 6, 'docs/studio.md 3: 14 keys for 8 frames');
  const c = d.clips.attack;
  for (const k of light) {
    assert.equal(k.before, k.after + 1);
    assert.ok(k.t > framePhase(c, k.after) && k.t < framePhase(c, k.before), `${k.t} lies between frames ${k.after} and ${k.before}`);
  }
  assert.equal(C.lightLabel(d, 'attack'), 'Swing light');
  assert.deepEqual(C.lightKeys(d, 'walk'), []);
  assert.deepEqual(C.lightKeys(d, 'nope'), []);
  // the frames' own keys are not among them
  assert.equal(X.keyFrames(d, 'attack').size, 8);
  // removed: only the frames' keys stay
  const r = valid(C.removeLightKeys(d, 'attack'), 'no light');
  assert.equal(r.clips.attack.keys.length, 8);
  assert.deepEqual(C.lightKeys(r, 'attack'), []);
  // a frame-count change merges them into frames (snapKeys): none stay between frames
  const six = X.setFrames(d, 'attack', 6).def;
  assert.deepEqual(C.lightKeys(six, 'attack'), []);
});

test('Mirror legs: offered where the body has two sides', () => {
  assert.equal(C.canMirror(theHero()), true);
  for (const id of ['two-legs', 'four-legs', 'crawler', 'topdown-person', 'topdown-beast']) assert.equal(C.canMirror(start(id)), true, id);
  for (const id of ['blob', 'blank', 'flyer']) assert.equal(C.canMirror(start(id)), false, id);
});

test('Mirror legs on the Hero: near and far foot swap on this frame only', () => {
  const d = theHero();
  const k = d.clips.walk.keys[0];
  const r = valid(C.mirrorLegs(d, 'walk', 0), 'mirrored');
  assert.deepEqual(r.clips.walk.keys[0].footF, k.footB);
  assert.deepEqual(r.clips.walk.keys[0].footB, k.footF);
  assert.deepEqual(r.clips.walk.keys[1], d.clips.walk.keys[1]);
  // twice is as it was
  assert.deepEqual(C.mirrorLegs(r, 'walk', 0).clips.walk.keys[0], d.clips.walk.keys[0]);
});

test('Mirror legs on a bone rig: the paired feet swap targets, paired leg bones swap how far they turn from rest', () => {
  const d = start('two-legs');
  const pose = X.keyedPose(d, 'walk', 0);
  const r = valid(C.mirrorLegs(d, 'walk', 0), 'two legs');
  const after = X.keyedPose(r, 'walk', 0);
  assert.deepEqual(after.ik.footN, pose.ik.footF);
  assert.deepEqual(after.ik.footF, pose.ik.footN);
  // a frame with no key gets one, holding the swap
  const four = start('four-legs');
  const keyless = X.deleteKey(four, 'walk', 1);
  const p1 = X.keyedPose(keyless, 'walk', 1);
  const m = valid(C.mirrorLegs(keyless, 'walk', 1), 'four legs');
  assert.ok(X.keyIndexAt(m, 'walk', 1) >= 0);
  assert.deepEqual(X.keyedPose(m, 'walk', 1).ik.foreN, p1.ik.foreF);
  assert.deepEqual(X.keyedPose(m, 'walk', 1).ik.hindF, p1.ik.hindN);
  // top-down left and right legs: the turn away from each leg's own rest is swapped, and how far each is stretched
  const td = start('topdown-person');
  const side = valid(C.mirrorLegs(td, 'walk_side', 0), 'top-down side');
  const rig = X.rigFor(td, 'walk_side');
  const rest = (id) => rig.bones.find((b) => b.id === id).angle;
  const before = X.keyedPose(td, 'walk_side', 0).bones;
  const now = X.keyedPose(side, 'walk_side', 0).bones;
  assert.ok(Math.abs((now.legL - rest('legL')) - (before.legR - rest('legR'))) < 1e-9);
  assert.ok(Math.abs((now.legR - rest('legR')) - (before.legL - rest('legL'))) < 1e-9);
  const down = valid(C.mirrorLegs(td, 'walk_down', 0), 'top-down down');
  const s0 = X.keyedPose(td, 'walk_down', 0).stretch, s1 = X.keyedPose(down, 'walk_down', 0).stretch;
  assert.equal(s1.legL, s0.legR);
  assert.equal(s1.legR, s0.legL);
  assert.equal(s1.armL, s0.armL, 'arms are not legs');
  // nothing to mirror: unchanged
  const blob = start('blob');
  assert.deepEqual(C.mirrorLegs(blob, 'idle', 0), blob);
});

test('Sounds on this frame: added by name, given how it sounds and how loud, removed', () => {
  const d = theHero();
  assert.deepEqual(C.cuesAt(d, 'walk', 0).map((c) => c.sound), ['footstep-gravel']);
  assert.deepEqual(C.cuesAt(d, 'walk', 1), []);
  const a = C.addCue(d, 'walk', 1, 'jump', 'Big leap');
  assert.ok(!a.error);
  const v = valid(a.def, 'added');
  const cues = C.cuesAt(v, 'walk', 1);
  assert.equal(cues.length, 1);
  assert.deepEqual({ sound: cues[0].sound, frame: cues[0].frame, preset: cues[0].preset }, { sound: 'jump', frame: 1, preset: 'Big leap' });
  const quiet = valid(C.setCue(v, 'walk', cues[0].index, { volume: 0.4 }), 'quieter');
  assert.equal(C.cuesAt(quiet, 'walk', 1)[0].volume, 0.4);
  const loud = valid(C.setCue(quiet, 'walk', cues[0].index, { volume: 9 }), 'held to 1');
  assert.equal(C.cuesAt(loud, 'walk', 1)[0].volume, 1);
  const other = valid(C.setCue(quiet, 'walk', cues[0].index, { preset: null }), 'no preset');
  assert.equal(C.cuesAt(other, 'walk', 1)[0].preset, undefined);
  const gone = valid(C.removeCue(quiet, 'walk', cues[0].index), 'removed');
  assert.deepEqual(C.cuesAt(gone, 'walk', 1), []);
  assert.equal(gone.clips.walk.sounds.length, d.clips.walk.sounds.length);
  // a bone rig takes them too; not a sound id, or past the limit: said in words
  const b = start('blob');
  assert.ok(!C.addCue(b, 'idle', 0, 'slime-squelch').error);
  assert.match(C.addCue(b, 'idle', 0, 'Not a sound!').error, /sound/i);
  let many = b;
  for (let i = 0; i < 16; i++) many = C.addCue(many, 'idle', i % 4, 'jump').def;
  assert.match(C.addCue(many, 'idle', 0, 'jump').error, /16/);
});

test('the library\'s sound effects by name, in groups, music left out', () => {
  const patches = [
    { id: 'jump', name: 'Jump', category: 'movement', presets: { 'Big leap': {}, Small: {} } },
    { id: 'coin', name: 'Coin', category: 'pickup' },
    { id: 'theme', name: 'Theme', category: 'music' },
    { id: 'arrow', name: 'Arrow hit', category: 'impact' },
    { id: 'body-fall', name: 'Body fall', category: 'impact' },
  ];
  const groups = C.soundChoices(patches);
  assert.deepEqual(groups.map((g) => g.label), ['Impact', 'Movement', 'Pickup']);
  assert.deepEqual(groups[0].sounds.map((s) => s.name), ['Arrow hit', 'Body fall']);
  assert.ok(!groups.flatMap((g) => g.sounds).some((s) => s.id === 'theme'));
  assert.deepEqual(C.presetsOf(patches[0]), ['Big leap', 'Small']);
  assert.deepEqual(C.presetsOf(patches[1]), []);
  assert.equal(C.soundName('body-fall', patches), 'Body fall');
  assert.equal(C.soundName('lost-one', patches), 'Lost one');
});
