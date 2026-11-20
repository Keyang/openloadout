// Migration batch P5 (docs/data-sprites.md section 7; the /sprite-forge skill's redraw section): blast-door, laser-gate,
// moving-platform, save-crystal, saw-blade, upgrade-pedestal, wall-terminal and warp-pad redrawn as data, each on a port
// generator of engine/gen/props-p5.js that runs its code sprite's drawing on a paint-ref grid (engine/gen/port-sprite.js,
// as the M9, E1, E2 and P4 ports do), every colour the code worked out from a colour the colour rule of the same
// function (shadeTo, migration P5, among them). This test holds:
//   1. each generator to the goldens harness (pinned output, determinism, cost, every argument at its limits);
//   2. each library data file (sprites/<id>.json) to its frozen code sprite (tests/fixtures/code-sprites/<id>.js), pixel
//      for pixel, at every clip and frame of: the defaults, every choice option and toggle, every slider at its ends,
//      all sliders low, all high, colours off the swatches (black, white, three others);
//   3. the edge sweep: every mix of choices and toggles crossed with every corner of the sliders (each at its low or
//      high end), at every clip and frame, the same pixels as the code sprite, so no case touches the frame's edge
//      where the code did not;
//   4. each port's heaviest call within its cost at the M9, E2 and P4 line (0.05 ms a unit and 2 ms).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { librarySprite, codeSprite } from '../helpers/library.mjs';
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';
import { imageBox, touchesEdge } from '../helpers/redraw-boxes.mjs';

/** The eight props: library id -> its generator, the old frame's pivot (where `at` puts it) and its paint arguments. */
const PROPS = {
  'blast-door': { gen: 'door.blast', at: [32, 46], paints: { body: 'body', accent: 'accent', glowing: 'glow', hull: 'hull' } },
  'laser-gate': { gen: 'laser.gate', at: [32, 46], paints: { body: 'body', accent: 'accent', glowing: 'glow' } },
  'moving-platform': { gen: 'platform.moving', at: [32, 8], paints: { wood: 'wood', metal: 'metal' } },
  'save-crystal': { gen: 'crystal.save', at: [16, 46], paints: { pedestalColour: 'pedestalColour', body: 'body', glowing: 'glow' } },
  'saw-blade': { gen: 'saw.blade', at: [24, 24], paints: { metal: 'metal', accent: 'accent' } },
  'upgrade-pedestal': { gen: 'pedestal.upgrade', at: [16, 46], paints: { body: 'body', accent: 'accent', glowing: 'glow' } },
  'wall-terminal': { gen: 'terminal.wall', at: [16, 46], paints: { body: 'body', accent: 'accent', glowing: 'glow' } },
  'warp-pad': { gen: 'warp.pad', at: [32, 40], paints: { body: 'body', accent: 'accent', glowing: 'glow' } },
};
const IDS = Object.keys(PROPS);
const OFF_SWATCH = ['#000000', '#ffffff', '#3a7bd5', '#c8a2c8', '#556b2f'];

const frame = (f, frames = 8, loop = true) => ({ t: loop ? f / frames : frames > 1 ? f / (frames - 1) : 0, loop, frames, frame: f });

test('every P5 generator is registered once, in family shape, as a port of its code sprite', () => {
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

/** The settings each test case draws: defaults, every choice option, every toggle flipped, every slider at its ends, all low, all high, colours off the swatches. */
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
  return out;
}

/** The edge sweep: every mix of choices and toggles, crossed with every corner of the sliders (each at its low or high end). */
function sweepOf(sprite) {
  let mixes = [{}];
  for (const [k, d] of Object.entries(sprite.params)) {
    const values = d.kind === 'choice' ? d.options.map((o) => o.value) : d.kind === 'toggle' ? [true, false] : d.kind === 'range' && k !== 'speed' ? [d.min, d.max] : null;
    if (values) mixes = mixes.flatMap((m) => values.map((v) => ({ ...m, [k]: v })));
  }
  return mixes;
}

/** Where two frames differ: null when they are the same. */
function difference(a, b) {
  if (a.w !== b.w || a.h !== b.h) return `size ${a.w}x${a.h} against ${b.w}x${b.h}`;
  for (let i = 0; i < a.data.length; i++) {
    if ((a.data[i] >>> 0) !== (b.data[i] >>> 0)) return `pixel ${i % a.w},${Math.floor(i / a.w)}: ${(a.data[i] >>> 0).toString(16)} against ${(b.data[i] >>> 0).toString(16)}`;
  }
  return null;
}

/** Draws old and new at each setting, every clip and frame: { bad (frames that differ), edge (frames that touch the edge only in the redraw), cases }. */
function compare(old, now, settings) {
  const bad = [], edge = [];
  let cases = 0;
  for (const s of settings) {
    const po = cleanParams(old, { ...defaultParams(old), ...s }), pn = cleanParams(now, { ...defaultParams(now), ...s });
    for (const [clip, c] of Object.entries(old.clips)) for (let f = 0; f < c.frames; f++) {
      cases++;
      const a = renderPixels(old, clip, f, po), b = renderPixels(now, clip, f, pn);
      const d = difference(a, b);
      if (d) bad.push(`${clip} f${f} ${JSON.stringify(s)}: ${d}`);
      if (touchesEdge(imageBox(b), now.size) && !touchesEdge(imageBox(a), old.size)) edge.push(`${clip} f${f} ${JSON.stringify(s)}`);
    }
  }
  return { bad, edge, cases };
}

for (const id of IDS) {
  test(`${id}: the data file draws its code sprite's pixels at every clip and frame of the defaults, every option, slider end and off-swatch colour`, async () => {
    const now = await librarySprite(id), old = await codeSprite(id);
    assert.ok(now.definition, `${id}: the library sprite is the data file`);
    const { bad, cases } = compare(old, now, settingsOf(old));
    assert.deepEqual(bad.slice(0, 6), [], `${id}: ${bad.length} of ${cases} frames differ`);
  });

  test(`${id}: the edge sweep (every choice and toggle by every corner of the sliders) draws the code's pixels and touches no edge the code did not`, async () => {
    const now = await librarySprite(id), old = await codeSprite(id);
    assert.ok(now.definition, `${id}: the library sprite is the data file`);
    const { bad, edge, cases } = compare(old, now, sweepOf(old));
    assert.deepEqual(edge.slice(0, 6), [], `${id}: ${edge.length} of ${cases} frames touch the edge`);
    assert.deepEqual(bad.slice(0, 6), [], `${id}: ${bad.length} of ${cases} frames differ`);
  });
}

// ---- safety: each port's heaviest call within its cost (as tests/unit/gen-e2-safety.test.mjs and gen-p4-props) ----

const MS_PER_COST = 0.05;
const SPARE_MS = 2;
const allowedMs = (cost) => SPARE_MS + cost * MS_PER_COST;
const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
const median = (fn, n = 9) => { fn(); fn(); const ms = []; for (let i = 0; i < n; i++) ms.push(cpuMs(fn)); return ms.sort((a, b) => a - b)[n >> 1]; };
// [call, frame]: the heaviest call of each port the calibration found (every picture, word and flag and each slider's
// ends and middle at every frame; paints filled in below), on which its `units` were set (1.5 times its median of nine at 0.01 ms a unit)
const HEAVIEST = [
  [{ gen: 'door.blast', v: 1, picture: 'closed', style: 'iris', pieces: 0, stripes: true }, 0],
  [{ gen: 'laser.gate', v: 1, picture: 'warn', width: 1, style: 'pylon', beams: 'two', flicker: 1 }, 0],
  [{ gen: 'platform.moving', v: 1, picture: 'idle', width: 40, style: 'stone', chains: false, bob: 0 }, 2],
  [{ gen: 'crystal.save', v: 1, picture: 'idle', size: 1, shape: 'prism', rings: true, pedestal: 'stone', pedestalSize: 1.35, bob: 1, flicker: 0.5 }, 5],
  [{ gen: 'saw.blade', v: 1, picture: 'grind', size: 1, style: 'jagged', teeth: 12, hub: true, wobble: 1 }, 6],
  [{ gen: 'pedestal.upgrade', v: 1, picture: 'idle', size: 0, style: 'pillar', shape: 'star', bob: 1 }, 2],
  [{ gen: 'terminal.wall', v: 1, picture: 'idle', style: 'console', shape: 'graph', keys: true, flicker: 0 }, 0],
  [{ gen: 'warp.pad', v: 1, picture: 'activate', size: 1, style: 'hex', rings: 'three', flicker: 1 }, 3],
];

test('every P5 port has a heaviest call here', () => {
  assert.deepEqual(HEAVIEST.map(([c]) => c.gen).sort(), Object.values(PROPS).map((p) => p.gen).sort());
});

test('every P5 port at its heaviest runs within its cost', () => {
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
