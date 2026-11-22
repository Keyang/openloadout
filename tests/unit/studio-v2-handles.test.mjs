// The studio's handles on a version 2 picture (app/studio/v2-handles.js): the anchor, a rig's bone tips and IK ends,
// dragged or nudged by whole pixels into a new definition; a clip taken from its base becomes keys of its own.
//   node --test tests/unit/studio-v2-handles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nodePieceStore } from '../../tools/lib/pieces-index.mjs';
import { checkFull } from '../../app/studio/v2-check.js';
import { renderFrame, cleanParams } from '../../engine/sprite.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import * as H from '../../app/studio/v2-handles.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const KNIGHT = read('../../sprites/knight.json');
const COIN = read('../fixtures/v2/coin.json');
const WARDEN = read('../../sprites/barrow-warden.json');
const pieces = nodePieceStore();
await pieces.loadFor(KNIGHT);
const clips = (def, clip, frame = 0) => ({ mode: 'clips', clip, frame, pieces });
const body = () => ({ mode: 'body', pieces });
const px = (def, clip, frame) => { const m = makeDataSprite(def, { pieces }); assert.ok(m.ok, m.errors?.join('; ')); return Buffer.from(renderFrame(m.sprite, clip, frame, cleanParams(m.sprite, {})).data.buffer).toString('base64'); };

test('every body has the anchor, and only a rig has more', () => {
  const h = H.handles(COIN, body());
  assert.deepEqual(h.map((x) => x.id), ['pivot']);
  assert.deepEqual(h[0].at, COIN.pivot);
  const k = H.handles(KNIGHT, clips(KNIGHT, 'walk', 2));
  const ids = k.map((x) => x.id);
  assert.equal(ids[0], 'pivot');
  assert.ok(ids.includes('root') && ids.includes('ik:legF') && ids.includes('ik:legB'));
  assert.ok(ids.some((i) => i.startsWith('bone:')));
  // a foot is one handle: the bones of a chain have no tip handles of their own
  assert.ok(!ids.includes('bone:shinF') && !ids.includes('bone:thighF'));
});

test('setPivot moves the anchor by whole pixels and keeps it inside the frame; the definition is not changed', () => {
  const before = JSON.stringify(COIN);
  const a = H.setPivot(COIN, [3.6, 5.2]);
  assert.deepEqual(a.pivot, [4, 5]);
  assert.deepEqual(H.setPivot(COIN, [-9, 999]).pivot, [0, COIN.size[1] - 1]);
  assert.equal(JSON.stringify(COIN), before);
  assert.deepEqual(H.nudgeHandle(COIN, body(), 'pivot', 1, -1).pivot, [COIN.pivot[0] + 1, COIN.pivot[1] - 1]);
  assert.deepEqual(H.dragHandle(COIN, body(), 'pivot', [2, 2]).pivot, [2, 2]);
});

test('"Snap to the feet" puts a rig\'s anchor under the body on the ground row', () => {
  const f = H.feetPivot(KNIGHT, body());
  assert.deepEqual(f, [28, 58]);
  assert.deepEqual(H.feetPivot(COIN, body()), COIN.pivot);
});

test('dragging a foot in a clip frame sets that frame\'s ik key (the clip was its base\'s: it becomes the sprite\'s own keys)', () => {
  assert.equal(KNIGHT.clips.walk.keys, undefined);
  const ctx = clips(KNIGHT, 'walk', 2);
  const foot = H.handles(KNIGHT, ctx).find((x) => x.id === 'ik:legF');
  const next = H.dragHandle(KNIGHT, ctx, 'ik:legF', [foot.at[0] + 4, foot.at[1] - 3]);
  const c = next.clips.walk;
  assert.equal(c.from, undefined);
  assert.ok(Array.isArray(c.keys) && c.keys.length >= 8);
  const key = c.keys.find((k) => Math.abs(k.t - 2 / 8) < 0.001);
  assert.ok(key && Array.isArray(key.ik?.legF) && key.ik.legF.every(Number.isInteger));
  // the foot is where it was dragged to (to a pixel)
  const now = H.handles(next, ctx).find((x) => x.id === 'ik:legF');
  assert.ok(Math.abs(now.at[0] - (foot.at[0] + 4)) <= 1 && Math.abs(now.at[1] - (foot.at[1] - 3)) <= 1, `${now.at} vs ${foot.at}`);
  assert.equal(KNIGHT.clips.walk.keys, undefined, 'the old definition is not changed');
  assert.ok(checkFull(next, { pieces }).ok, 'still passes');
});

test('taking a clip from its base does not change the picture', () => {
  const ctx = clips(KNIGHT, 'walk', 3);
  const same = H.dragHandle(KNIGHT, ctx, 'ik:legF', H.handles(KNIGHT, ctx).find((x) => x.id === 'ik:legF').at);
  for (let f = 0; f < 8; f++) assert.ok(px(same, 'walk', f) === px(KNIGHT, 'walk', f), `frame ${f} changed`);
});

test('dragging a bone tip in a frame turns it on that frame\'s key, inside its joint limits; a nudge always turns it', () => {
  const ctx = clips(KNIGHT, 'idle', 0);
  const bone = H.handles(KNIGHT, ctx).find((x) => x.kind === 'bone');
  assert.ok(bone, 'a bone handle');
  const id = bone.id.slice(5);
  const next = H.dragHandle(KNIGHT, ctx, bone.id, [bone.at[0] + 5, bone.at[1] + 5]);
  const key = next.clips.idle.keys.find((k) => Math.abs(k.t) < 0.001);
  assert.ok(Number.isInteger(key.bones[id]));
  const turned = H.nudgeHandle(KNIGHT, ctx, bone.id, 1, 0);
  assert.notEqual(JSON.stringify(turned), JSON.stringify(KNIGHT));
  assert.ok(checkFull(turned, { pieces }).ok);
});

test('the whole body moves on the frame\'s root key', () => {
  const ctx = clips(KNIGHT, 'idle', 1);
  const r = H.handles(KNIGHT, ctx).find((x) => x.id === 'root');
  const next = H.dragHandle(KNIGHT, ctx, 'root', [r.at[0] + 2, r.at[1]]);
  const key = next.clips.idle.keys.find((k) => Math.abs(k.t - 1 / 8) < 0.001);
  assert.ok(Array.isArray(key.root) && key.root.every(Number.isInteger));
});

test('Body: a bone the sprite writes itself has its rest angle and length set by its tip; a base\'s bones have no handle', () => {
  const kb = H.handles(KNIGHT, body()).map((x) => x.id);
  assert.ok(kb.includes('bone:lift'), kb.join());
  assert.ok(!kb.some((i) => i === 'bone:spine'));
  const w = H.handles(WARDEN, body());
  const tip = w.find((x) => x.id.startsWith('bone:'));
  assert.ok(tip, 'the warden writes its bones');
  const id = tip.id.slice(5);
  const next = H.dragHandle(WARDEN, body(), tip.id, [tip.at[0] + 3, tip.at[1] + 3]);
  const b = next.body.rig.bones.find((x) => x.id === id);
  const was = WARDEN.body.rig.bones.find((x) => x.id === id);
  assert.ok(Number.isInteger(b.angle) && Number.isInteger(b.length));
  assert.ok(b.angle !== was.angle || b.length !== was.length);
  assert.equal(JSON.stringify(H.dragHandle(KNIGHT, body(), 'bone:spine', [1, 1])), JSON.stringify(KNIGHT));
  const r = H.handles(WARDEN, body()).find((x) => x.id === 'root');
  const moved = H.dragHandle(WARDEN, body(), 'root', [r.at[0] + 2, r.at[1] - 1]);
  const rb = moved.body.rig.bones.find((x) => x.parent == null);
  const rw = WARDEN.body.rig.bones.find((x) => x.parent == null);
  assert.deepEqual(rb.at, [rw.at[0] + 2, rw.at[1] - 1]);
});

test('the solved skeleton: a line per bone; nothing for a body without bones', () => {
  const s = H.skeleton(KNIGHT, clips(KNIGHT, 'walk', 0));
  assert.ok(Object.keys(s.J.bones).length > 20);
  assert.equal(H.skeleton(COIN, body()), null);
});

test('bad input changes nothing', () => {
  assert.equal(JSON.stringify(H.dragHandle(KNIGHT, body(), 'pivot', [NaN, 1])), JSON.stringify(KNIGHT));
  assert.equal(JSON.stringify(H.dragHandle(KNIGHT, clips(KNIGHT, 'nope', 0), 'ik:legF', [1, 1])), JSON.stringify(KNIGHT));
  assert.equal(JSON.stringify(H.dragHandle(KNIGHT, body(), 'ik:legF', [1, 1])), JSON.stringify(KNIGHT));
  assert.deepEqual(H.handles(null, body()), []);
});
