// What a data sprite's cached pass and its cached pictures are keyed on, beyond its own file (build item B9, review
// round 2, issue 6). Everything that changes what a data sprite draws must be in both keys:
//   - engine/data-frames.js framesInClip (any frame number drawn inside the clip), which tools/lib/assets.mjs and
//     app/catalog.js both use: in engine/, so tools/lib/thumbs.mjs keys pictures on it, and in the quality key's code;
//   - catalog/sprite-schema.js parseSpriteJson, whose cleaning runs before drawing: in the quality key's code, and in
//     the picture key refreshDataPictures keeps (thumbs.mjs keys on engine/ and rigs/ only).
// The tools no longer reach into the site's app/ for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runQuality, dataSpriteFiles } from '../../tools/lib/quality-run.mjs';
import { dataProject, coinDef, badgeDef, ROOT } from '../helpers/data-sprites.mjs';

const rel = (root, files) => files.map((f) => path.relative(root, f).split(path.sep).join('/'));

test('a data sprite\'s quality key holds engine/data-frames.js and catalog/sprite-schema.js', () => {
  const root = dataProject({ data: { coin: coinDef() } });
  const { files } = dataSpriteFiles(root, path.join(root, 'sprites', 'coin.json'));
  const mine = rel(root, files);
  assert.ok(mine.includes('engine/data-frames.js'), mine.join(', '));
  assert.ok(mine.includes('catalog/sprite-schema.js'));
  assert.ok(!mine.some((f) => f.startsWith('app/')), 'nothing of the site\'s app/ is in it');
});

test('the tools take framesInClip from engine/, not from the site\'s app/catalog.js, which hands the same function on', async () => {
  const text = fs.readFileSync(path.join(ROOT, 'tools', 'lib', 'assets.mjs'), 'utf8');
  assert.ok(!/from ['"]\.\.\/\.\.\/app\//.test(text), 'tools/lib/assets.mjs imports nothing from app/');
  const E = await import('../../engine/data-frames.js');
  const C = await import('../../app/catalog.js');
  assert.equal(C.framesInClip, E.framesInClip);
});

test('a change to engine/data-frames.js re-checks the data sprites, and only them', async () => {
  const root = dataProject({ data: { coin: coinDef() }, code: ['crate'] });
  const run = async () => (await runQuality({ root, sprites: undefined, sounds: [], workers: 2 })).results.filter((r) => !r.cached).map((r) => r.id).sort();
  assert.deepEqual(await run(), ['coin', 'crate']);
  assert.deepEqual(await run(), []);
  fs.appendFileSync(path.join(root, 'engine', 'data-frames.js'), '\n// changed\n');
  assert.deepEqual(await run(), ['coin']);
});

// one build's pictures step, in its own process as the build runs it
const ASSETS = pathToFileURL(path.join(ROOT, 'tools', 'lib', 'assets.mjs')).href, THUMBS = pathToFileURL(path.join(ROOT, 'tools', 'lib', 'thumbs.mjs')).href;
function picturesStep(root) {
  const code = `import { loadSprites, refreshDataPictures } from ${JSON.stringify(ASSETS)}; import { writeImages } from ${JSON.stringify(THUMBS)};
const root = ${JSON.stringify(root)}; const sprites = await loadSprites(root);
const refreshed = refreshDataPictures({ root, sprites }); const { made } = writeImages({ root, sprites });
console.log(JSON.stringify({ refreshed, made: made.sort() }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('a change to catalog/sprite-schema.js redraws the pictures of every data sprite, pieces or not, and no code sprite\'s', () => {
  const root = dataProject({ data: { badge: badgeDef() }, code: ['crate'] });
  assert.deepEqual(picturesStep(root), { refreshed: [], made: ['badge', 'crate'] });
  assert.deepEqual(picturesStep(root), { refreshed: [], made: [] });
  fs.appendFileSync(path.join(root, 'catalog', 'sprite-schema.js'), '\n// changed\n');
  assert.deepEqual(picturesStep(root), { refreshed: ['badge'], made: ['badge'] });
  assert.deepEqual(picturesStep(root), { refreshed: [], made: [] });
});

// review round 3, issue 2: the picture key named the tools' own files by their absolute paths, so the same project in
// another checkout (another folder) got other keys and redrew every data sprite's pictures.
test('the picture key of a data sprite is the same in any checkout: no absolute path is hashed', async () => {
  const keyIn = async () => {
    const root = dataProject({ data: { badge: badgeDef(), coin: coinDef() } });
    fs.cpSync(path.join(ROOT, 'tools'), path.join(root, 'tools'), { recursive: true });      // the tools too, as in a checkout elsewhere
    const A = await import(pathToFileURL(path.join(root, 'tools', 'lib', 'assets.mjs')).href);
    const sprites = await A.loadSprites(root);
    A.refreshDataPictures({ root, sprites });
    return JSON.parse(fs.readFileSync(path.join(root, '.cache', 'build.json'), 'utf8')).dataPictures;
  };
  const a = await keyIn(), b = await keyIn();
  assert.deepEqual(Object.keys(a).sort(), ['badge', 'coin']);
  assert.deepEqual(a, b);
});

// review round 3, issue 4: checkSprite now runs the data checks itself (quality/sprite.js imports quality/data-checks.js,
// which imports engine/data-sprite.js and so every generator family). They look only at version 2 data sprites, so a
// code sprite's key holds quality/data-checks.js but not what it imports: editing a generator re-checks no code sprite.
test('a code sprite\'s quality key holds quality/data-checks.js, but not engine/data-sprite.js or any generator', async () => {
  const { assetFiles } = await import('../../tools/lib/quality-run.mjs');
  const root = dataProject({ code: ['crate'] });
  const mine = rel(root, assetFiles(root, 'sprite', path.join(root, 'sprites', 'crate.js')).files);
  assert.ok(mine.includes('quality/sprite.js') && mine.includes('quality/data-checks.js'), mine.join(', '));
  assert.ok(!mine.includes('engine/data-sprite.js'), mine.join(', '));
  assert.ok(!mine.some((f) => f.startsWith('engine/gen/')), mine.join(', '));
});

test('a change to a generator family re-checks the data sprites naming it and no code sprite', async () => {
  const root = dataProject({ data: { coin: coinDef(), badge: badgeDef() }, code: ['crate'] });
  const run = async () => (await runQuality({ root, sprites: undefined, sounds: [], workers: 2 })).results.filter((r) => !r.cached).map((r) => r.id).sort();
  assert.deepEqual(await run(), ['badge', 'coin', 'crate']);
  const fx = fs.readdirSync(path.join(root, 'engine', 'gen')).find((f) => fs.readFileSync(path.join(root, 'engine', 'gen', f), 'utf8').includes("'twinkle'"));
  assert.ok(fx, 'the family file of twinkle@1');
  fs.appendFileSync(path.join(root, 'engine', 'gen', fx), '\n// changed\n');
  const again = await run();
  assert.ok(!again.includes('crate'), again.join(', '));
});
