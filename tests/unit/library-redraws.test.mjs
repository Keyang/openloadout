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
 * The only controls a redraw may drop today: the Motion sliders that scale a baked person's bob, step or shake. A person
 * base (base:person-side, base:person-topdown-*) bakes its clips at the code rig's middle Bounce, Stride and Wobble and a
 * clip key takes no binding, so nothing can scale them yet (reviews of M6, issues 5 to 7). This is not a decision to drop
 * them: Contract 15 rule 10 says redraws keep control keys, and Keyang decides whether these may go or the framework
 * gains a slider that scales a clip's motion. The check below only holds a record to the case as it stands: the sprite
 * really extends a person base, that base takes no setting of that name, and the reason names that base.
 */
const DROPPABLE = Object.freeze(['bounce', 'stride', 'wobble']);
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

test('each keeps its code sprite\'s name, meta, frame, clips (frames, fps, loop), sound cues, controls and versions', async () => {
  for (const old of RECORDS) {
    const id = old.id, s = await spriteOf(id);
    assert.equal(s.id, id);
    assert.equal(s.name, old.name, `${id} name`);
    assert.equal(s.preview, old.preview, `${id} preview`);
    assert.deepEqual([...s.size], old.size, `${id} size`);
    assert.deepEqual([...s.pivot], old.pivot, `${id} pivot`);
    assert.equal(!!s.grounded, !!old.grounded, `${id} grounded`);
    assert.deepEqual(JSON.parse(JSON.stringify(s.meta)), old.meta, `${id} meta`);
    assert.deepEqual(Object.keys(s.clips), Object.keys(old.clips), `${id} clips in order`);
    for (const [c, { frames, loop, fps }] of Object.entries(old.clips)) {
      assert.equal(s.clips[c].frames, frames, `${id} ${c} frames`);
      assert.equal(!!s.clips[c].loop, loop, `${id} ${c} loop`);
      // a one-frame clip (a prop's resting state) shows no motion, so its fps is not part of what it shows (P1's crate idle)
      if (frames > 1) [0, 0.5, 1].forEach((speed, i) => assert.equal(clipFps(s, c, cleanParams(s, { speed })), fps[i], `${id} ${c} fps at speed ${speed}`));
    }
    // every old control key is a control now (or renamed through was.controls) with the same kind
    for (const [k, o] of Object.entries(old.params)) {
      if (droppedOf(old).has(k)) {
        assert.equal(s.params[nowKey(s, k)], undefined, `${id}: dropped control ${k} is gone`);
        // the sprite really stands on the base that cannot move it, and that base takes no setting of that name
        const ext = JSON.parse(fs.readFileSync(fileOf(id), 'utf8')).body?.rig?.extends;
        assert.match(ext?.use ?? '', PERSON_BASE, `${id}: dropped ${k}, so it extends a person base`);
        assert.ok(old.dropped[k].includes(ext.use), `${id}: dropped ${k}: the reason names ${ext.use}, the base it extends`);
        const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'pieces', `${ext.use.replace(':', '-')}.v${ext.v}.json`), 'utf8'));
        assert.equal(Object.hasOwn(base.args ?? {}, k), false, `${id}: ${ext.use}@${ext.v} has a ${k} setting, so ${k} can be kept`);
        continue;
      }
      const d = s.params[nowKey(s, k)];
      assert.ok(d, `${id}: control ${k} kept`);
      assert.equal(d.kind, o.kind, `${id} ${k} kind`);
      // what the panel says keeps too: the control's label, a slider's end words, and option labels where the record has them
      assert.equal(d.label, o.label, `${id} ${k} label`);
      if (o.kind === 'range') assert.deepEqual([d.lo, d.hi], [o.lo, o.hi], `${id} ${k} end words`);
      for (const [v, label] of Object.entries(o.optionLabels ?? {})) assert.equal(d.options.find((x) => x.value === nowValue(s, k, v))?.label, label, `${id} ${k}: option ${v} keeps its label`);
      if (o.kind === 'choice') {
        for (const v of o.options) assert.ok(d.options.some((x) => x.value === nowValue(s, k, v)), `${id} ${k}: option ${v} kept or mapped by was`);
        assert.equal(d.def, nowValue(s, k, o.def), `${id} ${k} default`);
      } else if (o.kind === 'color') {
        assert.equal(d.def, o.def, `${id} ${k} default`);
        // a data sprite's swatches are its slot's colour first, then every listed one (engine/data-sprite.js slotSwatches):
        // the code's list, every colour kept in its order, with the default moved to the front when another led it (M6)
        assert.deepEqual(d.swatches, [o.def, ...o.swatches.filter((c) => c !== o.def)], `${id} ${k} swatches`);
      } else if (o.kind === 'range') {
        assert.equal(d.def, o.def, `${id} ${k} default`);
        assert.deepEqual([d.min, d.max, d.step], [o.min, o.max, o.step], `${id} ${k} min, max, step`);
      } else assert.equal(d.def, o.def, `${id} ${k} default`);
      // a control shown only for some settings keeps that condition (recorded when the code sprite had one)
      // (a control it names that was renamed, sprite-level was: { controls }, is named by its new key: batch M9's input-dpad)
      const renamed = (w) => (Array.isArray(w) ? w.map(renamed) : Object.fromEntries(Object.entries(w).map(([c, v]) => [s.was?.controls?.[c] ?? c, v])));
      if (o.when) assert.deepEqual(JSON.parse(JSON.stringify(d.when)), renamed(o.when), `${id} ${k} when`);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(s.sounds ?? {})), old.sounds, `${id} sound cues`);
    assert.deepEqual((s.versions ?? []).map((v) => v.name), old.versions.map((v) => v.name), `${id} versions by name`);
    for (const [n, v] of old.versions.entries()) {
      const p = cleanParams(s, s.versions[n].params), q = cleanParams(s, v.params);
      assert.deepEqual(p, q, `${id} version ${v.name} keeps its settings`);
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

test('settings saved before the redraw (links, bags, versions) open with the same values, every option and swatch, and draw', async () => {
  for (const old of RECORDS) {
    const id = old.id, s = await spriteOf(id);
    const saved = [];
    for (const [k, o] of Object.entries(old.params)) {
      if (o.kind === 'choice') for (const v of o.options) saved.push({ [k]: v });
      else if (o.kind === 'color') for (const v of o.swatches) saved.push({ [k]: v });
      else if (o.kind === 'toggle') saved.push({ [k]: !o.def }, { [k]: String(!o.def) });
      else saved.push({ [k]: o.min }, { [k]: o.max }, { [k]: String(o.min + (o.max - o.min) / 4) });
    }
    for (const v of old.versions) saved.push(v.params);
    for (const input of saved) {
      const p = cleanParams(s, input);
      for (const [k, v] of Object.entries(input)) {
        if (droppedOf(old).has(k)) { assert.equal(k in p, false, `${id}: saved ${k} (dropped) is left out`); continue; }
        const kind = old.params[k].kind;
        const want = kind === 'toggle' ? v === true || v === 'true' : kind === 'range' ? Math.min(old.params[k].max, Math.max(old.params[k].min, Number(v))) : nowValue(s, k, v);
        assert.equal(p[nowKey(s, k)], want, `${id}: saved ${k}=${v} opens as ${p[nowKey(s, k)]}`);
      }
      for (const c of Object.keys(s.clips)) assert.ok(drawn(s, c, p) > 12, `${id} ${c} draws at ${JSON.stringify(input)}`);
    }
    // a link from before: a key the sprite never had is dropped, an out-of-range number clamped
    const p = cleanParams(s, { gone: 3, size: 7 });
    assert.equal('gone' in p, false);
    if (s.params.size) assert.equal(p.size, s.params.size.max);
  }
});

test('a bag stored before the redraw, and a bag link made before it, open each redraw with its saved settings and draw them', async () => {
  // what was saved before: each sprite at its last ready-made version (or every choice at its last option), by id only
  const SAVED = RECORDS.map((r) => {
    const v = r.versions.at(-1)?.params;
    const chosen = v && Object.keys(v).length ? v : Object.fromEntries(Object.entries(r.params).filter(([, o]) => o.kind === 'choice').map(([k, o]) => [k, o.options.at(-1)]));
    // a sprite with no versions and no choices (an icon set such as icons-key-items, batch M4): every toggle the other way
    const params = Object.keys(chosen).length ? chosen : Object.fromEntries(Object.entries(r.params).filter(([, o]) => o.kind === 'toggle').map(([k, o]) => [k, !o.def]));
    // a sprite with no versions, choices or toggles (bg-battle-dungeon, batch M10): every slider at its top
    const saved = Object.keys(params).length ? params : Object.fromEntries(Object.entries(r.params).filter(([, o]) => o.kind === 'range').map(([k, o]) => [k, o.max]));
    return { id: r.id, params: saved, scale: 2 };
  });
  const STORED = JSON.stringify({
    version: 1,
    items: SAVED.map((o, i) => ({ key: `i${i + 1}`, kind: 'sprite', id: o.id, settings: { params: o.params, cues: null, scale: o.scale }, addedAt: 1763500000000 })),
    theme: { seed: 0, colour: { hue: 0, saturation: 1, contrast: 1, tint: null, tintAmount: 0, palette: null, outline: null }, sound: { pitch: 0, brightness: 0 }, music: { tempo: 1, intensity: null }, shapes: false },
    next: SAVED.length + 1,
  });
  const LINK = `#/bag?load=${Buffer.from(JSON.stringify({ v: 1, i: SAVED.map((o) => ['s', o.id, { params: o.params, cues: null, scale: o.scale }]) })).toString('base64url')}`;
  const store = memoryStorage();
  store.setItem(BAG_KEY, STORED);
  const fromStore = createBag(store);
  const fromLink = createBag(memoryStorage());
  assert.equal(fromLink.fromLink(LINK), SAVED.length);
  for (const [how, bag] of [['stored', fromStore], ['link', fromLink]]) {
    const items = bag.items();
    assert.deepEqual(items.map((i) => i.id), IDS, `${how}: every redraw, in order`);
    for (const [n, it] of items.entries()) {
      const o = SAVED[n], s = await spriteOf(it.id);
      assert.equal(it.settings.scale, o.scale, `${how} ${it.id} scale`);
      const p = cleanParams(s, it.settings.params);
      for (const [k, v] of Object.entries(o.params)) if (!droppedOf(RECORDS[n]).has(k)) assert.equal(p[nowKey(s, k)], nowValue(s, k, v), `${how} ${it.id}: saved ${k} kept`);
      const plain = defaultParams(s);
      let differs = false;
      for (const c of Object.keys(s.clips)) {
        const a = renderFrame(s, c, 0, p), b = renderFrame(s, c, 0, plain);
        assert.ok(solid(a) > 12 || drawn(s, c, p) > 12, `${how} ${it.id} ${c} draws`);
        differs ||= a.data.some((v, i) => v !== b.data[i]);
      }
      assert.ok(differs, `${how} ${it.id}: the saved values change the picture`);
    }
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
