// The sprite source and sound patch the browser test hands to window.loadout (tests/fixtures/api/sources.mjs),
// checked here in Node: the good ones pass the quality bar and each faulty one fails it for its own reason.
// The source is loaded the way app/api.js loads it: import addresses rewritten, then imported as a module.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rewriteImports } from '../../app/api.js';
import { checkSprite } from '../../quality/sprite.js';
import { checkSound } from '../../quality/sound.js';
import { validateMeta } from '../../catalog/schema.js';
import { GOOD_SPRITE, GOOD_ID, EMPTY_FRAME, DEAD_CONTROL, NO_META, GOOD_SOUND, starSprite, chimePatch, STAR_ID, CHIME_ID } from '../fixtures/api/sources.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-api-src-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
async function load(source) {
  const r = rewriteImports(source, { base: pathToFileURL(path.join(REAL, 'sprites') + path.sep).href, origin: 'null' });      // every file: address has the origin "null"
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const file = path.join(tmp, `s${n++}.mjs`);
  fs.writeFileSync(file, r.source);
  return (await import(pathToFileURL(file).href)).default;
}
const check = async (source) => checkSprite(await load(source), { validateMeta });

test('the good sprite source loads from memory and passes the bar', async () => {
  const def = await load(GOOD_SPRITE);
  assert.equal(def.id, GOOD_ID);
  const r = checkSprite(def, { validateMeta });
  assert.deepEqual(r.errors, []);
});

test('an empty frame, a control that does nothing and missing metadata each fail with the checker\'s message', async () => {
  const empty = await check(EMPTY_FRAME);
  assert.ok(empty.errors.some((e) => /empty|nothing drawn|no pixels/i.test(e)), empty.errors.join('\n'));
  const dead = await check(DEAD_CONTROL);
  assert.ok(dead.errors.some((e) => /weight/i.test(e)), dead.errors.join('\n'));
  const meta = await check(NO_META);
  assert.ok(meta.errors.some((e) => /meta/i.test(e)), meta.errors.join('\n'));
});

test('the good sound patch passes the bar', () => {
  const r = checkSound(GOOD_SOUND, { validateMeta });
  assert.deepEqual(r.errors, []);
});

test('route 2: the star fails on its first try, passes once fixed, and passes with its chime cued', async () => {
  const first = await check(starSprite({ broken: true }));
  assert.ok(first.errors.some((e) => /weight/i.test(e)), first.errors.join('\n'));
  const fixed = await check(starSprite());
  assert.deepEqual(fixed.errors, []);
  const chime = chimePatch();
  assert.deepEqual(checkSound(chime, { validateMeta }).errors, []);
  const def = await load(starSprite({ cue: CHIME_ID }));
  assert.equal(def.id, STAR_ID);
  const cued = checkSprite(def, { validateMeta, soundIndex: new Map([[CHIME_ID, chime]]) });
  assert.deepEqual(cued.errors, []);
  assert.deepEqual(def.sounds.collect.map((c) => c.sound), [CHIME_ID]);
});
