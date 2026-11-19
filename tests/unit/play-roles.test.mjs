// Playground (architecture.md, Contract 9): what each thing in the bag does is decided by its metadata, never by its id.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { roleOf, rowFromSprite, rowFromPatch, planScene, fitsMode } from '../../app/play/roles.js';
import { validateMeta } from '../../catalog/schema.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { all as fixtures, walker, tilesSide, tilesTop, backdrop } from '../fixtures/play/index.js';

const sprite = (id, type, role, view = 'side') => ({ id, kind: 'sprite', name: id, type, role, view });
const sound = (id, role = 'actions/hit', type = 'sfx') => ({ id, kind: 'sound', name: id, type, role, view: null });
const entry = (row, soundIds = []) => ({ key: 'k-' + row.id, row, soundIds });
// every kit on disk (bundles/kit-*.json): the tests below are about whatever kits there are, not about named ones
const bundleDir = new URL('../../bundles/', import.meta.url);
const kits = fs.readdirSync(bundleDir).filter((f) => /^kit-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(new URL(f, bundleDir), 'utf8')))
  .filter((kit) => kit.sprites.every((id) => fs.existsSync(new URL(`../../sprites/${id}.js`, import.meta.url))));

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

test('tiles made for the other view are left out of the scene', () => {
  const entries = [
    entry(sprite('hero', 'character', 'characters/player')),
    entry(sprite('forest', 'tileset', 'world/tile', 'side')),
    entry(sprite('meadow', 'tileset', 'world/tile', 'top-down')),
    entry(sprite('any', 'tileset', 'world/tile', 'none')),
  ];
  const side = planScene(entries);
  assert.equal(side.mode, 'side');
  assert.deepEqual(side.tilesets, ['k-forest', 'k-any']);
  assert.deepEqual(side.otherTiles, ['k-meadow']);
  const top = planScene([entry(sprite('scout', 'character', 'characters/player', 'top-down')), ...entries.slice(1)]);
  assert.deepEqual(top.tilesets, ['k-meadow', 'k-any']);
  assert.deepEqual(top.otherTiles, ['k-forest']);
  // with no player, tiles decide the view like everything else does
  assert.equal(planScene([entry(sprite('meadow', 'tileset', 'world/tile', 'top-down'))]).mode, 'top');
  assert.deepEqual(planScene([entry(sprite('meadow', 'tileset', 'world/tile', 'top-down'))]).tilesets, ['k-meadow']);
});

test('the visitor can pick another player of the scene\'s view; every tileset of that view is used', () => {
  const entries = [
    entry(sprite('hero', 'character', 'characters/player')),
    entry(sprite('scout', 'character', 'characters/player', 'top-down')),
    entry(sprite('ranger', 'character', 'characters/player', 'top-down')),
    entry(sprite('bricks', 'tileset', 'world/tile', 'top-down')),
    entry(sprite('grass', 'tileset', 'world/tile', 'top-down')),
  ];
  const plan = planScene(entries, { top: { player: 'k-ranger' } });
  assert.equal(plan.mode, 'top', 'the ground is seen from above');
  assert.equal(plan.player, 'k-ranger');
  assert.equal(plan.roles['k-scout'], 'npc');
  assert.deepEqual(plan.players, ['k-scout', 'k-ranger'], 'only characters drawn for this view can be played');
  assert.deepEqual(plan.leftOut, ['k-hero'], 'the side-view hero is left out, not walked round a top-down room');
  assert.deepEqual(plan.tilesets, ['k-bricks', 'k-grass']);
  assert.equal(planScene(entries, { top: { player: 'nope' } }).player, 'k-scout', 'an unknown pick falls back to the first');
  assert.equal(planScene(entries, { top: { player: 'k-hero' } }).player, 'k-scout', 'and so does a pick from the other view');
});

test('one character alone decides the view; with no character the other sprites do', () => {
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

// ---- which view the scene opens in, and what is left out of it ------------------------------------------------

const ids = (plan, keys) => keys.map((k) => k.slice(2));
const hero = () => entry(sprite('hero', 'character', 'characters/player', 'side'));
const scout = () => entry(sprite('scout', 'character', 'characters/player', 'top-down'));

test('a thing fits a view unless it was drawn for the other one', () => {
  assert.equal(fitsMode('side', 'side'), true);
  assert.equal(fitsMode('side', 'top'), false);
  assert.equal(fitsMode('top-down', 'top'), true);
  assert.equal(fitsMode('top-down', 'side'), false);
  for (const any of ['front', 'none', null, undefined]) assert.deepEqual([fitsMode(any, 'side'), fitsMode(any, 'top')], [true, true], `view ${any} fits both`);
});

test('ground tiles drawn from above open the scene top-down, whatever comes first in the bag', () => {
  const plan = planScene([
    hero(),
    entry(sprite('slime', 'creature', 'characters/enemy', 'side')),
    entry(sprite('wolf', 'creature', 'characters/enemy', 'side')),
    entry(sprite('bat', 'creature', 'characters/enemy', 'side')),
    scout(),
    entry(sprite('meadow', 'tileset', 'world/tile', 'top-down')),
  ]);
  assert.equal(plan.mode, 'top', 'four side-view things, but the ground is seen from above');
  assert.equal(plan.why, 'tiles');
  assert.equal(plan.player, 'k-scout', 'the player is one drawn for this view');
  // and the other way round
  const side = planScene([scout(), entry(sprite('elder', 'character', 'characters/npc', 'top-down')), entry(sprite('inn', 'prop', 'world/building', 'top-down')), hero(), entry(sprite('forest', 'tileset', 'world/tile', 'side'))]);
  assert.equal(side.mode, 'side');
  assert.equal(side.why, 'tiles');
  assert.equal(side.player, 'k-hero');
});

test('with no ground tiles, or tiles for both views, the scene opens in the view most things were drawn for', () => {
  const mostlyTop = [hero(), scout(), entry(sprite('elder', 'character', 'characters/npc', 'top-down')), entry(sprite('inn', 'prop', 'world/building', 'top-down')), entry(sprite('coin', 'pickup', 'items/pickup', 'front'))];
  const plan = planScene(mostlyTop);
  assert.equal(plan.mode, 'top');
  assert.equal(plan.why, 'most');
  assert.equal(plan.player, 'k-scout');
  const mostlySide = [scout(), hero(), entry(sprite('slime', 'creature', 'characters/enemy', 'side')), entry(sprite('fire', 'prop', 'world/prop', 'side'))];
  assert.equal(planScene(mostlySide).mode, 'side');
  // tiles for both views do not decide: the rest of the bag does
  const both = [...mostlyTop, entry(sprite('forest', 'tileset', 'world/tile', 'side')), entry(sprite('meadow', 'tileset', 'world/tile', 'top-down'))];
  assert.equal(planScene(both).mode, 'top');
  assert.equal(planScene(both).why, 'most');
  // as many of one as of the other: the first character the visitor can play as decides
  assert.equal(planScene([hero(), scout()]).mode, 'side');
  assert.equal(planScene([scout(), hero()]).mode, 'top');
  // things that fit both views (a coin seen from the front, an effect) never decide
  assert.equal(planScene([entry(sprite('coin', 'pickup', 'items/pickup', 'front')), entry(sprite('boom', 'effect', 'effects/explosion', 'none'))]).mode, 'side');
  assert.equal(planScene([entry(sprite('coin', 'pickup', 'items/pickup', 'front'))]).why, 'only');
});

test('nothing drawn for one view is put in the other view\'s scene; what is left out is listed', () => {
  const bag = [
    hero(), scout(),
    entry(sprite('slime', 'creature', 'characters/enemy', 'side')),
    entry(sprite('bug', 'creature', 'characters/enemy', 'top-down')),
    entry(sprite('chest', 'prop', 'world/prop', 'top-down')),
    entry(sprite('fire', 'prop', 'world/prop', 'side')),
    entry(sprite('coin', 'pickup', 'items/pickup', 'front')),
    entry(sprite('boom', 'effect', 'effects/explosion', 'none')),
    entry(sprite('spell', 'effect', 'effects/magic', 'side')),
    entry(sprite('arrow', 'projectile', 'effects/projectile', 'side')),
    entry(sprite('bolt', 'projectile', 'effects/projectile', 'top-down')),
    entry(sprite('forest', 'tileset', 'world/tile', 'side')),
    entry(sprite('meadow', 'tileset', 'world/tile', 'top-down')),
    entry(sprite('hills', 'background', 'environment/background', 'side')),
    entry(sprite('stars', 'background', 'environment/background', 'none')),
    entry(sprite('heart', 'icon', 'interface/icon', 'front')),
    entry(sound('click', 'interface/click')),
  ];
  const viewOf = Object.fromEntries(bag.map((e) => [e.key, e.row.view]));
  for (const mode of ['side', 'top']) {
    const plan = planScene(bag, { mode });
    assert.equal(plan.mode, mode);
    assert.equal(plan.why, 'chosen');
    const placed = [plan.player, ...plan.players, ...plan.scene, plan.projectile, ...plan.tilesets, plan.background, ...plan.backgrounds];
    for (const key of placed) assert.equal(fitsMode(viewOf[key], mode), true, `${key} (${viewOf[key]}) in a ${mode} scene`);
    assert.ok(plan.leftOut.length > 0);
    for (const key of plan.leftOut) assert.equal(fitsMode(viewOf[key], mode), false, `${key} is left out only because of its view`);
    // everything is either used or left out: nothing vanishes without a word
    const used = new Set([...placed, ...plan.display, ...plan.board, ...plan.attached, ...plan.music, ...plan.leftOut]);
    for (const e of bag) assert.ok(used.has(e.key) || plan.roles[e.key] === 'projectile', `${e.key} is accounted for`);
  }
  const side = planScene(bag, { mode: 'side' }), top = planScene(bag, { mode: 'top' });
  assert.deepEqual(ids(side, side.leftOut), ['scout', 'bug', 'chest', 'bolt', 'meadow'], 'in bag order');
  assert.deepEqual(ids(top, top.leftOut), ['hero', 'slime', 'fire', 'spell', 'arrow', 'forest', 'hills']);
  assert.deepEqual(side.otherTiles, ['k-meadow']);
  assert.deepEqual(ids(side, side.scene), ['slime', 'fire', 'coin', 'boom', 'spell']);
  assert.deepEqual(ids(top, top.scene), ['bug', 'chest', 'coin', 'boom']);
  assert.deepEqual([side.projectile, top.projectile], ['k-arrow', 'k-bolt']);
  assert.deepEqual([side.backgrounds, top.backgrounds], [['k-hills', 'k-stars'], ['k-stars']]);
  assert.deepEqual(side.display, top.display, 'interface pieces are shown in both');
});

test('the switch is offered only when the bag has things for both views, and each view keeps its own picks', () => {
  const bag = [hero(), entry(sprite('mage', 'character', 'characters/player', 'side')), scout(), entry(sprite('ranger', 'character', 'characters/player', 'top-down')), entry(sprite('coin', 'pickup', 'items/pickup', 'front'))];
  assert.deepEqual(planScene(bag).modes, ['side', 'top']);
  assert.deepEqual(planScene([hero(), entry(sprite('coin', 'pickup', 'items/pickup', 'front'))]).modes, ['side']);
  assert.deepEqual(planScene([scout()]).modes, ['top']);
  assert.deepEqual(planScene([entry(sprite('coin', 'pickup', 'items/pickup', 'front'))]).modes, ['side'], 'things that fit both open in side view');
  // a choice of a view the bag has nothing for is not kept
  assert.equal(planScene([hero()], { mode: 'top' }).mode, 'side');
  assert.equal(planScene([scout()], { mode: 'side' }).mode, 'top');
  // the visitor picks the mage in side view, switches to top-down and picks the ranger, then switches back
  const picks = { mode: 'side', side: { player: 'k-mage' }, top: { player: 'k-ranger' } };
  assert.equal(planScene(bag, picks).player, 'k-mage');
  assert.equal(planScene(bag, { ...picks, mode: 'top' }).player, 'k-ranger');
  assert.equal(planScene(bag, { ...picks, mode: 'side' }).player, 'k-mage', 'back in side view, the mage is still the player');
  // a pick made in one view is never used in the other
  assert.equal(planScene(bag, { mode: 'top', side: { player: 'k-mage' } }).player, 'k-scout');
  assert.deepEqual(planScene(bag, { mode: 'top' }).players, ['k-scout', 'k-ranger']);
  assert.equal(planScene(bag, { mode: 'top' }).roles['k-ranger'], 'npc', 'the other character of this view walks around');
});

test('every kit, added whole: its ground decides the view, and no thing is in the wrong scene', { skip: !kits.length && 'no kit bundle is there yet' }, async () => {
  for (const kit of kits) {
    const entries = [];
    for (const id of kit.sprites) entries.push(entry(rowFromSprite((await import(`../../sprites/${id}.js`)).default)));
    const viewOf = Object.fromEntries(entries.map((e) => [e.key, e.row.view]));
    const tileViews = new Set(entries.filter((e) => roleOf(e.row) === 'tiles').map((e) => e.row.view).filter((v) => v === 'side' || v === 'top-down'));
    const plan = planScene(entries);
    if (tileViews.size === 1) assert.equal(plan.mode, tileViews.has('top-down') ? 'top' : 'side', `${kit.id} opens in the view of its ground tiles`);
    for (const mode of plan.modes) {
      const p = planScene(entries, { mode });
      for (const key of [p.player, ...p.scene, p.projectile, ...p.tilesets, ...p.backgrounds].filter(Boolean)) assert.equal(fitsMode(viewOf[key], mode), true, `${kit.id}: ${key} in a ${mode} scene`);
      assert.equal(p.leftOut.length, entries.filter((e) => !fitsMode(e.row.view, mode) && !['display', 'sound', 'music'].includes(roleOf(e.row))).length);
      if (entries.some((e) => roleOf(e.row) === 'player' && fitsMode(e.row.view, mode))) assert.ok(p.player, `${kit.id} has a character to play in ${mode}`);
    }
  }
});
