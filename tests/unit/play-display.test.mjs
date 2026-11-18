// Playground: the pure parts of the page. How an interface piece is shown, how fast each background
// layer slides, the words under the scene, and whether a sprite is the visitor's own version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { displayPlan, fillSpan } from '../../app/play/display.js';
import { layerSpeed, layerShift, drawOrder } from '../../app/play/layers.js';
import { howTo, plural, roleNote, keysLine } from '../../app/play/words.js';
import { isCustom } from '../../app/play/kinds.js';
import { defineSprite, range, choice } from '../../engine/sprite.js';

const one = { frames: 1, fps: 1, loop: true }, moving = { frames: 8, fps: 8, loop: true };
const clips = (spec) => Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, v]));

test('an interface piece is shown by what its clips are', () => {
  assert.deepEqual(displayPlan(clips({ frame: one, fill: one, 'fill-b': one, flash: { frames: 4, fps: 8, loop: false } })), { kind: 'bar', frame: 'frame', fill: 'fill' });
  assert.deepEqual(displayPlan(clips({ 'heart-full': one, 'heart-half': one, 'heart-empty': one })), { kind: 'glyphs', full: 'heart-full', empty: 'heart-empty' });
  assert.deepEqual(displayPlan(clips({ normal: one, hover: one, pressed: one, disabled: one })), { kind: 'button', rest: 'normal', hover: 'hover', pressed: 'pressed' });
  assert.deepEqual(displayPlan(clips({ normal: one })), { kind: 'button', rest: 'normal', hover: null, pressed: null });
  assert.deepEqual(displayPlan(clips({ idle: moving }), 'idle'), { kind: 'set', clips: ['idle'] });
});

test('a set shows every clip, however many and whether or not they move', () => {
  const digits = clips(Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`digit-${i}`, one])));
  assert.equal(displayPlan(digits).kind, 'set');
  assert.equal(displayPlan(digits).clips.length, 14, 'none is cut off');
  // a panel set with a bouncing cursor: every clip, side by side, not one resting clip
  assert.deepEqual(displayPlan(clips({ panel: one, row: one, cursor: moving, 'turn-marker': moving }), 'panel'), { kind: 'set', clips: ['panel', 'row', 'cursor', 'turn-marker'] });
  assert.deepEqual(displayPlan(clips({ box: one, 'name-tag': one, choice: one, next: moving })).clips, ['box', 'name-tag', 'choice', 'next']);
});

test('a bar is filled to a value inside its opening', () => {
  const opening = { x: 6, y: 4, w: 50, h: 8 };
  assert.deepEqual(fillSpan(opening, 64, 1), { x: 6, w: 50 });
  assert.deepEqual(fillSpan(opening, 64, 0.5), { x: 6, w: 25 });
  assert.deepEqual(fillSpan(opening, 64, 0), { x: 6, w: 0 });
  assert.deepEqual(fillSpan(opening, 64, 2 / 3), { x: 6, w: 33 });
  assert.deepEqual(fillSpan(null, 64, 0.5), { x: 0, w: 32 }, 'no opening told: the whole frame');
  assert.deepEqual(fillSpan(opening, 64, 7), { x: 6, w: 50 });
});

test('background layers slide at different speeds: far 0.1, mid 0.4, near 0.7 of the camera', () => {
  assert.deepEqual(['far', 'mid', 'near'].map((c, i) => layerSpeed(c, i, 3)), [0.1, 0.4, 0.7]);
  assert.equal(layerSpeed('near', 0, 1), 0.7, 'the name decides, not the position');
  const odd = ['a', 'b', 'c', 'd'].map((c, i) => layerSpeed(c, i, 4));
  assert.deepEqual(odd.map((v) => Math.round(v * 100) / 100), [0.1, 0.3, 0.5, 0.7], 'other names: spread from the first to the last');
  assert.equal(new Set(odd).size, 4);
  assert.equal(layerSpeed('sky', 0, 1), 0.1);
  // after the camera has moved 100 px the three layers have moved 10, 40 and 70
  assert.deepEqual(['far', 'mid', 'near'].map((c, i) => layerShift(100, layerSpeed(c, i, 3), 320)), [10, 40, 70]);
  assert.equal(layerShift(3300, 0.1, 320), 10, 'and wrap at the width of a layer');
  assert.equal(layerShift(-10, 1, 320), 310);
});

test('top-down, things are drawn in the order of their pivot rows, so the player walks behind trees and buildings', () => {
  const tree = { n: 1, role: 'prop', y: 200 }, house = { n: 2, role: 'prop', y: 120 }, coin = { n: 3, role: 'pickup', y: 200 };
  const above = { n: 9, role: 'player', y: 180 }, below = { n: 9, role: 'player', y: 230 };
  const order = (list) => drawOrder(list, 'top').map((t) => t.n);
  assert.deepEqual(order([above, tree, house, coin]), [2, 9, 1, 3], 'a player above the foot of the tree is behind it');
  assert.deepEqual(order([tree, below, house, coin]), [2, 1, 3, 9], 'a player below it is in front');
  // side view keeps its layers: props behind pickups behind creatures behind the player, whatever their height
  const side = drawOrder([{ n: 4, role: 'player', y: 10 }, { n: 1, role: 'creature', y: 300 }, { n: 2, role: 'prop', y: 500 }, { n: 3, role: 'pickup', y: 0 }, { n: 5, role: 'effect', y: 0, passing: 'burst' }], 'side');
  assert.deepEqual(side.map((t) => t.n), [2, 3, 1, 4, 5]);
});

test('the line for someone who has never played is built from what is in the scene', () => {
  assert.equal(howTo({ mode: 'side', player: true, ledges: true, pickup: 'Coin', enemy: 'Slime' }), 'Jump onto the ledges, collect the coins, press X next to the slime.');
  assert.equal(howTo({ mode: 'side', player: true, ledges: true }), 'Jump onto the ledges.');
  assert.equal(howTo({ mode: 'side', player: true, ledges: true, prop: 'Campfire' }), 'Jump onto the ledges, press X next to the campfire.');
  assert.equal(howTo({ mode: 'top', player: true, pickup: 'Gold key', enemy: 'Cave Bat' }), 'Walk round the room, collect the gold keys, press X next to the cave bat.');
  assert.equal(howTo({ mode: 'side', player: false, pickup: 'Coin' }), '', 'nobody to play: nothing to say');
  assert.deepEqual(['Coin', 'Torch', 'Berry', 'Box', 'Glass', 'Leaf pile'].map(plural), ['coins', 'torches', 'berries', 'boxes', 'glasses', 'leaf piles']);
});

test('the words say only what can happen', () => {
  assert.match(roleNote('creature', { player: true }), /hurts it/);
  assert.doesNotMatch(roleNote('creature', { player: false }), /hurt|attack|X/);
  assert.doesNotMatch(roleNote('prop', { player: false }), /X|next to/);
  assert.doesNotMatch(roleNote('pickup', { player: false }), /Walk into/);
  assert.match(roleNote('display', { player: true }), /score and health/i);
  const side = keysLine({ mode: 'side', player: true, block: true, dodge: false });
  assert.match(side, /X to attack or use things/);
  assert.match(side, /Space to jump/);
  assert.match(side, /C to block/);
  assert.doesNotMatch(side, /dodge|your action/);
  assert.doesNotMatch(keysLine({ mode: 'top', player: true }), /jump/i);
  assert.equal(keysLine({ mode: 'side', player: false }), 'Arrow keys move the view.');
});

test('a sprite the visitor changed is told apart from one as it was made', () => {
  const s = defineSprite({ id: 'x', name: 'X', size: [8, 8], pivot: [4, 7], params: { size: range('Size', 0.5), hat: choice('Hat', 'none', ['none', 'cap']) }, clips: { idle: { frames: 1, fps: 1 } }, sounds: { idle: [{ sound: 'hum', frame: 0 }] }, render(g) { g.rect(2, 2, 4, 4, '#c9423a'); } });
  assert.equal(isCustom(s, {}), false);
  assert.equal(isCustom(s, { params: {}, cues: null }), false);
  assert.equal(isCustom(s, { params: { size: 0.5, hat: 'none' } }), false, 'the same values as made');
  assert.equal(isCustom(s, { params: { hat: 'cap' } }), true);
  assert.equal(isCustom(s, { params: {}, cues: { idle: [{ sound: 'hum', frame: 0, preset: null, params: null, volume: 1 }] } }), false, 'its own sounds, written out');
  assert.equal(isCustom(s, { params: {}, cues: { idle: [] } }), true, 'a sound taken off');
  assert.equal(isCustom(s, { params: {}, cues: { idle: [{ sound: 'hum', frame: 0, volume: 0.4 }] } }), true);
});
