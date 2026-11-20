// The quality cache (tools/lib/quality-run.mjs) keys each asset on the files it really loads: its own file, the
// modules it imports (followed through their imports), and the checker's code. These tests prove both halves:
//   - a change to anything an asset uses checks it again (a stale pass is never served);
//   - a change to anything else leaves its cached result alone (so one edit does not re-check the whole library).
// They run on a small made-up project, so they take a moment and never touch the real cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQuality, assetFiles } from '../../tools/lib/quality-run.mjs';
import { isSpriteFile } from '../../tools/lib/assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const sprite = (id, imports, value, extra = '') => `${imports}\nexport default { id: '${id}', name: '${id}', value: ${value}, clips: { idle: {} }, render() {}${extra} };\n`;
const FILES = {
  // the checker: a sprite fails when its value is over 5, a sound when its level is over the sound engine's limit
  'quality/sprite.js': "import { round } from '../engine/maths.js';\nexport function checkSprite(def) { const v = round(def.value); return { errors: v > 5 ? [`value ${v} is over 5`] : [], warnings: [], metrics: { v } }; }\n",
  'quality/sound.js': "import { MAX } from '../sound/limits.js';\nexport function checkSound(patch) { return { errors: patch.level > MAX ? [`level ${patch.level} is over ${MAX}`] : [], warnings: [], notes: [], metrics: {} }; }\n",
  'catalog/schema.js': 'export function validateMeta() { return { ok: true, errors: [] }; }\n',
  'engine/maths.js': 'export const round = (v) => Math.round(v);\n',
  'engine/base.js': 'export const BASE = 1;\n',
  'engine/other.js': 'export const OTHER = 2;\n',
  'engine/unused.js': 'export const UNUSED = 0;\n',
  'sound/limits.js': 'export const MAX = 3;\n',
  'rigs/tall.js': "import { BASE } from '../engine/base.js';\nexport const size = BASE + 1;\n",
  'rigs/short.js': "import { OTHER } from '../engine/other.js';\nexport const size = OTHER;\n",
  'sprites/_shared.js': 'export const NUDGE = 0;\n',
  // "one" stands on the tall rig, uses the shared helper and plays the sound "beep"; "two" stands on the short rig
  'sprites/one.js': sprite('one', "import { size } from '../rigs/tall.js';\nimport { NUDGE } from './_shared.js';", 'size + NUDGE', ", sounds: { idle: [{ sound: 'beep', frame: 0 }] }"),
  'sprites/two.js': sprite('two', "import { size } from '../rigs/short.js';", 'size'),
  'sounds/beep.json': '{ "id": "beep", "name": "Beep", "level": 1 }\n',
  'sounds/hum.json': '{ "id": "hum", "name": "Hum", "level": 1 }\n',
};

function project() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-qcache-')));
  for (const [rel, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const edit = (root, rel, from, to) => {
  const f = path.join(root, rel), text = fs.readFileSync(f, 'utf8');
  assert.ok(text.includes(from), `${rel} holds ${from}`);
  fs.writeFileSync(f, text.replace(from, to));
};
/** Runs the bar over the whole made-up project; returns { checked: ids checked again, failed: ids that fail }. */
async function run(root) {
  const { results } = await runQuality({ root, workers: 2 });
  for (const r of results) assert.ok(!r.errors.some((e) => /checker (crashed|stopped)|cannot be/.test(e)), `${r.id}: ${r.errors.join('; ')}`);
  return { checked: results.filter((r) => !r.cached).map((r) => r.id).sort(), failed: results.filter((r) => !r.ok).map((r) => r.id).sort() };
}
async function fresh() {
  const root = project();
  assert.deepEqual(await run(root), { checked: ['beep', 'hum', 'one', 'two'], failed: [] }, 'the first run checks everything');
  assert.deepEqual(await run(root), { checked: [], failed: [] }, 'the second run checks nothing');
  return root;
}

test('a change to a module behind an asset checks that asset again, and it now fails: no stale pass', async () => {
  const root = await fresh();
  // engine/base.js is two steps from sprites/one.js (one -> rigs/tall.js -> engine/base.js) and nothing else uses it
  edit(root, 'engine/base.js', 'BASE = 1', 'BASE = 9');
  assert.deepEqual(await run(root), { checked: ['one'], failed: ['one'] });
  assert.deepEqual(await run(root), { checked: [], failed: ['one'] }, 'the failure is cached too, and still reported');
  edit(root, 'engine/base.js', 'BASE = 9', 'BASE = 1');
  assert.deepEqual(await run(root), { checked: ['one'], failed: [] });
});

test('a change to a rig checks only the sprites on that rig', async () => {
  const root = await fresh();
  edit(root, 'rigs/short.js', 'size = OTHER', 'size = OTHER + 7');
  assert.deepEqual(await run(root), { checked: ['two'], failed: ['two'] });
  edit(root, 'rigs/tall.js', 'BASE + 1', 'BASE + 2');
  assert.deepEqual(await run(root), { checked: ['one'], failed: ['two'] });
});

test('a change to a shared helper in sprites/ checks only the sprites that import it', async () => {
  const root = await fresh();
  edit(root, 'sprites/_shared.js', 'NUDGE = 0', 'NUDGE = 8');
  assert.deepEqual(await run(root), { checked: ['one'], failed: ['one'] });
});

test('a change to the asset\'s own file checks only that asset', async () => {
  const root = await fresh();
  edit(root, 'sprites/two.js', 'value: size', 'value: size + 6');
  assert.deepEqual(await run(root), { checked: ['two'], failed: ['two'] });
  edit(root, 'sounds/hum.json', '"level": 1', '"level": 4');
  assert.deepEqual(await run(root), { checked: ['hum'], failed: ['hum', 'two'] });
});

test('a change nothing uses, and a new file nothing uses, check nothing again', async () => {
  const root = await fresh();
  edit(root, 'engine/unused.js', 'UNUSED = 0', 'UNUSED = 1');
  fs.writeFileSync(path.join(root, 'engine', 'brand-new.js'), 'export const NEW = 1;\n');
  fs.writeFileSync(path.join(root, 'rigs', 'brand-new.js'), "import { NEW } from '../engine/brand-new.js';\nexport const size = NEW;\n");
  fs.writeFileSync(path.join(root, 'sprites', '_other-helper.js'), 'export const x = 1;\n');
  assert.deepEqual(await run(root), { checked: [], failed: [] });
});

test('a change to the checker\'s own code checks every asset of that kind, and only that kind', async () => {
  const root = await fresh();
  edit(root, 'quality/sprite.js', 'v > 5', 'v > 1');
  assert.deepEqual(await run(root), { checked: ['one', 'two'], failed: ['one', 'two'] }, 'the sprite checker changed');
  edit(root, 'engine/maths.js', 'Math.round(v)', 'Math.round(v) - 2');               // a module the sprite checker imports
  assert.deepEqual(await run(root), { checked: ['one', 'two'], failed: [] }, 'a module the sprite checker imports changed');
  edit(root, 'sound/limits.js', 'MAX = 3', 'MAX = 0');                               // a module the sound checker imports
  assert.deepEqual(await run(root), { checked: ['beep', 'hum'], failed: ['beep', 'hum'] }, 'a module the sound checker imports changed');
  edit(root, 'quality/sound.js', 'patch.level > MAX', 'patch.level > MAX + 5');
  assert.deepEqual(await run(root), { checked: ['beep', 'hum'], failed: [] }, 'the sound checker changed');
});

test('a change to the metadata rules checks everything again', async () => {
  const root = await fresh();
  edit(root, 'catalog/schema.js', 'ok: true', 'ok:  true');
  assert.deepEqual(await run(root), { checked: ['beep', 'hum', 'one', 'two'], failed: [] });
});

test('a change to a sound checks that sound and the sprites that play it', async () => {
  const root = await fresh();
  edit(root, 'sounds/beep.json', '"level": 1', '"level": 2');
  assert.deepEqual(await run(root), { checked: ['beep', 'one'], failed: [] });
});

test('a module with an import that cannot be followed makes its sprites depend on the whole framework', async () => {
  const root = project();
  edit(root, 'rigs/short.js', 'export const size', 'export const later = (name) => import(name);\nexport const size');
  assert.deepEqual((await run(root)).checked, ['beep', 'hum', 'one', 'two']);
  edit(root, 'engine/unused.js', 'UNUSED = 0', 'UNUSED = 1');
  assert.deepEqual(await run(root), { checked: ['two'], failed: [] }, 'two may load anything, so any framework change checks it again; one is untouched');
});

test('an import of a file that does not exist yet is part of the key: creating the file checks the sprite again', async () => {
  const root = project();
  fs.writeFileSync(path.join(root, 'sprites', 'three.js'), sprite('three', "import { size } from '../rigs/coming.js';", 'size'));
  const first = await runQuality({ root, sprites: ['three'], sounds: [] });
  assert.match(first.results[0].errors[0], /cannot be loaded/);
  assert.equal((await runQuality({ root, sprites: ['three'], sounds: [] })).results[0].cached, true);
  fs.writeFileSync(path.join(root, 'rigs', 'coming.js'), 'export const size = 1;\n');
  const after = (await runQuality({ root, sprites: ['three'], sounds: [] })).results[0];
  assert.equal(after.cached, false);
  assert.deepEqual(after.errors, []);
});

test('assetFiles lists what a key covers', () => {
  const root = project();
  const rel = (list) => list.map((f) => path.relative(root, f).split(path.sep).join('/')).filter((f) => !f.startsWith('..'));
  assert.deepEqual(rel(assetFiles(root, 'sprite', path.join(root, 'sprites', 'one.js')).files),
    ['catalog/schema.js', 'engine/base.js', 'engine/maths.js', 'quality/sprite.js', 'rigs/tall.js', 'sprites/_shared.js', 'sprites/one.js']);
  assert.deepEqual(rel(assetFiles(root, 'sound', path.join(root, 'sounds', 'beep.json')).files),
    ['catalog/schema.js', 'quality/sound.js', 'sound/limits.js', 'sounds/beep.json']);
});

test('on the real project: a key covers the asset and the checker, and is narrower than the whole framework', () => {
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  // a code file or a data file (docs/data-sprites.md, DQ1): a data file's key is its definition, the pieces and generators it names and the code that draws it
  const spriteFiles = fs.readdirSync(path.join(ROOT, 'sprites')).filter(isSpriteFile).sort();
  const framework = ['engine', 'rigs'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));
  const usedBy = Object.fromEntries(framework.map((f) => [f, 0]));
  for (const f of spriteFiles) {
    const { files, open } = assetFiles(ROOT, 'sprite', path.join(ROOT, 'sprites', f));
    const list = files.map(rel);
    assert.equal(open, false, `sprites/${f}: every import can be followed`);
    for (const need of [`sprites/${f}`, 'quality/sprite.js', 'catalog/schema.js', 'engine/sprite.js']) assert.ok(list.includes(need), `sprites/${f}: its key covers ${need}`);
    assert.ok(!list.includes('quality/sound.js'), `sprites/${f}: the sound checker is not behind a sprite`);
    for (const x of list) if (x in usedBy) usedBy[x]++;
  }
  // the point of per-asset keys: most framework files are behind only some of the sprites
  const narrow = framework.filter((f) => usedBy[f] < spriteFiles.length);
  assert.ok(narrow.length > framework.length / 2, `${narrow.length} of ${framework.length} framework files are behind only some sprites`);
  const sound = fs.readdirSync(path.join(ROOT, 'sounds')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()[0];
  const list = assetFiles(ROOT, 'sound', path.join(ROOT, 'sounds', sound)).files.map(rel);
  assert.ok(list.includes(`sounds/${sound}`) && list.includes('quality/sound.js'));
  assert.deepEqual(list.filter((f) => /^(sprites|rigs)\//.test(f) || f === 'quality/sprite.js'), [], 'no sprite code is behind a sound');
});
