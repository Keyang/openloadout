// The catalogue says which sounds each sprite's animations play (tech.soundIds, Contract 4), so the
// site can show "Used by" on a sound's page without loading any sprite program.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, range } from '../../engine/sprite.js';
import { buildCatalog, spriteTech } from '../../tools/lib/catalog.mjs';
import { loadAssets } from '../../tools/lib/assets.mjs';

const blob = (id, sounds) => defineSprite({
  id, name: `Test ${id}`, blurb: 'A blob used by the tests.', size: [16, 16], pivot: [8, 15],
  params: { size: range('Size', 0.5, { min: 0, max: 1 }) },
  clips: { walk: { frames: 4, fps: 6 }, hit: { frames: 3, fps: 10, loop: false } },
  ...(sounds ? { sounds } : {}),
  render(g, { p }) { g.ellipse(8, 9, 3 + p.size * 4, 4, '#ff0000'); },
});

test('tech.soundIds lists each sound a sprite plays once, in alphabetical order', () => {
  const def = blob('test-blob', { walk: [{ sound: 'step', frame: 0 }, { sound: 'step', frame: 2 }], hit: [{ sound: 'thud', frame: 1 }, { sound: 'clang', frame: 1 }] });
  const tech = spriteTech(def);
  assert.deepEqual(tech.soundIds, ['clang', 'step', 'thud']);
  assert.equal(tech.sounds, 3, 'the count stays, and agrees with the list');
});

test('a silent sprite has an empty list', () => {
  const tech = spriteTech(blob('test-quiet'));
  assert.deepEqual(tech.soundIds, []);
  assert.equal(tech.sounds, 0);
});

test('the list is in the catalogue row, as plain data', () => {
  const def = blob('test-blob', { walk: [{ sound: 'step', frame: 0 }] });
  const cat = buildCatalog({ sprites: [{ id: def.id, file: 'sprites/test-blob.js', def }] });
  assert.deepEqual(cat.assets[0].tech.soundIds, ['step']);
  assert.deepEqual(JSON.parse(JSON.stringify(cat)), cat);
});

test('for the real sprites the list is exactly what their animations play, and sound rows have no such list', async () => {
  const loaded = await loadAssets();
  const cat = buildCatalog(loaded);
  for (const { id, def } of loaded.sprites) {
    const want = [...new Set(Object.values(def.sounds ?? {}).flat().map((c) => c.sound))].sort();
    const row = cat.assets.find((a) => a.id === id);
    assert.deepEqual(row.tech.soundIds, want, id);
    assert.equal(row.tech.sounds, want.length, id);
  }
  for (const row of cat.assets) if (row.kind !== 'sprite') assert.equal('soundIds' in row.tech, false, row.id);
});
