// Library redraws (docs/data-sprites.md section 7, the migration batches M1 to M40): every code sprite redrawn as a data
// file, sprites/<id>.json, through the /sprite-forge skill. One record per redrawn sprite lives in
// tests/fixtures/redraws/<id>.json: the code sprite's interface as it was read from sprites/<id>.js just before the
// redraw (name, meta, frame, clips with their fps at three speeds, every control with its kind, default, options,
// swatches and range, the sound cues, the ready-made versions, the bundles that hold it). A batch appends to the list by
// adding its records (one file per sprite, so batches never edit the same line); this test holds every redraw to its
// record. P1's three (coin, crate, icons-food) are held by library-p1-redraws.test.mjs.
//
// What a redraw keeps (section 7): its id, name, meta, every clip (frames, fps, loop), every sound cue, every control
// key and kind, colour defaults and swatches, range ends and steps, the versions by name. A choice whose options changed
// lists `was: { old: new }` and a renamed control a sprite-level `was: { controls }`, so settings, bags and links saved
// before the redraw open with every saved value kept (or mapped) and draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, loadDataSprite, loadBundles, findSpriteFile } from '../../tools/lib/assets.mjs';
import { runQuality } from '../../tools/lib/quality-run.mjs';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { generatorVersions } from '../../engine/gen/index.js';
import { cleanParams, clipFps, defaultParams, renderFrame } from '../../engine/sprite.js';
import { createBag, memoryStorage, BAG_KEY } from '../../app/bag.js';

const RECORDS_DIR = path.join(ROOT, 'tests', 'fixtures', 'redraws');
/** A record with its choice options as values; options recorded as { value, label } also keep their labels in `optionLabels`. */
function withOptionLabels(r) {
  for (const o of Object.values(r.params ?? {})) {
    if (o.kind !== 'choice' || !o.options.some((x) => typeof x === 'object')) continue;
    o.optionLabels = Object.fromEntries(o.options.map((x) => (typeof x === 'object' ? [x.value, x.label] : [x, null])).filter(([, l]) => l !== null));
    o.options = o.options.map((x) => (typeof x === 'object' ? x.value : x));
  }
  return r;
}
/** Every redraw record, by id order: the list each migration batch appends to (one file per sprite). */
const RECORDS = fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, f), 'utf8')))
  // REDRAW_IDS=a,b runs the test on those records only (a batch checks its own redraws while others are under way)
  .filter((r) => !process.env.REDRAW_IDS || process.env.REDRAW_IDS.split(',').includes(r.id))
  .map(withOptionLabels);
const IDS = RECORDS.map((r) => r.id);
/** The controls a record says the redraw dropped (section 7: "a removed control's value is dropped"), each with the reason: { key: why }. Batch M6. */
const droppedOf = (r) => new Set(Object.keys(r.dropped ?? {}));
/**
 * The controls a redraw may drop: none. Contract 15 rule 10 (Keyang's DQ3): redraws keep control keys. The Motion
 * sliders (Bounce, Stride, Wobble, Rattle) that M6 and M7 once dropped are kept with a clip `travel` (build item F5,
 * docs/data-sprites.md 2.2 "Motion sliders"; batch M6b removed the allowance), so a record that lists one as dropped
 * fails here. The checks on `dropped` below stay for a case Keyang allows by name.
 */
const DROPPABLE = Object.freeze([]);
const PERSON_BASE = /^base:person-[a-z-]+$/;

const fileOf = (id) => path.join(ROOT, 'sprites', `${id}.json`);
const loaded = new Map();
async function spriteOf(id) {
  if (!loaded.has(id)) loaded.set(id, await loadDataSprite(ROOT, fileOf(id)));
  return loaded.get(id);
}
const solid = (g) => g.data.filter((v) => v >>> 24).length;
/** Pixels a clip paints at settings p: its first frame's, or when that is nearly empty (a font sheet's row of small glyphs, one a frame, starting with a one-pixel full stop: batch M9) all its frames' together. */
const drawn = (s, c, p) => { const n = solid(renderFrame(s, c, 0, p)); if (n > 12) return n; let all = 0; for (let f = 0; f < s.clips[c].frames; f++) all += solid(renderFrame(s, c, f, p)); return all; };

/** Every generator call in a definition: [{ gen, v }]. */
function calls(x, out = []) {
  if (Array.isArray(x)) for (const v of x) calls(v, out);
  else if (x && typeof x === 'object') { if (typeof x.gen === 'string') out.push({ gen: x.gen, v: x.v }); for (const v of Object.values(x)) calls(v, out); }
  return out;
}

/** The key a saved setting is read under now (a renamed control's `was`), and the value an old choice option opens as. */
function nowKey(s, k) { return s.params[k] ? k : s.was?.controls?.[k] ?? k; }
function nowValue(s, k, v) {
  const d = s.params[nowKey(s, k)];
  if (d?.kind === 'choice' && !d.options.some((o) => o.value === v)) return d.was?.[String(v)];
  return v;
}

test('the record list is not empty and every record is one sprite', () => {
  assert.ok(RECORDS.length >= 1);
  for (const r of RECORDS) {
    assert.match(r.id, /^[a-z][a-z0-9-]*$/);
    assert.equal(r.source, `sprites/${r.id}.js`);
    for (const k of ['name', 'meta', 'size', 'pivot', 'preview', 'params', 'clips', 'sounds', 'versions', 'bundles']) assert.ok(k in r, `${r.id}: record has ${k}`);
    // a dropped control was one of the code sprite's, and says why it could not be kept
    for (const [k, why] of Object.entries(r.dropped ?? {})) {
      assert.ok(k in r.params, `${r.id}: dropped ${k} was a control`);
      assert.ok(typeof why === 'string' && why.length > 20, `${r.id}: dropped ${k} says why`);
      // only an approved Motion slider, and only on the base that cannot move it (checked against the sprite below)
      assert.ok(DROPPABLE.includes(k), `${r.id}: ${k} may not be dropped (only ${DROPPABLE.join(', ')})`);
      assert.equal(r.params[k].kind, 'range', `${r.id}: dropped ${k} was a slider`);
      assert.equal(r.params[k].group, 'Motion', `${r.id}: dropped ${k} was a Motion slider`);
      assert.match(why, /base:person-[a-z-]+/, `${r.id}: dropped ${k}: the reason names the person base that cannot move it`);
    }
  }
});

test('each is a library data file, sprites/<id>.json, and its code file and _was- copy are gone', () => {
  for (const id of IDS) {
    assert.ok(fs.existsSync(fileOf(id)), `sprites/${id}.json`);
    assert.equal(fs.existsSync(path.join(ROOT, 'sprites', `${id}.js`)), false, `sprites/${id}.js is deleted`);
    assert.equal(fs.existsSync(path.join(ROOT, 'sprites', `_was-${id}.js`)), false, `sprites/_was-${id}.js is deleted`);
    assert.equal(findSpriteFile(ROOT, id), fileOf(id));
  }
});

test('each is version 2 data the validator passes, with no code, naming only the newest version of every generator', () => {
  for (const id of IDS) {
    const text = fs.readFileSync(fileOf(id), 'utf8'), def = JSON.parse(text);
    assert.equal(def.format, 'loadout-sprite');
    assert.equal(def.version, 2);
    assert.equal(def.id, id);
    assert.equal(/function|=>|\bMath\./.test(text), false, `${id}: no code text`);
    assert.ok(def.body && typeof def.body === 'object', `${id}: a body`);
    const r = validateSprite(def);
    assert.deepEqual(r.errors, [], id);
    for (const { gen, v } of calls(def)) {
      const newest = Math.max(...generatorVersions(gen));
      assert.equal(v, newest, `${id}: ${gen}@${v} is not the newest version (${gen}@${newest})`);
    }
  }
});


test('each passes the quality bar with no errors', { timeout: 1_200_000 }, async () => {
  const cacheFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-redraws-')), 'quality.json');
  const run = await runQuality({ sprites: IDS, sounds: [], cache: false, cacheFile });
  assert.deepEqual(run.results.map((r) => r.id ?? path.basename(r.file, '.json')).sort(), [...IDS].sort());
  for (const r of run.results) {
    assert.equal(r.file.endsWith('.json'), true, `${r.file} is the data file`);
    assert.deepEqual(r.errors, [], r.file);
    assert.equal(r.ok, true, r.file);
  }
});



test('each loads through the build\'s loader as data, draws its card, and stays in its bundles', async () => {
  const kits = loadBundles(ROOT);
  for (const old of RECORDS) {
    const def = await loadDataSprite(ROOT, fileOf(old.id));
    assert.equal(def.id, old.id);
    assert.ok(solid(renderFrame(def, def.preview, 0, defaultParams(def))) > 40, `${old.id} draws its card`);
    const holding = kits.filter((b) => (b.sprites ?? []).includes(old.id)).map((b) => b.id).sort();
    for (const b of old.bundles) assert.ok(holding.includes(b), `${old.id} is still in ${b}`);
  }
});
