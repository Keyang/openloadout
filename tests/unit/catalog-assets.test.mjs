// The real assets and bundle files: every meta valid, every bundle valid and pointing at real assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssets } from '../../tools/lib/assets.mjs';
import { validateMeta, validateBundle, WORDS_MIN, WORDS_MAX } from '../../catalog/schema.js';
import { kits } from '../../kits/index.js';

const { sprites, sounds, bundles } = await loadAssets();

test('the scan finds every asset file: one sprite per sprites/*.js, one sound or track per sounds/*.json', async () => {
  const fs = await import('node:fs');
  const files = (dir, ext) => fs.readdirSync(new URL(`../../${dir}/`, import.meta.url)).filter((f) => f.endsWith(ext) && !f.startsWith('_') && !f.startsWith('index.')).length;
  assert.equal(sprites.length, files('sprites', '.js'));
  assert.equal(sounds.length, files('sounds', '.json'));
  assert.ok(sprites.length >= 7 && sounds.filter((s) => !s.isMusic).length >= 19 && sounds.some((s) => s.isMusic));
});

test('every sprite has valid meta', () => {
  for (const s of sprites) {
    const r = validateMeta(s.def.meta, 'sprite');
    assert.ok(r.ok, `${s.file}:\n  ${r.errors.join('\n  ')}`);
  }
});

test('every sound and music track has valid meta', () => {
  for (const s of sounds) {
    const r = validateMeta(s.patch.meta, s.isMusic ? 'music' : 'sound');
    assert.ok(r.ok, `${s.file}:\n  ${r.errors.join('\n  ')}`);
  }
});

test('words do not just repeat the name: each asset has 6 to 14 and most are not in the name', () => {
  for (const s of [...sprites.map((x) => ({ file: x.file, name: x.def.name, meta: x.def.meta })), ...sounds.map((x) => ({ file: x.file, name: x.patch.name, meta: x.patch.meta }))]) {
    const w = s.meta.words;
    assert.ok(w.length >= WORDS_MIN && w.length <= WORDS_MAX, s.file);
    const name = s.name.toLowerCase();
    assert.ok(w.filter((x) => !name.includes(x)).length >= 4, `${s.file}: give synonyms and verbs, not just the name`);
  }
});

test('ids are unique across sprites and sounds', () => {
  const ids = [...sprites.map((s) => s.id), ...sounds.map((s) => s.id)];
  assert.equal(new Set(ids).size, ids.length);
});

const known = {
  sprite: sprites.map((s) => s.id),
  sound: sounds.filter((s) => !s.isMusic).map((s) => s.id),
  music: sounds.filter((s) => s.isMusic).map((s) => s.id),
};

test('every bundle file is valid and refers only to assets that exist', () => {
  assert.ok(bundles.length >= 3);
  for (const b of bundles) {
    const { file, ...data } = b;
    const r = validateBundle(data, known);
    assert.ok(r.ok, `${file}:\n  ${r.errors.join('\n  ')}`);
  }
});

test('the three kits were migrated to bundle files with the same ids and members', () => {
  for (const k of kits) {
    const b = bundles.find((x) => x.id === k.id);
    assert.ok(b, `bundles/${k.id}.json is missing`);
    assert.equal(b.name, k.name);
    assert.equal(b.blurb, k.blurb);
    assert.deepEqual(b.sprites, k.sprites);
    assert.deepEqual(b.sounds, k.sounds);
    assert.deepEqual(b.music, k.music ?? []);
    assert.equal(typeof b.gameType, 'string');
    assert.deepEqual(b.theme, {});
  }
});
