// Build item R4a (docs/data-sprites.md sections 5 and 9, "Last"): the build and the tools refuse a code sprite. A file in
// sprites/ that is not the data form, <id>.json of format "loadout-sprite" version 2, stops the build, the loader and the
// quality run with one message that names the file and says how to make the sprite as data (the /sprite-forge skill). A
// code file is never imported. A data file still loads. Runs on temporary project folders (--root, never the real one).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  loadSprites, loadAssets, loadSpriteFile, loadDataSprite, findSpriteFile, spriteIds, isSpriteFile,
  isCodeSpriteFile, codeSpriteFiles, codeSpriteRefusal, refuseCodeId,
} from '../../tools/lib/assets.mjs';
import { runQuality, assetFiles } from '../../tools/lib/quality-run.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(REAL, 'tools', 'build.mjs');
const coin = fs.readFileSync(path.join(REAL, 'sprites', 'coin.json'), 'utf8');

const roots = [];
test.after(() => { fs.rmSync(MARK, { force: true }); for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });
/** A project folder with the framework linked in, the library's pieces, the coin's sound and only the given files in sprites/. */
function make(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-refuse-code-'));
  roots.push(dir);
  for (const d of ['engine', 'catalog', 'rigs', 'sound', 'quality', 'pieces']) if (fs.existsSync(path.join(REAL, d))) fs.symlinkSync(path.join(REAL, d), path.join(dir, d));
  fs.mkdirSync(path.join(dir, 'sprites'));
  fs.mkdirSync(path.join(dir, 'sounds'));         // only the sound the coin's cue names, so a build here is quick
  fs.copyFileSync(path.join(REAL, 'sounds', 'coin-pickup.json'), path.join(dir, 'sounds', 'coin-pickup.json'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'sprites', name), text);
  return dir;
}
/** A program of the old kind, the shape every code sprite had; it writes the file MARK when it runs (a file, so a child process or a worker counts too), so a test can see it never did. */
const MARK = path.join(os.tmpdir(), `loadout-r4a-ran-${process.pid}`);
const program = (id) => `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(MARK)}, 'ran');\nexport default { id: '${id}', name: '${id}', clips: { idle: { frames: 1, fps: 1 } }, render() {} };\n`;

/** What the message says, for a file `rel` in sprites/ (the same words from the build, the loader and the quality run). */
function assertRefusal(message, rel, id) {
  assert.ok(message.startsWith(`${rel}:`), `starts with the file's name: ${message}`);
  assert.match(message, /code sprite/i, message);
  assert.ok(message.includes(`sprites/${id}.json`), `says what to make instead (sprites/${id}.json): ${message}`);
  assert.match(message, /format "loadout-sprite"/, message);
  assert.match(message, /version 2/, message);
  assert.match(message, /\/sprite-forge/, `names the skill: ${message}`);
  assert.match(message, /skills\/sprite-forge\/SKILL\.md/, message);
}

test('R4a: the loader refuses a code file in sprites/ for a new id, naming the file and the skill, and never runs it', async () => {
  fs.rmSync(MARK, { force: true });
  const root = make({ 'x.js': program('x') });
  await assert.rejects(loadSprites(root), (e) => { assertRefusal(e.message, 'sprites/x.js', 'x'); return true; });
  await assert.rejects(loadAssets(root), (e) => { assertRefusal(e.message, 'sprites/x.js', 'x'); return true; });
  assert.ok(!fs.existsSync(MARK), 'a code sprite is never imported');
});

test('R4a: an old id is refused the same way, beside its data file or alone', async () => {
  fs.rmSync(MARK, { force: true });
  for (const files of [{ 'coin.js': program('coin') }, { 'coin.js': program('coin'), 'coin.json': coin }]) {
    const root = make(files);
    await assert.rejects(loadSprites(root), (e) => { assertRefusal(e.message, 'sprites/coin.js', 'coin'); return true; });
  }
  assert.ok(!fs.existsSync(MARK), 'a code sprite is never imported');
});

test('R4a: a helper (_was-x.js, _shared.js), an index.js and an .mjs file are refused too, with the sprite files named together', async () => {
  for (const name of ['_was-x.js', '_shared.js', 'index.js', 'y.mjs']) {
    const root = make({ [name]: 'export const x = 1;\n', 'coin.json': coin });
    await assert.rejects(loadSprites(root), (e) => { assert.ok(e.message.startsWith(`sprites/${name}:`), e.message); assert.match(e.message, /\/sprite-forge/); return true; }, name);
  }
  const root = make({ 'a.js': program('a'), 'b.js': program('b') });
  await assert.rejects(loadSprites(root), (e) => { assert.ok(e.message.startsWith('sprites/a.js, sprites/b.js:'), e.message); assert.match(e.message, /code sprites/i); return true; });
});

test('R4a: a data file loads, the one beside it does not matter, and a data file of another format or version is refused naming it', async () => {
  const ok = make({ 'coin.json': coin });
  const got = await loadSprites(ok);
  assert.deepEqual(got.map((s) => s.id), ['coin']);
  assert.equal(got[0].file, 'sprites/coin.json');
  assert.equal(got[0].data, true);
  assert.equal((await loadAssets(ok)).sprites.length, 1);
  const v1 = make({ 'coin.json': coin.replace('"version": 2', '"version": 1') });
  await assert.rejects(loadSprites(v1), (e) => { assert.ok(e.message.startsWith('sprites/coin.json:'), e.message); assert.match(e.message, /version 2/); assert.match(e.message, /\/sprite-forge/); return true; });
  const other = make({ 'coin.json': coin.replace('"loadout-sprite"', '"something-else"') });
  await assert.rejects(loadSprites(other), (e) => { assert.ok(e.message.startsWith('sprites/coin.json:'), e.message); assert.match(e.message, /format "loadout-sprite"/); return true; });
});

test('R4a: the file helpers see only data files: isSpriteFile, findSpriteFile, spriteIds; codeSpriteFiles lists what is refused', () => {
  assert.equal(isSpriteFile('x.json'), true);
  assert.equal(isSpriteFile('x.js'), false);
  assert.equal(isSpriteFile('_x.json'), false);
  assert.equal(isSpriteFile('index.json'), false);
  for (const f of ['x.js', '_x.js', 'index.js', 'x.mjs', 'x.cjs']) assert.equal(isCodeSpriteFile(f), true, f);
  for (const f of ['x.json', 'x.png', 'README.md']) assert.equal(isCodeSpriteFile(f), false, f);
  const root = make({ 'coin.json': coin, 'coin.js': program('coin'), 'old.js': program('old') });
  assert.equal(findSpriteFile(root, 'coin'), path.join(root, 'sprites', 'coin.json'));
  assert.equal(findSpriteFile(root, 'old'), null);
  assert.deepEqual(spriteIds(root), ['coin']);
  assert.deepEqual(codeSpriteFiles(root), ['coin.js', 'old.js']);
  assert.deepEqual(codeSpriteFiles(make({ 'coin.json': coin })), []);
});

test('R4a: loadSpriteFile hands a .js path to the refusal, and loadDataSprite of a .json is the one way in', async () => {
  fs.rmSync(MARK, { force: true });
  const root = make({ 'x.js': program('x'), 'coin.json': coin });
  await assert.rejects(loadSpriteFile(root, 'sprites/x.js'), (e) => { assertRefusal(e.message, 'sprites/x.js', 'x'); return true; });
  await assert.rejects(loadSpriteFile(root, path.join(root, 'sprites', 'x.js')), (e) => { assertRefusal(e.message, 'sprites/x.js', 'x'); return true; });
  assert.ok(!fs.existsSync(MARK), 'a code sprite is never imported');
  assert.equal((await loadSpriteFile(root, 'sprites/coin.json')).id, 'coin');
  assert.equal((await loadDataSprite(root, 'sprites/coin.json')).id, 'coin');
  assert.match(codeSpriteRefusal('sprites/z.js'), /^sprites\/z\.js: a code sprite/);
});

test('R4a: the quality run refuses a code file, listed or asked for by id or path, and runs a data file', async () => {
  fs.rmSync(MARK, { force: true });
  const root = make({ 'x.js': program('x'), 'coin.json': coin });
  await assert.rejects(runQuality({ root, sounds: [], cache: false, workers: 1 }), (e) => { assertRefusal(e.message, 'sprites/x.js', 'x'); return true; });
  await assert.rejects(runQuality({ root, sprites: [path.join(root, 'sprites', 'x.js')], sounds: [], cache: false, workers: 1 }), (e) => { assertRefusal(e.message, 'sprites/x.js', 'x'); return true; });
  assert.throws(() => assetFiles(root, 'sprite', path.join(root, 'sprites', 'x.js')), (e) => { assertRefusal(e.message, 'sprites/x.js', 'x'); return true; });
  assert.ok(!fs.existsSync(MARK), 'a code sprite is never imported');
  const { results } = await runQuality({ root: make({ 'coin.json': coin }), sounds: [], cache: false, workers: 1 });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'coin');
  assert.ok(results[0].ok, results[0].errors.join('; '));
});

test('R4a: the build stops at validate for a code file, naming it, and writes nothing; a data file passes validate', () => {
  const root = make({ 'x.js': program('x'), 'coin.json': coin });
  const r = spawnSync(process.execPath, [BUILD, '--root', root, '--skip-quality', '--skip-search', '--skip-vendor'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = r.stdout + r.stderr;
  assert.match(out, /Build stopped/);
  assert.match(out, /sprites\/x\.js: a code sprite/);
  assert.match(out, /sprites\/x\.json/);
  assert.match(out, /\/sprite-forge/);
  assert.ok(!fs.existsSync(path.join(root, 'generated')), 'a build that stops at validate writes nothing');
  fs.rmSync(path.join(root, 'sprites', 'x.js'));
  const ok = spawnSync(process.execPath, [BUILD, '--root', root, '--skip-quality', '--skip-search', '--skip-vendor'], { encoding: 'utf8', timeout: 170000 });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /validate\s+1 sprites \(1 data files\)/);
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8'));
  assert.equal(cat.assets.find((a) => a.id === 'coin').src, 'sprites/coin.json');
});

test('R4a: tools/check.mjs and tools/render.mjs refuse a code file by path, with the message and no stack trace, and exit 1', () => {
  const root = make({});
  const file = path.join(root, 'sprites', 'x.js'), marker = path.join(root, 'ran');
  fs.writeFileSync(file, `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\nexport default { id: 'x' };\n`);
  for (const [tool, args] of [['check.mjs', [file, '--no-cache']], ['render.mjs', [file, '--out', path.join(root, 'out')]]]) {
    const r = spawnSync(process.execPath, [path.join(REAL, 'tools', tool), ...args], { cwd: REAL, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 1, `${tool}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /x\.js: a code sprite\. Loadout takes sprites as data only/, `${tool}: ${r.stderr}`);
    assert.match(r.stderr, /\/sprite-forge/, tool);
    assert.doesNotMatch(r.stderr, /\n\s+at /, `${tool}: no stack trace`);
  }
  assert.ok(!fs.existsSync(marker), 'a code sprite is never imported');
});

test('R4a: an id that exists only as a code file gets the refusal, not "Unknown sprite" and a list of ids (the maker loop checks and renders by id)', async () => {
  fs.rmSync(MARK, { force: true });
  const root = make({ 'zzx.js': program('zzx'), 'coin.json': coin });
  // the quality run (tools/check.mjs <id>) and the helper
  await assert.rejects(runQuality({ root, sprites: ['zzx'], sounds: [], cache: false, workers: 1 }), (e) => {
    assert.equal(e.name, 'CodeSpriteError');
    assertRefusal(e.message, 'sprites/zzx.js', 'zzx');
    assert.doesNotMatch(e.message, /Unknown sprite|Known:/);
    return true;
  });
  assert.throws(() => refuseCodeId(root, 'zzx'), /sprites\/zzx\.js: a code sprite/);
  assert.doesNotThrow(() => refuseCodeId(root, 'coin'), 'a data sprite is not refused');
  assert.doesNotThrow(() => refuseCodeId(root, 'nothing-here'), 'an id with no file at all is left to "Unknown sprite"');
  assert.doesNotThrow(() => refuseCodeId(root, '../x'), 'not a plain id');
  await assert.rejects(runQuality({ root, sprites: ['nothing-here'], sounds: [], cache: false, workers: 1 }), (e) => e.name === 'Error' && /Unknown sprite "nothing-here"/.test(e.message));
  // tools/render.mjs <id>, run from a scratch project that has its own copy of the command
  fs.mkdirSync(path.join(root, 'tools'));
  fs.copyFileSync(path.join(REAL, 'tools', 'render.mjs'), path.join(root, 'tools', 'render.mjs'));
  fs.copyFileSync(path.join(REAL, 'tools', 'png.mjs'), path.join(root, 'tools', 'png.mjs'));
  fs.symlinkSync(path.join(REAL, 'tools', 'lib'), path.join(root, 'tools', 'lib'));
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'render.mjs'), 'zzx', '--out', path.join(root, 'out')], { cwd: root, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /sprites\/zzx\.js: a code sprite\. Loadout takes sprites as data only/, r.stderr);
  assert.match(r.stderr, /sprites\/zzx\.json/);
  assert.match(r.stderr, /\/sprite-forge/);
  assert.doesNotMatch(r.stderr, /Unknown sprite|Known:/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
  const u = spawnSync(process.execPath, [path.join(root, 'tools', 'render.mjs'), 'nothing-here', '--out', path.join(root, 'out')], { cwd: root, encoding: 'utf8', timeout: 60000 });
  assert.equal(u.status, 1);
  assert.match(u.stderr, /Unknown sprite "nothing-here"\. Known: coin/);
  assert.ok(!fs.existsSync(MARK), 'a code sprite is never imported');
});

test('R4a: the skill\'s redraw sheet reads the old sprite by path (--old, else the frozen copy) and refuses a code file inside sprites/', () => {
  const root = make({ 'coin.json': coin });
  fs.symlinkSync(path.join(REAL, 'tools'), path.join(root, 'tools'));
  const sheets = path.join(REAL, '..', '..', 'skills', 'sprite-forge', 'sheets.mjs');
  if (!fs.existsSync(sheets)) return;   // the skill lives outside this folder; a copy of the project alone has no skill to test
  const run = (...a) => spawnSync(process.execPath, [sheets, 'redraw', 'coin', '--root', root, '--scale', '1', ...a], { cwd: root, encoding: 'utf8', timeout: 120000 });
  fs.writeFileSync(path.join(root, 'sprites', '_was-coin.js'), program('coin'));
  const inside = run('--old', path.join(root, 'sprites', '_was-coin.js'));
  assert.equal(inside.status, 1, inside.stdout + inside.stderr);
  assert.match(inside.stderr, /is in sprites\/, where the build refuses any code file/);
  assert.match(inside.stderr, /--old <file>/);
  assert.ok(!fs.existsSync(MARK), 'a code file in sprites/ is never imported');
  fs.rmSync(path.join(root, 'sprites', '_was-coin.js'));
  const missing = run('--old', path.join(root, 'nothing.js'));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing nothing\.js \(the old sprite: pass --old <file>/);
  const fixture = path.join(REAL, 'tests', 'fixtures', 'code-sprites', 'coin.js');
  const ok = run('--old', fixture);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /coin-redraw\.png/);
  assert.ok(fs.existsSync(path.join(root, 'out', 'coin-redraw.png')));
  fs.mkdirSync(path.join(root, 'tests', 'fixtures'), { recursive: true });
  fs.symlinkSync(path.join(REAL, 'tests', 'fixtures', 'code-sprites'), path.join(root, 'tests', 'fixtures', 'code-sprites'));
  assert.equal(run().status, 0, 'the frozen copy tests/fixtures/code-sprites/<id>.js is the default old sprite');
});

test('R4a: dist ships the sprite data files of sprites/ only (the ones the build validates): a README, a picture, a page, a folder, _helper.json or index.json left in it stays out', () => {
  const root = make({ 'coin.json': coin, 'README.md': '# not a sprite', 'x.png': 'png', 'x.txt': 'notes', 'x.html': '<script>1</script>', '_helper.json': '{}', 'index.json': '{}' });
  fs.mkdirSync(path.join(root, 'sprites', 'sub'));
  fs.writeFileSync(path.join(root, 'sprites', 'sub', 'y.json'), '{}');
  for (const d of ['app', 'bundles', 'search', 'vendor']) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
  const r = spawnSync(process.execPath, [BUILD, '--root', root, '--skip-quality', '--skip-search', '--skip-vendor', '--dist'], { encoding: 'utf8', timeout: 170000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(fs.readdirSync(path.join(root, 'dist', 'sprites')).sort(), ['coin.json']);
});

test('R4a: every kind of code file is refused, in any letter case: .jsx, .tsx, .mts, .cts and .JS stop the build and the loader as .js does', () => {
  for (const name of ['a.js', 'a.jsx', 'a.mjs', 'a.mts', 'a.cjs', 'a.cts', 'a.ts', 'a.tsx', 'a.JS', 'a.Jsx', '_h.TS', 'index.mjs']) assert.equal(isCodeSpriteFile(name), true, name);
  for (const name of ['a.json', 'a.JSON', 'a.md', 'a.png', 'a.html', 'a.txt', 'jsx', 'a.json5']) assert.equal(isCodeSpriteFile(name), false, name);
  const root = make({ 'coin.json': coin, 'x.jsx': program('x'), 'y.TSX': program('y'), 'z.mts': program('z') });
  assert.deepEqual(codeSpriteFiles(root), ['x.jsx', 'y.TSX', 'z.mts']);
  for (const id of ['x', 'z']) assert.throws(() => refuseCodeId(root, id), (e) => e.name === 'CodeSpriteError' && e.message.startsWith(`sprites/${id}.`));
  const r = spawnSync(process.execPath, [BUILD, '--root', root, '--skip-quality', '--skip-search', '--skip-vendor'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /sprites\/x\.jsx, sprites\/y\.TSX, sprites\/z\.mts: code sprites/);
  assert.ok(!fs.existsSync(MARK), 'a code sprite is never imported');
});

test('R4a: the refusal says "take this file out of sprites/" only for a file that is in sprites/', () => {
  const inside = codeSpriteRefusal('sprites/x.js');
  assert.match(inside, /then take this file out of sprites\/\.$/);
  assert.match(codeSpriteRefusal('sprites/x.js, sprites/y.js'), /then take these files out of sprites\/\.$/);
  assert.match(codeSpriteRefusal(path.join(make({}), 'sprites', 'x.js')), /then take this file out of sprites\/\.$/, 'an absolute path into sprites/ counts');
  const frozen = codeSpriteRefusal(path.join('tests', 'fixtures', 'code-sprites', 'coin.js'));
  assert.doesNotMatch(frozen, /take this file out of sprites/);
  assert.match(frozen, /^tests\/fixtures\/code-sprites\/coin\.js: a code sprite\./);
  assert.match(frozen, /not a sprite of the library, so it stays outside sprites\/\.$/);
  assert.doesNotMatch(codeSpriteRefusal('elsewhere/my-sprites.js'), /take this file out of sprites/, 'a folder only named like sprites is not sprites/');
  // and as the tool prints it, for a frozen copy given by path
  const r = spawnSync(process.execPath, [path.join(REAL, 'tools', 'render.mjs'), path.join(REAL, 'tests', 'fixtures', 'code-sprites', 'coin.js'), '--out', os.tmpdir()], { cwd: REAL, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /a code sprite/);
  assert.doesNotMatch(r.stderr, /take this file out of sprites/);
});

test('R4a: the versions step refuses a code file in sprites/ instead of skipping it', async () => {
  const { buildVersions } = await import('../../tools/lib/versions-build.mjs');
  const root = make({ 'coin.json': coin, 'x.js': program('x') });
  fs.mkdirSync(path.join(root, 'generated'));
  await assert.rejects(buildVersions({ root, only: ['coin'], cache: null }), (e) => {
    assert.equal(e.name, 'CodeSpriteError');
    assertRefusal(e.message, 'sprites/x.js', 'x');
    return true;
  });
  assert.ok(!fs.existsSync(MARK), 'a code sprite is never imported');
});
