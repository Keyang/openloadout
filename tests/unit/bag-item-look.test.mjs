// A bag item can carry a look of its own (Contract 6, 7): the id of one of the named looks (THEME_PRESETS), or none,
// which means it follows the bag's look. It is kept through storage, a shared link and an edit, and themeFor() is the
// one place that says which look an item is drawn, played and exported with.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, cleanSettings, lookOf, themeFor } from '../../app/bag.js';
import { createEdit } from '../../app/editing.js';
import { THEME_PRESETS, normalizeTheme, defaultTheme } from '../../engine/theme.js';

const preset = (id) => normalizeTheme(THEME_PRESETS.find((p) => p.id === id).theme);
const sprite = (settings = {}) => ({ kind: 'sprite', id: 'knight', settings: { params: { armor: 0.5 }, cues: null, scale: 1, ...settings } });
const sound = (settings = {}) => ({ kind: 'sound', id: 'coin-pickup', settings: { params: {}, style: null, seed: 1, ...settings } });
const music = (settings = {}) => ({ kind: 'music', id: 'battle-theme', settings: { params: {}, style: null, ...settings } });

test('settings keep a look id for every kind, and drop anything that is not one', () => {
  for (const kind of ['sprite', 'sound', 'music']) {
    assert.equal(cleanSettings(kind, { look: 'frost' }).look, 'frost');
    assert.equal('look' in cleanSettings(kind, {}), false, 'no look: the settings are stored exactly as before');
    for (const bad of [null, '', 7, 'Frost!', 'x'.repeat(60), { id: 'frost' }]) assert.equal('look' in cleanSettings(kind, { look: bad }), false);
  }
});

test('lookOf and themeFor: an item with a known look has that look; any other follows the bag', () => {
  const bagLook = preset('night');
  assert.equal(lookOf({ look: 'frost' }), 'frost');
  assert.equal(lookOf({ look: 'no-such-look' }), null);
  assert.equal(lookOf({}), null);
  assert.equal(lookOf(null), null);
  assert.deepEqual(themeFor({ look: 'frost' }, bagLook), preset('frost'));
  assert.deepEqual(themeFor({ look: 'original' }, bagLook), defaultTheme(), '"original" holds the item as made, whatever the bag wears');
  assert.deepEqual(themeFor({}, bagLook), bagLook);
  assert.deepEqual(themeFor({ look: 'no-such-look' }, bagLook), bagLook);
  assert.deepEqual(themeFor({ look: 'frost' }, null), preset('frost'));
  assert.deepEqual(themeFor({}, null), defaultTheme());
});

test('the look is kept through storage, an update, and a shared link (add and replace)', () => {
  const storage = memoryStorage();
  const bag = createBag(storage);
  const a = bag.add(sprite({ look: 'frost' })), b = bag.add(sound({ look: 'sunset' })), c = bag.add(music()), d = bag.add(music({ look: 'night' }));
  assert.equal(bag.get(a).settings.look, 'frost');
  assert.equal('look' in bag.get(c).settings, false);
  const again = createBag(storage);
  assert.deepEqual(again.items().map((i) => i.settings.look ?? null), ['frost', 'sunset', null, 'night']);
  again.update(b, { ...again.get(b).settings, look: 'candy' });
  again.update(d, { params: {}, style: null });
  assert.deepEqual(createBag(storage).items().map((i) => i.settings.look ?? null), ['frost', 'candy', null, null]);

  const link = again.toLink();
  const other = createBag(memoryStorage());
  assert.equal(other.fromLink(link), 4);
  assert.deepEqual(other.items().map((i) => i.settings.look ?? null), ['frost', 'candy', null, null]);
  other.fromLink(link, { mode: 'add' });
  assert.deepEqual(other.items().map((i) => i.settings.look ?? null), ['frost', 'candy', null, null, 'frost', 'candy', null, null]);
});

test('a sprite with a look of its own keeps no record of what the bag\'s look made of its shapes', () => {
  const fake = { id: 'knight', params: { armor: { kind: 'range', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Armour' } }, clips: {}, size: [8, 8] };
  const bag = createBag(memoryStorage(), { spriteOf: () => fake });
  const own = bag.add(sprite({ look: 'frost' })), follows = bag.add(sprite());
  bag.setTheme({ shapes: true, seed: 7 });
  assert.equal('lookParams' in bag.get(own).settings, false);
  assert.ok(bag.get(follows).settings.lookParams, 'the one that follows the bag is recorded as before');
});

test('an edit session keeps the item\'s look while other things change, sets it, and clears it', () => {
  const bag = createBag(memoryStorage());
  const key = bag.add(sprite({ look: 'frost' }));
  const edit = createEdit({ kind: 'sprite', id: 'knight', key, bag, defaults: { params: { armor: 0.5 }, cues: null, scale: 1 } });
  assert.equal(edit.settings().look, 'frost');
  edit.set({ params: { armor: 1 } });
  assert.equal(bag.get(key).settings.look, 'frost');
  edit.set({ look: 'night' });
  assert.equal(bag.get(key).settings.look, 'night');
  edit.set({ look: null });
  assert.equal('look' in bag.get(key).settings, false);
  edit.close();
});
