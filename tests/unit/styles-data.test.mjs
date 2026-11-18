// Style as data (Contract 12): the catalogue row and the bag item with its link. (The action schemas and api.json: styles-api.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, cleanSettings } from '../../app/bag.js';
import { buildCatalog } from '../../tools/lib/catalog.mjs';
import { validateMeta } from '../../catalog/schema.js';
import { loadSounds } from '../../tools/lib/assets.mjs';
import blob from '../fixtures/styles/blob.js';
import sparkle from '../fixtures/styles/sparkle.js';

test('a catalogue row carries the styles its sprite lists; a sound row has none', () => {
  const sound = loadSounds().find((x) => !x.isMusic);
  const cat = buildCatalog({
    sprites: [{ id: blob.id, file: 'sprites/style-blob.js', def: blob }, { id: sparkle.id, file: 'sprites/style-sparkle.js', def: sparkle }],
    sounds: [sound],
  });
  const row = (id) => cat.assets.find((a) => a.id === id);
  assert.deepEqual(row('style-blob').styles, ['pixel', 'silhouette', 'outline-svg']);
  assert.deepEqual(row('style-sparkle').styles, ['pixel', 'silhouette']);
  assert.ok(!('styles' in row(sound.id)), 'a sound\'s named styles stay in tech.styles');
  assert.notEqual(row('style-blob').styles, blob.styles, 'a copy, not the sprite\'s own list');
});

test('styles is declared on the sprite, not in its meta, and the message says where', () => {
  const meta = { type: 'creature', role: 'characters/enemy', themes: ['neutral'], gameTypes: ['platformer'], view: 'side', words: ['a', 'b', 'c', 'd', 'e', 'f'], license: 'draft', styles: ['pixel'] };
  const r = validateMeta(meta, 'sprite');
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /meta\.styles/.test(e) && /defineSprite/.test(e) && /styles: \[/.test(e)), r.errors.join('\n'));
});

test('a sprite item in the bag keeps its style; one without a style is stored exactly as before', () => {
  assert.deepEqual(cleanSettings('sprite', { params: { size: 1 }, cues: null, scale: 2 }), { params: { size: 1 }, cues: null, scale: 2 });
  assert.deepEqual(Object.keys(cleanSettings('sprite', {})), ['params', 'cues', 'scale']);
  assert.deepEqual(cleanSettings('sprite', { params: {}, style: 'silhouette' }), { params: {}, cues: null, scale: 1, style: 'silhouette' });
  for (const bad of [null, '', 7, 'Not An Id', { id: 'x' }]) assert.ok(!('style' in cleanSettings('sprite', { style: bad })), String(bad));
  // sounds: `style` is the sound's named style, as it always was
  assert.deepEqual(cleanSettings('sound', { style: 'Gem' }), { params: {}, style: 'Gem', seed: 1 });
});

test('the style survives storage, a reload, an update and a shared link', () => {
  const storage = memoryStorage();
  const bag = createBag(storage);
  const a = bag.add({ kind: 'sprite', id: 'style-blob', settings: { params: { size: 0.8 }, cues: null, scale: 2, style: 'outline-svg' } });
  const b = bag.add({ kind: 'sprite', id: 'knight', settings: { params: {}, cues: null, scale: 1 } });
  assert.equal(bag.get(a).settings.style, 'outline-svg');
  assert.ok(!('style' in bag.get(b).settings));
  const again = createBag(storage);                         // the page was reloaded
  assert.equal(again.get(a).settings.style, 'outline-svg');
  assert.deepEqual(again.get(b).settings, { params: {}, cues: null, scale: 1 });
  again.update(a, { ...again.get(a).settings, style: 'silhouette' });
  assert.equal(createBag(storage).get(a).settings.style, 'silhouette');
  const link = again.toLink();
  const other = createBag(memoryStorage());
  assert.equal(other.fromLink(link), 2);
  assert.deepEqual(other.items().map((i) => [i.id, i.settings.style ?? null]), [['style-blob', 'silhouette'], ['knight', null]]);
  assert.deepEqual(other.items()[0].settings, { params: { size: 0.8 }, cues: null, scale: 2, style: 'silhouette' });
});

test('a link leaves the style out when it is the asset\'s standard one', () => {
  const bag = createBag(memoryStorage(), { standard: (kind) => (kind === 'sprite' ? { params: {}, style: 'pixel' } : null) });
  bag.add({ kind: 'sprite', id: 'style-blob', settings: { params: {}, style: 'pixel' } });
  const plain = createBag(memoryStorage());
  plain.add({ kind: 'sprite', id: 'style-blob', settings: { params: {} } });
  const to = createBag(memoryStorage());
  to.fromLink(bag.toLink());
  assert.ok(!('style' in to.items()[0].settings));
  bag.clear();
  bag.add({ kind: 'sprite', id: 'style-blob', settings: { params: {}, style: 'silhouette' } });
  to.fromLink(bag.toLink());
  assert.equal(to.items()[0].settings.style, 'silhouette');
});
