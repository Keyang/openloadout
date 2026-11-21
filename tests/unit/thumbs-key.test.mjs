// Build item R4c part 3: the key of a sprite's pictures (tools/lib/thumbs.mjs writeImages) no longer hashes `_*.js`
// drawing-helper files of sprites/. No such file exists (the build refuses every code file in sprites/, R4a), so the
// hash was of an empty list and the key of a real tree is the same as before: the next real build does NOT redraw
// every picture because of this change. What the key still follows: the sprite's own file, engine/ and rigs/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeImages } from '../../tools/lib/thumbs.mjs';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { goodData } from '../fixtures/api/data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-key-'));
  for (const d of ['sprites', 'engine', 'rigs', 'sound']) fs.mkdirSync(path.join(root, d));
  fs.writeFileSync(path.join(root, 'sprites', 'gem.json'), JSON.stringify(goodData()));
  fs.writeFileSync(path.join(root, 'engine', 'a.js'), 'export const a = 1;\n');
  const r = makeDataSprite(goodData());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const sprites = [{ id: goodData().id, file: 'sprites/gem.json', def: r.sprite }];
  return { root, sprites, run: () => writeImages({ root, sprites }) };
}

test('a file named _*.js or _*.json in sprites/ no longer changes the pictures key', () => {
  const t = tree();
  try {
    assert.deepEqual(t.run().made, [goodData().id], 'the first build draws it');
    assert.deepEqual(t.run().skipped, [goodData().id], 'the second finds it unchanged');
    fs.writeFileSync(path.join(t.root, 'sprites', '_helper.js'), 'export const h = 1;\n');
    fs.writeFileSync(path.join(t.root, 'sprites', '_helper.json'), '{}\n');
    assert.deepEqual(t.run().skipped, [goodData().id], 'a helper file beside the sprites is not part of the key');
  } finally { fs.rmSync(t.root, { recursive: true, force: true }); }
});

test('the key still follows the sprite file and engine/', () => {
  const t = tree();
  try {
    t.run();
    fs.writeFileSync(path.join(t.root, 'engine', 'a.js'), 'export const a = 2;\n');
    assert.deepEqual(t.run().made, [goodData().id], 'a change in engine/ redraws');
    fs.writeFileSync(path.join(t.root, 'sprites', 'gem.json'), JSON.stringify({ ...goodData(), blurb: 'changed' }));
    assert.deepEqual(t.run().made, [goodData().id], 'a change in the sprite file redraws');
  } finally { fs.rmSync(t.root, { recursive: true, force: true }); }
});

test('tools/lib/thumbs.mjs holds no hashing of underscore files, and none exist in sprites/ or engine/', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'tools/lib/thumbs.mjs'), 'utf8'), /startsWith\('_'\)|helpers/);
  for (const d of ['sprites', 'engine']) assert.deepEqual(fs.readdirSync(path.join(ROOT, d)).filter((f) => f.startsWith('_')), [], `${d}/ has no _ file`);
});
