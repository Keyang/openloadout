// tools/lib/quality-run.mjs: checks many assets across worker threads and caches each result.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQuality, dependencyHash, cacheable, soundsHash } from '../../tools/lib/quality-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FX = path.join(ROOT, 'tests', 'fixtures', 'quality');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'quality-run-'));

test('runs sprites and sounds, then serves unchanged assets from the cache', async () => {
  const dir = tmp(), cacheFile = path.join(dir, 'quality.json');
  const job = { sprites: [path.join(FX, 'sprite-files', 'q-good.js')], sounds: [path.join(FX, 'sounds', 'good-blip.json'), path.join(FX, 'sounds', 'silent.json')], cacheFile };
  const a = await runQuality(job);
  assert.equal(a.results.length, 3);
  assert.deepEqual(a.results.map((r) => [r.kind, r.id, r.cached]), [['sprite', 'q-good', false], ['sound', 'q-blip', false], ['sound', 'q-silent', false]]);
  assert.equal(a.results[2].ok, false);
  assert.ok(fs.existsSync(cacheFile));
  const b = await runQuality(job);
  assert.deepEqual(b.results.map((r) => r.cached), [true, true, true]);
  assert.deepEqual(b.results.map((r) => r.errors), a.results.map((r) => r.errors));
  const c = await runQuality({ ...job, cache: false });
  assert.deepEqual(c.results.map((r) => r.cached), [false, false, false]);
});

test('a changed asset is checked again', async () => {
  const dir = tmp(), cacheFile = path.join(dir, 'quality.json'), file = path.join(dir, 'q-blip.json');
  const patch = JSON.parse(fs.readFileSync(path.join(FX, 'sounds', 'good-blip.json'), 'utf8'));
  fs.writeFileSync(file, JSON.stringify(patch));
  assert.equal((await runQuality({ sprites: [], sounds: [file], cacheFile })).results[0].cached, false);
  assert.equal((await runQuality({ sprites: [], sounds: [file], cacheFile })).results[0].cached, true);
  patch.out = '0*tone*amp';
  fs.writeFileSync(file, JSON.stringify(patch));
  const r = (await runQuality({ sprites: [], sounds: [file], cacheFile })).results[0];
  assert.equal(r.cached, false);
  assert.equal(r.ok, false);
});

test('a sprite file that cannot be loaded is reported as that sprite\'s error, and the run goes on', async () => {
  const r = await runQuality({ sprites: [path.join(FX, 'sprite-files', 'q-bad-parts.js'), path.join(FX, 'sprite-files', 'q-good.js')], sounds: [], cache: false });
  assert.equal(r.results.length, 2);
  const bad = r.results.find((x) => x.id === 'q-bad-parts');
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /cannot be loaded: .*"hatShape" is not one of the sprite's controls/);
  const good = r.results.find((x) => x.id === 'q-good');
  assert.ok(good.metrics.looks > 0, 'the next sprite was still checked');
  assert.ok(!good.errors.some((e) => /cannot be loaded/.test(e)));
});

test('the dependency hash covers the engine, rigs, sound engine, quality code and schema', () => {
  const h = dependencyHash(ROOT);
  assert.match(h, /^[0-9a-f]{40}$/);
  assert.equal(dependencyHash(ROOT), h, 'stable');
});

test('a result that says the checker crashed is not cached', () => {
  assert.equal(cacheable({ ok: false, errors: ['checker crashed: boom'] }), false);
  assert.equal(cacheable({ ok: false, errors: ['checker stopped before finishing'] }), false);
  assert.equal(cacheable({ ok: false, errors: ['cannot be loaded: x'] }), true);
  assert.equal(cacheable({ ok: true, errors: [] }), true);
});

test('a sprite\'s cache key covers only the sounds it uses', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'sounds'));
  const put = (id, v) => fs.writeFileSync(path.join(root, 'sounds', `${id}.json`), JSON.stringify({ id, v }));
  put('step', 1); put('zap', 1);
  const h = soundsHash(root, ['step']);
  put('zap', 2);
  assert.equal(soundsHash(root, ['step']), h, 'another sound changed: same key');
  put('step', 2);
  assert.notEqual(soundsHash(root, ['step']), h, 'a sound it uses changed: new key');
  assert.notEqual(soundsHash(root, ['missing']), soundsHash(root, []), 'a missing sound is part of the key');
});
