// The quality cache (tools/lib/quality-run.mjs) keys each asset on the files it really loads. A sound is keyed on its own
// file, the checker's code (quality/sound.js and what it imports, found from the source text), the metadata rules and the
// worker; a sprite, since build item R4a, is a data file keyed on its definition, the generators and pieces it names and the
// code that draws and checks it (tests/unit/assets-data-keys.test.mjs holds that half, and assets-refuse-code.test.mjs
// that a code sprite is refused). These tests prove both halves of the rule for what remains here:
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

const FILES = {
  // the checkers: a sound fails when its level is over the sound engine's limit; the sprite checker is only here because the worker loads it
  'quality/sprite.js': "import { round } from '../engine/maths.js';\nexport function checkSprite(def) { const v = round(def.value); return { errors: v > 5 ? [`value ${v} is over 5`] : [], warnings: [], metrics: { v } }; }\n",
  'quality/sound.js': "import { MAX } from '../sound/limits.js';\nexport function checkSound(patch) { return { errors: patch.level > MAX ? [`level ${patch.level} is over ${MAX}`] : [], warnings: [], notes: [], metrics: {} }; }\n",
  'catalog/schema.js': 'export function validateMeta() { return { ok: true, errors: [] }; }\n',
  'engine/maths.js': 'export const round = (v) => Math.round(v);\n',
  'engine/unused.js': 'export const UNUSED = 0;\n',
  'sound/limits.js': 'export const MAX = 3;\n',
  'sound/other.js': 'export const OTHER = 2;\n',
  'sounds/beep.json': '{ "id": "beep", "name": "Beep", "level": 1 }\n',
  'sounds/hum.json': '{ "id": "hum", "name": "Hum", "level": 1 }\n',
};

function project() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-qcache-')));
  for (const [rel, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  fs.mkdirSync(path.join(root, 'sprites'));
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
  assert.deepEqual(await run(root), { checked: ['beep', 'hum'], failed: [] }, 'the first run checks everything');
  assert.deepEqual(await run(root), { checked: [], failed: [] }, 'the second run checks nothing');
  return root;
}

test('a change to a module behind a sound checks that sound again, and it now fails: no stale pass', async () => {
  const root = await fresh();
  edit(root, 'sound/limits.js', 'MAX = 3', 'MAX = 0');                               // a module the sound checker imports: every sound
  assert.deepEqual(await run(root), { checked: ['beep', 'hum'], failed: ['beep', 'hum'] });
  assert.deepEqual(await run(root), { checked: [], failed: ['beep', 'hum'] }, 'the failure is cached too, and still reported');
  edit(root, 'sound/limits.js', 'MAX = 0', 'MAX = 3');
  assert.deepEqual(await run(root), { checked: ['beep', 'hum'], failed: [] });
});

test('a change to the asset\'s own file checks only that asset', async () => {
  const root = await fresh();
  edit(root, 'sounds/hum.json', '"level": 1', '"level": 4');
  assert.deepEqual(await run(root), { checked: ['hum'], failed: ['hum'] });
  edit(root, 'sounds/beep.json', '"level": 1', '"level": 2');
  assert.deepEqual(await run(root), { checked: ['beep'], failed: ['hum'] });
});

test('a change nothing uses, and a new file nothing uses, check nothing again', async () => {
  const root = await fresh();
  edit(root, 'engine/unused.js', 'UNUSED = 0', 'UNUSED = 1');
  edit(root, 'sound/other.js', 'OTHER = 2', 'OTHER = 3');
  fs.writeFileSync(path.join(root, 'engine', 'brand-new.js'), 'export const NEW = 1;\n');
  fs.writeFileSync(path.join(root, 'sound', 'brand-new.js'), "import { NEW } from '../engine/brand-new.js';\nexport const x = NEW;\n");
  assert.deepEqual(await run(root), { checked: [], failed: [] });
});

test('a change to the checker\'s own code checks every asset of that kind, and only that kind', async () => {
  const root = await fresh();
  edit(root, 'quality/sprite.js', 'v > 5', 'v > 1');
  assert.deepEqual(await run(root), { checked: [], failed: [] }, 'the sprite checker is no part of a sound\'s key');
  edit(root, 'engine/maths.js', 'Math.round(v)', 'Math.round(v) - 2');               // a module only the sprite checker imports
  assert.deepEqual(await run(root), { checked: [], failed: [] });
  edit(root, 'quality/sound.js', 'patch.level > MAX', 'patch.level > MAX + 5');
  assert.deepEqual(await run(root), { checked: ['beep', 'hum'], failed: [] }, 'the sound checker changed');
});

test('a change to the metadata rules checks everything again', async () => {
  const root = await fresh();
  edit(root, 'catalog/schema.js', 'ok: true', 'ok:  true');
  assert.deepEqual(await run(root), { checked: ['beep', 'hum'], failed: [] });
});

test('a module with an import that cannot be followed makes its sounds depend on the whole framework', async () => {
  const root = project();
  edit(root, 'sound/limits.js', 'export const MAX', 'export const later = (name) => import(name);\nexport const MAX');
  assert.deepEqual((await run(root)).checked, ['beep', 'hum']);
  edit(root, 'engine/unused.js', 'UNUSED = 0', 'UNUSED = 1');
  assert.deepEqual(await run(root), { checked: ['beep', 'hum'], failed: [] }, 'a sound may load anything, so any framework change checks it again');
});

test('assetFiles lists what a key covers, and refuses a sprite that is not a data file (R4a)', () => {
  const root = project();
  const rel = (list) => list.map((f) => path.relative(root, f).split(path.sep).join('/')).filter((f) => !f.startsWith('..'));
  assert.deepEqual(rel(assetFiles(root, 'sound', path.join(root, 'sounds', 'beep.json')).files),
    ['catalog/schema.js', 'quality/sound.js', 'sound/limits.js', 'sounds/beep.json']);
  fs.writeFileSync(path.join(root, 'sprites', 'one.js'), 'export default {};\n');
  assert.throws(() => assetFiles(root, 'sprite', path.join(root, 'sprites', 'one.js')), { message: /^sprites\/one\.js: a code sprite/ });
});

test('on the real project: a key covers the asset and the checker, and is narrower than the whole framework', () => {
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  // a sprite is a data file (docs/data-sprites.md, DQ1): its key is its definition, the pieces and generators it names and the code that draws it
  const spriteFiles = fs.readdirSync(path.join(ROOT, 'sprites')).filter(isSpriteFile).sort();
  assert.ok(spriteFiles.length > 0);
  for (const f of spriteFiles) {
    const { files, open } = assetFiles(ROOT, 'sprite', path.join(ROOT, 'sprites', f));
    const list = files.map(rel);
    assert.equal(open, false, `sprites/${f}: every import can be followed`);
    for (const need of [`sprites/${f}`, 'quality/sprite.js', 'catalog/schema.js', 'engine/data-sprite.js']) assert.ok(list.includes(need), `sprites/${f}: its key covers ${need}`);
    assert.ok(!list.includes('quality/sound.js'), `sprites/${f}: the sound checker is not behind a sprite`);
  }
  const sound = fs.readdirSync(path.join(ROOT, 'sounds')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()[0];
  const list = assetFiles(ROOT, 'sound', path.join(ROOT, 'sounds', sound)).files.map(rel);
  assert.ok(list.includes(`sounds/${sound}`) && list.includes('quality/sound.js'));
  assert.deepEqual(list.filter((f) => /^(sprites|rigs)\//.test(f) || f === 'quality/sprite.js'), [], 'no sprite code is behind a sound');
});
