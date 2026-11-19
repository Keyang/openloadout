// The library page (#/browse): the pure helpers in app/library-state.js. What the address holds beside the search and
// filters (the Kits tab, the sort), the order of results, the numbers on the kind tabs, the facts a list row shows,
// the colour of a version dot, the whole-number size of a picture on a tile, and the remembered grid or list.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SORTS, extrasFromQuery, libraryHash, sortRows, kitsMatching, tabCounts, rowFacts, lengthWords, dotColour, tileScale, rowCrop,
  createLayoutMemory, LAYOUT_KEY, versionSettings, versionInBag,
} from '../../app/library-state.js';
import { stateFromQuery } from '../../app/browse.js';

const fakeStorage = (start = {}) => {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
};
const row = (id, kind, type, tech = {}, more = {}) => ({ id, kind, type, name: more.name ?? id, tech, ...more });

test('the address names the Kits tab and the sort; anything else is dropped', () => {
  assert.deepEqual(extrasFromQuery({}), { kits: false, sort: 'featured' });
  assert.deepEqual(extrasFromQuery({ kind: 'kits', sort: 'name' }), { kits: true, sort: 'name' });
  assert.deepEqual(extrasFromQuery('kind=sound&sort=length'), { kits: false, sort: 'length' });
  assert.deepEqual(extrasFromQuery({ sort: 'sideways' }), { kits: false, sort: 'featured' });
  assert.deepEqual(SORTS.map((s) => s.id), ['featured', 'name', 'controls', 'length']);
});

test('the address is the old one when nothing new is chosen, and carries the Kits tab and the sort when they are', () => {
  const none = stateFromQuery({});
  assert.equal(libraryHash(none, { kits: false, sort: 'featured' }), '#/browse');
  assert.equal(libraryHash({ ...none, q: 'coin', kind: 'sound' }, { kits: false, sort: 'featured' }), '#/browse?q=coin&kind=sound');
  assert.equal(libraryHash({ ...none, q: 'coin' }, { kits: true, sort: 'featured' }), '#/browse?q=coin&kind=kits');
  assert.equal(libraryHash({ ...none, kind: 'sprite', themes: 'forest' }, { kits: false, sort: 'name' }), '#/browse?kind=sprite&theme=forest&sort=name');
  // and back again
  const text = libraryHash({ ...none, q: 'a b' }, { kits: true, sort: 'controls' }).split('?')[1];
  assert.deepEqual(extrasFromQuery(text), { kits: true, sort: 'controls' });
  assert.equal(stateFromQuery(text).q, 'a b');
  assert.equal(stateFromQuery(text).kind, null);
});

test('featured puts characters first and the ones with most to change before the rest; a search keeps its own order', () => {
  const rows = [
    row('zap', 'sound', 'sfx', { controls: 5, seconds: 0.2 }),
    row('coin', 'sprite', 'pickup', { controls: 4 }),
    row('squire', 'sprite', 'character', { controls: 6 }),
    row('hero', 'sprite', 'character', { controls: 20 }),
    row('tune', 'music', 'music', { controls: 9, seconds: 12 }),
  ];
  assert.deepEqual(sortRows(rows, 'featured').map((r) => r.id), ['hero', 'squire', 'coin', 'zap', 'tune']);
  assert.deepEqual(sortRows(rows, 'featured', { typed: true }).map((r) => r.id), ['zap', 'coin', 'squire', 'hero', 'tune']);
  assert.deepEqual(sortRows(rows, 'name').map((r) => r.id), ['coin', 'hero', 'squire', 'tune', 'zap']);
  assert.deepEqual(sortRows(rows, 'controls').map((r) => r.id), ['hero', 'tune', 'squire', 'zap', 'coin']);
  assert.deepEqual(sortRows(rows, 'length').map((r) => r.id), ['tune', 'zap', 'coin', 'hero', 'squire']);
  assert.equal(rows[0].id, 'zap', 'the list handed in is left as it was');
});

test('kits are found by the words in their name and their line', () => {
  const bundles = [{ id: 'a', name: 'Thornwood Keep', blurb: 'A hero and a boss' }, { id: 'b', name: 'Menu sounds', blurb: 'Clicks' }];
  assert.deepEqual(kitsMatching(bundles, '').map((b) => b.id), ['a', 'b']);
  assert.deepEqual(kitsMatching(bundles, 'HERO keep').map((b) => b.id), ['a']);
  assert.deepEqual(kitsMatching(bundles, 'dragon'), []);
});

test('the tabs count what each would show', () => {
  assert.deepEqual(tabCounts({ kind: { sprite: 3, sound: 2 } }, 6), { all: 5, sprite: 3, sound: 2, music: 0, kits: 6 });
});

test('a list row says how many animations and controls there are, and how long a sound is', () => {
  assert.deepEqual(rowFacts(row('hero', 'sprite', 'character', { clips: [{}, {}, {}], controls: 20 })), { animations: '3', controls: '20', length: '' });
  assert.deepEqual(rowFacts(row('zap', 'sound', 'sfx', { controls: 5, seconds: 0.11 })), { animations: '', controls: '5', length: '0.11 s' });
  assert.equal(lengthWords(0.7), '0.7 s');
  assert.equal(lengthWords(1), '1 s');
  assert.equal(lengthWords(11.71), '12 s');
  assert.equal(lengthWords(41.74, true), '42 s, loops');
  assert.equal(lengthWords(undefined), '');
});

test('a version dot takes the first colour the version sets, and a quiet one of three when it sets none', () => {
  assert.equal(dotColour({ params: { height: 1, hair: '#A8612A', outfit: '#4f9d57' } }, 0), '#a8612a');
  const plain = [0, 1, 2].map((i) => dotColour({ params: { time: 'dusk' } }, i));
  assert.equal(new Set(plain).size, 3);
  for (const c of plain) assert.match(c, /^#[0-9a-f]{6}$/);
  assert.equal(dotColour({ style: 'On metal' }, 4), plain[1]);
});

test('a picture sits on its tile at a whole-number size, or a whole-number fraction when it is too big', () => {
  assert.equal(tileScale(16, 16), 3);
  assert.equal(tileScale(32, 32), 3);
  assert.equal(tileScale(48, 48), 2);
  assert.equal(tileScale(64, 64), 2);
  assert.equal(tileScale(96, 96), 1);
  assert.equal(tileScale(128, 96), 1);
  assert.equal(tileScale(320, 180), 0.5);
  assert.equal(tileScale(64, 64, 64), 1);
  assert.equal(tileScale(32, 32, 64), 2);
});

test('a sprite bigger than a list row tile is shown as a close-up around where it stands', () => {
  assert.equal(rowCrop(row('coin', 'sprite', 'pickup', { frame: [32, 32], pivot: [16, 30] })), null);
  const c = rowCrop(row('boss', 'sprite', 'creature', { frame: [128, 96], pivot: [64, 90], grounded: true }));
  assert.deepEqual(c, { x: -32, y: -30 });
  assert.ok(c.x <= 0 && c.x >= 64 - 128 && c.y <= 0 && c.y >= 64 - 96);
});

test('grid or list is remembered, and anything else read from storage means grid', () => {
  const storage = fakeStorage();
  const m = createLayoutMemory(storage);
  assert.equal(m.get(), 'grid');
  m.set('list');
  assert.equal(storage.map.get(LAYOUT_KEY), 'list');
  assert.equal(createLayoutMemory(storage).get(), 'list');
  assert.equal(createLayoutMemory(fakeStorage({ [LAYOUT_KEY]: 'sideways' })).get(), 'grid');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const b = createLayoutMemory(broken);
  assert.equal(b.get(), 'grid');
  b.set('list');
  assert.equal(b.get(), 'list', 'kept for this visit when storage is blocked');
});

test('a version goes in the bag as the settings it stands for, and the bag knows it again', () => {
  assert.deepEqual(versionSettings('sprite', { name: 'Ranger', params: { hair: '#a8612a' } }), { params: { hair: '#a8612a' } });
  assert.deepEqual(versionSettings('sound', { name: 'On metal', style: 'On metal' }), { params: {}, style: 'On metal' });
  const items = [
    { kind: 'sprite', id: 'hero', key: 'i1', settings: { params: { hair: '#a8612a' }, cues: null, scale: 1 } },
    { kind: 'sprite', id: 'coin', key: 'i2', settings: { params: {}, cues: null, scale: 1 } },
  ];
  assert.equal(versionInBag(items, 'sprite', 'hero', { params: { hair: '#a8612a' } }), true);
  assert.equal(versionInBag(items, 'sprite', 'hero', { params: { hair: '#000000' } }), false);
  assert.equal(versionInBag(items, 'sprite', 'slime', { params: {} }), false);
});
