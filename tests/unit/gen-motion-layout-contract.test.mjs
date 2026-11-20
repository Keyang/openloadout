// The goldens harness for the generators that do not return primitives (docs/data-sprites.md 3.1: a golden, a fuzz
// test and a determinism test per version), which tests/unit/gen-registry-goldens.test.mjs leaves out:
//   MOTIONS (family "motion", engine/data-sprite.js LAYOUTS): every registered motion, pinned at its defaults and at
//     each number argument's two ends, five phases each, looped and not. The cases are made from the arguments
//     themselves, so a new motion needs no list here: pin it with GEN_GOLDEN_WRITE=1 (only missing files are written).
//     Its output is held to the motion contract: at most 16 node moves of finite numbers, and `args` named
//     "<generator id>.<argument>" naming a keyable argument of a registered generator (engine/gen/pictures.js).
//   LAYOUTS (family "layout", docs/data-sprites.md 4.3): every registered layout, pinned by the frame lists it lays out
//     for its fixtures (every clip, first, middle and last frame, default settings), fuzzed over random settings, clips
//     and frames, and laid out twice the same from two separate builds. A new layout adds a row to LAYOUT_FIXTURES (its
//     own fixture definitions) and pins with GEN_GOLDEN_WRITE=1; until then this test names it.
// Built by B8 for its motions and pictures@1, after the B8 review; written for B12 to B15's layouts too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as registry from '../../engine/gen/index.js';
import { withoutClockOrDice, goldenPath, readGolden } from '../helpers/gen-harness.mjs';
import { MOTION_TARGETS } from '../../engine/gen/motion.js';
import { dataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { defaultParams } from '../../engine/sprite.js';
import { stampPixels, SHAPE_CAPS } from '../../engine/gen/args.js';

const WRITE = process.env.GEN_GOLDEN_WRITE === '1';
const NUMBER_TYPES = new Set(['px', 'share', 'count', 'angle', 'seed']);
const PHASES = [0, 0.25, 0.5, 0.75, 1];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const json = (v) => JSON.parse(JSON.stringify(v));
/** A small seeded random number source for the fuzz (mulberry32), so a failure can be replayed. */
const dice = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** FNV-1a of a string, as 8 hex digits: a frame list pinned without keeping all of it. */
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };

// ---- motions -------------------------------------------------------------------------------------------------------

const motions = () => registry.generators().filter((g) => g.family === 'motion');
const ctxOf = (t, loop) => ({ t, frame: Math.round(t * (loop ? 8 : 7)) % 8, frames: 8, loop, size: [32, 32], clip: 'x', direction: null });
const filled = (entry, args) => Object.fromEntries(Object.entries(entry.args).map(([k, t]) => [k, Object.hasOwn(args, k) ? args[k] : t.default]));
/** Runs a motion the way a layout does: checked by the registry, then run with its defaults filled, frozen, without clock or dice. */
function moveOf(entry, args, ctx) {
  const check = registry.checkCall({ gen: entry.id, v: entry.v, ...args });
  assert.ok(check.ok, `${entry.key} ${JSON.stringify(args)}: ${check.errors.join('; ')}`);
  return json(withoutClockOrDice(() => entry.run(Object.freeze(filled(entry, args)), Object.freeze(ctxOf(ctx.t, ctx.loop)))));
}
/** The argument sets a motion is pinned at: its defaults, then each number argument at its two ends. */
function motionArgSets(entry) {
  const sets = [{}];
  for (const [k, t] of Object.entries(entry.args)) if (NUMBER_TYPES.has(t.type)) sets.push({ [k]: t.lo }, { [k]: t.hi });
  return sets;
}
/** The motion contract on one output: a list of node moves of finite numbers whose args name keyable arguments of registered generators. */
function checkMoves(entry, out, label) {
  assert.ok(Array.isArray(out), `${label}: a list of node moves`);
  assert.ok(out.length <= 16, `${label}: at most 16 moves (a layout reads no more)`);
  const keyable = new Map(registry.generators().map((g) => [g.id, g.keyable]));
  for (const m of out) {
    assert.ok(isObj(m), label);
    if (m.node !== undefined) assert.equal(typeof m.node, 'string', `${label}: node`);
    assert.ok(Array.isArray(m.move) && m.move.length === 2 && m.move.every(fin), `${label}: move [dx, dy]`);
    if (m.turn !== undefined) assert.ok(fin(m.turn), `${label}: turn`);
    if (m.scale !== undefined) assert.ok(fin(m.scale) && m.scale > 0, `${label}: scale`);
    if (m.args === undefined) continue;
    assert.ok(isObj(m.args) && Object.keys(m.args).length <= 16, `${label}: args`);
    for (const [name, v] of Object.entries(m.args)) {
      const dot = name.lastIndexOf('.');
      assert.ok(dot > 0, `${label}: "${name}" is named <generator id>.<argument>`);
      const gen = name.slice(0, dot), arg = name.slice(dot + 1);
      assert.ok(keyable.has(gen), `${label}: "${name}": no generator "${gen}"`);
      assert.ok(keyable.get(gen).includes(arg), `${label}: "${name}": ${gen} does not let "${arg}" be keyed`);
      assert.ok(fin(v) || typeof v === 'boolean', `${label}: "${name}" is a number or true/false`);
      if (MOTION_TARGETS[entry.key]) assert.ok(MOTION_TARGETS[entry.key].includes(name), `${label}: "${name}" is listed in MOTION_TARGETS`);
    }
  }
}

test('every registered motion has a golden file (pin a new one with GEN_GOLDEN_WRITE=1)', () => {
  const missing = [];
  for (const entry of motions()) {
    if (readGolden(entry.key)) continue;
    if (!WRITE) { missing.push(entry.key); continue; }
    const cases = [];
    for (const args of motionArgSets(entry)) for (const loop of [true, false]) for (const t of PHASES) cases.push({ args, ctx: { t, loop }, moves: moveOf(entry, args, { t, loop }) });
    fs.writeFileSync(goldenPath(entry.key), `${JSON.stringify({ id: entry.id, v: entry.v, family: 'motion', cases }, null, 1)}\n`);
  }
  assert.deepEqual(missing, [], 'motions with no golden file');
  assert.ok(motions().length >= 4, 'B8\'s four motions are registered');
});

for (const entry of motions()) {
  test(`${entry.key}: golden, determinism, the motion contract, fuzz`, () => {
    const golden = readGolden(entry.key);
    assert.ok(golden, `${entry.key}: no golden file`);
    assert.equal(golden.family, 'motion');
    assert.ok(golden.cases.length >= 10, 'at least ten pinned cases');
    for (const [i, c] of golden.cases.entries()) {
      const label = `${entry.key} case ${i}`;
      const out = moveOf(entry, c.args, c.ctx);
      assert.deepEqual(out, c.moves, `${label}: output differs from the pinned golden (a released version never changes: make a new version)`);
      assert.deepEqual(moveOf(entry, c.args, c.ctx), out, `${label}: not deterministic`);
      checkMoves(entry, out, label);
    }
    assert.equal(entry.cost({}), 0, 'a motion draws nothing: it costs nothing');
    // fuzz: random settings of every argument within its type, at random phases
    const roll = dice(entry.key.length * 7919);
    for (let n = 0; n < 200; n++) {
      const args = {};
      for (const [k, t] of Object.entries(entry.args)) {
        if (!NUMBER_TYPES.has(t.type)) continue;
        const v = t.lo + (t.hi - t.lo) * roll();
        args[k] = t.type === 'count' || t.type === 'seed' ? Math.round(v) : v;
      }
      const ctx = { t: roll(), loop: roll() < 0.5 };
      checkMoves(entry, moveOf(entry, args, ctx), `${entry.key} fuzz ${n}`);
    }
    // just outside each number argument, and an unknown argument: refused by the check, never thrown
    for (const [k, t] of Object.entries(entry.args)) {
      if (!NUMBER_TYPES.has(t.type)) continue;
      for (const v of [t.lo - 1, t.hi + 1, 'x', null]) assert.equal(registry.checkCall({ gen: entry.id, v: entry.v, [k]: v }).ok, false, `${entry.key}.${k} = ${v}`);
    }
    assert.equal(registry.checkCall({ gen: entry.id, v: entry.v, notAnArgument: 1 }).ok, false);
  });
}

test('B8\'s motions drive only the generators MOTION_TARGETS names', () => {
  assert.deepEqual(Object.keys(MOTION_TARGETS).sort(), ['pickup.bob@1', 'pickup.collect@1', 'pickup.spin@1', 'prop.rock@1']);
  for (const [key, names] of Object.entries(MOTION_TARGETS)) {
    const entry = registry.generators().find((g) => g.key === key);
    const seen = new Set();
    for (const t of PHASES) for (const m of moveOf(entry, {}, { t, loop: false })) for (const k of Object.keys(m.args ?? {})) seen.add(k);
    assert.deepEqual([...seen].sort(), [...names].sort(), key);
  }
});

// ---- layouts -------------------------------------------------------------------------------------------------------

const FIX = new URL('../fixtures/v2/', import.meta.url);
/** The fixture definitions each layout is pinned by (paths under tests/fixtures/v2/). B12 to B15 add their rows. */
const LAYOUT_FIXTURES = {
  'pictures@1': ['pictures/coin.json', 'pictures/crate.json', 'pictures/icons-food.json'],
  'panel@1': ['panel/bare-panel.json'],
  'layers@1': ['bg-forest.json', 'layers/bg-starfield.json', 'layers/bg-forest-wide.json'],
};
const layouts = () => registry.generators().filter((g) => g.family === 'layout');
const load = (p) => dataSprite(JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8')));
const clipsOf = (s) => Object.entries(s.clips).map(([name, c]) => [name, Math.max(1, c.frames ?? 1)]);
const frameKey = (s, clip, f, p) => { const r = dataFrameList(s, clip, f, p); return { r, h: hash(JSON.stringify(r.list)) }; };

/** The pinned frames of a layout: { "<fixture> <clip> <frame>": hash of the frame list at default settings }. */
function layoutFrames(key) {
  const out = {};
  for (const p of LAYOUT_FIXTURES[key]) {
    const s = load(p), d = defaultParams(s);
    for (const [clip, n] of clipsOf(s)) for (const f of [...new Set([0, Math.floor(n / 2), n - 1])]) out[`${p} ${clip} ${f}`] = frameKey(s, clip, f, d).h;
  }
  return out;
}

test('every registered layout names its fixtures and has a golden file (pin a new one with GEN_GOLDEN_WRITE=1)', () => {
  const unnamed = layouts().filter((g) => !LAYOUT_FIXTURES[g.key]).map((g) => g.key);
  assert.deepEqual(unnamed, [], 'layouts with no fixtures in LAYOUT_FIXTURES');
  const missing = [];
  for (const g of layouts()) {
    if (readGolden(g.key)) continue;
    if (!WRITE) { missing.push(g.key); continue; }
    fs.writeFileSync(goldenPath(g.key), `${JSON.stringify({ id: g.id, v: g.v, family: 'layout', fixtures: LAYOUT_FIXTURES[g.key], frames: layoutFrames(g.key) }, null, 1)}\n`);
  }
  assert.deepEqual(missing, [], 'layouts with no golden file');
});

for (const g of layouts().filter((x) => LAYOUT_FIXTURES[x.key])) {
  test(`${g.key}: golden frames, determinism across builds, fuzz over settings, clips and frames`, () => {
    const golden = readGolden(g.key);
    assert.ok(golden, `${g.key}: no golden file`);
    assert.equal(golden.family, 'layout');
    assert.deepEqual(golden.fixtures, LAYOUT_FIXTURES[g.key]);
    assert.ok(Object.keys(golden.frames).length >= 9, 'at least nine pinned frames');
    assert.deepEqual(layoutFrames(g.key), golden.frames, 'a frame list differs from the pinned golden (a released version never changes: make a new version)');
    // two separate builds lay out the same
    for (const p of LAYOUT_FIXTURES[g.key]) {
      const a = load(p), b = load(p), d = defaultParams(a);
      for (const [clip, n] of clipsOf(a)) assert.equal(frameKey(a, clip, n - 1, d).h, frameKey(b, clip, n - 1, d).h, `${p} ${clip}`);
    }
    // fuzz: random settings, clips and frames lay out within the frame's caps and never throw
    const roll = dice(4242);
    for (const p of LAYOUT_FIXTURES[g.key]) {
      const s = load(p), clips = clipsOf(s);
      for (let n = 0; n < 40; n++) {
        const params = { ...defaultParams(s) };
        for (const [k, c] of Object.entries(s.params)) {
          if (c.kind === 'range') params[k] = roll();
          else if (c.kind === 'toggle') params[k] = roll() < 0.5;
          else if (c.kind === 'choice' && Array.isArray(c.options) && c.options.length) { const o = c.options[Math.floor(roll() * c.options.length)]; params[k] = isObj(o) ? o.value ?? o.id ?? o.key : o; }
        }
        const [clip, frames] = clips[Math.floor(roll() * clips.length)];
        const f = Math.floor(roll() * frames);
        let r;
        assert.doesNotThrow(() => { r = dataFrameList(s, clip, f, params); }, `${p} ${clip} ${f} ${JSON.stringify(params)}`);
        assert.ok(Array.isArray(r.list) && r.list.length <= registry.GEN_LIMITS.primitives, `${p} ${clip} ${f}`);
        assert.ok(stampPixels(r.list) <= SHAPE_CAPS.stampPixels, `${p} ${clip} ${f}: stamp pixels`);
        assert.equal(frameKey(s, clip, f, params).h, hash(JSON.stringify(r.list)), `${p} ${clip} ${f}: twice the same`);
      }
    }
  });
}
