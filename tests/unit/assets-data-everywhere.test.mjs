// Data sprites (sprites/<id>.json; docs/data-sprites.md, build items B9 and B9c) are first-class in every tool that
// names a sprite by its id or scans sprites/: the ready-made versions of the build (tools/lib/versions-build.mjs),
// tools/scene.mjs, tools/tilemap.mjs and tools/bundles-from-plans.mjs, all through one shared loader in
// tools/lib/assets.mjs (findSpriteFile for the file, loadSpriteFile to load it). The real sprites/ holds no test file,
// so these run in scratch projects (tests/helpers/data-sprites.mjs) and never touch the real folders.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { dataProject, coinDef, badgeDef, tuftDef, asFile, editFile, ROOT } from '../helpers/data-sprites.mjs';
import { loadSpriteFile, loadDataSprite, findSpriteFile } from '../../tools/lib/assets.mjs';
import { buildVersions, versionsKey, VERSIONS_PER_ASSET } from '../../tools/lib/versions-build.mjs';
import { importGraph } from '../../tools/lib/imports.mjs';
import { loadSprite as sceneSprite } from '../../tools/scene.mjs';

const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });

test('loadSpriteFile loads a sprite file by path: a data file read as data; a code file is refused, never imported (R4a)', async () => {
  const root = dataProject({ data: { badge: badgeDef() }, code: ['slime'] });
  const data = await loadSpriteFile(root, findSpriteFile(root, 'badge'));
  assert.equal(data.id, 'badge');
  assert.equal(typeof data.render, 'function');
  assert.equal(data.name, (await loadDataSprite(root, 'sprites/badge.json')).name);
  assert.equal(findSpriteFile(root, 'slime'), null, 'the code file is no sprite');
  await rejects(loadSpriteFile(root, path.join(root, 'sprites', 'slime.js')), /^sprites\/slime\.js: a code sprite.*sprites\/slime\.json.*\/sprite-forge/);
  // relative to the project, and out of it
  assert.equal((await loadSpriteFile(root, 'sprites/badge.json')).id, 'badge');
  const elsewhere = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loose-')), 'loose.json');
  fs.writeFileSync(elsewhere, asFile(badgeDef('loose')));
  assert.equal((await loadSpriteFile(root, elsewhere)).id, 'loose');
  await rejects(loadSpriteFile(root, 'sprites/nothing.json'), /nothing\.json/);
  await rejects(loadSpriteFile(root, path.join(root, 'sprites', 'nothing.js')), /nothing\.js/);
});

// ---- the ready-made versions (generated/versions.json) ----------------------------------------------------------

test('buildVersions makes the versions of a data sprite, as versionsOf does for the sprite it draws', async () => {
  const root = dataProject({ data: { coin: coinDef(), badge: badgeDef() } });
  const out = await buildVersions({ root });
  assert.deepEqual(Object.keys(out), ['badge', 'coin']);
  const [{ versionsOf }, { defaultParams, cleanParams }] = await Promise.all([
    import(pathToFileURL(path.join(root, 'engine', 'versions.js')).href), import(pathToFileURL(path.join(root, 'engine', 'sprite.js')).href)]);
  for (const id of ['coin', 'badge']) {
    const sprite = await loadDataSprite(root, `sprites/${id}.json`);
    const want = versionsOf(sprite, VERSIONS_PER_ASSET);
    assert.ok(out[id].length >= 2, `${id}: ${out[id].length} versions`);
    assert.deepEqual(out[id].map((v) => v.name), want.map((v) => v.name));
    assert.deepEqual(out[id].map((v) => cleanParams(sprite, v.params)), want.map((v) => v.params));
    const dflt = defaultParams(sprite);
    for (const v of out[id]) for (const [k, x] of Object.entries(v.params)) assert.notEqual(x, dflt[k], `${id}: only what differs from the defaults`);
  }
  // the same output with the cache, and only the asked ones
  const cache = {};
  assert.deepEqual(await buildVersions({ root, cache }), out);
  assert.deepEqual(await buildVersions({ root, cache }), out);
  assert.deepEqual(Object.keys(await buildVersions({ root, only: ['coin'] })), ['coin']);
});

test('a data sprite that cannot be drawn stops the versions, naming its file', async () => {
  const broken = badgeDef();
  broken.body.pictures.draw[1] = { gen: 'no-such-thing', v: 1, on: 'plate' };
  const root = dataProject({ data: { badge: broken } });
  await rejects(buildVersions({ root }), /sprites\/badge\.json: .*no-such-thing/);
});

test('a code file in sprites/ stops the versions, naming it, whether its id has a data file or not (R4a)', async () => {
  const root = dataProject({ data: { slime: coinDef('slime') }, code: ['slime'] });
  await rejects(buildVersions({ root }), /^sprites\/slime\.js: a code sprite.*\/sprite-forge/);
  await rejects(buildVersions({ root: dataProject({ data: { coin: coinDef() }, code: ['slime'] }) }), /^sprites\/slime\.js: a code sprite/);
});

test('a data sprite\'s versions are keyed on its definition, the pieces it uses and the code that draws it', () => {
  const root = dataProject({ data: { 'tuft-pot': tuftDef(), coin: coinDef() }, pieces: true });
  const file = path.join(root, 'sprites', 'tuft-pot.json');
  const key = () => versionsKey(importGraph({ root }), file, root);
  const k0 = key();
  assert.equal(key(), k0, 'the same input gives the same key');
  assert.notEqual(versionsKey(importGraph({ root }), path.join(root, 'sprites', 'coin.json'), root), k0);
  editFile(root, 'pieces/stamp-test-clod.v1.json', '"stamp:test-clod"', '"stamp:test-clod" ');
  const k1 = key();
  assert.notEqual(k1, k0, 'a piece it uses (through another piece) changed');
  editFile(root, 'engine/data-sprite.js', '\n', '\n// changed\n');
  const k2 = key();
  assert.notEqual(k2, k1, 'the code that draws every data sprite changed');
  fs.writeFileSync(file, asFile({ ...tuftDef(), name: 'Tuft pot two' }));
  assert.notEqual(key(), k2, 'its definition changed');
});

// ---- tools/scene.mjs and tools/tilemap.mjs ----------------------------------------------------------------------

test('scene.mjs loads a data sprite by path, and by id from the sprites/ of a project', async () => {
  const root = dataProject({ data: { badge: badgeDef() } });
  const byPath = await sceneSprite(path.join(root, 'sprites', 'badge.json'));
  assert.equal(byPath.id, 'badge');
  assert.equal((await sceneSprite('sprites/badge.json', root)).id, 'badge');
  assert.equal((await sceneSprite('badge', process.cwd(), root)).id, 'badge');
  await rejects(sceneSprite('nothing', process.cwd(), root), /no sprite "nothing".*sprites\/nothing\.json/);
  // a code file in a project is refused by path (R4a)
  fs.writeFileSync(path.join(root, 'sprites', 'old.js'), 'export default {};\n');
  await rejects(sceneSprite(path.join(root, 'sprites', 'old.js')), /^sprites\/old\.js: a code sprite|old\.js: a code sprite/);
  // the real project's sprites load by id
  assert.equal((await sceneSprite('slime')).id, 'slime');
  const real = fs.readdirSync(path.join(ROOT, 'sprites')).find((f) => f.endsWith('.json') && !f.startsWith('_'));
  if (real) assert.equal((await sceneSprite(real.slice(0, -5))).id, real.slice(0, -5));
});

test('tilemap.mjs draws a data sprite given by path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tilemap-data-'));
  const file = path.join(dir, 'zz-data-badge.json');
  fs.writeFileSync(file, asFile(badgeDef('zz-data-badge')));
  const out = path.join(dir, 'out');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'tilemap.mjs'), '--file', file, '--out', out], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Data badge/);
  assert.ok(fs.statSync(path.join(out, 'zz-data-badge-map.png')).size > 60);
  const bad = path.join(dir, 'zz-bad.json');
  fs.writeFileSync(bad, '{ "format": ');
  const b = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'tilemap.mjs'), '--file', bad, '--out', out], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(b.status, 1);
  assert.match(b.stderr, /zz-bad\.json: not valid JSON/);
});

// ---- tools/bundles-from-plans.mjs ------------------------------------------------------------------------------

test('bundles-from-plans counts a data file as the sprite a plan names, and asks for a data file for one still to come; a code file is not one', () => {
  const real = path.join(ROOT, 'bundles', 'specs');
  const planFile = fs.readdirSync(real).filter((f) => f.endsWith('.plan.json')).sort()[0];
  const plan = JSON.parse(fs.readFileSync(path.join(real, planFile), 'utf8'));
  const idsOf = (list) => list.map((x) => (typeof x === 'string' ? x : x.id));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-plans-data-'));
  fs.mkdirSync(path.join(dir, 'bundles', 'specs'), { recursive: true });
  fs.copyFileSync(path.join(real, planFile), path.join(dir, 'bundles', 'specs', planFile));
  for (const d of ['engine', 'sound', 'rigs']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });   // rigs/: engine/data-rules.js, which engine/sprite.js imports (build item F3), needs it
  for (const d of ['sprites', 'sounds']) fs.mkdirSync(path.join(dir, d));
  const sprites = idsOf(plan.sprites);
  // every sprite as a data file (the tool only asks whether a sprite's file is there)
  sprites.forEach((id) => fs.writeFileSync(path.join(dir, 'sprites', `${id}.json`), ''));
  for (const id of [...idsOf(plan.sounds), ...idsOf(plan.music)]) fs.writeFileSync(path.join(dir, 'sounds', `${id}.json`), '{}');
  const run = () => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'bundles-from-plans.mjs'), '--root', dir, '--check'], { encoding: 'utf8', timeout: 60_000 });
  const ok = run();
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, new RegExp(`${plan.id}: complete`));
  const gone = sprites[1];
  fs.rmSync(path.join(dir, 'sprites', `${gone}.json`));
  const r = run();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`${plan.id}: not written, 1 asset still to come: sprites/${gone}\\.json`));
  fs.writeFileSync(path.join(dir, 'sprites', `${gone}.js`), '');      // a code file does not stand in for the data file
  assert.equal(run().status, 1);
});
