// tools/build.mjs, run on a temporary copy of the project (--root), never on the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPNG } from '../fixtures/catalog/png-read.mjs';
import { loadAssets } from '../../tools/lib/assets.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(REAL, 'tools', 'build.mjs');
const FIX = path.join(REAL, 'tests', 'fixtures', 'catalog');
// what a project copy needs to build: the assets and the code they import, plus the site for --dist
const COPY = ['engine', 'rigs', 'sound', 'sprites', 'sounds', 'bundles', 'app', 'index.html'];

function makeCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-build-'));
  for (const p of COPY) fs.cpSync(path.join(REAL, p), path.join(dir, p), { recursive: true });
  return dir;
}
function build(root, ...args) {
  const r = spawnSync(process.execPath, [BUILD, '--root', root, '--skip-quality', ...args], { encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: r.stdout + r.stderr };
}
const readCatalog = (root) => JSON.parse(fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8'));

// expected counts come from the real project, so adding assets does not break these tests
const real = await loadAssets(REAL);
const N_ASSETS = real.sprites.length + real.sounds.length;
const N_PICTURED = real.sprites.length + real.sounds.filter((s) => !s.isMusic).length;   // music has no pictures
const N_BUNDLES = real.bundles.length;

const root = makeCopy();
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('builds the catalogue, thumbnails and strips for the copy', () => {
  const r = build(root);
  assert.equal(r.code, 0, r.out);
  for (const step of ['validate', 'catalogue', 'thumbnails', 'quality', 'search', 'vendor']) assert.match(r.out, new RegExp(step, 'i'), `summary should mention ${step}`);
  assert.match(r.out, /\d+ ?ms|\d+(\.\d+)? ?s\b/, 'summary has timings');
  const cat = readCatalog(root);
  assert.equal(cat.version, 1);
  assert.equal(cat.assets.length, N_ASSETS);
  assert.equal(cat.bundles.length, N_BUNDLES);
  for (const a of cat.assets) {
    for (const key of ['thumb', 'strip']) {
      if (!a[key]) continue;
      const img = readPNG(fs.readFileSync(path.join(root, a[key])));
      assert.ok(img.w > 0 && img.h > 0, `${a.id} ${key}`);
    }
    if (a.kind === 'sprite') assert.ok(a.thumb && a.strip, a.id);
    if (a.kind === 'sound') assert.ok(a.thumb && !a.strip, a.id);
    if (a.kind === 'music') assert.ok(!a.thumb && !a.strip, a.id);
  }
  assert.ok(fs.existsSync(path.join(root, '.cache', 'build.json')));
});

test('G3: a new sprite file and a new sound file appear in the catalogue with no other edit', () => {
  fs.copyFileSync(path.join(FIX, 'test-gem.js'), path.join(root, 'sprites', 'test-gem.js'));
  fs.copyFileSync(path.join(FIX, 'test-pop.json'), path.join(root, 'sounds', 'test-pop.json'));
  const r = build(root);
  assert.equal(r.code, 0, r.out);
  const cat = readCatalog(root);
  assert.equal(cat.assets.length, N_ASSETS + 2);
  const gem = cat.assets.find((a) => a.id === 'test-gem');
  const pop = cat.assets.find((a) => a.id === 'test-pop');
  assert.ok(gem && pop, 'both new assets are listed');
  assert.equal(gem.kind, 'sprite');
  assert.equal(gem.src, 'sprites/test-gem.js');
  assert.deepEqual(gem.tech.frame, [16, 16]);
  assert.equal(gem.tech.sounds, 1);
  assert.deepEqual(gem.words.slice(0, 2), ['gem', 'jewel']);
  assert.equal(pop.kind, 'sound');
  assert.equal(pop.tech.seconds, 0.15);
  const thumb = readPNG(fs.readFileSync(path.join(root, gem.thumb)));
  assert.deepEqual([thumb.w, thumb.h], [32, 32]);
  const strip = readPNG(fs.readFileSync(path.join(root, gem.strip)));
  assert.deepEqual([strip.w, strip.h], [64, 16]);
  assert.ok(fs.existsSync(path.join(root, pop.thumb)));
});

test('a second build skips assets whose source has not changed', () => {
  const r = build(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\b0 made\b/, r.out);
  assert.match(r.out, new RegExp(`\\b${N_PICTURED + 2} skipped\\b`), r.out);   // + the new sprite and sound
  // touching the content of one file re-renders only that one
  const f = path.join(root, 'sounds', 'test-pop.json');
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  p.params[0].default = 900;
  fs.writeFileSync(f, JSON.stringify(p, null, 1));
  const r2 = build(root);
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.out, /\b1 made\b/, r2.out);
});

test('a change to a shared _helper file in sprites/ redraws the sprites', () => {
  const helper = path.join(root, 'sprites', '_test-helper.js');
  fs.writeFileSync(helper, 'export const x = 1;\n');
  const r = build(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`\\b${real.sprites.length + 1} made\\b`), r.out);
  fs.rmSync(helper);
  assert.equal(build(root).code, 0);
});

test('removing an asset removes its pictures', () => {
  fs.rmSync(path.join(root, 'sprites', 'test-gem.js'));
  fs.rmSync(path.join(root, 'sounds', 'test-pop.json'));
  const r = build(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(readCatalog(root).assets.length, N_ASSETS);
  assert.ok(!fs.existsSync(path.join(root, 'generated', 'thumbs', 'test-gem.png')));
  assert.ok(!fs.existsSync(path.join(root, 'generated', 'strips', 'test-gem.png')));
  assert.ok(!fs.existsSync(path.join(root, 'generated', 'thumbs', 'test-pop.png')));
});

test('exits 1 with a clear message on an asset with invalid meta', () => {
  const p = JSON.parse(fs.readFileSync(path.join(FIX, 'test-pop.json'), 'utf8'));
  p.id = 'bad-pop';
  p.meta.role = 'world/tile';
  p.meta.words = ['Pop'];
  const f = path.join(root, 'sounds', 'bad-pop.json');
  fs.writeFileSync(f, JSON.stringify(p, null, 1));
  const before = fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8');
  const r = build(root);
  fs.rmSync(f);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /sounds\/bad-pop\.json/);
  assert.match(r.out, /meta\.role/);
  assert.match(r.out, /meta\.words/);
  assert.equal(fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8'), before, 'the catalogue is left alone');
});

test('exits 1 when an asset has no meta at all', () => {
  const p = JSON.parse(fs.readFileSync(path.join(FIX, 'test-pop.json'), 'utf8'));
  p.id = 'no-meta';
  delete p.meta;
  const f = path.join(root, 'sounds', 'no-meta.json');
  fs.writeFileSync(f, JSON.stringify(p, null, 1));
  const r = build(root);
  fs.rmSync(f);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /sounds\/no-meta\.json/);
  assert.match(r.out, /meta is missing/);
});

test('exits 1 when a bundle names an asset that does not exist', () => {
  const f = path.join(root, 'bundles', 'broken.json');
  fs.writeFileSync(f, JSON.stringify({ id: 'broken', name: 'Broken', gameType: 'platformer', blurb: 'x', sprites: ['dragon'], sounds: [], music: [], theme: {} }, null, 2));
  const r = build(root);
  fs.rmSync(f);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /bundles\/broken\.json/);
  assert.match(r.out, /"dragon"/);
});

test('exits 1 naming the file when a sound or bundle is not valid JSON', () => {
  for (const rel of ['sounds/broken-json.json', 'bundles/broken-json.json']) {
    const f = path.join(root, rel);
    fs.writeFileSync(f, '{ "id": "broken-json", "name": ');
    const r = build(root);
    fs.rmSync(f);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(rel.replace('/', '\\/').replace('.', '\\.')), r.out);
    assert.match(r.out, /JSON/, r.out);
    assert.doesNotMatch(r.out, /\n\s+at /, 'no stack trace');
  }
});

test('exits 1 naming the file when a sprite file throws on import', () => {
  const f = path.join(root, 'sprites', 'broken-sprite.js');
  fs.writeFileSync(f, "import { defineSprite } from '../engine/sprite.js';\nexport default defineSprite({ id: 'broken-sprite' });\n");
  const r = build(root);
  fs.rmSync(f);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /sprites\/broken-sprite\.js/, r.out);
  assert.match(r.out, /missing "name"/, r.out);
});

test('--root with no folder prints how to use it', () => {
  const r = spawnSync(process.execPath, [BUILD, '--root'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /usage: node tools\/build\.mjs/i);
  assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
});

test('--dist copies the publishable site and nothing else', () => {
  const r = build(root, '--dist');
  assert.equal(r.code, 0, r.out);
  const dist = path.join(root, 'dist');
  for (const p of ['index.html', 'app', 'engine', 'sprites/knight.js', 'sounds/coin-pickup.json', 'bundles/dungeon-starter.json', 'generated/catalog.json', 'generated/thumbs/knight.png']) {
    assert.ok(fs.existsSync(path.join(dist, p)), `dist/${p}`);
  }
  for (const p of ['.cache', 'tools', 'tests', 'node_modules', 'dist']) assert.ok(!fs.existsSync(path.join(dist, p)), `dist/${p} should not be copied`);
});

test('optional steps run when their module exists in the project', () => {
  fs.mkdirSync(path.join(root, 'tools', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'lib', 'search-index.mjs'),
    "import fs from 'node:fs';\nexport async function buildSearchIndex({ assets, outFile }) { fs.writeFileSync(outFile, String(assets.length)); }\n");
  fs.writeFileSync(path.join(root, 'tools', 'lib', 'vendor.mjs'),
    "import fs from 'node:fs'; import path from 'node:path';\nexport async function vendorAll({ root }) { fs.mkdirSync(path.join(root, 'vendor'), { recursive: true }); fs.writeFileSync(path.join(root, 'vendor', 'x.txt'), 'ok'); }\n");
  const r = build(root);
  fs.rmSync(path.join(root, 'tools'), { recursive: true });
  assert.equal(r.code, 0, r.out);
  assert.equal(fs.readFileSync(path.join(root, 'generated', 'search.sqlite'), 'utf8'), String(N_ASSETS));
  assert.equal(fs.readFileSync(path.join(root, 'vendor', 'x.txt'), 'utf8'), 'ok');
});

test('the quality step runs quality/sprite.js and quality/sound.js when they exist, and fails on errors', () => {
  fs.mkdirSync(path.join(root, 'quality'), { recursive: true });
  fs.writeFileSync(path.join(root, 'quality', 'sprite.js'),
    "export function checkSprite(def) { return { errors: def.id === 'slime' ? ['too slimy'] : [], warnings: [], metrics: {} }; }\n");
  fs.writeFileSync(path.join(root, 'quality', 'sound.js'),
    "export function checkSound(patch) { return { errors: [], warnings: ['w'], metrics: {} }; }\n");
  const r = spawnSync(process.execPath, [BUILD, '--root', root], { encoding: 'utf8', timeout: 180000 });
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 1, out);
  assert.match(out, /slime/);
  assert.match(out, /too slimy/);
  const skipped = build(root);   // --skip-quality
  fs.rmSync(path.join(root, 'quality'), { recursive: true });
  assert.equal(skipped.code, 0, skipped.out);
});
