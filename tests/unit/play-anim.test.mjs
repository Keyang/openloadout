// Playground: an animation steps through its frames, and a sound fires exactly once when its frame is reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnim, advance, seek, cuesAt } from '../../app/play/anim.js';
import { activeCues, buildKind, makeKind } from '../../app/play/kinds.js';
import { defineSprite, choice } from '../../engine/sprite.js';
import { walker } from '../fixtures/play/index.js';
import { rowFromSprite } from '../../app/play/roles.js';

const LOOP = { frames: 4, fps: 10, loop: true };
const ONCE = { frames: 4, fps: 10, loop: false };

function run(anim, info, seconds, dt = 1 / 60) {
  const seen = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) seen.push(...advance(anim, info, dt));
  return seen;
}

test('every frame is reached once, in order', () => {
  assert.deepEqual(run(createAnim('walk'), LOOP, 0.38), [0, 1, 2, 3]);
  assert.deepEqual(run(createAnim('walk'), LOOP, 0.78), [0, 1, 2, 3, 0, 1, 2, 3], 'a loop starts again');
  const a = createAnim('attack');
  assert.deepEqual(run(a, ONCE, 2), [0, 1, 2, 3], 'a one-shot plays once');
  assert.equal(a.done, true);
  assert.equal(a.frame, 3, 'and rests on its last frame');
});

test('a slow frame rate does not repeat a frame, a long step does not skip one', () => {
  assert.deepEqual(run(createAnim('idle'), { frames: 2, fps: 2, loop: true }, 0.4), [0]);
  const a = createAnim('walk');
  assert.deepEqual(advance(a, LOOP, 0.25), [0, 1, 2]);
  assert.deepEqual(advance(a, LOOP, 0.1), [3]);
});

test('a sound fires exactly once when its frame is reached', () => {
  const cues = [{ sound: 'slash', frame: 2 }, { sound: 'hum', frame: 0, loop: true }];
  const a = createAnim('attack');
  const fired = [];
  for (let i = 0; i < 120; i++) fired.push(...cuesAt(cues, advance(a, ONCE, 1 / 60)).map((c) => c.sound));
  assert.deepEqual(fired, ['slash'], 'once, and a looping sound is not fired from a frame');
  const b = createAnim('walk');
  const steps = [];
  for (let i = 0; i < 48; i++) steps.push(...cuesAt([{ sound: 'step', frame: 1 }], advance(b, LOOP, 1 / 60)).map((c) => c.sound));
  assert.equal(steps.length, 2, 'once each time round a loop: 0.8 seconds is two passes');
});

test('a sprite that is standing on a held frame makes no sound', () => {
  const a = createAnim('walk_up', { hold: true });
  assert.deepEqual(run(a, LOOP, 1), []);
  assert.equal(a.frame, 0);
});

test('a clip can be moved by hand (a jump follows the jump, not the clock)', () => {
  const a = createAnim('jump');
  assert.deepEqual(seek(a, { frames: 8, fps: 10, loop: false }, 0), [0]);
  assert.deepEqual(seek(a, { frames: 8, fps: 10, loop: false }, 0), []);
  assert.deepEqual(seek(a, { frames: 8, fps: 10, loop: false }, 3), [1, 2, 3]);
  assert.deepEqual(seek(a, { frames: 8, fps: 10, loop: false }, 2), [], 'never backwards');
  assert.deepEqual(seek(createAnim('jump', { start: 4 }), { frames: 8, fps: 10, loop: false }, 5), [4, 5], 'a fall starts half way through');
});

const armed = defineSprite({
  id: 'armed', name: 'Armed', size: [8, 8], pivot: [4, 7],
  params: { weapon: choice('Weapon', 'sword', ['none', 'sword']) },
  clips: { idle: { frames: 2, fps: 4 }, attack: { frames: 4, fps: 10, loop: false } },
  sounds: { attack: [{ sound: 'slash', frame: 2, when: { weapon: ['sword'] } }, { sound: 'whoosh', frame: 2, when: { weapon: ['none'] } }, { sound: 'grunt', frame: 0 }] },
  render(g, { p }) { g.rect(2, 1, 4, 6, '#c9423a'); if (p.weapon === 'sword') g.rect(6, 0, 1, 5, '#c2c9d6'); },
});

test('a sound that only applies to some settings respects them', () => {
  const sounds = (p, stored) => activeCues(armed, stored, p).attack.map((c) => c.sound);
  assert.deepEqual(sounds({ weapon: 'sword' }), ['slash', 'grunt']);
  assert.deepEqual(sounds({ weapon: 'none' }), ['whoosh', 'grunt']);
  // the bag keeps the visitor's own list, each sound with its `when`
  const stored = { attack: [{ sound: 'slash', frame: 2, preset: null, params: null, volume: 0.5, when: { weapon: ['sword'] } }, { sound: 'whoosh', frame: 2, preset: null, params: null, volume: 1, when: { weapon: ['none'] } }, { sound: 'beep', frame: 1, preset: null, params: null, volume: 1 }] };
  assert.deepEqual(sounds({ weapon: 'none' }, stored), ['whoosh', 'beep']);
  assert.deepEqual(sounds({ weapon: 'sword' }, stored), ['slash', 'beep']);
  assert.equal(activeCues(armed, stored, { weapon: 'sword' }).attack[0].volume, 0.5, 'the visitor\'s own volume is kept');
});

test('firing through a built sprite: the sword sound plays once per swing and never without a sword', () => {
  const fire = (weapon) => {
    const kind = buildKind({ key: 'k', sprite: armed, settings: { params: { weapon } } }, 'player');
    const a = createAnim('attack');
    const out = [];
    for (let i = 0; i < 60; i++) out.push(...cuesAt(kind.cues.attack, advance(a, kind.clips.attack, 1 / 60)).map((c) => c.sound));
    return out;
  };
  assert.deepEqual(fire('sword'), ['grunt', 'slash']);
  assert.deepEqual(fire('none'), ['grunt', 'whoosh']);
});

test('a built sprite knows its size, where it stands, its clips and where a shot leaves it', () => {
  const kind = buildKind({ key: 'w1', sprite: walker, row: rowFromSprite(walker), settings: {} }, 'player', { isLoop: (id) => id === 'hum' });
  assert.equal(kind.key, 'w1');
  assert.equal(kind.id, 'play-walker');
  assert.equal(kind.role, 'player');
  assert.equal(kind.view, 'top-down');
  assert.deepEqual(kind.pivot, [24, 42]);
  assert.equal(kind.rest, 'idle_down');
  assert.equal(kind.clips.walk_down.fps, 10);
  assert.equal(kind.clips.walk_down.speed, 26);
  assert.ok(kind.box.l > 4 && kind.box.l <= 12 && kind.box.r > 4 && kind.box.r <= 12, 'the body is narrower than the frame');
  assert.ok(kind.box.t > 24 && kind.box.t <= 36);
  assert.equal(kind.lift, 0, 'it stands on the ground');
  assert.equal(kind.cues.walk_side[0].sound, 'footstep-gravel');
  assert.equal(kind.cues.walk_side[0].loop, false);
  assert.equal(kind.clips.attack_side.hitFrame, 3, 'the hit lands where the swing sounds');
  assert.deepEqual(kind.clips.attack_side.fire, { dx: 12, dy: 12 }, 'from the muzzle socket, measured from the pivot');
  assert.equal(kind.clips.attack_up.fire.dy, 28);
  const plain = makeKind({ key: 'x', role: 'pickup', clips: { spin: { frames: 4, fps: 8 } } });
  assert.equal(plain.clips.spin.loop, true);
  assert.deepEqual(plain.clipNames, ['spin']);
});

const shape = (over) => defineSprite({
  id: 'shape', name: 'Shape', size: [48, 48], pivot: [24, 42], params: {}, clips: { idle: { frames: 1, fps: 1 } },
  render(g) { const [px, py] = this.pivot; g.rect(px - 8, py - 16, 16, 16, '#c9423a'); },
  ...over,
});

test('where a thing stands comes from its pivot and whether it is on the ground', () => {
  const stand = buildKind({ key: 'a', sprite: shape({}), settings: {} }, 'creature');
  assert.deepEqual([stand.lift, stand.flying], [0, false]);
  // a flyer: pivot at its middle, not on the ground. It hovers clear of the ground
  const flyer = buildKind({ key: 'b', sprite: shape({ pivot: [24, 24], grounded: false }), settings: {} }, 'creature');
  assert.equal(flyer.flying, true);
  assert.ok(flyer.lift >= 30, `a flyer hovers (${flyer.lift})`);
  // an effect with its pivot at its middle still sits on the ground, not half under it
  const effect = buildKind({ key: 'c', sprite: shape({ pivot: [24, 24], render(g) { g.rect(16, 16, 16, 16, '#c9423a'); } }), settings: {} }, 'effect');
  assert.equal(effect.lift, 7, 'raised by what would be under the ground line');
  // a boss in a big frame stands on its pivot row
  const boss = buildKind({ key: 'd', sprite: shape({ size: [96, 96], pivot: [44, 90], render(g) { g.rect(20, 30, 50, 60, '#c9423a'); } }), settings: {} }, 'creature', { hp: 8 });
  assert.deepEqual([boss.lift, boss.hp, boss.box.t], [0, 8, 60]);
  // the catalogue row wins when it is there, and its stripClip is what a thing with no idle rests on
  const coin = defineSprite({ id: 'c2', name: 'C', size: [32, 32], pivot: [16, 30], grounded: false, preview: 'spin', params: {}, clips: { collect: { frames: 2, fps: 8, loop: false }, spin: { frames: 2, fps: 8 } }, render(g) { g.rect(10, 12, 12, 12, '#e6c545'); } });
  const k = buildKind({ key: 'e', sprite: coin, row: { stripClip: 'spin', tech: { pivot: [16, 30], grounded: false } }, settings: {} }, 'pickup');
  assert.equal(k.rest, 'spin');
  assert.ok(k.lift >= 6 && k.lift <= 10);
});
