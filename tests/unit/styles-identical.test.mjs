// Frozen hashes were DROPPED (2026-11-18): they cannot tell a deliberate change to a rig or helper from a seam regression, so the guarantee is kept by comparing with the old renderer itself.
// The absolute rule of the style seam (task W6-A): the seam changes nothing. Every sprite in sprites/ is drawn
// through the renderer as it was before the seam (a word-for-word copy, tests/fixtures/styles/legacy-render.mjs)
// and through today's engine: every frame, the sheet PNG and the sheet JSON must be the same bytes. Both sides use
// today's rigs and helpers, so a helper that is changed on purpose changes both and the test still holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../../tools/lib/assets.mjs';
import { encodePNG } from '../../tools/png.mjs';
import { renderFrame, renderSheet, defaultParams, randomParams } from '../../engine/sprite.js';
import { exportSheet, stylesOf } from '../../engine/styles.js';
import { buildCatalog } from '../../tools/lib/catalog.mjs';
import { legacyRenderFrame, legacyRenderSheet } from '../fixtures/styles/legacy-render.mjs';

const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
const png = (s) => encodePNG(s.w, s.h, new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength));
const encodePng = (w, h, rgba) => encodePNG(w, h, rgba);

// every sprite in sprites/ that loads (one that another builder has half-written is named, not counted)
const sprites = [], unloadable = [];
for (const f of fs.readdirSync(path.join(ROOT, 'sprites')).filter((x) => x.endsWith('.js') && !x.startsWith('_') && x !== 'index.js').sort()) {
  const file = path.join(ROOT, 'sprites', f);
  try {
    const def = (await import(pathToFileURL(file).href)).default;
    if (!def || typeof def.render !== 'function') throw new Error('no sprite exported');
    sprites.push({ id: def.id, file, def });
  } catch (e) { unloadable.push(`${f}: ${String(e.message).split('\n')[0]}`); }
}

/** What one sprite makes: a hash over every frame, and the sheet's PNG and JSON, at 1x defaults and 2x random settings. */
function made(def, frame, sheet) {
  const p = defaultParams(def), q = randomParams(def, 4242);
  const frames = crypto.createHash('sha1');
  for (const [clip, c] of Object.entries(def.clips)) for (let i = 0; i < c.frames; i++) frames.update(Buffer.from(frame(def, clip, i, p).data.buffer));
  const s1 = sheet(def, p), s2 = sheet(def, q, { scale: 2 });
  return { frames: frames.digest('hex'), png: sha(png(s1)), json: sha(JSON.stringify(s1.meta, null, 2)), png2: sha(png(s2)), json2: sha(JSON.stringify(s2.meta, null, 2)) };
}

test('every sprite in sprites/: frames, sheet PNG and sheet JSON are what the renderer made before the seam', (t) => {
  if (unloadable.length) t.diagnostic(`not compared (the file does not load right now): ${unloadable.join(' | ')}`);
  assert.ok(sprites.length >= 6, `at least six sprites to compare (found ${sprites.length})`);
  const differ = [], broken = [];
  for (const { id, def } of sprites) {
    let before, now;
    try { before = made(def, legacyRenderFrame, legacyRenderSheet); } catch (e) { broken.push(`${id}: ${e.message}`); continue; }   // it failed before the seam too
    now = made(def, renderFrame, renderSheet);
    for (const k of Object.keys(before)) if (before[k] !== now[k]) differ.push(`${id}.${k}`);
  }
  if (broken.length) t.diagnostic(`not compared (render fails with or without the seam): ${broken.join(' | ')}`);
  t.diagnostic(`${sprites.length - broken.length} sprites compared`);
  assert.deepEqual(differ, []);
});

test('the pixel exporter hands back exactly the old sheet: the same PNG bytes, the same JSON text, no "style" in it', async () => {
  let n = 0;
  for (const { id, def } of sprites.slice(0, 12)) {
    const p = defaultParams(def);
    let before;
    try { before = legacyRenderSheet(def, p, { scale: 2 }); } catch { continue; }
    const out = await exportSheet(def, p, { scale: 2, encodePng });
    assert.deepEqual(out.files.map((f) => [f.name, f.type]), [[`${id}.png`, 'image/png']], id);
    assert.ok(Buffer.from(out.files[0].bytes).equals(png(before)), `${id}: PNG bytes`);
    assert.equal(JSON.stringify(out.data, null, 2), JSON.stringify(before.meta, null, 2), `${id}: JSON text`);
    assert.ok(!('artStyle' in out.data) && !('style' in out.data), `${id}: a pixel sheet names no art style (absent means pixel)`);
    n++;
  }
  assert.ok(n >= 6, `at least six sprites exported (${n})`);
});

test('every existing sprite offers one style, pixel, and its catalogue row says so', () => {
  for (const { id, def } of sprites) assert.deepEqual(stylesOf(def), ['pixel'], id);
  const cat = buildCatalog({ sprites: sprites.slice(0, 6).map(({ id, def }) => ({ id, file: `sprites/${id}.js`, def })) });
  for (const row of cat.assets) assert.deepEqual(row.styles, ['pixel'], row.id);
});
