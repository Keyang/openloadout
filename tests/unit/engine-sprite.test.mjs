// Sprite definition, parameters, frames and sheets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, defaultParams, cleanParams, randomParams, renderFrame, renderSheet, range, choice, color, toggle, clipFps } from '../../engine/sprite.js';
import { sprites } from '../../sprites/index.js';

const base = () => ({
  id: 'test-blob', name: 'Test blob', size: [16, 16], pivot: [8, 15],
  params: {
    size: range('Size', 0.5, { min: 0, max: 1 }),
    mood: choice('Mood', 'calm', ['calm', 'angry']),
    tint: color('Tint', '#ff0000', ['#ff0000', '#00ff00']),
    glow: toggle('Glow', false),
  },
  clips: { idle: { frames: 4, fps: 6 }, hit: { frames: 3, fps: 10, loop: false } },
  render(g, { t, p }) { g.ellipse(8, 9 + Math.sin(t * 6.28), 3 + p.size * 4, 4, p.tint); },
});

test('defineSprite rejects a missing required field', () => {
  for (const k of ['id', 'name', 'size', 'pivot', 'params', 'clips', 'render']) {
    const d = base(); delete d[k];
    assert.throws(() => defineSprite(d), new RegExp(`missing "${k}"`), k);
  }
});

test('defineSprite rejects a bad id, a clip without frames or fps, and sounds on a missing clip', () => {
  assert.throws(() => defineSprite({ ...base(), id: 'Bad Id' }), /lowercase/);
  assert.throws(() => defineSprite({ ...base(), clips: { a: { frames: 0, fps: 5 } } }), /frames/);
  assert.throws(() => defineSprite({ ...base(), clips: { a: { frames: 2 } } }), /fps/);
  assert.throws(() => defineSprite({ ...base(), sounds: { nope: [{ sound: 'x', frame: 0 }] } }), /does not exist/);
  assert.throws(() => defineSprite({ ...base(), sounds: { idle: [{ sound: 'x', frame: 9 }] } }), /outside/);
});

test('defineSprite fills defaults', () => {
  const s = defineSprite(base());
  assert.equal(s.kind, 'Character');
  assert.equal(s.preview, 'idle');
  assert.equal(s.clips.idle.loop, true);
  assert.equal(s.clips.hit.loop, false);
  assert.equal(s.clips.idle.label, 'Idle');
  assert.deepEqual(s.sounds, {});
});

test('cleanParams clamps ranges, rejects bad choices and colours, coerces toggles', () => {
  const s = defineSprite(base());
  const p = cleanParams(s, { size: 7, mood: 'sleepy', tint: 'red', glow: 'true' });
  assert.equal(p.size, 1);
  assert.equal(p.mood, 'calm');
  assert.equal(p.tint, '#ff0000');
  assert.equal(p.glow, true);
  assert.equal(cleanParams(s, { size: -3 }).size, 0);
  assert.equal(cleanParams(s, { size: 'abc' }).size, 0.5);
  assert.equal(cleanParams(s, { tint: '#00FF00' }).tint, '#00ff00');
  assert.deepEqual(cleanParams(s), defaultParams(s));
});

test('randomParams is deterministic for a seed and always valid', () => {
  const s = defineSprite(base());
  assert.deepEqual(randomParams(s, 5), randomParams(s, 5));
  const p = randomParams(s, 9);
  assert.deepEqual(cleanParams(s, p), p);
});

test('renderFrame is deterministic and draws something', () => {
  const s = defineSprite(base());
  const a = renderFrame(s, 'idle', 2, defaultParams(s)), b = renderFrame(s, 'idle', 2, defaultParams(s));
  assert.deepEqual([...a.data], [...b.data]);
  assert.ok(a.bounds());
  assert.throws(() => renderFrame(s, 'missing', 0, defaultParams(s)), /no clip/);
});

test('one-shot clips reach t = 1 on their last frame, loops stop short of it', () => {
  const seen = {};
  const s = defineSprite({ ...base(), render(g, a) { seen[a.clip + a.frame] = a.t; } });
  renderFrame(s, 'hit', 2, {}); renderFrame(s, 'idle', 3, {});
  assert.equal(seen.hit2, 1);
  assert.equal(seen.idle3, 0.75);
});

test('renderSheet metadata shape', () => {
  const s = defineSprite(base());
  const p = defaultParams(s);
  const sh = renderSheet(s, p, { scale: 2 });
  assert.equal(sh.w, 4 * 16 * 2);
  assert.equal(sh.h, 2 * 16 * 2);
  assert.equal(sh.data.length, sh.w * sh.h);
  const m = sh.meta;
  assert.equal(m.app, 'Loadout');
  assert.equal(m.sprite, 'test-blob');
  assert.equal(m.image, 'test-blob.png');
  assert.equal(m.frameWidth, 32); assert.equal(m.frameHeight, 32);
  assert.deepEqual(m.pivot, { x: 16, y: 30 });
  assert.equal(m.facing, 'right');
  assert.deepEqual(m.animations.idle, { row: 0, frames: 4, fps: 6, loop: true });
  assert.deepEqual(m.animations.hit, { row: 1, frames: 3, fps: 10, loop: false });
  assert.equal(m.frames.length, 7);
  assert.deepEqual(m.frames[4], { name: 'hit_0', animation: 'hit', x: 0, y: 32, w: 32, h: 32, duration: 100 });
  assert.deepEqual(m.params, p);
});

test('clipFps accepts a function and never goes below 1', () => {
  const s = defineSprite({ ...base(), clips: { a: { frames: 2, fps: (p) => p.size * 10 } } });
  assert.equal(clipFps(s, 'a', { size: 0.5 }), 5);
  assert.equal(clipFps(s, 'a', { size: 0 }), 1);
});

test('every shipped sprite renders every clip deterministically with its defaults', () => {
  assert.ok(sprites.length >= 7);
  for (const s of sprites) {
    const p = defaultParams(s);
    for (const clip of Object.keys(s.clips)) {
      const a = renderFrame(s, clip, 0, p), b = renderFrame(s, clip, 0, p);
      assert.deepEqual([...a.data], [...b.data], `${s.id}/${clip}`);
      assert.ok(a.bounds(), `${s.id}/${clip} is empty`);
    }
  }
});
