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
// what a project copy needs to build: the assets and the code they import, plus the site for --dist (catalog/: a studio
// library file in sprites/ is checked by catalog/studio-schema.js when it is loaded; studio item F1 made two of them;
// pieces/: what a data sprite, sprites/<id>.json, may use, as the migration redraws the library as data)
const COPY = ['engine', 'rigs', 'sound', 'sprites', 'sounds', 'bundles', 'app', 'catalog', 'pieces', 'index.html'];

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
  fs.copyFileSync(path.join(FIX, 'test-gem.json'), path.join(root, 'sprites', 'test-gem.json'));
  fs.copyFileSync(path.join(FIX, 'test-pop.json'), path.join(root, 'sounds', 'test-pop.json'));
  const r = build(root);
  assert.equal(r.code, 0, r.out);
  const cat = readCatalog(root);
  assert.equal(cat.assets.length, N_ASSETS + 2);
  const gem = cat.assets.find((a) => a.id === 'test-gem');
  const pop = cat.assets.find((a) => a.id === 'test-pop');
  assert.ok(gem && pop, 'both new assets are listed');
  assert.equal(gem.kind, 'sprite');
  assert.equal(gem.src, 'sprites/test-gem.json');
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

test('a code file in sprites/, a shared _helper too, stops the build before anything is written (R4a)', () => {
  const before = fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8');
  for (const name of ['_test-helper.js', 'old-sprite.js']) {
    const f = path.join(root, 'sprites', name);
    fs.writeFileSync(f, 'export const x = 1;\n');
    const r = build(root);
    fs.rmSync(f);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`sprites/${name.replace('.', '\\.')}: a code sprite`), r.out);
    assert.match(r.out, /\/sprite-forge/, r.out);
    assert.doesNotMatch(r.out, /\n\s+at /, 'no stack trace');
    assert.equal(fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8'), before, 'the catalogue the site reads is as it was');
  }
  assert.equal(build(root).code, 0);
});

test('removing an asset removes its pictures', () => {
  fs.rmSync(path.join(root, 'sprites', 'test-gem.json'));
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

test('exits 1 naming the file when a sprite file cannot be loaded', () => {
  const f = path.join(root, 'sprites', 'broken-sprite.json');
  fs.writeFileSync(f, JSON.stringify({ format: 'loadout-sprite', version: 2, id: 'broken-sprite' }));
  const r = build(root);
  fs.rmSync(f);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /sprites\/broken-sprite\.json/, r.out);
  assert.match(r.out, /name/i, r.out);
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
  // the knight's file is sprites/knight.json
  for (const p of ['index.html', 'app', 'engine', real.sprites.find((s) => s.id === 'knight').file, 'sounds/coin-pickup.json', 'bundles/dungeon-starter.json', 'generated/catalog.json', 'generated/thumbs/knight.png']) {
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

// ---- a failed build never changes what the site shows; messages say what to do -----------------------------

/** Every file under generated/ with its content, so "nothing changed" can be checked byte for byte. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[path.relative(dir, f)] = fs.readFileSync(f).toString('base64'); } };
  walk(dir);
  return out;
}
/** A stand-in quality bar for the copy: fails the sprites whose ids are listed, passes everything else. */
function stubQuality(root, failing = []) {
  fs.mkdirSync(path.join(root, 'quality'), { recursive: true });
  fs.writeFileSync(path.join(root, 'quality', 'sprite.js'),
    `const FAIL = ${JSON.stringify(failing)};\nexport function checkSprite(def) { return { errors: FAIL.includes(def.id) ? ['shine frame 0 / default: nothing drawn (and 3 more)'] : [], warnings: [], metrics: {} }; }\n`);
  fs.writeFileSync(path.join(root, 'quality', 'sound.js'), 'export function checkSound() { return { errors: [], warnings: [], notes: [], metrics: {} }; }\n');
}
const fullBuild = (root, ...args) => {
  const r = spawnSync(process.execPath, [BUILD, '--root', root, ...args], { encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: r.stdout + r.stderr };
};
const addNewAssets = (root) => {
  fs.copyFileSync(path.join(FIX, 'test-gem.json'), path.join(root, 'sprites', 'test-gem.json'));
  fs.copyFileSync(path.join(FIX, 'test-pop.json'), path.join(root, 'sounds', 'test-pop.json'));
};
const removeNewAssets = (root) => { fs.rmSync(path.join(root, 'sprites', 'test-gem.json'), { force: true }); fs.rmSync(path.join(root, 'sounds', 'test-pop.json'), { force: true }); };

test('a new asset that fails the quality bar stops the build and leaves generated/ exactly as it was', () => {
  stubQuality(root, []);
  assert.equal(fullBuild(root).code, 0, 'a good build to start from');
  const before = snapshot(path.join(root, 'generated'));
  addNewAssets(root);
  stubQuality(root, ['test-gem']);
  const r = fullBuild(root);
  assert.equal(r.code, 1, r.out);
  const after = snapshot(path.join(root, 'generated'));
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'no file was added to or taken from generated/');
  assert.deepEqual(Object.keys(after).filter((f) => after[f] !== before[f]), [], 'no file in generated/ was changed');
  const cat = readCatalog(root);
  assert.equal(cat.assets.some((a) => a.id === 'test-gem'), false, 'the failing sprite is not in the catalogue the site reads');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'generated', 'sounds.json'), 'utf8')).patches.some((p) => p.id === 'test-pop'), false, 'nor is the sound that came with it');
  // the message: which file, what is wrong, what to do, and that the site was not changed
  assert.match(r.out, /sprites\/test-gem\.json/);
  assert.match(r.out, /Test gem/);
  assert.match(r.out, /What is wrong:\s+shine frame 0 \/ default: nothing drawn/);
  assert.match(r.out, /What to do:/);
  assert.ok(r.out.includes('node tools/check.mjs test-gem'), r.out);
  assert.match(r.out, /site (still shows|was not changed|is unchanged)|nothing .* was changed/i, r.out);
  assert.doesNotMatch(r.out, /\n\s+at /, 'no stack trace');

  // once it passes, the same build takes it in, and says nothing about skipping
  stubQuality(root, []);
  const good = fullBuild(root);
  assert.equal(good.code, 0, good.out);
  assert.equal(readCatalog(root).assets.some((a) => a.id === 'test-gem'), true);
  assert.doesNotMatch(good.out, /NOT CHECKED:|left out the quality bar/, good.out);
  removeNewAssets(root);
  assert.equal(fullBuild(root).code, 0);
});

test('--skip-quality still builds, and the last thing it says is that nothing was checked', () => {
  stubQuality(root, ['slime']);            // would fail if it ran
  const r = build(root);                   // --skip-quality
  assert.equal(r.code, 0, r.out);
  const end = r.out.slice(r.out.lastIndexOf('Done in'));
  assert.match(end, /NOT CHECKED:/, r.out);
  assert.match(end, /left out the quality bar/, r.out);
  assert.match(end, /--skip-quality/, 'it names the option that did it');
  assert.match(end, /without --skip-quality|node tools\/build\.mjs/i, 'and says how to get a checked build');
});

test('when the site already lists an asset that now fails, the build says so', () => {
  addNewAssets(root);
  stubQuality(root, ['test-gem']);
  assert.equal(build(root).code, 0, 'a build that skips the bar takes the asset in');
  assert.equal(readCatalog(root).assets.some((a) => a.id === 'test-gem'), true);
  const r = fullBuild(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /still (lists|shows)[^\n]*Test gem/i, r.out);
  assert.match(r.out, /--skip-quality|earlier build/i, r.out);
  removeNewAssets(root);
  fs.rmSync(path.join(root, 'quality'), { recursive: true });
  assert.equal(build(root).code, 0);
});

test('a build step that breaks part-way leaves the catalogue alone and prints no stack trace', () => {
  const before = fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8');
  addNewAssets(root);
  fs.mkdirSync(path.join(root, 'tools', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'lib', 'search-index.mjs'), "export async function buildSearchIndex() { throw new Error('the disk is full'); }\n");
  const r = build(root);
  fs.rmSync(path.join(root, 'tools'), { recursive: true });
  removeNewAssets(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /search/i, 'it names the step');
  assert.match(r.out, /the disk is full/);
  assert.doesNotMatch(r.out, /\n\s+at /, 'no stack trace');
  assert.equal(fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8'), before, 'the catalogue is as the last good build left it');
  assert.deepEqual(fs.readdirSync(path.join(root, 'generated')).filter((f) => /tmp|\.next/.test(f)), [], 'no half-written file is left behind');
  assert.equal(build(root).code, 0);
});

test('two assets with one id: one message that names both files, and nothing misleading after it', () => {
  // a sprite named like a sound that a bundle lists (taken from the real bundles, whichever they are today)
  const soundId = real.bundles.flatMap((b) => b.sounds)[0];
  assert.ok(soundId, 'a bundle lists a sound');
  const f = path.join(root, 'sprites', `${soundId}.json`);
  const gem = JSON.parse(fs.readFileSync(path.join(FIX, 'test-gem.json'), 'utf8'));
  gem.id = soundId;
  delete gem.clips.shine.sounds;
  fs.writeFileSync(f, JSON.stringify(gem));
  const r = build(root);
  fs.rmSync(f);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /1 problem to fix/, r.out);
  assert.ok(r.out.includes(`sprites/${soundId}.json`) && r.out.includes(`sounds/${soundId}.json`), 'both files are named');
  assert.match(r.out, /rename/i, 'it says what to do');
  assert.doesNotMatch(r.out, /bundles\//, 'no bundle is blamed for it');
  assert.doesNotMatch(r.out, /move it to/, r.out);
  assert.equal(build(root).code, 0);
});
