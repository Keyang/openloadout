// Creature batch C1's generators (engine/gen/creature-c1.js; docs/data-sprites.md section 7): six library creatures
// ported whole (creature.bat@1, creature.slime@1, creature.wolf@1, creature.crow-scout@1, creature.spore-hopper@1,
// creature.moss-golem@1) and the attach-point motions of the three whose points move (creature.crow-scout.points@1,
// creature.spore-hopper.points@1, creature.moss-golem.points@1). Held here:
//   - each port passes the goldens harness (pinned at three cases, deterministic, fuzzed, cost monotone, loops close)
//   - each port draws, at every clip and frame, exactly what its frozen code sprite draws with the same settings (the
//     port's paint refs worked out to colours by a one-port data sprite), at the defaults, at every slider's ends and
//     every choice, and with colours off the swatches; and so does the shipped library file sprites/<id>.json
//   - each library file's sockets() are the code's at every clip and frame, slider end, choice and toggle
//   - the golem's 96 x 96 port gives at most 8,100 stamp pixels a frame (the rest as rects) and the same pixels
//   - each port's heaviest call runs within its cost (as gen-e1-safety and gen-e2-safety: 0.05 ms a unit plus 2 ms)
//   - each points motion moves its nodes to where the code's sockets() put the points, turned to the code's angle
// The motions' own goldens are held by gen-motion-layout-contract.test.mjs (pinned with GEN_GOLDEN_WRITE=1).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkCall, runGenerator, generator } from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';
import { stampPixels } from '../../engine/gen/args.js';
import { codeSprite, librarySprite, librarySpriteFile } from '../helpers/library.mjs';

const PORTS = ['bat', 'slime', 'wolf', 'crow-scout', 'spore-hopper', 'moss-golem'];
// a port's argument whose old setting's name is a call field (glow): the setting it stands for
const OLD_NAME = { spores: 'glow', shine: 'glow' };
const MOVING_POINTS = ['crow-scout', 'spore-hopper', 'moss-golem'];

// the paint arguments of each port: the code sprite's colour controls, by the same keys
const paintsOf = (entry) => Object.fromEntries(Object.entries(entry.args).filter(([, t]) => t.type === 'paint').map(([k]) => [k, k]));

const CASES = {
  'creature.bat@1': [
    { args: { at: [25, 25], picture: 'fly', body: 'body', membrane: 'membrane', eye: 'eye' }, ctx: { frame: 2 } },
    { args: { at: [25, 25], picture: 'attack', size: 1, span: 0, wing: 'round', ears: 1, eyes: 'cute', fangs: false, body: 'body', membrane: 'membrane', eye: 'eye', flap: 1, bob: 0 }, ctx: { frame: 4 } },
    { args: { at: [30, 20], picture: 'die', size: 0, span: 1, wing: 'sharp', eyes: 'one', body: 'body', membrane: 'membrane', eye: 'eye' }, ctx: { frame: 6 } },
  ],
  'creature.slime@1': [
    { args: { at: [22, 42], picture: 'hop', body: 'body' }, ctx: { frame: 3 } },
    { args: { at: [22, 42], picture: 'attack', size: 1, shape: 1, eyes: 'one', topping: 'crown', shine: false, body: 'body', wobble: 1, hop: 0 }, ctx: { frame: 4 } },
    { args: { at: [20, 40], picture: 'die', size: 0, shape: 0, eyes: 'sleepy', topping: 'bow', body: 'body' }, ctx: { frame: 5 } },
  ],
  'creature.wolf@1': [
    { args: { at: [27, 43], picture: 'run', fur: 'fur', belly: 'belly', eyes: 'eyes' }, ctx: { frame: 2 } },
    { args: { at: [27, 43], picture: 'attack', size: 1, legs: 1, snout: 0, ears: 'floppy', tail: 'curled', fluff: 0, markings: 'mask', fur: 'fur', belly: 'belly', eyes: 'eyes', stride: 1, bounce: 0, wag: 1 }, ctx: { frame: 3 } },
    { args: { at: [30, 40], picture: 'die', size: 0, legs: 0, snout: 1, ears: 'tall', tail: 'brush', markings: 'plain', fur: 'fur', belly: 'belly', eyes: 'eyes' }, ctx: { frame: 7 } },
  ],
  'creature.crow-scout@1': [
    { args: { at: [24, 24], picture: 'fly', body: 'body', accent: 'accent' }, ctx: { frame: 1 } },
    { args: { at: [24, 24], picture: 'attack', size: 1, span: 1, beak: 0, crest: 'spiky', eyes: 'glow', held: 'bomb', heldSize: 1.35, body: 'body', accent: 'accent', flap: 1, bob: 0 }, ctx: { frame: 3 } },
    { args: { at: [20, 26], picture: 'die', size: 0, span: 0, beak: 1, crest: 'tuft', eyes: 'angry', held: 'lantern', heldSize: 0.65, body: 'body', accent: 'accent' }, ctx: { frame: 5 } },
  ],
  'creature.spore-hopper@1': [
    { args: { at: [24, 42], picture: 'hop', ruffColour: 'ruffColour', body: 'body', spores: 'glow' }, ctx: { frame: 4 } },
    { args: { at: [24, 42], picture: 'attack', size: 1, bulk: 1, eyes: 'angry', ribs: false, ruff: 'petals', ruffSize: 1.35, ruffColour: 'ruffColour', body: 'body', spores: 'glow', hop: 1, wobble: 1 }, ctx: { frame: 5 } },
    { args: { at: [20, 40], picture: 'die', size: 0, bulk: 0, eyes: 'sleepy', ruff: 'thorns', ruffSize: 0.65, ruffColour: 'ruffColour', body: 'body', spores: 'glow' }, ctx: { frame: 4 } },
  ],
  'creature.moss-golem@1': [
    { args: { at: [44, 90], picture: 'walk', growthColour: 'growthColour', stone: 'stone', shine: 'glow' }, ctx: { frame: 2 } },
    { args: { at: [44, 90], picture: 'attack', size: 1, bulk: 1, arms: 1, shape: 'horned', wear: 1, growth: 'saplings', growthSize: 1.35, growthColour: 'growthColour', core: 'eye', coreSize: 1.3, stone: 'stone', shine: 'glow', bounce: 1 }, ctx: { frame: 9 } },
    { args: { at: [40, 88], picture: 'die', size: 0, bulk: 0, arms: 0, shape: 'slab', wear: 0, growth: 'mushrooms', growthSize: 0.65, growthColour: 'growthColour', core: 'rune', coreSize: 0.7, stone: 'stone', shine: 'glow', bounce: 0 }, ctx: { frame: 7 } },
  ],
};

test('the six creature ports and the three points motions are registered', () => {
  for (const id of PORTS) {
    const e = generator(`creature.${id}`, 1);
    assert.ok(e, `creature.${id}@1`);
    assert.equal(e.family, 'creature');
  }
  for (const id of MOVING_POINTS) assert.equal(generator(`creature.${id}.points`, 1)?.family, 'motion', `creature.${id}.points@1`);
});

for (const [key, cases] of Object.entries(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    const entry = generator(id, Number(v));
    assert.ok(entry, `${key} is registered`);
    checkGeneratorContract(registry, entry, { cases });
  });
}

// ---- the port draws what the code drew --------------------------------------------------------------------------

/** A data sprite made of one port, its controls and colour slots the code sprite's: what the library file does, minimally. */
function onePort(code, id) {
  const entry = generator(`creature.${id}`, 1);
  const P = code.params;
  const controls = [], palette = [];
  for (const [k, d] of Object.entries(P)) {
    if (k === 'speed') { controls.push({ key: 'speed', standard: 'speed' }); continue; }
    if (d.kind === 'color') { palette.push({ id: k, label: d.label, default: d.def, material: 'paint', swatches: d.swatches }); controls.push({ key: k, kind: 'colour', label: d.label }); continue; }
    if (d.kind === 'range') controls.push({ key: k, kind: 'range', label: d.label, lo: d.lo, hi: d.hi, default: d.def, min: d.min, max: d.max, step: d.step });
    else if (d.kind === 'choice') controls.push({ key: k, kind: 'choice', label: d.label, options: d.options.map((o) => o.value), default: d.def });
    else controls.push({ key: k, kind: 'toggle', label: d.label, default: d.def });
  }
  const args = Object.fromEntries(Object.entries(entry.args).filter(([k]) => k !== 'at' && k !== 'picture').map(([k, t]) => [k, t.type === 'paint' ? OLD_NAME[k] ?? k : { from: k }]));
  const clips = Object.fromEntries(Object.entries(code.clips).map(([c, x]) => [c, { frames: x.frames, fps: 10, loop: x.loop !== false }]));
  return dataSprite({
    format: 'loadout-sprite', version: 2, id: `${id}-port`, name: code.name, size: [...code.size], pivot: [...code.pivot], grounded: code.grounded,
    meta: code.meta, preview: code.preview, styles: ['pixel'], palette, controls,
    body: { pictures: { nodes: [{ id: 'body', parent: null, at: [...code.pivot] }], draw: [{ gen: `creature.${id}`, v: 1, on: 'body', at: [0, 0], picture: 'clip', ...args }] } },
    clips,
  });
}

/** The settings each port is compared at: defaults, every slider at each end, every choice and toggle, two colours off the swatches. */
function looks(code) {
  const out = [{}];
  for (const [k, d] of Object.entries(code.params)) {
    if (k === 'speed') continue;
    if (d.kind === 'range') out.push({ [k]: d.min }, { [k]: d.max });
    else if (d.kind === 'choice') for (const o of d.options) out.push({ [k]: o.value });
    else if (d.kind === 'toggle') out.push({ [k]: !d.def });
    else out.push({ [k]: '#7f3fbf' }, { [k]: '#d8e8c0' });
  }
  const ranges = Object.entries(code.params).filter(([k, d]) => d.kind === 'range' && k !== 'speed');
  out.push(Object.fromEntries(ranges.map(([k, d]) => [k, d.min])), Object.fromEntries(ranges.map(([k, d]) => [k, d.max])));
  return out;
}

const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

// Each case draws the frozen code sprite once and compares two data sprites with it: the one-port sprite above (the
// generator alone, every argument bound to its own key) and the shipped library file sprites/<id>.json (its bindings,
// slots, parts, `when`s and clips as written; review C1 round 1, issue 1: the pixel records vary only Size, choices,
// toggles and swatches, so a library file whose Flap read Bob passed every other test).
for (const id of PORTS) {
  test(`creature.${id}@1 and sprites/${id}.json draw what sprites/${id}.js drew, every clip and frame, at every slider end, choice and two off-swatch colours`, { timeout: 900_000 }, async () => {
    assert.equal(librarySpriteFile(id), `sprites/${id}.json`, `${id}: the library file is the data file`);
    const code = await codeSprite(id), port = onePort(code, id), lib = await librarySprite(id);
    const bad = [];
    for (const over of looks(code)) {
      const pc = cleanParams(code, { ...defaultParams(code), ...over }), pp = cleanParams(port, { ...defaultParams(port), ...over }), pl = cleanParams(lib, { ...defaultParams(lib), ...over });
      for (const [clip, c] of Object.entries(code.clips)) for (let f = 0; f < c.frames; f++) {
        const want = renderPixels(code, clip, f, pc);
        if (!same(want, renderPixels(port, clip, f, pp))) bad.push(`port ${clip} ${f} ${JSON.stringify(over)}`);
        if (!same(want, renderPixels(lib, clip, f, pl))) bad.push(`sprites/${id}.json ${clip} ${f} ${JSON.stringify(over)}`);
      }
    }
    assert.deepEqual(bad.slice(0, 12), [], `${bad.length} frames differ`);
  });
}

// The library file's attach points end to end (review C1 round 1, issue 2): sprite.sockets() of sprites/<id>.json,
// through the pictures layout, the points motions and the draw list's node turn, against the frozen code's sockets()
// at every clip and frame, at the defaults, every slider end, every choice and toggle. Every creature of the batch,
// moving points or not.
test('each library creature\'s sockets() are the code\'s, every clip and frame, at every slider end, choice and toggle', { timeout: 600_000 }, async () => {
  const turn = (a) => { let x = a % (2 * Math.PI); if (x <= -Math.PI) x += 2 * Math.PI; if (x > Math.PI) x -= 2 * Math.PI; return x; };
  const bad = [];
  let frames = 0;
  for (const id of PORTS) {
    const code = await codeSprite(id), lib = await librarySprite(id);
    for (const over of looks(code)) for (const [clip, c] of Object.entries(code.clips)) for (let f = 0; f < c.frames; f++) {
      const t = c.loop !== false ? f / c.frames : f / (c.frames - 1);
      const want = code.sockets?.(clip, t, cleanParams(code, { ...defaultParams(code), ...over })) ?? {};
      const got = lib.sockets?.(clip, t, cleanParams(lib, { ...defaultParams(lib), ...over })) ?? {};
      frames++;
      const where = `${id} ${clip} ${f} ${JSON.stringify(over)}`;
      if (Object.keys(got).sort().join() !== Object.keys(want).sort().join()) { bad.push(`${where}: points ${Object.keys(got)} not ${Object.keys(want)}`); continue; }
      for (const [k, s] of Object.entries(want)) {
        const g = got[k];
        if (!(Math.abs(g.x - s.x) < 1e-6 && Math.abs(g.y - s.y) < 1e-6 && Math.abs(turn(g.angle - s.angle)) < 1e-6)) bad.push(`${where} ${k}: ${g.x}, ${g.y}, ${g.angle} not ${s.x}, ${s.y}, ${s.angle}`);
      }
    }
  }
  assert.ok(frames > 2000, `${frames} frames compared`);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} points differ`);
});

test('the golem\'s port keeps to a frame\'s stamp pixels: at most its 90 x 90 box as stamps, the rest as rects', () => {
  for (const [clip, frames] of [['die', 12], ['attack', 12], ['stagger', 8]]) for (let frame = 0; frame < frames; frame++) {
    const r = runGenerator({ gen: 'creature.moss-golem', v: 1, at: [44, 90], picture: clip, size: 1, bulk: 1, arms: 1, shape: 'horned', growth: 'saplings', growthSize: 1.35, growthColour: 'g', stone: 's', shine: 'l', bounce: 1 }, { frame });
    assert.ok(r.ok, r.errors.join('; '));
    const stamps = r.primitives.filter((p) => p.kind === 'stamp');
    assert.ok(stampPixels(stamps) <= 8100, `${clip} ${frame}: ${stampPixels(stamps)} stamp pixels`);
    for (const s of stamps) assert.ok(s.at[0] >= 3 && s.at[1] >= 3, `${clip} ${frame}: a stamp starts inside the box`);
    assert.ok(r.primitives.every((p) => p.kind === 'stamp' || (p.kind === 'rect' && p.size[1] === 1)), 'only stamps and one-row rects');
  }
});

// ---- cost: each port's heaviest call within its cost (as gen-e1-safety and gen-e2-safety) ----------------------------

const MS_PER_COST = 0.05, SPARE_MS = 2;
const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
const median = (fn, n = 9) => { fn(); fn(); const ms = []; for (let i = 0; i < n; i++) ms.push(cpuMs(fn)); return ms.sort((a, b) => a - b)[n >> 1]; };
// [call, frame]: the heaviest call of each port the calibration found (scratchpad c1/calib.mjs: every picture, word and
// flag and each slider's ends and middle at every frame, the slowest again as a median of nine), paints filled in below
const HEAVIEST = [
  [{ gen: 'creature.bat', v: 1, picture: 'idle', size: 1, span: 1, ears: 1, flap: 1, bob: 1 }, 7],   // 1.10 ms under load
  [{ gen: 'creature.slime', v: 1, picture: 'attack', size: 1, shape: 1, wobble: 1, hop: 1, topping: 'horns' }, 6],   // 0.62 ms
  [{ gen: 'creature.wolf', v: 1, picture: 'attack', size: 1, legs: 1, snout: 1, fluff: 1, stride: 1, bounce: 1, wag: 1, markings: 'mask' }, 3],   // 2.36 ms
  [{ gen: 'creature.crow-scout', v: 1, picture: 'idle', size: 1, span: 1, beak: 1, heldSize: 1.35, flap: 1, bob: 1, held: 'sack' }, 0],   // 1.32 ms warm (3.3 ms the first frame of a look)
  [{ gen: 'creature.spore-hopper', v: 1, picture: 'idle', size: 1, bulk: 1, hop: 1, wobble: 1, ruffSize: 1.35, ruff: 'thorns' }, 0],   // 0.91 ms
  [{ gen: 'creature.moss-golem', v: 1, picture: 'idle', size: 1, bulk: 1, arms: 1, bounce: 1, wear: 1, growthSize: 1.35, coreSize: 1.3, shape: 'horned' }, 0],   // 17.41 ms under load
];

test('every creature port at its heaviest runs within its cost', () => {
  const slow = [];
  for (const [base, frame] of HEAVIEST) {
    const entry = generator(base.gen, base.v);
    assert.ok(entry, `${base.gen}@${base.v} is registered`);
    const call = { at: [48, 48], ...paintsOf(entry), ...base };
    const c = checkCall(call);
    assert.ok(c.ok, `${base.gen}@${base.v}: ${c.errors.join('; ')}`);
    const ctx = { size: [96, 96], frame };
    const r = runGenerator(call, ctx);
    assert.ok(r.ok && r.primitives.length > 0, `${base.gen}@${base.v} draws something`);
    const ms = median(() => runGenerator(call, ctx));
    if (ms > SPARE_MS + c.cost * MS_PER_COST) slow.push(`${base.gen}@${base.v}: ${ms.toFixed(2)} ms for cost ${c.cost}`);
  }
  assert.deepEqual(slow, []);
});

// ---- the points motions ---------------------------------------------------------------------------------------------

test('each points motion puts its nodes where the code\'s sockets() put the points, at the code\'s angle', async () => {
  const norm = (a) => { let x = a % (2 * Math.PI); if (x <= -Math.PI) x += 2 * Math.PI; if (x > Math.PI) x -= 2 * Math.PI; return x; };
  for (const id of MOVING_POINTS) {
    const code = await codeSprite(id), entry = generator(`creature.${id}.points`, 1);
    const sets = [{}, ...Object.keys(entry.args).filter((k) => k !== 'at').flatMap((k) => (entry.args[k].type === 'word' ? entry.args[k].values.map((v) => ({ [k]: v })) : [{ [k]: entry.args[k].lo }, { [k]: entry.args[k].hi }]))];
    for (const over of sets) for (const [clip, c] of Object.entries(code.clips)) for (let f = 0; f < c.frames; f++) {
      const t = c.loop ? f / c.frames : f / (c.frames - 1);
      const p = cleanParams(code, { ...defaultParams(code), ...over });
      const want = code.sockets(clip, t, p);
      const args = Object.fromEntries(Object.keys(entry.args).filter((k) => k !== 'at').map((k) => [k, p[k]]));
      const moves = entry.run(Object.freeze({ at: entry.args.at.default, ...args }), Object.freeze({ t, frame: f, frames: c.frames, loop: c.loop !== false, clip, size: [...code.size] }));
      assert.deepEqual(moves.map((m) => m.node).sort(), Object.keys(want).sort(), `${id} ${clip} ${f}: one node a point`);
      for (const m of moves) {
        const s = want[m.node];
        assert.ok(Math.abs(m.move[0] - s.x) < 1e-9 && Math.abs(m.move[1] - s.y) < 1e-9, `${id} ${clip} ${f} ${m.node}: at ${m.move} not ${s.x}, ${s.y}`);
        const turned = Math.atan2(-Math.sin(m.turn * Math.PI / 180), Math.cos(m.turn * Math.PI / 180));
        assert.ok(Math.abs(norm(turned - s.angle)) < 1e-9, `${id} ${clip} ${f} ${m.node}: angle`);
      }
    }
  }
});
