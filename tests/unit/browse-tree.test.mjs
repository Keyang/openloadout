// Finding things (W2-A): turning the counts from the search library into the filter lists the page shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleTree, optionsFor, activeFilters, stateFromQuery, FILTER_GROUPS } from '../../app/browse.js';
import { countFacets } from '../../search/core.js';

const assets = [
  { id: 'knight', kind: 'sprite', type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['platformer'], view: 'side', bundles: ['starter'] },
  { id: 'slime', kind: 'sprite', type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer'], view: 'side', bundles: ['starter'] },
  { id: 'farmer', kind: 'sprite', type: 'character', role: 'characters/player', themes: ['farm'], gameTypes: ['farming-sim'], view: 'top-down', bundles: [] },
  { id: 'coin', kind: 'sprite', type: 'pickup', role: 'items/pickup', themes: ['neutral'], gameTypes: ['platformer'], view: 'front', bundles: ['starter'] },
  { id: 'icon', kind: 'sprite', type: 'icon', role: 'interface/icon', themes: ['neutral'], gameTypes: ['platformer'], view: 'none', bundles: [] },
  { id: 'coin-pickup', kind: 'sound', type: 'sfx', role: 'items/pickup', themes: ['neutral'], gameTypes: ['platformer'], view: null, bundles: ['starter'] },
  { id: 'step', kind: 'sound', type: 'sfx', role: 'characters/footstep', themes: ['neutral'], gameTypes: ['platformer'], view: null, bundles: [] },
  { id: 'boss', kind: 'music', type: 'music', role: 'music/boss', themes: ['fantasy'], gameTypes: ['platformer'], view: null, bundles: [] },
];
const counts = (filters = {}) => countFacets(assets, filters);

test('roles are grouped under the shared top levels, in the taxonomy order', () => {
  const tree = roleTree(counts().role);
  assert.deepEqual(tree.map((t) => [t.id, t.label, t.count]), [
    ['characters', 'Characters', 4], ['items', 'Items and pickups', 2], ['interface', 'Interface', 1], ['music', 'Music', 1],
  ]);
  // a sprite role and a sound role sit under the same top level
  assert.deepEqual(tree[0].children.map((c) => [c.id, c.label, c.count]), [
    ['characters/player', 'Player', 2], ['characters/enemy', 'Enemies', 1], ['characters/footstep', 'Footsteps', 1],
  ]);
  assert.deepEqual(tree[1].children.map((c) => c.id), ['items/pickup']);
});

test('a branch is open when it, or something under it, is chosen', () => {
  assert.equal(roleTree(counts().role).some((t) => t.open), false);
  const top = roleTree(counts().role, 'characters');
  assert.equal(top[0].open, true);
  assert.equal(top[0].on, true);
  const leaf = roleTree(counts().role, 'items/pickup');
  assert.equal(leaf[1].open, true);
  assert.equal(leaf[1].on, false);
  assert.equal(leaf[1].children[0].on, true);
  assert.equal(leaf[0].open, false);
});

test('a chosen role that no longer has matches is still listed, so it can be switched off', () => {
  const tree = roleTree({ characters: 2, 'characters/player': 2 }, 'world/door');
  const world = tree.find((t) => t.id === 'world');
  assert.equal(world.count, 0);
  assert.deepEqual(world.children.map((c) => [c.id, c.count, c.on]), [['world/door', 0, true]]);
});

test('role names nobody listed still get a readable label', () => {
  const tree = roleTree({ vehicles: 1, 'vehicles/space-ship': 1 });
  assert.deepEqual(tree.map((t) => [t.id, t.label]), [['vehicles', 'Vehicles']]);
  assert.equal(tree[0].children[0].label, 'Space ship');
});

test('filter lists show what the catalogue holds, with everyday labels and counts', () => {
  const c = counts();
  const none = stateFromQuery({});
  assert.deepEqual(optionsFor('kind', c, none).map((o) => [o.value, o.label, o.count]), [['sprite', 'Sprites', 5], ['sound', 'Sounds', 2], ['music', 'Music', 1]]);
  assert.deepEqual(optionsFor('type', c, none).map((o) => [o.value, o.label, o.count]), [
    ['character', 'Character', 2], ['creature', 'Creature', 1], ['pickup', 'Pickup', 1], ['icon', 'Icon', 1], ['sfx', 'Sound effect', 2], ['music', 'Music', 1],
  ]);
  assert.deepEqual(optionsFor('themes', c, none).map((o) => o.label), ['Fantasy', 'Dungeon', 'Farm', 'Fits anywhere']);
  assert.deepEqual(optionsFor('gameTypes', c, none).map((o) => [o.label, o.count]), [['Platformer', 7], ['Farming game', 1]]);
  // "no view" is not offered as a style
  assert.deepEqual(optionsFor('view', c, none).map((o) => [o.value, o.label, o.count]), [['side', 'Side view', 2], ['top-down', 'Top-down', 1], ['front', 'Front view', 1]]);
  const bundles = [{ id: 'starter', name: 'Starter kit' }];
  assert.deepEqual(optionsFor('bundle', c, none, bundles).map((o) => [o.value, o.label, o.count]), [['starter', 'Starter kit', 4]]);
});

test('counts follow the other filters, and the chosen value is marked', () => {
  const state = stateFromQuery('kind=sound');
  const c = counts({ kind: 'sound' });
  assert.deepEqual(optionsFor('type', c, state).map((o) => [o.value, o.count]), [['sfx', 2]]);
  const kinds = optionsFor('kind', c, state);
  assert.deepEqual(kinds.map((o) => [o.value, o.count, o.on]), [['sprite', 5, false], ['sound', 2, true], ['music', 1, false]]);
  // a chosen value with no matches left stays in the list so it can be switched off
  const stuck = optionsFor('themes', counts({ kind: 'music', themes: 'farm' }), stateFromQuery('kind=music&theme=farm'));
  assert.deepEqual(stuck.find((o) => o.value === 'farm'), { value: 'farm', label: 'Farm', count: 0, on: true });
});

test('every filter has an everyday name, and the style ones are marked as kept', () => {
  assert.deepEqual(FILTER_GROUPS.map((g) => g.key), ['kind', 'role', 'type', 'themes', 'gameTypes', 'view', 'bundle']);
  assert.deepEqual(FILTER_GROUPS.filter((g) => g.sticky).map((g) => g.key), ['gameTypes', 'view']);
  for (const g of FILTER_GROUPS) assert.doesNotMatch(g.label, /facet|index|query|metadata/i);
});

test('the chosen filters as chips: style choices first, each with a plain label', () => {
  const chips = activeFilters(stateFromQuery('kind=sound&role=items/pickup&view=side&game=platformer&bundle=starter&theme=farm&type=sfx'), [{ id: 'starter', name: 'Starter kit' }]);
  assert.deepEqual(chips.map((c) => [c.key, c.label, c.sticky]), [
    ['gameTypes', 'Platformer', true], ['view', 'Side view', true],
    ['kind', 'Sounds', false], ['role', 'Items and pickups: Pickups', false], ['type', 'Sound effect', false], ['themes', 'Farm', false], ['bundle', 'Starter kit', false],
  ]);
  assert.deepEqual(activeFilters(stateFromQuery('q=coin')), []);
  assert.equal(activeFilters(stateFromQuery('role=world'))[0].label, 'World');
});
