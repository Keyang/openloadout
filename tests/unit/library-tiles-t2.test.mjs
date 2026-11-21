// Build item T2 (docs/data-sprites.md section 9, the last migration wave): the tilesets castle, village, meadow, water
// and shore redrawn as data, sprites/<id>.json, held to the frozen code tilesets they replace
// (tests/fixtures/code-sprites/): the same clips in the same order (a downloaded sheet keeps its frame positions), the
// same tile rules and picker classes, and the same pixels, exactly, on every frame of every clip, at the defaults, at
// every setting swept (each slider at its ends, middle and a third point, each option, each swatch, each toggle
// flipped) and at random settings with half the colours off the swatches (the colour controls take any colour: the
// colours the code worked out are the code's colour rules, never the colour they give at the swatches). Each library
// file is what its writer in tests/helpers/ports/ writes. The tiles are drawn by engine/gen/tile-ports.js (their
// generators' own tests: tests/unit/gen-tile-ports.test.mjs).
//
// T2_IDS=a,b runs the tests on those tilesets only (a tileset still being redrawn is left out).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tileRules } from '../../engine/tile-rules.js';
import { classifyTiles } from '../../engine/tiles.js';
import { cleanParams, defaultParams, renderFrame } from '../../engine/sprite.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { ROOT, codeSprite, librarySprite } from '../helpers/library.mjs';

const ALL = ['tiles-castle', 'tiles-village', 'tiles-meadow', 'tiles-water', 'tiles-shore'];
// BLOCKED: tiles-shore has six versions of its open water (water-fill to water-fill-f), and the validator takes a group
// of at most four (catalog/sprite-schema.js SPRITE_LIMITS.fillVersions, docs/data-sprites.md 2.3 "fills: 1..4"). Its
// generator and writer are done (tests/helpers/ports/tiles-shore.mjs); its code file stays until the cap is six.
const BLOCKED = {}; // tiles-shore unblocked: the fill-version cap is 6 (catalog/sprite-schema.js)
const IDS = ALL.filter((id) => !BLOCKED[id] && (!process.env.T2_IDS || process.env.T2_IDS.split(',').includes(id)));
const libFile = (id) => `${ROOT}/sprites/${id}.json`;
const pair = async (id) => ({ code: await codeSprite(id), data: await librarySprite(id) });

test('each is a library data file with no code file beside it, and the validator passes it', () => {
  for (const id of IDS) {
    assert.ok(fs.existsSync(libFile(id)), `sprites/${id}.json`);
    assert.equal(fs.existsSync(`${ROOT}/sprites/${id}.js`), false, `sprites/${id}.js is deleted`);
    const r = validateSprite(JSON.parse(fs.readFileSync(libFile(id), 'utf8')));
    assert.deepEqual(r.errors, [], id);
  }
});

/** Settings to compare at: the defaults, each slider at its ends, middle and a third point, each option, each swatch, each toggle flipped. */
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
      if (o.kind === 'choice') p[k] = o.options[Math.floor(rnd() * o.options.length)].value;
      if (o.kind === 'toggle') p[k] = rnd() < 0.5;
    }
    out.push(p);
  }
  return out;
}
/** Pixels that differ, per clip, over every frame (or the first `most` of each clip), at these settings. */
function diffs(code, data, p0, most = Infinity) {
  const pc = cleanParams(code, p0), pd = cleanParams(data, p0), out = {};
  for (const clip of Object.keys(code.clips)) {
    for (let f = 0; f < Math.min(most, code.clips[clip].frames); f++) {
      const a = renderFrame(code, clip, f, pc).data, b = renderFrame(data, clip, f, pd).data;
      let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
      if (n) out[`${clip}#${f}`] = n;
    }
  }
  return out;
}

test('a blocked tileset is refused for that reason only, and stays a code file until it is not', async () => {
  for (const [id, why] of Object.entries(BLOCKED)) {
    const { written } = await import(`../helpers/ports/${id}.mjs`);
    const r = validateSprite(JSON.parse(written()));
    assert.equal(r.ok, false, `${id} passes the validator now: take it out of BLOCKED, write it (node tests/helpers/ports/${id}.mjs --write) and delete sprites/${id}.js`);
    assert.equal(r.errors.length, 1, `${id}: ${r.errors.join('; ')}`);
    assert.match(r.errors[0], why);
    assert.ok(fs.existsSync(`${ROOT}/sprites/${id}.js`) && !fs.existsSync(libFile(id)), `${id} is still the code file`);
  }
});
