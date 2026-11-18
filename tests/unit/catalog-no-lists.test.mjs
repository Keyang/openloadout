// Hard rule 2: an asset is one file and there is no list to maintain. The three lists the site once kept
// by hand (of sprites, of sounds, of kits) are gone, and no code may bring one back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/lib/assets.mjs';

// written in pieces so this file does not name them itself
const INDEX = 'index';
const OLD_LISTS = [`sprites/${INDEX}.js`, `sounds/${INDEX}.json`, `kits/${INDEX}.js`];
const CODE = ['app', 'tools', 'tests', 'engine', 'quality', 'search'];

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(m?js|json|html|css|md)$/.test(e.name) && fs.statSync(p).size < 400_000) yield p;
  }
}

test('the hand-kept lists do not exist', () => {
  for (const f of OLD_LISTS) assert.equal(fs.existsSync(path.join(ROOT, f)), false, `${f} is back: the build finds assets by scanning the folders`);
  assert.equal(fs.existsSync(path.join(ROOT, 'kits')), false, 'kits/ is back: kits are bundles now (bundles/<id>.json)');
});

test('no code mentions them', () => {
  const hits = [];
  for (const dir of CODE) for (const f of files(path.join(ROOT, dir))) {
    const text = fs.readFileSync(f, 'utf8');
    for (const old of OLD_LISTS) if (text.includes(old)) hits.push(`${path.relative(ROOT, f)} mentions ${old}`);
  }
  assert.deepEqual(hits, []);
});

test('the sprite and sound folders hold assets and shared helpers only', () => {
  for (const [dir, ext] of [['sprites', '.js'], ['sounds', '.json']]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (!f.endsWith(ext)) continue;
      assert.notEqual(f.slice(0, -ext.length), INDEX, `${dir}/${f}: a list file; assets are found by scanning the folder`);
    }
  }
});
