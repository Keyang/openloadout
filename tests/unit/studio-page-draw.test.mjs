// How the studio page draws a definition and makes its files (item S9). The page draws frames itself while a handle is
// dragged (no validation on every move), so that drawing must be exactly what the sprite draws (engine/data-sprite.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteFor, drawFrame, drawRest, libraryFile, sheetOf } from '../../app/studio/draw.js';
import { startFrom } from '../../app/studio/edit.js';
import { STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';
import { renderFrame } from '../../engine/sprite.js';
import { makeDataSprite, validateDataSprite } from '../../engine/data-sprite.js';
import { readDataFile } from '../../tools/lib/data-file.mjs';

const same = (a, b, what) => assert.equal(Buffer.compare(Buffer.from(a.data.buffer), Buffer.from(b.data.buffer)), 0, what);

test('a frame drawn by the page is the frame the sprite draws, for every template and clip', () => {
  for (const id of STUDIO_TEMPLATE_IDS) {
    const d = validateDataSprite(startFrom(id, `T ${id}`)).value;
    const s = makeDataSprite(d).sprite;
    for (const clip of Object.keys(d.clips)) {
      for (const f of [0, d.clips[clip].frames - 1]) same(drawFrame(d, clip, f), renderFrame(s, clip, f, {}), `${id} ${clip} ${f}`);
    }
  }
});

test('the rest pose draws something, and a top-down body draws each way it faces', () => {
  const d = validateDataSprite(startFrom('topdown-person', 'Walker')).value;
  const pics = ['side', 'down', 'up'].map((f) => drawRest(d, f));
  for (const g of pics) assert.ok(g.data.some((v) => v !== 0));
  assert.notEqual(Buffer.compare(Buffer.from(pics[0].data.buffer), Buffer.from(pics[1].data.buffer)), 0);
});

test('the Hero (a library body) is drawn too', () => {
  const d = validateDataSprite(startFrom('hero', 'My hero')).value;
  const s = spriteFor(d);
  assert.equal(s.ok, true, s.errors?.join('; '));
  const g = drawFrame(d, 'walk', 0);
  assert.equal(g.w, 64);
  assert.ok(g.data.some((v) => v !== 0));
  const rest = drawRest(d);
  assert.ok(rest.data.some((v) => v !== 0));
});

test('spriteFor reports a definition that does not pass, never throws', () => {
  const r = spriteFor({ format: 'loadout-sprite', version: 1, id: 'Bad Id' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test('the file for the library is the fixed data form and reads back to the same definition', async () => {
  const d = validateDataSprite(startFrom('four-legs', 'Moss newt')).value;
  const f = await libraryFile(d);
  assert.equal(f.ok, true, f.errors?.join('; '));
  assert.equal(f.name, 'moss-newt.js');
  const back = readDataFile(f.text);
  assert.equal(back.ok, true);
  assert.equal(back.value.name, 'Moss newt');
  const taken = await libraryFile(d, ['moss-newt']);
  assert.equal(taken.ok, false, 'an id the library has is refused');
});

test('the page loads the file writer only when a file is made (tools/ is not part of the published site)', async () => {
  const fs = await import('node:fs');
  for (const f of ['app/studio-page.js', ...fs.readdirSync(new URL('../../app/studio/', import.meta.url)).map((n) => `app/studio/${n}`)]) {
    const src = fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /^import[^;]*tools\//m, `${f} imports from tools/ at load`);
  }
});

test('the sheet: every clip a row, every frame a cell, with the animation list', () => {
  const d = validateDataSprite(startFrom('blob', 'Goo')).value;
  const s = sheetOf(d);
  const clips = Object.keys(d.clips);
  const most = Math.max(...clips.map((c) => d.clips[c].frames));
  assert.equal(s.w, most * d.size[0]);
  assert.equal(s.h, clips.length * d.size[1]);
  assert.equal(s.rgba.length, s.w * s.h * 4);
  assert.deepEqual(Object.keys(s.meta.animations), clips);
});
