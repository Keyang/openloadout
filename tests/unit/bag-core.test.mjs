// The bag (architecture.md, Contract 6): what a visitor collects before downloading.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, BAG_KEY } from '../../app/bag.js';
import { defaultTheme } from '../../engine/theme.js';

const sprite = (over = {}) => ({ kind: 'sprite', id: 'knight', settings: { params: { armor: 0.5 }, cues: {}, scale: 1 }, ...over });
const sound = (over = {}) => ({ kind: 'sound', id: 'coin-pickup', settings: { params: { pitch: 900 }, style: 'Gem', seed: 1 }, ...over });
const music = (over = {}) => ({ kind: 'music', id: 'battle-theme', settings: { params: { bpm: 150 }, style: null }, ...over });

test('a new bag is empty, with the neutral theme', () => {
  const bag = createBag(memoryStorage());
  assert.equal(bag.count(), 0);
  assert.deepEqual(bag.items(), []);
  assert.deepEqual(bag.theme(), defaultTheme());
});

test('add returns a key and the item comes back with its settings', () => {
  const bag = createBag(memoryStorage(), { now: () => 1234 });
  const key = bag.add(sound());
  assert.equal(typeof key, 'string');
  assert.ok(key.length > 0);
  assert.equal(bag.count(), 1);
  const [item] = bag.items();
  assert.equal(item.key, key);
  assert.equal(item.kind, 'sound');
  assert.equal(item.id, 'coin-pickup');
  assert.deepEqual(item.settings, { params: { pitch: 900 }, style: 'Gem', seed: 1 });
  assert.equal(item.addedAt, 1234);
  assert.deepEqual(bag.get(key), item);
});

test('all three kinds can be added; anything else is refused', () => {
  const bag = createBag(memoryStorage());
  bag.add(sprite()); bag.add(sound()); bag.add(music());
  assert.deepEqual(bag.items().map((i) => i.kind), ['sprite', 'sound', 'music']);
  assert.throws(() => bag.add({ kind: 'video', id: 'x', settings: {} }));
  assert.throws(() => bag.add({ kind: 'sound', id: '', settings: {} }));
  assert.equal(bag.count(), 3);
});

test('the same asset can be added twice with different settings', () => {
  const bag = createBag(memoryStorage());
  const a = bag.add(sound());
  const b = bag.add(sound({ settings: { params: { pitch: 400 }, style: null, seed: 2 } }));
  assert.notEqual(a, b);
  assert.equal(bag.count(), 2);
  assert.equal(bag.get(a).settings.params.pitch, 900);
  assert.equal(bag.get(b).settings.params.pitch, 400);
});

test('items() hands out copies: changing them does not change the bag', () => {
  const bag = createBag(memoryStorage());
  const key = bag.add(sound());
  bag.items()[0].settings.params.pitch = 1;
  assert.equal(bag.get(key).settings.params.pitch, 900);
});

test('update replaces the settings of one item and keeps its place and key', () => {
  const bag = createBag(memoryStorage());
  const a = bag.add(sound());
  const b = bag.add(music());
  assert.equal(bag.update(a, { params: { pitch: 300 }, style: null, seed: 4 }), true);
  assert.deepEqual(bag.items().map((i) => i.key), [a, b]);
  assert.deepEqual(bag.get(a).settings, { params: { pitch: 300 }, style: null, seed: 4 });
  assert.equal(bag.count(), 2);
  assert.equal(bag.update('no-such-key', {}), false);
});

test('remove takes out one item; clear empties the bag', () => {
  const bag = createBag(memoryStorage());
  const a = bag.add(sound());
  const b = bag.add(sound());
  bag.add(music());
  assert.equal(bag.remove(a), true);
  assert.equal(bag.remove(a), false);
  assert.equal(bag.count(), 2);
  assert.equal(bag.get(a), null);
  assert.ok(bag.get(b));
  bag.clear();
  assert.equal(bag.count(), 0);
});

test('sprite sound cues keep only what a download needs', () => {
  const bag = createBag(memoryStorage());
  const key = bag.add(sprite({ settings: { params: { armor: 1 }, scale: 2, cues: { attack: [{ sound: 'whoosh', frame: 2, preset: null, params: null, volume: 0.5, open: true, n: 2 }] } } }));
  assert.deepEqual(bag.get(key).settings.cues, { attack: [{ sound: 'whoosh', frame: 2, preset: null, params: null, volume: 0.5 }] });
  assert.equal(bag.get(key).settings.scale, 2);
});

test('onChange tells listeners about every change, and stops when asked', () => {
  const bag = createBag(memoryStorage());
  const seen = [];
  const off = bag.onChange((b) => seen.push(b.count()));
  const k = bag.add(sound());
  bag.add(music());
  bag.update(k, { params: {}, style: null, seed: 1 });
  bag.setTheme({ ...defaultTheme(), sound: { pitch: 2, brightness: 0 } });
  bag.remove(k);
  bag.clear();
  assert.deepEqual(seen, [1, 2, 2, 2, 1, 0]);
  off();
  bag.add(sound());
  assert.equal(seen.length, 6);
});

test('a listener that throws does not stop the others', () => {
  const bag = createBag(memoryStorage());
  let heard = 0;
  bag.onChange(() => { throw new Error('boom'); });
  bag.onChange(() => { heard++; });
  const orig = console.error; console.error = () => {};
  try { bag.add(sound()); } finally { console.error = orig; }
  assert.equal(heard, 1);
});

test('the bag survives a new createBag on the same storage', () => {
  const storage = memoryStorage();
  const one = createBag(storage);
  const a = one.add(sprite());
  one.add(sound());
  one.setTheme({ colour: { hue: 40 } });
  const two = createBag(storage);
  assert.equal(two.count(), 2);
  assert.deepEqual(two.items(), one.items());
  assert.equal(two.theme().colour.hue, 40);
  // keys stay unique after reloading
  const c = two.add(sound());
  assert.ok(![a, ...one.items().map((i) => i.key)].includes(c));
  assert.ok(storage.getItem(BAG_KEY));
  assert.equal(BAG_KEY, 'loadout-bag-v1');
});

test('corrupt stored data gives an empty bag, never an error', () => {
  for (const junk of ['{not json', 'null', '42', '"text"', '[]', '{"items":"no"}', '{"items":[null,1,{"kind":"x"}]}']) {
    const storage = memoryStorage();
    storage.setItem(BAG_KEY, junk);
    const bag = createBag(storage);
    assert.equal(bag.count(), 0, junk);
    assert.deepEqual(bag.theme(), defaultTheme(), junk);
    bag.add(sound());
    assert.equal(createBag(storage).count(), 1, junk);
  }
});

test('good items next to bad ones are kept', () => {
  const storage = memoryStorage();
  storage.setItem(BAG_KEY, JSON.stringify({ version: 1, items: [{ key: 'a', kind: 'sound', id: 'jump', settings: { params: {} }, addedAt: 1 }, { key: 'b', kind: 'rocket', id: 'x' }, 'junk'], theme: 'bad' }));
  const bag = createBag(storage);
  assert.deepEqual(bag.items().map((i) => i.id), ['jump']);
  assert.deepEqual(bag.theme(), defaultTheme());
});

test('storage that throws (private window) still gives a working bag', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  const bag = createBag(broken);
  const k = bag.add(sound());
  assert.equal(bag.count(), 1);
  assert.ok(bag.get(k));
});

test('theme: neutral by default, set fills in missing parts, and get returns a copy', () => {
  const bag = createBag(memoryStorage());
  bag.setTheme({ sound: { pitch: 3 } });
  const t = bag.theme();
  assert.equal(t.sound.pitch, 3);
  assert.equal(t.sound.brightness, 0);
  assert.deepEqual(t.colour, defaultTheme().colour);
  t.sound.pitch = 9;
  assert.equal(bag.theme().sound.pitch, 3);
  bag.setTheme(null);
  assert.deepEqual(bag.theme(), defaultTheme());
});

test('the whole bag travels in one link and comes back the same', () => {
  const one = createBag(memoryStorage());
  one.add(sprite({ settings: { params: { armor: 0.25, cape: true, tint: '#aabbcc' }, cues: { idle: [{ sound: 'jump', frame: 0, preset: 'Big', params: { pitch: 2 }, volume: 1 }] }, scale: 2 } }));
  one.add(sound());
  one.add(sound({ settings: { params: { pitch: 100 }, style: null, seed: 7 } }));
  one.add(music());
  one.setTheme({ colour: { palette: 'Frost' }, sound: { pitch: -2, brightness: 0.3 } });
  const link = one.toLink();
  assert.equal(typeof link, 'string');
  assert.ok(link.startsWith('#/bag?'), link);
  assert.ok(!/[\s"{}]/.test(link), 'the link is safe to put in an address');

  const two = createBag(memoryStorage());
  two.add(music());
  assert.equal(two.fromLink(link), 4);
  const strip = (b) => b.items().map(({ kind, id, settings }) => ({ kind, id, settings }));
  assert.deepEqual(strip(two), strip(one));
  assert.deepEqual(two.theme(), one.theme());
  // a full address works too
  const three = createBag(memoryStorage());
  assert.equal(three.fromLink(`https://example.com/loadout/index.html${link}`), 4);
  assert.deepEqual(strip(three), strip(one));
});

test('fromLink can add to the bag instead of replacing it', () => {
  const one = createBag(memoryStorage());
  one.add(sound());
  const two = createBag(memoryStorage());
  two.add(music());
  assert.equal(two.fromLink(one.toLink(), { mode: 'add' }), 1);
  assert.deepEqual(two.items().map((i) => i.kind), ['music', 'sound']);
  assert.equal(new Set(two.items().map((i) => i.key)).size, 2);
});

test('a bad link changes nothing and says so with null', () => {
  const bag = createBag(memoryStorage());
  bag.add(sound());
  for (const bad of ['', '#/bag', '#/bag?load=%%%', '#/bag?load=bm90IGpzb24', 'nonsense', null]) assert.equal(bag.fromLink(bad), null, String(bad));
  assert.equal(bag.count(), 1);
});

test('the link of an empty bag gives an empty bag', () => {
  const one = createBag(memoryStorage());
  const two = createBag(memoryStorage());
  two.add(sound());
  assert.equal(two.fromLink(one.toLink()), 0);
  assert.equal(two.count(), 0);
});

test('sprite sound cues keep their `when` (the settings they play at)', () => {
  const bag = createBag(memoryStorage());
  const key = bag.add(sprite({ settings: { params: {}, scale: 1, cues: { attack: [{ sound: 'sword-slash', frame: 3, preset: 'Heavy blade', params: null, volume: 1, when: { weapon: ['sword', 'axe'] } }, { sound: 'whoosh', frame: 3, when: 'junk' }] } } }));
  const [a, b] = bag.get(key).settings.cues.attack;
  assert.deepEqual(a.when, { weapon: ['sword', 'axe'] });
  assert.equal('when' in b, false);
  // and they travel in the link
  const two = createBag(memoryStorage());
  two.fromLink(bag.toLink());
  assert.deepEqual(two.items()[0].settings.cues.attack[0].when, { weapon: ['sword', 'axe'] });
});

// The standard settings of each asset, as the site knows them: values equal to these are left out of links.
const STANDARD = {
  'sound:coin-pickup': (s) => ({ params: s.style === 'Gem' ? { pitch: 1200, ring: 0.5 } : { pitch: 900, ring: 0.3 } }),
  'sprite:knight': () => ({ params: { armor: 0.5, cape: true }, cues: { attack: [{ sound: 'whoosh', frame: 3, preset: null, params: null, volume: 1 }] } }),
};
const standard = (kind, id, settings) => (STANDARD[`${kind}:${id}`] ? STANDARD[`${kind}:${id}`](settings) : null);

test('links leave out values that are the standard ones, and come back meaning the same', () => {
  const full = createBag(memoryStorage());
  const short = createBag(memoryStorage(), { standard });
  for (const b of [full, short]) {
    b.add(sound({ settings: { params: { pitch: 900, ring: 0.8 }, style: null, seed: 1 } }));
    b.add(sound({ settings: { params: { pitch: 1200, ring: 0.5 }, style: 'Gem', seed: 2 } }));
    b.add(sprite({ settings: { params: { armor: 0.5, cape: false }, scale: 2, cues: { attack: [{ sound: 'whoosh', frame: 3, preset: null, params: null, volume: 1 }] } } }));
    b.add(music());   // no standard known: kept as it is
  }
  assert.ok(short.toLink().length < full.toLink().length, 'the link is shorter');
  const back = createBag(memoryStorage());
  back.fromLink(short.toLink());
  const s = back.items().map((i) => i.settings);
  assert.deepEqual(s[0], { params: { ring: 0.8 }, style: null, seed: 1 });
  assert.deepEqual(s[1], { params: {}, style: 'Gem', seed: 2 });
  assert.deepEqual(s[2], { params: { cape: false }, cues: null, scale: 2 });
  assert.deepEqual(s[3], music().settings);
  // the bag itself keeps everything
  assert.deepEqual(short.items()[0].settings.params, { pitch: 900, ring: 0.8 });
});

test('setStandard can be given later, and a failing one leaves the link whole', () => {
  const bag = createBag(memoryStorage());
  bag.add(sound({ settings: { params: { pitch: 900, ring: 0.8 }, style: null, seed: 1 } }));
  const whole = bag.toLink();
  bag.setStandard(() => { throw new Error('not loaded'); });
  assert.equal(bag.toLink(), whole);
  bag.setStandard(standard);
  assert.ok(bag.toLink().length < whole.length);
});

test('peekLink says what a link holds without changing the bag', () => {
  const one = createBag(memoryStorage());
  one.add(sound()); one.add(music());
  const two = createBag(memoryStorage());
  two.add(sprite());
  assert.deepEqual(two.peekLink(one.toLink()), { count: 2 });
  assert.equal(two.peekLink('#/bag?load=bm90IGpzb24'), null);
  assert.equal(two.peekLink('rubbish'), null);
  assert.equal(two.count(), 1);
});
