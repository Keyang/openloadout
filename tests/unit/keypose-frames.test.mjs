// S2 (docs/studio.md, section 8): the key blender on frames. A key's t is the phase engine/sprite.js gives a frame;
// a clip's pose at a frame; keys snapped to frames when the frame count changes (journey c).
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, renderFrame, frameSockets } from '../../engine/sprite.js';
import { framePhase, frameOfPhase, clipPose, blendKeys, snapKeys } from '../../rigs/keypose.js';

const CLIPS = {
  loop8: { frames: 8, fps: 10, loop: true },
  loop5: { frames: 5, fps: 10, loop: true },
  once6: { frames: 6, fps: 10, loop: false },
  once1: { frames: 1, fps: 1, loop: false },
  loop1: { frames: 1, fps: 1, loop: true },
  once64: { frames: 64, fps: 30, loop: false },
};

test('framePhase equals the phase engine/sprite.js gives render and sockets, for every frame of every kind of clip', () => {
  const seen = [];
  const clips = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, { ...c }]));
  const probe = defineSprite({
    id: 'keypose-probe', name: 'Probe', size: [8, 8], pivot: [4, 7], params: {}, clips,
    render(g, ctx) { seen.push(ctx.t); },
    sockets(clip, t) { return { tip: { x: t, y: 0, angle: 0 } }; },
  });
  for (const [name, c] of Object.entries(CLIPS)) {
    for (let f = 0; f < c.frames; f++) {
      seen.length = 0;
      renderFrame(probe, name, f, {});
      assert.equal(framePhase(c, f), seen[0], `${name} frame ${f}: render`);
      assert.equal(framePhase(c, f), frameSockets(probe, name, f, {}).tip.x, `${name} frame ${f}: sockets`);
    }
  }
  // a loop stops short of 1; a one-shot ends on it
  assert.equal(framePhase(CLIPS.loop8, 7), 7 / 8);
  assert.equal(framePhase(CLIPS.once6, 5), 1);
  assert.equal(framePhase({ frames: 4 }, 2), 0.5);           // loop is the default, as defineSprite's
});

test('frameOfPhase finds the frame a phase is nearest, and undoes framePhase', () => {
  for (const c of Object.values(CLIPS)) for (let f = 0; f < c.frames; f++) assert.equal(frameOfPhase(c, framePhase(c, f)), f);
  assert.equal(frameOfPhase(CLIPS.loop8, 0.97), 0);           // wraps round a loop
  assert.equal(frameOfPhase(CLIPS.loop8, 0.3), 2);
  assert.equal(frameOfPhase(CLIPS.once6, 0.97), 5);
  assert.equal(frameOfPhase(CLIPS.once6, 2), 5);               // clamped
  assert.equal(frameOfPhase(CLIPS.once6, -1), 0);
  assert.equal(frameOfPhase(CLIPS.once1, 0.7), 0);
  assert.equal(frameOfPhase(CLIPS.loop8, NaN), 0);
});

test('clipPose is the blend at the frame phase, closed for loops', () => {
  const walk = {
    frames: 8, fps: 10, loop: true,
    keys: [
      { t: 0, root: [0, 0], ik: { footF: [4, 0], footB: [-4, 0] }, bones: { tail1: 170 } },
      { t: 0.25, root: [0, -1], ik: { footF: [0, 0], footB: [0, -2] }, bones: { tail1: 190 } },
      { t: 0.5, root: [0, 0], ik: { footF: [-4, 0], footB: [4, 0] }, bones: { tail1: 170 } },
      { t: 0.75, root: [0, -1], ik: { footF: [0, -2], footB: [0, 0] }, bones: { tail1: 190 } },
    ],
  };
  for (let f = 0; f < 8; f++) assert.deepEqual(clipPose(walk, f), blendKeys(walk.keys, f / 8, { loop: true }));
  // keys on frames 0, 2, 4, 6 are drawn exactly (contacts on 0 and 4, as style guide 4 asks)
  assert.deepEqual(clipPose(walk, 0).ik, { footF: [4, 0], footB: [-4, 0] });
  assert.deepEqual(clipPose(walk, 4).ik, { footF: [-4, 0], footB: [4, 0] });
  // the frame after the last runs back toward the first: frame 7 is between the t = 0.75 key and t = 0 (+1)
  const f7 = clipPose(walk, 7);
  assert.ok(f7.bones.tail1 > 170 && f7.bones.tail1 < 190);
  // a one-shot reaches its last key on its last frame; base is passed through
  const bite = { frames: 6, fps: 12, loop: false, keys: [{ t: 0, bones: { head: 0 } }, { t: 1, bones: { head: 30 } }] };
  assert.equal(clipPose(bite, 5).bones.head, 30);
  assert.equal(clipPose(bite, 0, { base: { lean: 2 } }).lean, 2);
  // no keys, broken clip: an empty pose, no throw
  assert.deepEqual(clipPose({ frames: 4 }, 1), {});
  assert.deepEqual(clipPose(null, 1), {});
});

test('snapKeys keeps keys at their place in the motion, on frames, and merges keys that land together', () => {
  const keys = [
    { t: 0, root: [0, 0], bones: { a: 1, b: 1 } },
    { t: 0.25, ease: 'linear', root: [0, -1] },
    { t: 0.3, bones: { b: 5 } },
    { t: 0.5, root: [0, 0] },
    { t: 0.97, bones: { a: 9 } },
  ];
  const r = snapKeys(keys, { frames: 6, loop: true });
  // 6 frames: phases 0, 1/6, 2/6, 3/6, 4/6, 5/6. 0.25 -> frame 2 (1.5 rounds up), 0.3 -> frame 2, 0.97 -> frame 0 (wraps)
  assert.deepEqual(r.keys.map((k) => k.t), [0, 2 / 6, 3 / 6]);
  // later keys' fields win, maps merge field by field; the ease of the later key that sets one wins
  assert.deepEqual(r.keys[0], { t: 0, root: [0, 0], bones: { a: 9, b: 1 } });
  assert.deepEqual(r.keys[1], { t: 2 / 6, ease: 'linear', root: [0, -1], bones: { b: 5 } });
  // the note says which frames took more than one key
  assert.deepEqual(r.merged, [{ frame: 0, keys: 2 }, { frame: 2, keys: 2 }]);
  // the input is not changed
  assert.equal(keys[1].t, 0.25); assert.deepEqual(keys[0].bones, { a: 1, b: 1 });
  // a one-shot: 0.97 goes to the last frame, not round to the first
  const once = snapKeys(keys, { frames: 6, loop: false });
  assert.equal(once.keys.at(-1).t, 1);
  // keys already on frames are unchanged
  const on = [{ t: 0, lift: 0 }, { t: 0.5, lift: 1 }];
  assert.deepEqual(snapKeys(on, { frames: 8, loop: true }), { keys: on, merged: [] });
  assert.deepEqual(snapKeys(undefined, { frames: 8 }), { keys: [], merged: [] });
});

test('one-shot flags and shapes change on their key frame, not before (the bite and hurt from review)', () => {
  const bite = { frames: 6, loop: false, keys: [{ t: 0, bones: { jaw: 0 } }, { t: 0.4, bones: { jaw: -20 } }, { t: 0.8, bones: { jaw: 10 }, show: ['mouthOpen'] }] };
  const shown = [0, 1, 2, 3, 4, 5].map((f) => clipPose(bite, f).show.includes('mouthOpen'));
  assert.deepEqual(shown, [false, false, false, false, true, true]);
  const hurt = { frames: 4, loop: false, keys: [{ t: 0, lean: 0 }, { t: 0.66, flash: true }, { t: 1, flash: false }] };
  assert.deepEqual([0, 1, 2, 3].map((f) => clipPose(hurt, f).flash), [undefined, undefined, true, false]);
  assert.deepEqual([0, 1, 2, 3].map((f) => clipPose(hurt, f, { base: { flash: false } }).flash), [false, false, true, false]);
});

test('snapKeys merges show and hide per shape: the later key decides, and no shape ends in both lists', () => {
  const keys = [
    { t: 0.3, show: ['a', 'b'], hide: ['c'] },
    { t: 0.32, hide: ['a'], show: ['d'] },
  ];
  const r = snapKeys(keys, { frames: 4, loop: true });
  assert.equal(r.keys.length, 1);
  assert.deepEqual(r.keys[0], { t: 0.25, show: ['b', 'd'], hide: ['c', 'a'] });
  assert.deepEqual(r.merged, [{ frame: 1, keys: 2 }]);
});
