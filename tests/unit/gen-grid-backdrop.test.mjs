// The grid family (engine/gen/grid.js): what the Gridline backdrop is made of (bundles/specs/kit-puzzle-gridline.md,
// `bg-gridline`; "GH2": the look gridLines of engine/backdrop.js and the old sprite's towers, floating shapes and band
// drew, now generators). Each is pinned by the goldens harness (tests/helpers/gen-harness.mjs); the tests after it hold
// what the specification asks of a layer. To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-grid-backdrop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { GRID_FRAME_GENERATORS, GRID_SHAPE_KINDS } from '../../engine/gen/grid.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const LAYER = { size: [320, 180] };
const LOOP = { size: [320, 180], t: 0.5, loop: true, frames: 8, frame: 4 };

const CASES = {
  'grid.lines@1': [
    { args: { paint: 'haze' }, ctx: LAYER },
    { args: { pitch: 20, paint: 'haze', accent: 'haze.light', accentEvery: [4, 3] }, ctx: LAYER },
    { args: { pitch: 16, paint: 'haze', accent: 'glow', accentEvery: [0, 2] }, ctx: { size: [64, 64] } },
  ],
  'grid.lights@1': [
    { args: { paint: 'glow' }, ctx: LAYER },
    { args: { count: 14, seed: 3, pitch: 20, paint: 'glow' }, ctx: LAYER },
    { args: { count: 6, seed: 9, pitch: 16, size: 3, paint: 'glow.light' }, ctx: { size: [64, 64] } },
  ],
  'grid.towers@1': [
    { args: { paint: 'land' }, ctx: LAYER },
    { args: { tall: 8, seed: 4, paint: 'land', alt: 'land.light', lit: 'glow', unlit: 'land.deep' }, ctx: LOOP },
    { args: { tall: 3, slots: 4, cell: 8, base: 60, strip: 0, paint: 'land', lit: 'glow', windows: 0.5 }, ctx: { size: [128, 64], t: 0.25, loop: true, frames: 8, frame: 2 } },
  ],
  'grid.shapes@1': [
    { args: { paints: ['land'] }, ctx: LAYER },
    { args: { count: 12, seed: 5, kind: 'mixed', floor: 112, paints: ['land.light', 'land', 'land.dark'] }, ctx: LOOP },
    { args: { count: 6, seed: 2, kind: 'rings', top: 20, floor: 90, paints: ['glow', 'land'] }, ctx: LAYER },
    { args: { count: 5, seed: 7, kind: 'pieces', floor: 100, paints: ['land'] }, ctx: LAYER },
    { args: { count: 4, seed: 1, kind: 'squares', floor: 100, paints: ['land', 'land.dark'], wrap: false }, ctx: LOOP },
  ],
  'grid.band@1': [
    { args: { paint: 'land' }, ctx: LAYER },
    { args: { height: 28, seed: 3, paint: 'land', alt: 'land.dark', lip: 3, lipPaint: 'land.light' }, ctx: LAYER },
    { args: { height: 12, cell: 8, base: 64, share: 0.6, paint: 'land', alt: 'land.dark' }, ctx: { size: [64, 64] } },
  ],
  'grid.runner@1': [
    { args: { row: 160, paint: 'glow' }, ctx: LAYER },
    { args: { row: 152, length: 48, paint: 'glow', dim: 'glow.dark' }, ctx: LOOP },
    { args: { row: 10, length: 20, thick: 2, paint: 'glow', dim: 'glow.dark' }, ctx: { size: [64, 64], t: 0.95, loop: true, frames: 8, frame: 7 } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const [id, v] = key.split('@');
  test(`${key} passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

// ---- what a layer is -----------------------------------------------------------------------------------------------

const run = (call, ctx = LAYER) => {
  const r = registry.runGenerator(call, ctx);
  assert.ok(r.ok, r.errors.join('; '));
  return r.primitives;
};

/** The pixels a list of rects covers in a W x H frame, wrapped across its width: Map "x,y" -> paint (as text), later ones on top. */
function painted(prims, [W, H] = LAYER.size) {
  const out = new Map();
  for (const p of prims) {
    assert.equal(p.kind, 'rect', 'the grid family draws with rects only');
    for (let y = p.at[1]; y < p.at[1] + p.size[1]; y++) for (let x = p.at[0]; x < p.at[0] + p.size[0]; x++) {
      if (x >= 0 && x < W && y >= 0 && y < H) out.set(`${x},${y}`, JSON.stringify(p.paint));
    }
  }
  return out;
}

test('every grid generator is a frame generator, registered in FRAME_GENERATORS', () => {
  for (const key of Object.keys(CASES)) {
    assert.ok(GRID_FRAME_GENERATORS[key], `${key} has no reason in GRID_FRAME_GENERATORS`);
    assert.equal(registry.FRAME_GENERATORS[key], GRID_FRAME_GENERATORS[key]);
  }
});

test('grid.lines@1: 16 lines across and 9 down at pitch 20, every fourth across and third down in the accent', () => {
  const px = painted(run({ gen: 'grid.lines', v: 1, pitch: 20, paint: 'haze', accent: 'lit', accentEvery: [4, 3] }));
  for (let x = 0; x < 320; x++) {
    const want = x % 80 === 0 ? '"lit"' : x % 20 === 0 ? '"haze"' : undefined;
    assert.equal(px.get(`${x},7`), want, `column ${x}`);
  }
  for (let y = 0; y < 180; y++) {
    const want = y % 60 === 0 ? '"lit"' : y % 20 === 0 ? '"haze"' : undefined;
    assert.equal(px.get(`7,${y}`), want, `row ${y}`);
  }
});

test('grid.lights@1: every light is 2 x 2 and lies inside a square of the grid, never on a line', () => {
  const prims = run({ gen: 'grid.lights', v: 1, count: 40, seed: 3, pitch: 20, paint: 'glow' });
  assert.equal(prims.length, 40);
  for (const p of prims) {
    assert.deepEqual(p.size, [2, 2]);
    for (const [c, n] of [[p.at[0], 320], [p.at[1], 180]]) {
      assert.ok(c >= 0 && c + 1 < n, 'inside the frame');
      assert.ok(c % 20 >= 1 && (c + 1) % 20 >= 1, `a light at ${p.at} touches a line`);
    }
  }
});

test('grid.lights@1 and grid.shapes@1 keep the ones already there when the count grows', () => {
  const few = run({ gen: 'grid.lights', v: 1, count: 6, seed: 3, paint: 'glow' }).map((p) => String(p.at));
  const many = new Set(run({ gen: 'grid.lights', v: 1, count: 14, seed: 3, paint: 'glow' }).map((p) => String(p.at)));
  for (const at of few) assert.ok(many.has(at), `the light at ${at} moved`);
  const a = painted(run({ gen: 'grid.shapes', v: 1, count: 4, seed: 5, kind: 'squares', floor: 112, paints: ['land'] }));
  const b = painted(run({ gen: 'grid.shapes', v: 1, count: 12, seed: 5, kind: 'squares', floor: 112, paints: ['land'] }));
  for (const k of a.keys()) assert.ok(b.has(k), `a shape's pixel at ${k} is gone with more shapes`);
});

test('grid.towers@1: whole cells, no taller than `tall`, a strip along the bottom, and the layer repeats across its width', () => {
  for (const tall of [3, 6, 8]) {
    const px = painted(run({ gen: 'grid.towers', v: 1, tall, seed: 4, paint: 'land', alt: 'alt', lit: 'lit', unlit: 'unlit' }));
    let top = 180;
    for (const k of px.keys()) top = Math.min(top, Number(k.split(',')[1]));
    assert.equal(top, 180 - tall * 8, `the tallest tower at tall ${tall}`);
    for (let x = 0; x < 320; x++) assert.ok(px.has(`${x},179`) && px.has(`${x},172`), `the strip at column ${x}`);
    for (let x = 0; x < 320; x += 8) for (let y = 4; y < 180; y += 8) {       // a cell is one thing: all of its 8 x 8 or none
      const has = px.has(`${x},${y}`);
      for (const [dx, dy] of [[7, 0], [0, 3], [7, 3], [0, 7], [7, 7]]) assert.equal(px.has(`${x + dx},${y + dy}`), has, `cell at ${x},${y}`);
    }
  }
});

test('grid.towers@1: windows blink over the loop, and frame 0 leads back into itself', () => {
  const at = (t) => JSON.stringify(run({ gen: 'grid.towers', v: 1, tall: 6, seed: 4, paint: 'land', lit: 'lit', unlit: 'unlit' }, { ...LOOP, t }));
  assert.equal(at(0), at(1));
  assert.notEqual(at(0), at(0.5));
});

test('grid.shapes@1: every shape is a 3 px line, clear of the top rows and above the floor, and none overlap', () => {
  for (const kind of GRID_SHAPE_KINDS) {
    const prims = run({ gen: 'grid.shapes', v: 1, count: 12, seed: 5, kind, top: 16, floor: 112, paints: ['a', 'b', 'c'] }, LOOP);
    const px = painted(prims);
    assert.ok(px.size > 12 * 60, `${kind}: ${px.size} pixels for 12 shapes`);
    for (const k of px.keys()) { const y = Number(k.split(',')[1]); assert.ok(y >= 1 && y <= 112 + 20, `${kind}: a pixel at row ${y}`); }
    // no solid block: every painted pixel has an empty pixel within 3 px (a line, never a filled shape)
    for (const k of px.keys()) {
      const [x, y] = k.split(',').map(Number);
      let open = false;
      for (let dy = -3; dy <= 3 && !open; dy++) for (let dx = -3; dx <= 3 && !open; dx++) if (!px.has(`${(x + dx + 320) % 320},${y + dy}`)) open = true;
      assert.ok(open, `${kind}: a filled block at ${k}`);
    }
  }
});

test('grid.shapes@1: the shapes pulse through their paints over the loop and close', () => {
  const at = (t) => JSON.stringify(run({ gen: 'grid.shapes', v: 1, count: 8, seed: 5, floor: 112, paints: ['a', 'b', 'c'] }, { ...LOOP, t }));
  assert.equal(at(0), at(1));
  assert.notEqual(at(0), at(0.5));
  const used = new Set(run({ gen: 'grid.shapes', v: 1, count: 12, seed: 5, floor: 112, paints: ['a', 'b', 'c'] }, LOOP).map((p) => p.paint));
  assert.deepEqual([...used].sort(), ['a', 'b', 'c']);
});

test('grid.band@1: fills its rows across the whole width in cells of two tones, with a lip along the top', () => {
  const px = painted(run({ gen: 'grid.band', v: 1, height: 28, seed: 3, paint: 'land', alt: 'alt', lip: 3, lipPaint: 'lip' }));
  for (let x = 0; x < 320; x++) {
    assert.equal(px.has(`${x},151`), false);
    for (let y = 152; y < 180; y++) assert.ok(px.has(`${x},${y}`), `${x},${y}`);
    assert.equal(px.get(`${x},152`), '"lip"');
    assert.equal(px.get(`${x},154`), '"lip"');
    assert.equal(px.get(`${x},160`), px.get(`${x - (x % 16)},160`), 'a cell is one tone');
  }
  const tones = new Set([...px.values()]);
  assert.deepEqual([...tones].sort(), ['"alt"', '"land"', '"lip"']);
});

test('grid.runner@1: a light `length` px long runs left to right along the row and wraps', () => {
  const lit = (t) => { const px = painted(run({ gen: 'grid.runner', v: 1, row: 152, length: 48, paint: 'lit', dim: 'dim' }, { ...LOOP, t })); return [...Array(320).keys()].filter((x) => px.get(`${x},152`) === '"lit"'); };
  for (const t of [0, 0.25, 0.5, 0.875]) assert.equal(lit(t).length, 48, `at t ${t}`);
  assert.deepEqual(lit(0), lit(1));
  assert.equal(Math.max(...lit(0.5)), 159);
  assert.ok(lit(0).includes(0) === false && lit(0).includes(319), 'at t 0 the tail is still coming round the join');
  const px = painted(run({ gen: 'grid.runner', v: 1, row: 152, paint: 'lit', dim: 'dim' }, LOOP));
  for (let x = 0; x < 320; x++) assert.ok(px.has(`${x},152`), 'the line is unbroken');
});
