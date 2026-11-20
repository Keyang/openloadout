// scatter-pellet's shard and spark, pixel for pixel against the code they redraw (build item E3b; review of E3 round 3,
// issue 1: the shard was exact, but only a tool outside the project said so, and moving the whole dart 1 px or painting
// its core in the glow colour left every test green; issue 6: the spark had a stray tail pixel and did not grow on its
// flaring beat, and is now drawn as the code drew it too). The code is the frozen copy
// tests/fixtures/code-sprites/scatter-pellet.js (read through tests/helpers/library.mjs codeSprite); the library asset
// is sprites/scatter-pellet.json. Every fly frame of Shape = Shard and of Shape = Spark must be the same pixels at:
//   - every Size step where the head's width changes (3, 4 or 5 px: below 0.25, from 0.25, from 0.75) and between,
//   - Length in 41 steps (the head moves on a half-pixel rounding of Length, the tail and nose continuously),
//   - every Flicker band (1 px or 2 px out and in, the flare of a wild pellet from 0.4 out and 0.8 in) and its edges,
//   - the default colours and three other swatch pairs (core and glow, and the mid and rim worked out from them).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, codeSprite, librarySpriteFile } from '../helpers/library.mjs';
import { loadDataSprite } from '../../tools/lib/assets.mjs';
import { renderFrame, defaultParams } from '../../engine/sprite.js';

const steps = (n) => Array.from({ length: n }, (_, i) => i / (n - 1));
const SIZES = [0, 0.1, 0.2499, 0.25, 0.5, 0.7499, 0.75, 1];
const FLICKERS = [0, 0.2, 0.357, 0.3572, 0.39, 0.4, 0.6, 0.7999, 0.8, 1];

/** The first pixel where two frames differ, as "x,y code #rrggbbaa data #rrggbbaa", or null when they are the same. */
function firstDiff(a, b) {
  const hex = (p) => '#' + (p >>> 0).toString(16).padStart(8, '0');
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return `${i % a.w},${Math.floor(i / a.w)} code ${hex(a.data[i])} data ${hex(b.data[i])}`;
  return null;
}

/** Every case of the sweep: settings over both sprites' defaults. */
function sweep(code) {
  const core = code.params.core.swatches, glow = code.params.glow.swatches;
  const out = [];
  for (const size of SIZES) for (const length of steps(41)) for (const flicker of FLICKERS) out.push({ size, length, flicker });
  // the other colours: three swatch pairs, at three sizes, 11 lengths and three flickers
  for (const k of [1, 2, 3]) for (const size of [0, 0.5, 1]) for (const length of steps(11)) for (const flicker of [0, 0.5, 1])
    out.push({ size, length, flicker, core: core[k % core.length], glow: glow[(k * 3) % glow.length] });
  return out;
}

test('the frozen code copy is there and is the code sprite scatter-pellet; the library asset is its data file', async () => {
  const code = await codeSprite('scatter-pellet');
  assert.equal(code.id, 'scatter-pellet');
  assert.equal(librarySpriteFile('scatter-pellet'), 'sprites/scatter-pellet.json');
  assert.ok(code.params.core.swatches.length >= 4 && code.params.glow.swatches.length >= 4, 'swatches to sweep');
});

for (const shape of ['shard', 'spark']) test(`scatter-pellet ${shape}: every fly frame is the code's pixels (Size x Length x Flicker x colours)`, async () => {
  const code = await codeSprite('scatter-pellet');
  const data = await loadDataSprite(ROOT, path.join(ROOT, 'sprites', 'scatter-pellet.json'));
  const cases = sweep(code), frames = code.clips.fly.frames;
  assert.equal(data.clips.fly.frames, frames, 'fly frames');
  const bad = [];
  let n = 0;
  for (const set of cases) for (let f = 0; f < frames; f++) {
    const a = renderFrame(code, 'fly', f, { ...defaultParams(code), shape, ...set });
    const b = renderFrame(data, 'fly', f, { ...defaultParams(data), shape, ...set });
    n++;
    const d = firstDiff(a, b);
    if (d) bad.push(`f${f} ${JSON.stringify(set)}: ${d}`);
  }
  assert.ok(n > 10000, `${n} frames compared`);
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} of ${n} ${shape} frames differ from the code (change tools/projectiles/scatter-pellet.mjs and run node tools/projectiles/write.mjs scatter-pellet)`);
});
