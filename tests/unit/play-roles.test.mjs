// Playground (architecture.md, Contract 9): what each thing in the bag does is decided by its metadata, never by its id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleOf, rowFromSprite, rowFromPatch, planScene } from '../../app/play/roles.js';
import { validateMeta } from '../../catalog/schema.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { all as fixtures, walker, tilesSide, tilesTop, backdrop } from '../fixtures/play/index.js';

const sprite = (id, type, role, view = 'side') => ({ id, kind: 'sprite', name: id, type, role, view });
const sound = (id, role = 'actions/hit', type = 'sfx') => ({ id, kind: 'sound', name: id, type, role, view: null });
const entry = (row, soundIds = []) => ({ key: 'k-' + row.id, row, soundIds });

test('a role comes from type, role and kind', () => {
  assert.equal(roleOf(sprite('a', 'character', 'characters/player')), 'player');
  assert.equal(roleOf(sprite('a', 'creature', 'characters/player')), 'player');
  assert.equal(roleOf(sprite('a', 'creature', 'characters/enemy')), 'creature');
  assert.equal(roleOf(sprite('a', 'character', 'characters/boss')), 'creature');
  assert.equal(roleOf(sprite('a', 'creature', 'characters/animal')), 'creature');
  assert.equal(roleOf(sprite('a', 'character', 'characters/npc')), 'npc');
  assert.equal(roleOf(sprite('a', 'pickup', 'items/pickup', 'front')), 'pickup');
  assert.equal(roleOf(sprite('a', 'prop', 'items/key')), 'pickup');
  assert.equal(roleOf(sprite('a', 'prop', 'world/prop')), 'prop');
  assert.equal(roleOf(sprite('a', 'prop', 'world/door')), 'prop');
  assert.equal(roleOf(sprite('a', 'effect', 'effects/explosion')), 'effect');
  assert.equal(roleOf(sprite('a', 'projectile', 'effects/projectile')), 'projectile');
  assert.equal(roleOf(sprite('a', 'tileset', 'world/tile')), 'tiles');
  assert.equal(roleOf(sprite('a', 'background', 'environment/background')), 'background');
  assert.equal(roleOf(sprite('a', 'ui', 'interface/button', 'front')), 'display');
  assert.equal(roleOf(sprite('a', 'icon', 'items/icon', 'front')), 'display');
  assert.equal(roleOf(sprite('a', 'icon', 'interface/icon', 'front')), 'display', 'a set of portraits is never the player');
  assert.equal(roleOf(sprite('a', 'character', 'interface/icon', 'front')), 'display');
  assert.equal(roleOf(sound('a')), 'sound');
  assert.equal(roleOf({ id: 'a', kind: 'music', type: 'music', role: 'music/battle' }), 'music');
});

test('the id never decides the role', () => {
  assert.equal(roleOf(sprite('coin', 'creature', 'characters/enemy')), 'creature');
  assert.equal(roleOf(sprite('knight', 'pickup', 'items/pickup')), 'pickup');
});

test('a mixed bag is sorted into a scene', () => {
  const plan = planScene([
    entry(sprite('hero', 'character', 'characters/player'), ['step', 'slash']),
    entry(sprite('mage', 'character', 'characters/player')),
    entry(sprite('slime', 'creature', 'characters/enemy'), ['thud']),
    entry(sprite('gem', 'pickup', 'items/pickup', 'front'), ['ding']),
    entry(sprite('fire', 'prop', 'world/prop')),
    entry(sprite('boom', 'effect', 'effects/explosion')),
    entry(sprite('bricks', 'tileset', 'world/tile')),
    entry(sprite('hills', 'background', 'environment/background')),
    entry(sprite('heart', 'icon', 'interface/icon', 'front')),
    entry(sound('ding', 'items/pickup')),
    entry(sound('click', 'interface/click')),
    entry({ id: 'tune', kind: 'music', name: 'Tune', type: 'music', role: 'music/battle' }),
  ]);
  assert.equal(plan.mode, 'side');
  assert.equal(plan.player, 'k-hero');
  assert.deepEqual(plan.players, ['k-hero', 'k-mage']);
  assert.equal(plan.roles['k-mage'], 'npc', 'a playable character that was not picked stands in the scene');
  assert.deepEqual(plan.scene, ['k-mage', 'k-slime', 'k-gem', 'k-fire', 'k-boom']);
  assert.deepEqual(plan.tilesets, ['k-bricks']);
  assert.equal(plan.background, 'k-hills');
  assert.deepEqual(plan.display, ['k-heart']);
  assert.deepEqual(plan.music, ['k-tune']);
  assert.deepEqual(plan.board, ['k-click'], 'only sounds that no sprite plays get a button');
  assert.deepEqual(plan.attached, ['k-ding']);
  assert.equal(plan.empty, false);
  assert.equal(plan.soundsOnly, false);
});

test('the visitor can pick another player; every tileset in the bag is used', () => {
  const entries = [
    entry(sprite('hero', 'character', 'characters/player')),
    entry(sprite('scout', 'character', 'characters/player', 'top-down')),
    entry(sprite('bricks', 'tileset', 'world/tile')),
    entry(sprite('grass', 'tileset', 'world/tile')),
  ];
  const plan = planScene(entries, { player: 'k-scout' });
  assert.equal(plan.player, 'k-scout');
  assert.equal(plan.mode, 'top', 'the mode follows the player that was picked');
  assert.equal(plan.roles['k-hero'], 'npc');
  assert.deepEqual(plan.tilesets, ['k-bricks', 'k-grass']);
  assert.equal(planScene(entries, { player: 'nope' }).player, 'k-hero', 'an unknown pick falls back to the first');
});

test('the view of the player picks the mode; with no player the other sprites decide', () => {
  assert.equal(planScene([entry(sprite('p', 'character', 'characters/player', 'top-down'))]).mode, 'top');
  assert.equal(planScene([entry(sprite('p', 'character', 'characters/player', 'front'))]).mode, 'side');
  assert.equal(planScene([entry(sprite('s', 'creature', 'characters/enemy', 'top-down'))]).mode, 'top');
  assert.equal(planScene([entry(sprite('s', 'creature', 'characters/enemy', 'top-down')), entry(sprite('t', 'creature', 'characters/enemy', 'side'))]).mode, 'side');
  const noPlayer = planScene([entry(sprite('s', 'creature', 'characters/enemy'))]);
  assert.equal(noPlayer.player, null);
  assert.deepEqual(noPlayer.scene, ['k-s']);
});

test('an empty bag and a bag of sounds are told apart', () => {
  const none = planScene([]);
  assert.equal(none.empty, true);
  const only = planScene([entry(sound('click', 'interface/click')), entry({ id: 'tune', kind: 'music', type: 'music', role: 'music/menu' })]);
  assert.equal(only.empty, false);
  assert.equal(only.soundsOnly, true);
  assert.deepEqual(only.board, ['k-click']);
  assert.deepEqual(only.scene, []);
});

test('a row can be made from a sprite or a sound itself, for assets that are not in the catalogue', () => {
  const row = rowFromSprite(walker);
  assert.equal(row.kind, 'sprite');
  assert.equal(row.id, 'play-walker');
  assert.equal(row.type, 'character');
  assert.equal(row.role, 'characters/player');
  assert.equal(row.view, 'top-down');
  assert.deepEqual(row.tech.frame, [48, 48]);
  assert.deepEqual(row.tech.pivot, [24, 42]);
  assert.equal(row.tech.grounded, true);
  assert.equal(row.stripClip, 'walk_down');
  assert.deepEqual(row.tech.clips.map((c) => c.name).slice(0, 6), ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side']);
  assert.equal(roleOf(row), 'player');
  assert.equal(roleOf(rowFromSprite(tilesSide)), 'tiles');
  assert.equal(roleOf(rowFromSprite(tilesTop)), 'tiles');
  assert.equal(roleOf(rowFromSprite(backdrop)), 'background');
  const music = rowFromPatch({ id: 't', name: 'T', category: 'music', loop: true, meta: { type: 'music', role: 'music/menu' } });
  assert.equal(music.kind, 'music');
  assert.equal(roleOf(music), 'music');
  assert.equal(roleOf(rowFromPatch({ id: 's', name: 'S', category: 'ui', meta: { type: 'sfx', role: 'interface/click' } })), 'sound');
});

test('the fixture assets follow the style guide: frame sizes, pivots and names', () => {
  assert.deepEqual([tilesSide.size, tilesSide.pivot, tilesTop.size], [[32, 32], [16, 16], [32, 32]]);
  assert.deepEqual([backdrop.size, Object.keys(backdrop.clips)], [[320, 180], ['far', 'mid', 'near']]);
  assert.deepEqual([walker.size, walker.pivot], [[48, 48], [24, 42]]);
  for (const def of [tilesSide, tilesTop]) assert.ok(Object.keys(def.clips).length <= 32);
});

test('the fixture assets carry valid metadata and draw something in every clip', () => {
  for (const def of fixtures) {
    const v = validateMeta(def.meta, 'sprite');
    assert.deepEqual(v.errors, [], def.id);
    for (const [clip, c] of Object.entries(def.clips)) {
      for (let f = 0; f < c.frames; f++) assert.ok(renderFrame(def, clip, f, defaultParams(def)).bounds(), `${def.id} ${clip} frame ${f} is empty`);
    }
  }
});
