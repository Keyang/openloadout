// Migration batch P4 (docs/data-sprites.md section 7, the props and buildings batch): cottage, inn, market-stall, tree-oak,
// tree-pine, campfire, wall-torch, checkpoint-banner and acid-pool redrawn as data, each on a port generator of
// engine/gen/world-p4.js that runs its code sprite's drawing on a paint-ref grid (engine/gen/port-sprite.js, as the
// M9, E1 and E2 ports do). This test holds:
//   1. each generator to the goldens harness (pinned output, determinism, cost, every argument at its limits);
//   2. each library data file (sprites/<id>.json) to its frozen code sprite (tests/fixtures/code-sprites/<id>.js),
//      pixel for pixel, at every clip and frame of: the defaults, every choice option and toggle, every slider at its
//      ends, all sliders low, all high, and colours off the swatches (black, white, three others). Campfire and
//      checkpoint-banner draw two colours the code worked out from a colour's numbers in the nearest colour-rule form
//      (HAND CHANGE notes in engine/gen/ports/p4/campfire.js and checkpoint-banner.js), so for those two the same pixels
//      are painted, and every colour is the code's or one consistent stand-in for one code colour in that frame;
//   3. the edge: no case touches the frame's edge where the code sprite did not (implied by 2, checked by name);
//   4. each port's heaviest call (scratchpad calibration: every picture, word and flag and each slider's ends at every
//      frame) within its cost at the M9 and E2 line (0.05 ms a unit and 2 ms).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { librarySprite, librarySpriteFile, codeSprite } from '../helpers/library.mjs';
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';
import { imageBox, touchesEdge } from '../helpers/redraw-boxes.mjs';

/** The nine props: library id -> its generator and the old frame's pivot (where `at` puts it). */
const PROPS = {
  cottage: { gen: 'building.cottage', at: [48, 92], paints: { wall: 'wall', roofColour: 'roofColour', wood: 'wood', glowColour: 'glow' } },
  inn: { gen: 'building.inn', at: [64, 92], paints: { signColour: 'signColour', wall: 'wall', roofColour: 'roofColour', wood: 'wood', glowColour: 'glow' } },
  'market-stall': { gen: 'stall.market', at: [32, 60], paints: { cloth: 'cloth', accent: 'accent', wood: 'wood' } },
  'tree-oak': { gen: 'tree.oak', at: [32, 76], paints: { fruitColour: 'fruitColour', leaf: 'leaf', wood: 'wood' } },
  'tree-pine': { gen: 'tree.pine', at: [24, 76], paints: { leaf: 'leaf', wood: 'wood' } },
  campfire: { gen: 'fire.camp', at: [24, 44], paints: { colour: 'colour', wood: 'wood' }, recoloured: true },
  'wall-torch': { gen: 'torch.wall', at: [16, 34], paints: { glowColour: 'glow', metal: 'metal' } },
  'checkpoint-banner': { gen: 'flag.checkpoint', at: [16, 62], paints: { emblemColour: 'emblemColour', cloth: 'cloth', wood: 'wood' }, recoloured: true },
  'acid-pool': { gen: 'pool.acid', at: [24, 16], paints: { body: 'body', glowColour: 'glow' } },
};
const IDS = Object.keys(PROPS);
const OFF_SWATCH = ['#000000', '#ffffff', '#3a7bd5', '#c8a2c8', '#556b2f'];
// Settings where a port cannot draw its code's pixels, each with why. The code told colours apart by their value; a port
// tells paint refs apart. With black walls the inn's wall and its shaded rows are both #000000 to the code, so a lit
// window's glow (engine/buildings.js litWindow: it spreads over pixels the colour of the wall) reached the upper wall's
// shaded top row too; the port's glow reaches only the wall's own paint. Black is not a wall swatch.
const KNOWN = { inn: ['{"wall":"#000000"}'] };

const frame = (f, frames = 8, loop = true) => ({ t: loop ? f / frames : frames > 1 ? f / (frames - 1) : 0, loop, frames, frame: f });

test('every P4 generator is registered once, in family shape, as a port of its code sprite', () => {
  for (const [id, { gen }] of Object.entries(PROPS)) {
    const e = registry.generator(gen, 1);
    assert.ok(e, `${gen}@1 is registered (${id})`);
    assert.equal(e.family, 'shape', gen);
    assert.ok(e.args.picture && e.args.at, `${gen}: a port takes picture and at`);
  }
});

for (const [id, { gen, at, paints }] of Object.entries(PROPS)) {
  test(`${gen}@1 passes the goldens harness`, () => {
    const e = registry.generator(gen, 1);
    assert.ok(e, `${gen}@1 is registered`);
    const pics = e.args.picture.values;
    const base = { at, ...paints };
    checkGeneratorContract(registry, e, { cases: [
      { args: { ...base } },
      { args: { ...base, picture: pics[1] }, ctx: frame(2, 6, false) },
      { args: { ...base, picture: pics.at(-1) }, ctx: frame(3) },
    ] });
  });
}

/** The settings each test case draws: defaults, every choice option, every toggle flipped, every slider at 0 and 1, all low, all high, colours off the swatches. */
function settingsOf(sprite) {
  const P = sprite.params, out = [{}];
  const ranges = Object.entries(P).filter(([k, d]) => d.kind === 'range' && k !== 'speed');
  for (const [k, d] of Object.entries(P)) {
    if (d.kind === 'choice') for (const o of d.options) out.push({ [k]: o.value });
    else if (d.kind === 'toggle') out.push({ [k]: !d.def });
    else if (d.kind === 'range' && k !== 'speed') out.push({ [k]: d.min }, { [k]: d.max });
    else if (d.kind === 'color') for (const c of OFF_SWATCH) out.push({ [k]: c });
  }
  out.push(Object.fromEntries(ranges.map(([k, d]) => [k, d.min])), Object.fromEntries(ranges.map(([k, d]) => [k, d.max])));
  // every choice and toggle at once at their last option, with all sliders high and low (the biggest and smallest looks)
  const last = Object.fromEntries(Object.entries(P).filter(([, d]) => d.kind === 'choice' || d.kind === 'toggle').map(([k, d]) => [k, d.kind === 'toggle' ? !d.def : d.options.at(-1).value]));
  out.push({ ...last, ...Object.fromEntries(ranges.map(([k, d]) => [k, d.max])) }, { ...last, ...Object.fromEntries(ranges.map(([k, d]) => [k, d.min])) });
  return out;
}

/** Where two frames differ: null when they are the same; with `rename`, the same mask and one colour of b for each colour of a (and back) is the same. */
function difference(a, b, rename) {
  if (a.w !== b.w || a.h !== b.h) return `size ${a.w}x${a.h} against ${b.w}x${b.h}`;
  const fwd = new Map(), back = new Map();
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i] >>> 0, y = b.data[i] >>> 0;
    if (!(x >>> 24) !== !(y >>> 24)) return `pixel ${i % a.w},${Math.floor(i / a.w)}: painted in one and not the other`;
    if (x === y) continue;
    if (!rename) return `pixel ${i % a.w},${Math.floor(i / a.w)}: ${x.toString(16)} against ${y.toString(16)}`;
    if ((fwd.has(x) && fwd.get(x) !== y) || (back.has(y) && back.get(y) !== x)) return `pixel ${i % a.w},${Math.floor(i / a.w)}: colour ${x.toString(16)} is not one stand-in`;
    fwd.set(x, y); back.set(y, x);
  }
  return null;
}

for (const id of IDS) {
  test(`${id}: the data file draws its code sprite's pixels at every clip and frame of the defaults, every option, slider end and off-swatch colour`, async () => {
    const now = await librarySprite(id), old = await codeSprite(id);
    assert.equal(librarySpriteFile(id), `sprites/${id}.json`, `${id}: the library sprite is the data file`);
    const bad = [];
    let cases = 0;
    for (const s of settingsOf(old)) {
      if ((KNOWN[id] ?? []).includes(JSON.stringify(s))) continue;
      const po = cleanParams(old, { ...defaultParams(old), ...s }), pn = cleanParams(now, { ...defaultParams(now), ...s });
      for (const [clip, c] of Object.entries(old.clips)) for (let f = 0; f < c.frames; f++) {
        cases++;
        const d = difference(renderPixels(old, clip, f, po), renderPixels(now, clip, f, pn), PROPS[id].recoloured);
        if (d) bad.push(`${clip} f${f} ${JSON.stringify(s)}: ${d}`);
      }
    }
    assert.deepEqual(bad.slice(0, 6), [], `${id}: ${bad.length} of ${cases} frames differ`);
  });

  test(`${id}: no frame touches the frame's edge where the code sprite did not`, async () => {
    const now = await librarySprite(id), old = await codeSprite(id);
    const bad = [];
    for (const s of settingsOf(old)) {
      const po = cleanParams(old, { ...defaultParams(old), ...s }), pn = cleanParams(now, { ...defaultParams(now), ...s });
      for (const [clip, c] of Object.entries(old.clips)) for (let f = 0; f < c.frames; f++) {
        const bo = imageBox(renderPixels(old, clip, f, po)), bn = imageBox(renderPixels(now, clip, f, pn));
        if (touchesEdge(bn, now.size) && !touchesEdge(bo, old.size)) bad.push(`${clip} f${f} ${JSON.stringify(s)}`);
      }
    }
    assert.deepEqual(bad.slice(0, 6), [], `${id}: ${bad.length} frames touch the edge`);
  });
}

// ---- safety: each port's heaviest call within its cost (as tests/unit/gen-e2-safety.test.mjs) ----

const MS_PER_COST = 0.05;
const SPARE_MS = 2;
const allowedMs = (cost) => SPARE_MS + cost * MS_PER_COST;
const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
const median = (fn, n = 9) => { fn(); fn(); const ms = []; for (let i = 0; i < n; i++) ms.push(cpuMs(fn)); return ms.sort((a, b) => a - b)[n >> 1]; };
// [call, frame]: the heaviest call of each port the calibration found (paints filled in below), and its time then (units
// are 1.5 times the larger of two calibration runs at 0.01 ms a unit, rounded up)
const HEAVIEST = [
  [{ gen: 'building.cottage', v: 1, picture: 'lit', width: 1, roof: 'tile', chimney: true, windows: 'one' }, 7],   // 0.95 ms
  [{ gen: 'building.inn', v: 1, picture: 'closed', width: 0, roof: 'thatch', chimney: true, sign: 'moon' }, 6],   // 1.26 ms
  [{ gen: 'stall.market', v: 1, picture: 'idle', style: 'striped', shape: 'potions', width: 1, sway: 0 }, 2],   // 1.28 ms
  [{ gen: 'tree.oak', v: 1, picture: 'idle', size: 1, shape: 'layered', thickness: 1, fruit: 'apples', sway: 1 }, 7],   // 1.09 ms
  [{ gen: 'tree.pine', v: 1, picture: 'shake', size: 1, shape: 'tall', width: 1, snowy: false, sway: 1 }, 1],   // 1.97 ms
  [{ gen: 'fire.camp', v: 1, picture: 'ignite', height: 1, width: 0, side: 1, heat: 0, base: 'none', sparks: 1, flicker: 0, wind: 1 }, 4],   // 1.61 ms
  [{ gen: 'torch.wall', v: 1, picture: 'idle', style: 'sconce', height: 0, halo: true, sparks: true, flicker: 0 }, 5],   // 0.71 ms
  [{ gen: 'flag.checkpoint', v: 1, picture: 'down', height: 1, shape: 'banner', finial: true, emblem: 'sun', sway: 0 }, 3],   // 0.21 ms
  [{ gen: 'pool.acid', v: 1, picture: 'spawn', size: 1, shape: 'round', pieces: 1, crust: true, wobble: 0 }, 4],   // 1.87 ms
];

test('every P4 port has a heaviest call here', () => {
  assert.deepEqual(HEAVIEST.map(([c]) => c.gen).sort(), Object.values(PROPS).map((p) => p.gen).sort());
});

test('every P4 port at its heaviest runs within its cost, and within the stamp pixels a frame may hold', () => {
  const slow = [];
  for (const [base, f] of HEAVIEST) {
    const entry = registry.generator(base.gen, base.v);
    assert.ok(entry, `${base.gen}@${base.v} is registered`);
    const paints = Object.fromEntries(Object.entries(entry.args).filter(([, t]) => t.type === 'paint').map(([k]) => [k, k]));
    const call = { at: [150, 150], ...paints, ...base };
    const c = registry.checkCall(call);
    assert.ok(c.ok, `${base.gen}: ${c.errors.join('; ')}`);
    const ctx = { size: [300, 300], frame: f, frames: 8, t: f / 8, loop: true };
    const r = registry.runGenerator(call, ctx);
    assert.ok(r.ok, `${base.gen}: ${r.errors.join('; ')}`);
    assert.ok(r.primitives.length > 0, `${base.gen} draws something`);
    const ms = median(() => registry.runGenerator(call, ctx));
    if (ms > allowedMs(c.cost)) slow.push(`${base.gen}@${base.v}: ${ms.toFixed(2)} ms of processor time for cost ${c.cost} (allowed ${allowedMs(c.cost).toFixed(2)})`);
  }
  assert.deepEqual(slow, []);
});
