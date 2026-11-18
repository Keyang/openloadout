// tools/lib/catalog.mjs buildCatalog: the object in Contract 4, for the real assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssets } from '../../tools/lib/assets.mjs';
import { buildCatalog } from '../../tools/lib/catalog.mjs';
import { validateMeta } from '../../catalog/schema.js';
import { createVoice } from '../../sound/sfx-engine.js';

const loaded = await loadAssets();
const cat = buildCatalog(loaded);
const byId = Object.fromEntries(cat.assets.map((a) => [a.id, a]));

const nSprites = loaded.sprites.length, nSounds = loaded.sounds.filter((s) => !s.isMusic).length, nMusic = loaded.sounds.filter((s) => s.isMusic).length;

test('top level: version 1, one row per asset and per bundle; JSON-safe', () => {
  assert.equal(cat.version, 1);
  assert.equal(cat.assets.length, nSprites + nSounds + nMusic);
  assert.equal(cat.bundles.length, loaded.bundles.length);
  assert.deepEqual(JSON.parse(JSON.stringify(cat)), cat);
});

test('assets are ordered sprites, sounds, music, each by id', () => {
  const order = { sprite: 0, sound: 1, music: 2 };
  const keys = cat.assets.map((a) => `${order[a.kind]}:${a.id}`);
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(cat.assets.filter((a) => a.kind === 'sprite').length, nSprites);
  assert.equal(cat.assets.filter((a) => a.kind === 'sound').length, nSounds);
  assert.equal(cat.assets.filter((a) => a.kind === 'music').length, nMusic);
  assert.ok(cat.assets.some((a) => a.kind === 'music' && a.id === 'battle-theme'));
});

const FIELDS = ['id', 'kind', 'name', 'description', 'type', 'role', 'themes', 'gameTypes', 'view', 'words', 'license', 'bundles', 'src', 'tech', 'thumb', 'strip'];

test('every asset has the Contract 4 fields and its meta is valid', () => {
  for (const a of cat.assets) {
    for (const f of FIELDS) assert.ok(f in a, `${a.id}: missing ${f}`);
    assert.equal(typeof a.name, 'string');
    assert.ok(a.description.length > 10, `${a.id}: description`);
    const meta = { type: a.type, role: a.role, themes: a.themes, gameTypes: a.gameTypes, words: a.words, license: a.license };
    if (a.kind === 'sprite') meta.view = a.view;
    assert.ok(validateMeta(meta, a.kind).ok, a.id);
  }
});

test('sprite rows: src, description from blurb, derived tech, thumb and strip', () => {
  const k = byId.knight;
  const def = loaded.sprites.find((s) => s.id === 'knight').def;
  assert.equal(k.kind, 'sprite');
  assert.equal(k.name, 'Hero');
  assert.equal(k.description, def.blurb);
  assert.equal(k.view, 'side');
  assert.equal(k.src, 'sprites/knight.js');
  assert.deepEqual(k.tech.frame, def.size);
  assert.deepEqual(k.tech.clips.map((c) => c.name), Object.keys(def.clips));
  for (const c of k.tech.clips) {
    assert.deepEqual(Object.keys(c).sort(), ['fps', 'frames', 'label', 'loop', 'name']);
    assert.equal(c.frames, def.clips[c.name].frames);
    assert.equal(c.loop, def.clips[c.name].loop);
    assert.ok(Number.isInteger(c.fps) && c.fps >= 1);
  }
  assert.equal(k.tech.controls, Object.keys(def.params).length);
  // parts and sounds are derived from the sprite's own declaration, whatever it currently is
  assert.deepEqual(k.tech.parts, Object.keys(def.parts ?? {}));
  assert.equal(k.tech.sounds, new Set(Object.values(def.sounds ?? {}).flat().map((c) => c.sound)).size);
  assert.equal(k.thumb, 'generated/thumbs/knight.png');
  assert.equal(k.strip, 'generated/strips/knight.png');
  assert.equal(k.stripFrames, def.clips[def.preview].frames);
  assert.ok(Number.isInteger(k.stripFps) && k.stripFps >= 1);
});

test('sprite parts are listed when declared', () => {
  const def = { ...loaded.sprites.find((s) => s.id === 'knight').def };
  def.parts = { weapon: { label: 'Weapon', params: ['weapon'], none: 'none' } };
  const c = buildCatalog({ sprites: [{ id: 'knight', file: 'sprites/knight.js', def }], sounds: [], bundles: [] });
  assert.deepEqual(c.assets[0].tech.parts, ['weapon']);
});

test('sound rows: derived tech with seconds from createVoice, no strip', () => {
  const s = byId['sword-slash'];
  const patch = loaded.sounds.find((x) => x.id === 'sword-slash').patch;
  assert.equal(s.kind, 'sound');
  assert.equal(s.description, patch.description);
  assert.equal(s.view, null);
  assert.equal(s.src, 'sounds/sword-slash.json');
  assert.equal(s.tech.seconds, Math.round(createVoice(patch).duration * 100) / 100);
  assert.equal(s.tech.loop, false);
  assert.equal(s.tech.stereo, false);
  assert.equal(s.tech.bpm, null);
  assert.equal(s.tech.controls, patch.params.length);
  assert.deepEqual(s.tech.styles, ['Heavy blade', 'Quick dagger']);
  assert.equal(s.thumb, 'generated/thumbs/sword-slash.png');
  assert.equal(s.strip, null);
  // the waveform is ink on transparent: the site must put it on a light tile
  assert.equal(s.thumbInk, '#231b33');
  assert.equal(byId.wind.tech.loop, true);
});

test('music rows: stereo, bpm from the bpm control, no pictures', () => {
  const m = byId['battle-theme'];
  assert.equal(m.kind, 'music');
  assert.equal(m.type, 'music');
  assert.equal(m.tech.stereo, true);
  assert.equal(m.tech.loop, true);
  assert.equal(m.tech.bpm, 160);
  assert.ok(m.tech.seconds > 5 && m.tech.seconds < 120);
  assert.equal(m.thumb, null);
  assert.equal(m.strip, null);
  assert.ok(!('thumbInk' in m));
  assert.ok(!('thumbInk' in byId.knight));
});

test('bundles are listed on each asset they contain', () => {
  // derived from the bundle records, so adding a bundle never breaks this test
  assert.ok(cat.bundles.length >= 3);
  for (const bundle of cat.bundles) {
    for (const id of [...bundle.sprites, ...bundle.sounds, ...bundle.music]) {
      assert.ok(byId[id], `${bundle.id} lists ${id}, which is not in the catalogue`);
      assert.ok(byId[id].bundles.includes(bundle.id), `${id} does not list ${bundle.id}`);
    }
  }
  for (const a of cat.assets) {
    assert.deepEqual(a.bundles, [...a.bundles].sort(), `${a.id}: bundles are sorted`);
    for (const b of a.bundles) {
      const rec = cat.bundles.find((x) => x.id === b);
      assert.ok(rec && [...rec.sprites, ...rec.sounds, ...rec.music].includes(a.id), `${a.id} lists ${b}, which does not contain it`);
    }
  }
});

test('the catalogue is deterministic', () => {
  assert.deepEqual(buildCatalog(loaded), cat);
});
