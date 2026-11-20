// generated/versions.json is made by tools/lib/versions-build.mjs: deterministic, small (only what differs from the defaults),
// the same as versionsOf / soundVersionsOf, and taken from the cache when nothing behind an asset changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVersions, versionsKey, VERSIONS_PER_ASSET } from '../../tools/lib/versions-build.mjs';
import { importGraph } from '../../tools/lib/imports.mjs';
import { versionsOf, soundVersionsOf } from '../../engine/versions.js';
import { cleanParams } from '../../engine/sprite.js';
import { ROOT } from '../../tools/lib/assets.mjs';
import fs from 'node:fs';
import path from 'node:path';

import { librarySprite, codeSpriteFile } from '../helpers/library.mjs';   // the library asset, a code file or a data file (tests/helpers/library.mjs)
const ONLY = ['knight', 'slime', 'coin-pickup', 'battle-theme'];

test('buildVersions gives each asset its versions: hand ones first, params only as they differ, styles by name', async () => {
  const out = await buildVersions({ only: ONLY });
  assert.deepEqual(Object.keys(out), [...ONLY].sort());
  const knight = (await librarySprite('knight'));
  assert.equal(out.knight.length, 12);
  assert.deepEqual(out.knight[0], { name: 'Classic', made: 'hand', params: {} });
  assert.deepEqual(out.knight.map((v) => cleanParams(knight, v.params)), versionsOf(knight, VERSIONS_PER_ASSET).map((v) => v.params));
  const slime = (await librarySprite('slime'));
  assert.deepEqual(out.slime.map((v) => v.name), versionsOf(slime, VERSIONS_PER_ASSET).map((v) => v.name));
  const coin = JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', 'coin-pickup.json'), 'utf8'));
  assert.deepEqual(out['coin-pickup'][0], { name: 'Gem', made: 'hand', style: 'Gem' });
  assert.deepEqual(out['coin-pickup'].map((v) => v.name), soundVersionsOf(coin, VERSIONS_PER_ASSET).map((v) => v.name));
  for (const v of out['coin-pickup'].filter((x) => x.params)) for (const [k, x] of Object.entries(v.params)) assert.notEqual(x, coin.params.find((d) => d.id === k).default);
});

test('the same input gives the same file, and a cache hit gives exactly what making it again gives', async () => {
  const cache = {};
  const a = await buildVersions({ only: ONLY, cache });
  assert.deepEqual(Object.keys(cache).sort(), [...ONLY].sort());
  for (const id of ONLY) cache[id].versions = [{ name: 'from the cache', made: 'hand', params: {} }];
  const b = await buildVersions({ only: ONLY, cache });
  assert.ok(ONLY.every((id) => b[id][0].name === 'from the cache'), 'an unchanged asset was made again');
  for (const id of ONLY) cache[id].key = 'stale';
  const c = await buildVersions({ only: ONLY, cache });
  assert.deepEqual(c, a);
  assert.equal(JSON.stringify(await buildVersions({ only: ONLY })), JSON.stringify(a));
});

test('the cache key covers the asset file and everything it and engine/versions.js load', () => {
  const graph = importGraph({ root: ROOT });
  // a code sprite's key (the code knight and wizard, frozen first: tests/helpers/library.mjs), whose imports are followed
  const file = codeSpriteFile('knight');
  const { files } = graph.closure([file, path.join(ROOT, 'engine', 'versions.js')]);
  assert.ok(files.includes(file), path.relative(ROOT, file));
  for (const f of ['engine/versions.js', 'engine/sprite.js', 'rigs/humanoid.js', 'engine/materials.js']) assert.ok(files.includes(path.join(ROOT, f)), f);
  assert.equal(versionsKey(graph, file, ROOT), versionsKey(graph, file, ROOT));
  assert.notEqual(versionsKey(graph, file, ROOT), versionsKey(graph, codeSpriteFile('wizard'), ROOT));
});
