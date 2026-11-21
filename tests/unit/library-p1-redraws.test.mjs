// P1, the first slice of real redraws (docs/data-sprites.md section 9, "First useful slice", and section 7): coin, crate
// and icons-food are library data sprites, sprites/<id>.json, made through the /sprite-forge skill from the B8 fixtures
// (tests/fixtures/v2/pictures/) upgraded to the newest generator versions. The old code files (sprites/<id>.js) and
// their _was- copies are gone. Each keeps what its code sprite promised (section 7: id, name, meta, every clip with its
// frames, fps and loop, every sound cue, every control key and kind, choice options, colour defaults and swatches, the
// ready-made versions), passes the quality bar with no errors, loads through the build's loader as data, stays in its
// kits, and opens the settings and bags saved before the redraw.
//
// OLD below is the code sprites' interface as it was read from sprites/<id>.js on 2026-11-20, before they were deleted:
// the record this test holds the redraws to.
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

const IDS = ['coin', 'crate', 'icons-food'];

const OLD = {
  coin: {
    name: 'Coin', preview: 'spin', size: [32, 32], pivot: [16, 30],
    meta: { type: 'pickup', role: 'items/pickup', view: 'front' },
    clips: { spin: [8, true, [7, 11, 15]], collect: [8, false, [9, 15, 20]] },
    params: {
      size: ['range', 0.5], thickness: ['range', 0.4], shape: ['choice', 0, ['round', 'octagon', 'square'], 'round'],
      emblem: ['choice', 0, ['star', 'heart', 'plain', 'hole', 'gem'], 'star'], rim: ['toggle', true], sparkle: ['toggle', true],
      metal: ['color', '#f2c230', ['#f2c230', '#c9ced9', '#cf8a4a', '#6f7a94', '#5fc4a0', '#e8dca8']],
      inlay: ['color', '#c76a16', ['#c76a16', '#fff0a0', '#e2473f', '#3f86e0', '#3fbf6b', '#a45ee0', '#3a3350']],
      bob: ['range', 0.5], pop: ['range', 0.5], speed: ['range', 0.5],
    },
    sounds: { collect: [{ sound: 'coin-pickup', frame: 1 }] },
    versions: [],
  },
  crate: {
    name: 'Breakable crate', preview: 'idle', size: [32, 32], pivot: [16, 30],
    meta: { type: 'prop', role: 'world/prop', view: 'side' },
    // idle is one frame: its fps (8 in the code file) is not part of what it shows
    clips: { idle: [1, true, null], hurt: [4, false, [6, 9, 13]], break: [8, false, [8, 13, 17]] },
    params: {
      size: ['range', 0.5], style: ['choice', 0, ['crate', 'barrel', 'pot'], 'crate'], bands: ['toggle', true],
      mark: ['choice', 0, ['none', 'leaf', 'skull', 'star'], 'none'], pieces: ['range', 0.5],
      wood: ['color', '#a06a3c', ['#a06a3c', '#7a4f33', '#f0ead8', '#a8612a', '#5a3a22', '#c98a4a']],
      metal: ['color', '#c2c9d6', ['#c2c9d6', '#f2c230', '#8f97a8', '#5d6475', '#e6c545', '#c98a4a']],
      speed: ['range', 0.5],
    },
    sounds: {
      hurt: [{ sound: 'punch', preset: 'Light jab', frame: 0, volume: 0.9 }],
      break: [{ sound: 'crate-break', preset: 'Crate', frame: 0, volume: 0.8 }],
    },
    versions: [],
  },
  'icons-food': {
    name: 'Food icons', preview: 'apple', size: [32, 32], pivot: [16, 16],
    meta: { type: 'icon', role: 'items/icon', view: 'none' },
    clips: Object.fromEntries(['apple', 'drumstick', 'cheese', 'fish', 'egg', 'carrot', 'mushroom', 'soup'].map((c) => [c, [1, true, null]])),
    params: {
      size: ['range', 0.5], tilt: ['toggle', true], shade: ['toggle', true], shine: ['toggle', true],
      body: ['color', '#c9423a', ['#c9423a', '#f2c230', '#a4c44a', '#7a4fc4', '#e08a2c']],
      accent: ['color', '#3f8a4f', ['#3f8a4f', '#6aa83e', '#4f9d57', '#357a4c']],
      bowl: ['color', '#a06a3c', ['#a06a3c', '#7a4f33', '#f0ead8', '#c2c9d6', '#a8612a', '#c98a4a']],
    },
    sounds: {},
    versions: [
      ['Pantry', {}], ['Upright', { tilt: false, body: '#e08a2c', accent: '#357a4c' }], ['Green apple', { body: '#a4c44a', accent: '#6aa83e' }],
      ['Plain and big', { size: 1, shade: false, shine: false }], ['Dark bowl', { bowl: '#7a4f33', body: '#f2c230' }],
    ],
  },
};

const fileOf = (id) => path.join(ROOT, 'sprites', `${id}.json`);
const defOf = (id) => JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
const loaded = new Map();
async function spriteOf(id) {
  if (!loaded.has(id)) loaded.set(id, await loadDataSprite(ROOT, fileOf(id)));
  return loaded.get(id);
}
const solid = (g) => g.data.filter((v) => v >>> 24).length;

/** Every generator call in a definition: [{ gen, v }]. */
function calls(x, out = []) {
  if (Array.isArray(x)) for (const v of x) calls(v, out);
  else if (x && typeof x === 'object') { if (typeof x.gen === 'string') out.push({ gen: x.gen, v: x.v }); for (const v of Object.values(x)) calls(v, out); }
  return out;
}

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
    assert.ok(def.body?.pictures, `${id}: a pictures body`);
    const r = validateSprite(def);
    assert.deepEqual(r.errors, [], id);
    const named = calls(def);
    assert.ok(named.length >= 2, `${id} names generators`);
    for (const { gen, v } of named) {
      const newest = Math.max(...generatorVersions(gen));
      assert.equal(v, newest, `${id}: ${gen}@${v} is not the newest version (${gen}@${newest})`);
    }
  }
});

test('each keeps its code sprite\'s name, meta, frame, clips (frames, fps, loop), sound cues, controls and versions', async () => {
  for (const id of IDS) {
    const s = await spriteOf(id), old = OLD[id];
    assert.equal(s.id, id);
    assert.equal(s.name, old.name);
    assert.equal(s.preview, old.preview);
    assert.deepEqual([...s.size], old.size);
    assert.deepEqual([...s.pivot], old.pivot);
    for (const [k, v] of Object.entries(old.meta)) assert.equal(s.meta[k], v, `${id} meta.${k}`);
    assert.deepEqual(Object.keys(s.clips), Object.keys(old.clips), `${id} clips in order`);
    for (const [c, [frames, loop, fps]] of Object.entries(old.clips)) {
      assert.equal(s.clips[c].frames, frames, `${id} ${c} frames`);
      assert.equal(!!s.clips[c].loop, loop, `${id} ${c} loop`);
      if (fps) [0, 0.5, 1].forEach((speed, i) => assert.equal(clipFps(s, c, cleanParams(s, { speed })), fps[i], `${id} ${c} fps at speed ${speed}`));
    }
    assert.deepEqual(Object.keys(s.params).sort(), Object.keys(old.params).sort(), `${id} control keys`);
    for (const [k, [kind, def, list, choiceDef]] of Object.entries(old.params)) {
      const d = s.params[k];
      assert.equal(d.kind, kind, `${id} ${k} kind`);
      if (kind === 'choice') { assert.deepEqual(d.options.map((o) => o.value), list, `${id} ${k} options`); assert.equal(d.def, choiceDef, `${id} ${k} default`); }
      else if (kind === 'color') { assert.equal(d.def, def, `${id} ${k} default`); assert.deepEqual(d.swatches, list, `${id} ${k} swatches`); }
      else assert.equal(d.def, def, `${id} ${k} default`);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(s.sounds ?? {})), old.sounds, `${id} sound cues`);
    assert.deepEqual((s.versions ?? []).map((v) => [v.name, v.params]), old.versions, `${id} versions`);
  }
});

test('each passes the quality bar with no errors', { timeout: 600_000 }, async () => {
  const cacheFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-p1-')), 'quality.json');
  const run = await runQuality({ sprites: IDS, sounds: [], cache: false, cacheFile });
  assert.deepEqual(run.results.map((r) => r.id ?? path.basename(r.file, '.json')).sort(), [...IDS].sort());
  for (const r of run.results) {
    assert.equal(r.file.endsWith('.json'), true, `${r.file} is the data file`);
    assert.deepEqual(r.errors, [], r.file);
    assert.equal(r.ok, true, r.file);
  }
});

test('settings saved before the redraw (links, bags, versions) open with the same values, every option and swatch', async () => {
  for (const id of IDS) {
    const s = await spriteOf(id), old = OLD[id];
    const saved = [];
    for (const [k, [kind, def, list]] of Object.entries(old.params)) {
      if (kind === 'choice') for (const v of list) saved.push({ [k]: v });
      else if (kind === 'color') for (const v of list) saved.push({ [k]: v });
      else if (kind === 'toggle') saved.push({ [k]: !def }, { [k]: String(!def) });
      else saved.push({ [k]: 0 }, { [k]: 1 }, { [k]: '0.25' });
    }
    for (const [, params] of old.versions) saved.push(params);
    for (const input of saved) {
      const p = cleanParams(s, input);
      for (const [k, v] of Object.entries(input)) {
        const want = old.params[k][0] === 'toggle' ? v === true || v === 'true' : old.params[k][0] === 'range' ? Number(v) : v;
        assert.equal(p[k], want, `${id}: saved ${k}=${v} opens as ${p[k]}`);
      }
      // and it draws: every clip's first frame has a picture
      for (const c of Object.keys(s.clips)) assert.ok(solid(renderFrame(s, c, 0, p)) > 12, `${id} ${c} draws at ${JSON.stringify(input)}`);
    }
    // a link from before (a key the sprite never had is dropped, an out-of-range number clamped)
    const p = cleanParams(s, { gone: 3, size: 7 });
    assert.equal('gone' in p, false);
    assert.equal(p.size, 1);
  }
});

test('a bag stored before the redraw, and a bag link made before it, open the three resolved to their saved settings and drawn with them', async () => {
  // what was saved before the redraw, written out as it was held then (not made by today's bag): settings by id only
  const SAVED = [
    { id: 'coin', params: { shape: 'octagon', emblem: 'hole', metal: '#c9ced9', rim: false, size: 0.8 }, scale: 2 },
    { id: 'crate', params: { style: 'barrel', mark: 'skull', wood: '#5a3a22', bands: false }, scale: 1 },
    { id: 'icons-food', params: { tilt: false, shine: false, body: '#a4c44a', bowl: '#7a4f33' }, scale: 1 },
  ];
  // the browser's stored bag (localStorage BAG_KEY), format version 1, as the site wrote it before 2026-11-20
  const STORED = JSON.stringify({
    version: 1,
    items: SAVED.map((o, i) => ({ key: `i${i + 1}`, kind: 'sprite', id: o.id, settings: { params: o.params, cues: null, scale: o.scale }, addedAt: 1763500000000 })),
    theme: { seed: 0, colour: { hue: 0, saturation: 1, contrast: 1, tint: null, tintAmount: 0, palette: null, outline: null }, sound: { pitch: 0, brightness: 0 }, music: { tempo: 1, intensity: null }, shapes: false },
    next: 4,
  });
  // a bag link of library items as the site made one before: #/bag?load=<base64url of { v: 1, i: [['s', id, settings]] }>
  const LINK = `#/bag?load=${Buffer.from(JSON.stringify({ v: 1, i: SAVED.map((o) => ['s', o.id, { params: o.params, cues: null, scale: o.scale }]) })).toString('base64url')}`;

  const store = memoryStorage();
  store.setItem(BAG_KEY, STORED);
  const fromStore = createBag(store);
  const fromLink = createBag(memoryStorage());
  assert.equal(fromLink.fromLink(LINK), 3);
  for (const [how, bag] of [['stored', fromStore], ['link', fromLink]]) {
    const items = bag.items();
    assert.deepEqual(items.map((i) => i.id), IDS, `${how}: the three, in order`);
    for (const [n, it] of items.entries()) {
      const o = SAVED[n], s = await spriteOf(it.id);
      assert.equal(it.settings.scale, o.scale, `${how} ${it.id} scale`);
      // what the redrawn sprite makes of what the bag held: every saved value kept, none dropped or changed
      const p = cleanParams(s, it.settings.params);
      assert.deepEqual(Object.fromEntries(Object.keys(o.params).map((k) => [k, p[k]])), o.params, `${how} ${it.id}: the sprite keeps every saved value`);
      // and it draws with them: each clip's first frame has a picture, and the saved values change it
      const plain = defaultParams(s);
      let differs = false;
      for (const c of Object.keys(s.clips)) {
        const a = renderFrame(s, c, 0, p), b = renderFrame(s, c, 0, plain);
        assert.ok(solid(a) > 12, `${how} ${it.id} ${c} draws`);
        differs ||= a.data.some((v, i) => v !== b.data[i]);
      }
      assert.ok(differs, `${how} ${it.id}: the saved values change the picture`);
    }
  }
});

test('each loads through the build\'s loader as data and stays in its kits', async () => {
  for (const id of IDS) {
    const def = await loadDataSprite(ROOT, fileOf(id));
    assert.equal(def.id, id);
    assert.ok(solid(renderFrame(def, def.preview, 0, defaultParams(def))) > 40, `${id} draws its card`);
  }
  const kits = loadBundles(ROOT);
  const holding = (id) => kits.filter((b) => (b.sprites ?? []).includes(id)).map((b) => b.id).sort();
  // the kits the sprite was in before its redraw still hold it; a kit made later may reuse it too, so more kits are fine
  const stays = (id, was) => { const now = holding(id).filter((k) => k.startsWith('kit-')); assert.deepEqual(was.filter((k) => !now.includes(k)), [], `${id} left a kit it was in (now in ${now.join(', ')})`); };
  stays('coin', ['kit-platformer-fantasy', 'kit-rpg-fantasy']);
  stays('crate', ['kit-platformer-fantasy']);
});

test('icons-food draws the same as the B8 fixture with the newest icon pens (inside an icon set\'s fit they agree)', async () => {
  const { dataSprite } = await import('../../engine/data-sprite.js');
  const fixture = dataSprite(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'v2', 'pictures', 'icons-food.json'), 'utf8')));
  const s = await spriteOf('icons-food');
  for (const set of [{}, { tilt: false }, { size: 0, shade: false, shine: false }, { size: 1 }]) {
    for (const c of Object.keys(s.clips)) {
      const a = renderFrame(s, c, 0, cleanParams(s, set)), b = renderFrame(fixture, c, 0, cleanParams(fixture, set));
      assert.deepEqual([...a.data], [...b.data], `icons-food ${c} at ${JSON.stringify(set)}`);
    }
  }
  assert.ok(defOf('icons-food'));
});
