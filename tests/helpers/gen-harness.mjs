// The goldens harness for named generators (docs/data-sprites.md 3.1 "Tested"): every released id@v is checked for
// determinism (twice the same, and no clock or Math.random), golden primitives at three or more argument sets,
// argument fuzz (every type at its limits and just outside them), its cost (an upper bound on what it returns, under
// the per-frame budget at its largest arguments, and monotone in each number argument: rising or falling as the number
// grows, never both, which the registry's worst case over a table relies on) and loop closure (t = 0 and t = 1 draw the
// same when ctx.loop).
//
//   import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
//   test('twinkle@1', () => checkGeneratorContract(registry, registry.generator('twinkle', 1)));
//
// Goldens live in tests/fixtures/gen/<id>@<v>.json: { id, v, cases: [{ args, ctx?, primitives }] }. A released
// version's file never changes: a different output is a new version. To pin a NEW version, give its cases and run
// once with GEN_GOLDEN_WRITE=1; the harness writes only files that do not exist yet and never overwrites one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { typeSamples } from '../../engine/gen/args.js';
import { GEN_LIMITS } from '../../engine/gen/registry.js';

export const GOLDEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'gen');

/** The golden file of one generator version. */
export const goldenPath = (key) => path.join(GOLDEN_DIR, `${key}.json`);

/** Reads a golden file, or null when there is none. */
export function readGolden(key) {
  const f = goldenPath(key);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

const json = (v) => JSON.parse(JSON.stringify(v));

/** Runs fn with Math.random, Date.now and performance.now made to throw: a generator that reads them fails. */
export function withoutClockOrDice(fn) {
  const keep = { random: Math.random, now: Date.now, perf: globalThis.performance?.now };
  const no = (what) => () => { throw new Error(`a generator read ${what}`); };
  Math.random = no('Math.random'); Date.now = no('Date.now');
  if (globalThis.performance) globalThis.performance.now = no('performance.now');
  try { return fn(); } finally {
    Math.random = keep.random; Date.now = keep.now;
    if (globalThis.performance) globalThis.performance.now = keep.perf;
  }
}

/**
 * Writes the golden file for a new version from its cases ({ args, ctx? } each), when GEN_GOLDEN_WRITE=1 and no file
 * exists yet. Returns the golden (read or written), or null.
 */
export function pinGolden(registry, entry, cases) {
  const old = readGolden(entry.key);
  if (old || process.env.GEN_GOLDEN_WRITE !== '1' || !cases) return old;
  const out = { id: entry.id, v: entry.v, cases: cases.map((c) => {
    const r = registry.runGenerator({ gen: entry.id, v: entry.v, ...c.args }, c.ctx ?? {});
    assert.ok(r.ok, `${entry.key}: a golden case fails: ${r.errors.join('; ')}`);
    return { args: c.args, ...(c.ctx ? { ctx: c.ctx } : {}), primitives: r.primitives };
  }) };
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  fs.writeFileSync(goldenPath(entry.key), `${JSON.stringify(out, null, 1)}\n`);
  return out;
}

const NUMBER_TYPES = new Set(['px', 'share', 'count', 'angle', 'seed']);

// Values from lo to hi to sweep a number over: every whole number when there are few, else 65 evenly spaced.
function sweep(lo, hi, whole) {
  if (whole && hi - lo <= 128) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  return Array.from({ length: 65 }, (_, i) => { const v = lo + ((hi - lo) * i) / 64; return whole ? Math.round(v) : v; });
}

/**
 * Checks that a generator's cost is monotone in each number argument, each point coordinate and each number field of
 * a struct (the registry costs a bound number at the two ends of its table only). Throws an assertion error naming the
 * argument whose cost rises and then falls (or falls and then rises).
 */
export function checkCostMonotone(entry, baseArgs) {
  const positions = [];
  for (const [name, t] of Object.entries(entry.args)) {
    if (NUMBER_TYPES.has(t.type)) positions.push({ label: name, values: sweep(t.lo, t.hi, t.type === 'count' || t.type === 'seed'), set: (a, v) => ({ ...a, [name]: v }) });
    if (t.type === 'point') {
      for (const i of [0, 1]) {
        positions.push({ label: `${name}[${i}]`, values: sweep(t.lo, t.hi, false), set: (a, v) => { const p = [...(a[name] ?? t.default ?? [0, 0])]; p[i] = v; return { ...a, [name]: p }; } });
      }
    }
    if (t.type === 'struct') {
      for (const [k, f] of Object.entries(t.args)) {
        if (!NUMBER_TYPES.has(f.type)) continue;
        positions.push({ label: `${name}.${k}`, values: sweep(f.lo, f.hi, f.type === 'count' || f.type === 'seed'), set: (a, v) => ({ ...a, [name]: { ...(a[name] ?? t.default ?? {}), [k]: v } }) });
      }
    }
  }
  for (const pos of positions) {
    const costs = pos.values.map((v) => entry.cost(pos.set(baseArgs, v))).filter((c) => Number.isFinite(c));
    let dir = 0;
    for (let i = 1; i < costs.length; i++) {
      const d = Math.sign(costs[i] - costs[i - 1]);
      if (!d) continue;
      if (!dir) dir = d;
      else assert.ok(d === dir, `${entry.key}: cost rises and falls as ${pos.label} grows (${costs.join(', ')}): a cost must be monotone in each number, or the worst case over a table is missed`);
    }
  }
}

/** Every check of the harness on one registered generator version; throws an assertion error on the first failure. Options: cases (to pin a new golden), golden (check against this golden instead of the file: tests of the harness). */
export function checkGeneratorContract(registry, entry, { cases, golden: given } = {}) {
  assert.ok(entry, 'no generator given');
  const golden = given ?? pinGolden(registry, entry, cases);
  assert.ok(golden, `${entry.key}: no golden file ${path.relative(process.cwd(), goldenPath(entry.key))} (pin it: GEN_GOLDEN_WRITE=1 node --test <this test>)`);
  assert.equal(golden.id, entry.id); assert.equal(golden.v, entry.v);
  assert.ok(Array.isArray(golden.cases) && golden.cases.length >= 3, `${entry.key}: at least three golden cases`);
  const call = (args) => ({ gen: entry.id, v: entry.v, ...args });

  for (const [i, c] of golden.cases.entries()) {
    const label = `${entry.key} case ${i}`;
    // golden: the pinned output, exactly
    const r = withoutClockOrDice(() => registry.runGenerator(call(c.args), c.ctx ?? {}));
    assert.ok(r.ok, `${label}: ${r.errors.join('; ')}`);
    assert.deepEqual(json(r.primitives), c.primitives, `${label}: output differs from the pinned golden (a released version never changes: make a new version)`);
    // determinism
    assert.deepEqual(registry.runGenerator(call(c.args), c.ctx ?? {}).primitives, r.primitives, `${label}: not deterministic`);
    // cost: an upper bound, under the budget
    assert.ok(Number.isFinite(r.cost) && r.cost >= 0, `${label}: cost is a number`);
    assert.ok(r.primitives.length <= r.cost, `${label}: returns more than its cost`);
    assert.ok(r.cost <= GEN_LIMITS.primitives, `${label}: cost over the per-frame budget`);
    // loop closure
    const at0 = registry.runGenerator(call(c.args), { ...(c.ctx ?? {}), loop: true, t: 0 });
    const at1 = registry.runGenerator(call(c.args), { ...(c.ctx ?? {}), loop: true, t: 1 });
    assert.deepEqual(at1.primitives, at0.primitives, `${label}: a loop does not close (t = 0 and t = 1 differ)`);
  }

  // fuzz: every argument at its limits (runs) and just outside them (refused, never thrown)
  const baseArgs = golden.cases[0].args;
  let biggest = 0;
  for (const [name, type] of Object.entries(entry.args)) {
    const { valid, invalid } = typeSamples(type);
    for (const v of valid) {
      let r;
      assert.doesNotThrow(() => { r = registry.runGenerator(call({ ...baseArgs, [name]: v })); }, `${entry.key}.${name} = ${JSON.stringify(v)}`);
      assert.ok(r.ok, `${entry.key}.${name} = ${JSON.stringify(v)} should run: ${r.errors.join('; ')}`);
      assert.ok(r.primitives.length <= r.cost);
      biggest = Math.max(biggest, r.cost);
    }
    for (const v of invalid) {
      let r;
      assert.doesNotThrow(() => { r = registry.runGenerator(call({ ...baseArgs, [name]: v })); }, `${entry.key}.${name} = ${String(v)}`);
      assert.equal(r.ok, false, `${entry.key}.${name} = ${JSON.stringify(v)} should be refused`);
      assert.ok(r.errors.length > 0);
    }
  }
  assert.ok(biggest <= GEN_LIMITS.primitives, `${entry.key}: cost at its limits is over the per-frame budget`);
  for (const c of golden.cases) checkCostMonotone(entry, c.args);
  const unknown = registry.runGenerator(call({ ...baseArgs, notAnArgument: 1 }));
  assert.equal(unknown.ok, false, `${entry.key}: an unknown argument is refused`);
}

/**
 * Paints a primitive list onto a Surface the simple way, for port tests only: dots and stamps with anchor "tl" (what
 * the first generators return). colours maps paint refs to '#rrggbb'. The real renderer is engine/draw-list.js (B3).
 */
export function paintSimple(g, prims, colours) {
  for (const p of prims) {
    if (p.kind === 'dot') { g.dot(p.at[0], p.at[1], colours[p.paint]); continue; }
    if (p.kind !== 'stamp') throw new Error(`paintSimple: no ${p.kind}`);
    assert.ok(!p.anchor || p.anchor === 'tl', 'paintSimple draws top-left stamps only');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch !== '.') g.dot(p.at[0] + i, p.at[1] + j, colours[p.key[ch]]);
    }));
  }
  return g;
}
