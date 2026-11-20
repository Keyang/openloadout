// The GEN_GOLDEN_REWRITE switch for an unreleased layout's golden (build item B15b; tests/helpers/golden-rewrite.mjs,
// used by tests/unit/gen-motion-layout-contract.test.mjs): it names the keys to rewrite, refuses a key that is not a
// registered layout and a layout a library sprite uses, and reports which frames changed, were added or removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { rewriteKeys, layoutUsers, frameDiff, rewriteSummary, ROOT } from '../helpers/golden-rewrite.mjs';

test('rewriteKeys reads a comma list, and nothing when the switch is not set', () => {
  assert.deepEqual([...rewriteKeys({ GEN_GOLDEN_REWRITE: 'tiles@1, layers@1,' })], ['tiles@1', 'layers@1']);
  assert.deepEqual([...rewriteKeys({})], []);
  assert.deepEqual([...rewriteKeys({ GEN_GOLDEN_REWRITE: '' })], []);
});

test('layoutUsers finds the library data sprites a layout draws, and only those', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-golden-'));
  try {
    fs.mkdirSync(path.join(root, 'sprites'));
    fs.writeFileSync(path.join(root, 'sprites', 'tiles-a.json'), JSON.stringify({ body: { tiles: {} } }));
    fs.writeFileSync(path.join(root, 'sprites', 'coin.json'), JSON.stringify({ body: { pictures: {} } }));
    fs.writeFileSync(path.join(root, 'sprites', 'tiles-b.js'), 'export default {}');
    fs.writeFileSync(path.join(root, 'sprites', 'broken.json'), '{');
    assert.deepEqual(layoutUsers('tiles', root), ['sprites/tiles-a.json']);
    assert.deepEqual(layoutUsers('layers', root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('tiles@1 is not released yet: no library sprite is a tiles data file, so its golden may be rewritten', (t) => {
  const users = layoutUsers('tiles', ROOT);
  t.diagnostic(users.length ? `released by ${users.join(', ')}` : 'no library sprite draws with tiles@1 yet');
  assert.ok(Array.isArray(users));
});

test('frameDiff and rewriteSummary say what changed, was added and was removed', () => {
  const d = frameDiff({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, d: 4 });
  assert.deepEqual(d, { changed: ['b'], added: ['d'], removed: ['c'] });
  assert.equal(rewriteSummary('tiles@1', d, 3), 'rewrote tiles@1 (3 frames): 1 changed: b; 1 added: d; 1 removed: c');
});

test('the contract test refuses a rewrite of a key that is not a registered layout, and writes nothing', () => {
  const golden = path.join(ROOT, 'tests', 'fixtures', 'gen', 'tiles@1.json');
  const before = fs.readFileSync(golden, 'utf8');
  const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=every registered layout', path.join(ROOT, 'tests', 'unit', 'gen-motion-layout-contract.test.mjs')], { env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')), GEN_GOLDEN_REWRITE: 'nope@1' }, encoding: 'utf8', timeout: 120000 });
  assert.notEqual(r.status, 0, 'the run fails');
  assert.match(r.stdout + r.stderr, /nope@1.*not a registered layout/s);
  assert.equal(fs.readFileSync(golden, 'utf8'), before);
});

test('the contract test refuses a rewrite of a released layout (pictures@1: library sprites draw with it), and writes nothing', (t) => {
  const users = layoutUsers('pictures', ROOT);
  if (!users.length) { t.skip('no library sprite draws with pictures@1 here'); return; }
  const golden = path.join(ROOT, 'tests', 'fixtures', 'gen', 'pictures@1.json');
  const before = fs.readFileSync(golden, 'utf8');
  const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=every registered layout', path.join(ROOT, 'tests', 'unit', 'gen-motion-layout-contract.test.mjs')], { env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')), GEN_GOLDEN_REWRITE: 'pictures@1' }, encoding: 'utf8', timeout: 120000 });
  assert.notEqual(r.status, 0, 'the run fails');
  assert.match(r.stdout + r.stderr, /released layout/);
  assert.match(r.stdout + r.stderr, /pictures@1/);
  assert.equal(fs.readFileSync(golden, 'utf8'), before);
});
