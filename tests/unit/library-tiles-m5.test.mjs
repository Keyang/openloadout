// Migration batch M5 (docs/data-sprites.md section 7): the four tilesets redrawn as data, sprites/tiles-forest.json,
// tiles-cave.json, tiles-dungeon.json and tiles-platforms.json, held to the frozen code tilesets they replace
// (tests/fixtures/code-sprites/): the same clips in the same order (a downloaded sheet keeps its frame positions), the
// same tile rules and picker classes, the same pixels (exact for the cave, the dungeon and the platforms; the forest's
// known corner shading within its bound), at the swatches and at colours off them (review round 2: the colour controls
// take any colour), and each written by its writer in tests/helpers/ports/ (kept for audit).
//
// The clip order needs one framework field: body.tiles.decalOrder "last" (engine/gen/tiles-clips.js TILE_DECAL_ORDERS)
// lists every group's decals after the extra tiles, as the code tilesets did (decoClips spread last).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tileClips, tileClipNames, TILE_DECAL_ORDERS } from '../../engine/gen/tiles-clips.js';
import { resolveSprite } from '../../engine/resolve.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { pieceRegistry } from '../../engine/pieces.js';
import { tileRules } from '../../engine/tile-rules.js';
import { classifyTiles } from '../../engine/tiles.js';
import { cleanParams, defaultParams, renderFrame } from '../../engine/sprite.js';
import { testPieces } from '../fixtures/resolve/helpers.mjs';
import { ROOT, codeSprite, librarySprite } from '../helpers/library.mjs';

const IDS = ['tiles-forest', 'tiles-cave', 'tiles-dungeon', 'tiles-platforms'];
const libFile = (id) => `${ROOT}/sprites/${id}.json`;

// ---- the framework field ------------------------------------------------------------------------------------------
const body = (decalOrder) => ({
  tile: 32,
  ...(decalOrder ? { decalOrder } : {}),
  groups: [
    { name: 'rock', kind: 'block', pieces: ['block'], material: {}, decals: [{ name: 'a', place: 'on' }, { name: 'b', place: 'above' }] },
    { name: 'dark', kind: 'floor', fills: 2, material: {}, decals: [{ name: 'a', place: 'on' }] },
  ],
  extra: [{ name: 'stairs-down', label: 'Stairs', draw: [] }],
});

test('decalOrder: the two orders the framework has, "group" the default', () => {
  assert.deepEqual([...TILE_DECAL_ORDERS], ['group', 'last']);
});

test('decalOrder "group" (or none): each group\'s decals follow its pieces, the extra tiles come last', () => {
  const names = tileClipNames(body());
  assert.deepEqual(tileClipNames(body('group')), names);
  assert.ok(names.indexOf('rock-deco-b') < names.indexOf('dark-fill'));
  assert.equal(names.at(-1), 'stairs-down');
});

test('decalOrder "last": the same clips, every group\'s decals moved after the extra tiles, in group order', () => {
  const group = tileClips(body()), last = tileClips(body('last'));
  assert.deepEqual(Object.keys(last).sort(), Object.keys(group).sort());
  for (const k of Object.keys(group)) assert.deepEqual(last[k], group[k], k);
  const names = Object.keys(last);
  assert.deepEqual(names.slice(-4), ['stairs-down', 'rock-deco-a', 'rock-deco-b', 'dark-deco-a']);
  assert.ok(names.indexOf('dark-fill-b') < names.indexOf('stairs-down'));
});

test('the validator takes decalOrder "group" or "last" and refuses anything else', () => {
  const def = JSON.parse(fs.readFileSync(libFile('tiles-cave'), 'utf8'));
  const opts = { pieces: pieceRegistry(testPieces()) };
  for (const v of ['group', 'last']) {
    const d = structuredClone(def); d.body.tiles.decalOrder = v;
    const r = validateSprite(d, opts);
    assert.deepEqual(r.errors, [], v);
  }
  const bad = structuredClone(def); bad.body.tiles.decalOrder = 'first';
  const r = validateSprite(bad, opts);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /decalOrder.*"group".*"last"/);
});

test('engine/resolve.js gives a tileset its clips in the decalOrder the body names', async () => {
  // held to the order written out here and to the frozen code tileset, not to tileClips (review round 2 issue 3: a
  // comparison with tileClipNames passed with the "last" branch taken out, since both sides come from tileClips)
  const def = JSON.parse(fs.readFileSync(libFile('tiles-dungeon'), 'utf8'));
  const t = def.body.tiles, decals = t.groups.flatMap((g) => (g.decals ?? []).map((x) => `${g.name}-deco-${x.name}`));
  const extras = (t.extra ?? []).map((x) => x.name);
  assert.ok(decals.length >= 2 && extras.length >= 1, 'the dungeon has decals and extra tiles');
  const order = {};
  for (const v of ['group', 'last']) {
    const d = structuredClone(def); d.body.tiles.decalOrder = v;
    const r = resolveSprite(d, {}, { pieces: testPieces() });
    assert.ok(r.ok, r.errors?.join('; '));
    order[v] = Object.keys(r.clips);
  }
  assert.deepEqual(order.last.slice(-decals.length), decals, '"last": every decal after everything else, in group order');
  assert.ok(order.last.indexOf(extras.at(-1)) < order.last.indexOf(decals[0]), '"last": the extra tiles before the decals');
  assert.equal(order.group.at(-1), extras.at(-1), '"group": the extra tiles last');
  assert.ok(order.group.indexOf(decals[0]) < order.group.indexOf(extras[0]), '"group": a group\'s decals before the extra tiles');
  assert.deepEqual([...order.group].sort(), [...order.last].sort(), 'the same clips either way');
  assert.deepEqual(order.last, Object.keys((await codeSprite('tiles-dungeon')).clips), '"last" is the code tileset\'s order');
});

// ---- the four library tilesets against their code -----------------------------------------------------------------
const pair = async (id) => ({ code: await codeSprite(id), data: await librarySprite(id) });

test('each keeps its code tileset\'s clips in order, with their frames, labels, block kinds and decal places', async () => {
  for (const id of IDS) {
    const { code, data } = await pair(id);
    assert.deepEqual(Object.keys(data.clips), Object.keys(code.clips), `${id}: clips in order`);
    for (const [k, c] of Object.entries(code.clips)) {
      const d = data.clips[k];
      assert.deepEqual([d.frames, d.label, d.block, d.place], [c.frames, c.label, c.block, c.place], `${id} ${k}`);
    }
  }
});

test('each gives the download the same tile rules and the picker the same classes', async () => {
  for (const id of IDS) {
    const { code, data } = await pair(id);
    assert.deepEqual(tileRules(data.clips, { view: data.meta?.view }), tileRules(code.clips, { view: code.meta?.view }), `${id} tile rules`);
    assert.deepEqual(classifyTiles(data.clips), classifyTiles(code.clips), `${id} classes`);
  }
});

/** Settings to compare at: the defaults, each range at its ends and middle, each option, each swatch, each toggle flipped. */
function sweep(code) {
  const D = defaultParams(code), out = [['default', D]];
  for (const [k, o] of Object.entries(code.params)) {
    if (o.kind === 'range') for (const v of [o.min, (o.min + o.max) / 2, o.max, o.min + (o.max - o.min) * 0.37]) out.push([`${k}=${v}`, { ...D, [k]: v }]);
    if (o.kind === 'choice') for (const x of o.options) out.push([`${k}=${x.value}`, { ...D, [k]: x.value }]);
    if (o.kind === 'color') for (const s of o.swatches) out.push([`${k}=${s}`, { ...D, [k]: s }]);
    if (o.kind === 'toggle') out.push([`${k}=${!o.def}`, { ...D, [k]: !o.def }]);
  }
  return out;
}
/** Pixels that differ, per clip (first two frames), at these settings. */
function diffs(code, data, p0, only = null) {
  const pc = cleanParams(code, p0), pd = cleanParams(data, p0), out = {};
  for (const clip of Object.keys(code.clips)) {
    if (only && !only(clip)) continue;
    for (let f = 0; f < Math.min(2, code.clips[clip].frames); f++) {
      const a = renderFrame(code, clip, f, pc).data, b = renderFrame(data, clip, f, pd).data;
      let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
      if (n) out[clip] = (out[clip] ?? 0) + n;
    }
  }
  return out;
}

for (const id of ['tiles-cave', 'tiles-platforms', 'tiles-dungeon']) {
  test(`${id} draws its code tileset's pixels exactly at every setting swept`, async () => {
    const { code, data } = await pair(id);
    for (const [name, p] of sweep(code)) assert.deepEqual(diffs(code, data, p), {}, `${id} at ${name}`);
  });
}

test('tiles-dungeon: the floor exact for every style, floor swatch and wear; the stairs, walls and decals for every stone and floor swatch', async () => {
  const { code, data } = await pair('tiles-dungeon');
  const D = defaultParams(code);
  for (const style of code.params.style.options.map((o) => o.value)) for (const floor of code.params.floor.swatches) for (const wear of [0, 0.5, 0.8, 1]) for (const texture of [0.5, 1]) {
    assert.deepEqual(diffs(code, data, { ...D, style, floor, wear, texture }, (c) => c.startsWith('floor-fill')), {}, `floor ${style} ${floor} wear ${wear} texture ${texture}`);
  }
  for (const stone of code.params.stone.swatches) for (const floor of code.params.floor.swatches) for (const damp of [false, true]) {
    assert.deepEqual(diffs(code, data, { ...D, stone, floor, damp }, (c) => !c.startsWith('floor-fill')), {}, `stone ${stone} floor ${floor} damp ${damp}`);
  }
  for (const growth of code.params.growth.swatches) assert.deepEqual(diffs(code, data, { ...D, growth, damp: true, wear: 1, texture: 1 }), {}, `growth ${growth}`);
});

// Colours off the swatches (review round 2, issues 1 and 2): the colour controls take any colour (app/panel.js "pick
// any colour"), so the data must follow the code's colour maths for every colour, not only the ones it was traced at.
// Seeded random settings, every control at once, half the colours off the swatches; and the review's own cases.
function randomSettings(code, n, seed0) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const hex = () => '#' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');
  const out = [];
  for (let t = 0; t < n; t++) {
    const p = { ...defaultParams(code) };
    for (const [k, o] of Object.entries(code.params)) {
      if (o.kind === 'color') p[k] = rnd() < 0.5 ? hex() : o.swatches[Math.floor(rnd() * o.swatches.length)];
      if (o.kind === 'range') { p[k] = o.min + (o.max - o.min) * rnd(); if (o.step) p[k] = Math.round(p[k] / o.step) * o.step; }
      if (o.kind === 'choice') p[k] = o.options[Math.floor(rnd() * o.options.length)].value;
      if (o.kind === 'toggle') p[k] = rnd() < 0.5;
    }
    out.push(p);
  }
  return out;
}
for (const [id, seed] of [['tiles-dungeon', 7], ['tiles-cave', 7], ['tiles-platforms', 7], ['tiles-dungeon', 1234], ['tiles-cave', 99]]) {
  test(`${id} draws its code tileset's pixels exactly at 40 random settings, colours off the swatches included (seed ${seed})`, async () => {
    const { code, data } = await pair(id);
    for (const p of randomSettings(code, 40, seed)) assert.deepEqual(diffs(code, data, p), {}, `${id} at ${JSON.stringify(p)}`);
  });
}

test('tiles-dungeon keeps every joint and darker stone the code keeps under every look, at the colours the review picked', async () => {
  const { THEME_PRESETS, applyColour } = await import('../../engine/theme.js');
  const { code, data } = await pair('tiles-dungeon');
  const D = defaultParams(code);
  const cases = [['bricks', '#3a6ea8'], ['cobbles', '#e37f2d'], ['cobbles', '#520bed'], ['cobbles', '#a3109b'], ['slabs', '#025d28'], ['bricks', '#e37f2d']];
  for (const [style, floor] of cases) {
    const p = { ...D, style, floor, texture: 1, wear: 1 };
    for (const clip of ['floor-fill', 'floor-fill-b', 'floor-fill-c', 'wall-bottom']) {
      const a = renderFrame(code, clip, 0, cleanParams(code, p)).data, b = renderFrame(data, clip, 0, cleanParams(data, p)).data;
      for (const look of THEME_PRESETS) {
        const ta = applyColour(Uint32Array.from(a), look.theme.colour), tb = applyColour(Uint32Array.from(b), look.theme.colour);
        assert.equal(new Set(tb).size, new Set(ta).size, `${style} ${floor} ${clip} under ${look.id ?? look.name}: as many colours as the code`);
        assert.deepEqual([...tb], [...ta], `${style} ${floor} ${clip} under ${look.id ?? look.name}`);
      }
    }
  }
});

// The forest's one known gap (docs/data-sprites.md section 7 allows a redraw to differ; the review measured it): where
// the grass hangs down a corner, a slope or a ledge end, the code shades by the edge band's depth there, which band rules
// have no row form for. Only those tiles may differ, by at most this many pixels each, at any setting swept.
const FOREST_GAP = /^grass-(left|right|strip-l|strip-r|col-t|single|inner-(tl|tr|bl|br)|slope-(up|down)|thin-(l|m|r))$/;
const FOREST_MOST = 18;
test('tiles-forest draws its code tileset\'s pixels except the known corner shading, within its bound', async () => {
  const { code, data } = await pair('tiles-forest');
  for (const [name, p] of sweep(code)) {
    for (const [clip, n] of Object.entries(diffs(code, data, p))) {
      assert.match(clip, FOREST_GAP, `tiles-forest at ${name}: ${clip} differs in ${n} px`);
      assert.ok(n <= FOREST_MOST, `tiles-forest at ${name}: ${clip} differs in ${n} px (at most ${FOREST_MOST})`);
    }
  }
});

test('tiles-forest stays within the same bound at 40 random settings, colours off the swatches included', async () => {
  const { code, data } = await pair('tiles-forest');
  for (const p of randomSettings(code, 40, 7)) {
    for (const [clip, n] of Object.entries(diffs(code, data, p))) {
      assert.match(clip, FOREST_GAP, `tiles-forest at ${JSON.stringify(p)}: ${clip} differs in ${n} px`);
      assert.ok(n <= FOREST_MOST, `tiles-forest at ${JSON.stringify(p)}: ${clip} differs in ${n} px (at most ${FOREST_MOST})`);
    }
  }
});

test('each library tileset is what its writer in tests/helpers/ports/ writes', async () => {
  for (const id of ['tiles-forest', 'tiles-cave', 'tiles-dungeon']) {
    const { written } = await import(`../helpers/ports/${id}.mjs`);
    assert.equal(typeof written, 'function', `${id}: the writer exports written()`);
    assert.equal(written(), fs.readFileSync(libFile(id), 'utf8'), `${id}: sprites/${id}.json is what tests/helpers/ports/${id}.mjs writes (node tests/helpers/ports/${id}.mjs --write)`);
  }
  // the platforms: B15b's port (its fixture, tests/fixtures/v2/tiles/tiles-platforms.json) without the fixture's `made`
  const { tilesPlatformsPort, fixtureText } = await import('../helpers/ports/tiles-platforms.mjs');
  const port = tilesPlatformsPort(); delete port.made;
  assert.equal(fixtureText(port), fs.readFileSync(libFile('tiles-platforms'), 'utf8'), 'tiles-platforms: sprites/tiles-platforms.json is the B15b port without `made`');
});
