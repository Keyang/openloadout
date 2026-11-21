// Build item T3: the hive, pit, station floor and station walls tilesets redrawn as data (sprites/tiles-hive.json,
// tiles-pit.json, tiles-station-floor.json, tiles-station-walls.json), each tile drawn by its port generator
// (engine/gen/tiles-t3.js), held to the frozen code tilesets they replace (tests/fixtures/code-sprites/): the same clips
// in the same order with the same frames, labels, block kinds and decal places (a downloaded sheet keeps its frame
// positions), the same tile rules and picker classes, and the same pixels on every frame: at every setting one move from
// the defaults, every swatch, and seeded random settings with colours off the swatches (the colour controls take any
// colour, so the data must follow the code's colour maths, not its colours at the swatches). Each library file is what
// its writer (tests/helpers/ports/tiles-t3.mjs) writes. The pixel difference this measures is the redraw's: 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tileRules } from '../../engine/tile-rules.js';
import { classifyTiles } from '../../engine/tiles.js';
import { cleanParams, defaultParams, renderFrame } from '../../engine/sprite.js';
import { ROOT, codeSprite, librarySprite, codeSpriteFile } from '../helpers/library.mjs';
import { hasReplay } from '../helpers/code-replay.mjs';
import { T3_IDS, written } from '../helpers/ports/tiles-t3.mjs';

const pair = async (id) => ({ code: await codeSprite(id), data: await librarySprite(id) });

test('each is a data file now, and its code file is gone', () => {
  for (const id of T3_IDS) {
    assert.ok(fs.existsSync(`${ROOT}/sprites/${id}.json`), `sprites/${id}.json`);
    assert.equal(fs.existsSync(`${ROOT}/sprites/${id}.js`), false, `sprites/${id}.js is deleted`);
    assert.ok(codeSpriteFile(id) !== null || hasReplay(id), `the frozen copy of ${id}, or its recorded replay (tiles-hive: engine/hive.js went in R3)`);
  }
});

test('each library file is what tests/helpers/ports/tiles-t3.mjs writes', async () => {
  for (const id of T3_IDS) assert.equal(await written(id), fs.readFileSync(`${ROOT}/sprites/${id}.json`, 'utf8'), `${id}: node tests/helpers/ports/tiles-t3.mjs --write`);
});

test('each keeps its code tileset\'s clips in order, with their frames, labels, block kinds and decal places', async () => {
  for (const id of T3_IDS) {
    const { code, data } = await pair(id);
    assert.deepEqual(Object.keys(data.clips), Object.keys(code.clips), `${id}: clips in order`);
    for (const [k, c] of Object.entries(code.clips)) {
      const d = data.clips[k];
      assert.deepEqual([d.frames, d.label, d.block, d.place, d.loop !== false], [c.frames, c.label, c.block, c.place, c.loop !== false], `${id} ${k}`);
    }
  }
});

test('each gives the download the same tile rules and the picker the same classes', async () => {
  for (const id of T3_IDS) {
    const { code, data } = await pair(id);
    assert.deepEqual(tileRules(data.clips, { view: data.meta?.view }), tileRules(code.clips, { view: code.meta?.view }), `${id} tile rules`);
    assert.deepEqual(classifyTiles(data.clips), classifyTiles(code.clips), `${id} classes`);
  }
});

/** Settings to compare at: the defaults, each range at its ends, middle and a third of the way, each option, each swatch, each toggle flipped. */
function sweep(code) {
  const D = defaultParams(code), out = [['default', D]];
  for (const [k, o] of Object.entries(code.params)) {
    if (k === 'speed') continue;
    if (o.kind === 'range') for (const v of [o.min, (o.min + o.max) / 2, o.max, o.min + (o.max - o.min) * 0.37]) out.push([`${k}=${v}`, { ...D, [k]: v }]);
    if (o.kind === 'choice') for (const x of o.options) out.push([`${k}=${x.value ?? x}`, { ...D, [k]: x.value ?? x }]);
    if (o.kind === 'color') for (const s of o.swatches) out.push([`${k}=${s}`, { ...D, [k]: s }]);
    if (o.kind === 'toggle') out.push([`${k}=${!o.def}`, { ...D, [k]: !o.def }]);
  }
  return out;
}
/** Seeded random settings, every control at once, half the colours off the swatches. */
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
      if (o.kind === 'choice') { const x = o.options[Math.floor(rnd() * o.options.length)]; p[k] = x.value ?? x; }
      if (o.kind === 'toggle') p[k] = rnd() < 0.5;
    }
    out.push(p);
  }
  return out;
}
/** Pixels that differ, per clip, at these settings: every frame of every clip (allFrames), or the first frame and frame 3. */
export function diffs(code, data, p0, allFrames = false) {
  const pc = cleanParams(code, p0), pd = cleanParams(data, p0), out = {};
  for (const clip of Object.keys(code.clips)) {
    const n = code.clips[clip].frames, frames = allFrames ? [...Array(n).keys()] : [...new Set([0, Math.min(3, n - 1)])];
    for (const f of frames) {
      const a = renderFrame(code, clip, f, pc).data, b = renderFrame(data, clip, f, pd).data;
      let k = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) k++;
      if (k) out[`${clip}#${f}`] = k;
    }
  }
  return out;
}

for (const id of T3_IDS) {
  test(`${id} draws its code tileset's pixels on every frame of every clip at the defaults`, async () => {
    const { code, data } = await pair(id);
    assert.deepEqual(diffs(code, data, defaultParams(code), true), {}, id);
  });
  test(`${id} draws its code tileset's pixels at every setting swept`, async () => {
    const { code, data } = await pair(id);
    for (const [name, p] of sweep(code)) assert.deepEqual(diffs(code, data, p), {}, `${id} at ${name}`);
  });
  test(`${id} draws its code tileset's pixels at 24 random settings, colours off the swatches included`, async () => {
    const { code, data } = await pair(id);
    for (const p of randomSettings(code, 24, 7 + id.length)) assert.deepEqual(diffs(code, data, p, true), {}, `${id} at ${JSON.stringify(p)}`);
  });
}
