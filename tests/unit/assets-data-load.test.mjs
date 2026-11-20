// Data sprites as library files (docs/data-sprites.md, build item B9; section 10 DQ1: a data sprite is sprites/<id>.json).
// tools/lib/assets.mjs loads sprites/*.json through engine/data-sprite.js next to the code files (.js), and the
// catalogue (tools/lib/catalog.mjs) makes their rows like any sprite's, with the definition's `rev`. Every test works in
// a scratch project (tests/helpers/data-sprites.mjs), never in the real sprites/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSprites, loadAssets, loadDataSprite, dataRev, findSpriteFile, spriteIds } from '../../tools/lib/assets.mjs';
import { buildCatalog } from '../../tools/lib/catalog.mjs';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { dataProject, coinDef, badgeDef, tuftDef, asFile, ROOT } from '../helpers/data-sprites.mjs';

const solid = (g) => g.data.filter((v) => v >>> 24).length;
const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });

test('loadSprites finds sprites/<id>.json beside the code files, sorted by id, as ordinary sprites', async () => {
  const root = dataProject({ data: { badge: badgeDef(), 'tuft-pot': tuftDef() }, code: ['coin'], pieces: true });
  const list = await loadSprites(root);
  assert.deepEqual(list.map((s) => s.id), ['badge', 'coin', 'tuft-pot']);
  assert.deepEqual(list.map((s) => s.file), ['sprites/badge.json', 'sprites/coin.js', 'sprites/tuft-pot.json']);
  const [badge, coin, tuft] = list;
  assert.equal(badge.data, true);
  assert.equal(coin.data, undefined, 'a code file is not marked as data');
  assert.match(badge.rev, /^[0-9a-f]{12}$/);
  assert.equal(coin.rev, undefined);
  for (const s of [badge, tuft]) {
    assert.equal(typeof s.def.render, 'function');
    assert.equal(s.def.id, s.id);
    assert.ok(solid(renderFrame(s.def, s.def.preview, 0, defaultParams(s.def))) > 20, `${s.id} draws`);
  }
  assert.deepEqual(Object.keys(badge.def.params).sort(), ['picture', 'plate', 'sign']);
  // loadAssets carries them unchanged
  const all = await loadAssets(root);
  assert.deepEqual(all.sprites.map((s) => s.id), ['badge', 'coin', 'tuft-pot']);
});

test('a data file is drawn by the project it is in: its own engine/ and pieces/', async () => {
  const root = dataProject({ data: { 'tuft-pot': tuftDef() }, pieces: true });
  const [s] = await loadSprites(root);
  // the piece came from <root>/pieces (the real pieces/ has no part:test-tuft)
  assert.ok(!fs.existsSync(path.join(ROOT, 'pieces', 'part-test-tuft.v1.json')));
  assert.ok(solid(renderFrame(s.def, 'idle', 0, defaultParams(s.def))) > 20);
});

test('a data file that is not JSON, names another id, or fails its check stops the load, naming the file', async () => {
  await rejects(loadSprites(dataProject({ data: { bad: '{ "format": "loadout-sprite", ' } })), /sprites\/bad\.json: not valid JSON/);
  await rejects(loadSprites(dataProject({ data: { other: badgeDef('badge') } })), /sprites\/other\.json: .*"other".*badge/);
  const broken = badgeDef();
  broken.body.pictures.draw[1] = { gen: 'no-such-thing', v: 1, on: 'plate' };
  await rejects(loadSprites(dataProject({ data: { badge: broken } })), /sprites\/badge\.json: .*no-such-thing/);
  // a definition with a function or anything but data never gets as far as drawing: JSON cannot hold one, and a
  // file that is code is not a .json file
  await rejects(loadSprites(dataProject({ data: { badge: 'export default {}' } })), /sprites\/badge\.json: not valid JSON/);
});

test('one id cannot have both a code file and a data file', async () => {
  const root = dataProject({ data: { coin: coinDef() }, code: ['coin'] });
  await rejects(loadSprites(root), /sprites\/coin\.js and sprites\/coin\.json/);
});

test('a library data file is checked strictly: gaps in meta and sounds that do not exist are errors', async () => {
  const noWords = badgeDef();
  delete noWords.meta.words;
  await rejects(loadSprites(dataProject({ data: { badge: noWords } })), /sprites\/badge\.json: .*words/);
  const cue = badgeDef();
  cue.clips.idle.sounds = [{ sound: 'zz-no-such-sound', frame: 0 }];
  await rejects(loadSprites(dataProject({ data: { badge: cue } })), /sprites\/badge\.json: .*zz-no-such-sound/);
  // with the sound in sounds/ it loads
  const ok = await loadSprites(dataProject({ data: { badge: cue }, sounds: { 'zz-no-such-sound': { id: 'zz-no-such-sound' } } }));
  assert.deepEqual(Object.values(ok[0].def.sounds).flat().map((c) => c.sound), ['zz-no-such-sound']);
});

test('a piece the definition names that is not in pieces/ stops the load, naming the piece', async () => {
  await rejects(loadSprites(dataProject({ data: { 'tuft-pot': tuftDef() } })), /sprites\/tuft-pot\.json: .*part:test-tuft@1/);
});

test('a version 1 studio definition saved as .json loads too', async () => {
  const newt = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'studio', 'newt.json'), 'utf8'));
  const [s] = await loadSprites(dataProject({ data: { [newt.id]: newt }, sounds: [...new Set(Object.values(newt.clips).flatMap((c) => (c.sounds ?? []).map((x) => x.sound)))] }));
  assert.equal(s.id, newt.id);
  assert.equal(s.data, true);
  assert.ok(solid(renderFrame(s.def, s.def.preview, 0, defaultParams(s.def))) > 20);
});

test('rev is a short hash of the definition: spacing and key order do not change it, a changed value does', () => {
  const a = badgeDef();
  const reordered = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(dataRev(a), dataRev(reordered));
  assert.equal(dataRev(a), dataRev(JSON.parse(JSON.stringify(a))));
  assert.match(dataRev(a), /^[0-9a-f]{12}$/);
  const b = badgeDef();
  b.palette[0].default = '#3a6ea6';
  assert.notEqual(dataRev(a), dataRev(b));
});

test('loadDataSprite loads one data file by path, inside the project or out of it (check.mjs and render.mjs use it)', async () => {
  const root = dataProject({ data: { badge: badgeDef() } });
  const s = await loadDataSprite(root, path.join(root, 'sprites', 'badge.json'));
  assert.equal(s.id, 'badge');
  const elsewhere = path.join(root, 'loose.json');
  fs.writeFileSync(elsewhere, asFile(badgeDef('loose')));
  assert.equal((await loadDataSprite(root, elsewhere)).id, 'loose');
  await rejects(loadDataSprite(root, path.join(root, 'sprites', 'nothing.json')), /nothing\.json/);
});

test('findSpriteFile and spriteIds know both kinds of file', () => {
  // an index file is never a sprite (its name is written in pieces: tests/unit/catalog-no-lists.test.mjs looks for the old list's name)
  const index = ['sprites/', 'index', '.json'].join('');
  const root = dataProject({ data: { badge: badgeDef() }, code: ['coin'], files: { 'sprites/_shared.js': 'export const X = 1;\n', [index]: '{}' } });
  assert.equal(findSpriteFile(root, 'badge'), path.join(root, 'sprites', 'badge.json'));
  assert.equal(findSpriteFile(root, 'coin'), path.join(root, 'sprites', 'coin.js'));
  assert.equal(findSpriteFile(root, 'nothing'), null);
  assert.equal(findSpriteFile(root, '../engine/sprite'), null, 'only a sprite id, never a path');
  assert.deepEqual(spriteIds(root), ['badge', 'coin']);
});

test('the catalogue row of a data sprite is a sprite row like any other, with src sprites/<id>.json and its rev', async () => {
  const root = dataProject({ data: { badge: badgeDef(), coin: coinDef() } });
  const loaded = await loadAssets(root);
  const cat = buildCatalog(loaded);
  const row = cat.assets.find((a) => a.id === 'coin');
  assert.equal(row.kind, 'sprite');
  assert.equal(row.src, 'sprites/coin.json');
  assert.equal(row.rev, loaded.sprites.find((s) => s.id === 'coin').rev);
  assert.equal(row.rev, dataRev(coinDef()));
  assert.equal(row.name, 'Data coin');
  assert.equal(row.type, 'pickup');
  assert.deepEqual(row.words, coinDef().meta.words);
  assert.deepEqual(row.styles, ['pixel']);
  assert.deepEqual(row.tech.frame, [32, 32]);
  assert.deepEqual(row.tech.clips.map((c) => c.name), ['idle']);
  assert.equal(row.tech.controls, 5, 'gold, shine, size, sparkle, speed');
  assert.equal(row.thumb, 'generated/thumbs/coin.png');
  assert.equal(row.strip, 'generated/strips/coin.png');
  assert.equal(row.stripClip, 'idle');
  assert.equal(row.stripFrames, 8);
});
