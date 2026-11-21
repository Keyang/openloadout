// tools/check.mjs and tools/sfx.mjs are thin wrappers over quality/ and tools/lib/quality-run.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// every run uses its own cache file, so parallel tests never share one
const cacheFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quality-cli-')), 'quality.json');
const node = (...args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 120000 });

test('check.mjs <id> --json prints one result per sprite with errors, warnings and metrics', () => {
  const r = node('tools/check.mjs', 'slime', '--json', '--cache-file', cacheFile());
  const out = JSON.parse(r.stdout);
  assert.equal(out.sprites.length, 1);
  const s = out.sprites[0];
  assert.equal(s.id, 'slime');
  assert.ok(Array.isArray(s.errors) && Array.isArray(s.warnings));
  assert.equal(typeof s.metrics.ms, 'number');
  assert.equal(typeof out.ok, 'boolean');
  assert.equal(r.status, out.ok ? 0 : 1);
});

test('check.mjs <id> keeps its human-readable output, and says when a result came from the cache', () => {
  const cf = cacheFile();
  const a = node('tools/check.mjs', 'slime', '--cache-file', cf);
  assert.match(a.stdout, /^slime\s+(ok|FAIL|ok \(warnings\))\s+\d+ looks x \d+ clips/m);
  const b = node('tools/check.mjs', 'slime', '--cache-file', cf);
  assert.match(b.stdout, /^slime\s+.*\(cached\)/m);
  const c = node('tools/check.mjs', 'slime', '--cache-file', cf, '--no-cache');
  assert.doesNotMatch(c.stdout, /\(cached\)/);
});

test('check.mjs with an unknown id fails', () => {
  const r = node('tools/check.mjs', 'no-such-sprite');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown sprite "no-such-sprite"/);
});

test('check.mjs reports a sprite that cannot be defined as that sprite\'s error, without crashing', () => {
  const bad = 'tests/fixtures/quality/sprite-files/q-bad-parts.json', good = 'tests/fixtures/quality/sprite-files/q-good.json';
  const r = node('tools/check.mjs', bad, good, '--json', '--no-cache');
  const out = JSON.parse(r.stdout);
  assert.equal(r.status, 1);
  assert.deepEqual(out.sprites.map((s) => s.id), ['q-bad-parts', 'q-good']);
  assert.equal(out.sprites[0].ok, false);
  assert.ok(out.sprites[1].metrics.looks > 0, 'the run went on to the next sprite');
  assert.match(out.sprites[0].errors[0], /cannot be loaded/);
  const h = node('tools/check.mjs', bad, '--no-cache');
  assert.match(h.stdout, /q-bad-parts\s+FAIL[\s\S]*ERROR\s+cannot be loaded/);
});

test('sfx.mjs check --json prints one result per patch', () => {
  const r = node('tools/sfx.mjs', 'check', 'tests/fixtures/quality/sounds/good-blip.json', 'tests/fixtures/quality/sounds/silent.json', '--json', '--cache-file', cacheFile());
  const out = JSON.parse(r.stdout);
  assert.equal(out.sounds.length, 2);
  assert.equal(out.sounds[0].id, 'q-blip');
  assert.deepEqual(out.sounds[0].errors, []);
  assert.ok(out.sounds[1].errors.length);
  assert.equal(out.ok, false);
  assert.equal(r.status, 1);
});

test('sfx.mjs check keeps its human-readable output', () => {
  const r = node('tools/sfx.mjs', 'check', 'tests/fixtures/quality/sounds/good-blip.json', '--cache-file', cacheFile());
  assert.match(r.stdout, /q-blip\s+"Blip"/);
  assert.match(r.stdout, /loudness /);
  assert.match(r.stdout, /params\s+change from min/);
  assert.match(r.stdout, /RESULT: PASS/);
  assert.equal(r.status, 0);
});
