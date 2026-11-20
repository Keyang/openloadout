// tools/check.mjs and tools/render.mjs take data sprites (sprites/<id>.json; docs/data-sprites.md, build item B9): by
// id inside their project, or by path. The real sprites/ holds no test file, so these run the tools on a path in a
// scratch folder, with their own cache file and output folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { dataProject, badgeDef, coinDef, asFile, ROOT } from '../helpers/data-sprites.mjs';

const tool = (name, args) => spawnSync(process.execPath, [path.join(ROOT, 'tools', name), ...args], { encoding: 'utf8', timeout: 120_000 });

test('check.mjs checks a data file given by path, and says when one does not pass', () => {
  const dir = dataProject();
  const good = path.join(dir, 'loose-coin.json'), bad = path.join(dir, 'loose-bad.json');
  fs.writeFileSync(good, asFile(coinDef('loose-coin')));
  const broken = badgeDef('loose-bad');
  broken.body.pictures.draw[1] = { gen: 'no-such-thing', v: 1, on: 'plate' };
  fs.writeFileSync(bad, asFile(broken));
  const cache = path.join(dir, 'quality.json');
  const r = tool('check.mjs', [good, '--json', '--cache-file', cache]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.deepEqual(out.sprites.map((s) => [s.id, s.ok, s.cached]), [['loose-coin', true, false]]);
  // the second time it comes from the cache
  assert.deepEqual(JSON.parse(tool('check.mjs', [good, '--json', '--cache-file', cache]).stdout).sprites.map((s) => s.cached), [true]);
  const f = tool('check.mjs', [bad, '--cache-file', cache]);
  assert.equal(f.status, 1);
  assert.match(f.stdout, /loose-bad\s+FAIL/);
  assert.match(f.stdout, /ERROR {2}cannot be loaded: .*no-such-thing/);
});

test('render.mjs draws a data file given by path into the folder --out names', () => {
  const dir = dataProject();
  const file = path.join(dir, 'loose-badge.json');
  fs.writeFileSync(file, asFile(badgeDef('loose-badge')));
  const out = path.join(dir, 'pictures');
  const r = tool('render.mjs', [file, '--out', out, '--sheet']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Data badge \(24x24\)/);
  for (const f of ['loose-badge-clips.png', 'loose-badge-variants.png', 'loose-badge-choices.png', 'loose-badge.png', 'loose-badge.json']) {
    assert.ok(fs.statSync(path.join(out, f)).size > 60, f);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'out', 'loose-badge-clips.png')), 'nothing written to the real out/');
});

test('render.mjs says why a data file cannot be drawn, and lists known ids for an unknown one', () => {
  const dir = dataProject();
  const file = path.join(dir, 'loose-bad.json');
  fs.writeFileSync(file, '{ "format": "loadout-sprite", ');
  const r = tool('render.mjs', [file, '--out', path.join(dir, 'pictures')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /loose-bad\.json: not valid JSON/);
  const u = tool('render.mjs', ['zz-no-such-sprite', '--out', path.join(dir, 'pictures')]);
  assert.equal(u.status, 1);
  assert.match(u.stderr, /Unknown sprite "zz-no-such-sprite"\. Known: .*\bcoin\b/);
});
