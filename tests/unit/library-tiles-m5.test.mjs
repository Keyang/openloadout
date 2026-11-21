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

// ---- the four library tilesets against their code -----------------------------------------------------------------
const pair = async (id) => ({ code: await codeSprite(id), data: await librarySprite(id) });

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
// The forest's one known gap (docs/data-sprites.md section 7 allows a redraw to differ; the review measured it): where
// the grass hangs down a corner, a slope or a ledge end, the code shades by the edge band's depth there, which band rules
// have no row form for. Only those tiles may differ, by at most this many pixels each, at any setting swept.
const FOREST_GAP = /^grass-(left|right|strip-l|strip-r|col-t|single|inner-(tl|tr|bl|br)|slope-(up|down)|thin-(l|m|r))$/;
const FOREST_MOST = 18;