// The named-generator registry (docs/data-sprites.md section 3; Contract 15 rule 3). A definition never brings code:
// where it needs computed variety it names a generator, { "gen": "<id>", "v": <n>, ...args }, and this module looks the
// name up, checks every argument against its declared type (engine/gen/args.js), adds up the cost against a budget and
// runs it. A generator is pure and deterministic: it sees only its arguments and ctx, never a surface, a clock or
// Math.random (variety comes from a `seed` argument through engine/motion.js hash), and it RETURNS PRIMITIVES (the
// shape-list type described at the top of args.js), which engine/draw-list.js draws.
//
//   import { defineGenerator } from './registry.js';
//   import { point, count, paint } from './args.js';
//   export const blip = defineGenerator({
//     id: 'blip', v: 1, family: 'fx', about: 'One pixel at a point.',
//     args: { at: point(), size: count(1, 2, { default: 1 }), paint: paint() },
//     cost: (a) => 1,                                   // an upper bound on how many primitives run returns
//     run: (a, ctx) => [{ kind: 'dot', at: a.at, size: a.size, paint: a.paint }],
//     keyable: ['size'],                                // arguments clip keys may change (emitters)
//   });
//
// Versions: `id@v`. Once released a version's output never changes (its goldens in tests/fixtures/gen/ pin it); a
// change of output is a new version declared beside the old one. A generator that places or composes others gets a
// third argument: run(args, ctx, { call, costOf }) and cost(args, { costOf }); call(node, ctx) runs a nested call
// through the registry (checked, budgeted, depth-limited) and costOf(node) is a nested thing's cost (a primitive 1, a call
// its own worst case and at least 1).
//
// COST (section 3.4 rule 2). cost(args) is an upper bound on how many primitives run returns, and it must be monotone
// in each number argument (it may rise or fall as a number grows, never rise and then fall: the goldens harness checks
// it), because a bound number is costed at the two ends of what its table can give. checkCall costs a call at every
// combination of the bound settings its cost reads (each end of a table, each option of a pick, in points, paint lists
// and structs too), at most GEN_LIMITS.costCombos of them; a nested call costs at least 1 and is costed once per check.
// So the worst case checkCall reports is the worst case a run can meet, and a definition over the budget is refused
// before anything draws. entry.cost(args) called bare gives the same number (NaN when the arguments are wrong).
//
// Family modules live in engine/gen/<family>.js and are imported by engine/gen/index.js, one line each; the site's
// registry is the one this module exports functions of. createRegistry() makes a separate one (tests).
import { checkArg, checkField, checkPrimitive, describeArg, isArgType, isBinding, plainErrors, stampPixels, SHAPE_CAPS } from './args.js';

/**
 * Caps (docs/data-sprites.md 2.7 and 3.4): generator calls written per frame, primitives after expansion (also the
 * default cost budget), levels of nested calls below a call, combinations of bound settings one call is costed at, and
 * cost evaluations one check may make in all (so costing itself can never hang the page).
 */
export const GEN_LIMITS = Object.freeze({ calls: 64, primitives: 4000, depth: 4, costCombos: 4096, costWork: 65536 });

/** Fields a call may carry that are not arguments, each checked by type (args.js checkField); on, z, group, glow, part, shade, light and far are copied onto each primitive returned. */
export const CALL_FIELDS = Object.freeze(['gen', 'v', 'id', 'on', 'z', 'when', 'group', 'hidden', 'glow', 'part', 'clip', 'shade', 'light', 'far']);

/** What a generator sees besides its arguments (section 3.1): phase t, frame, frames, loop, frame size, clip name, direction. */
export const CTX_FIELDS = Object.freeze(['t', 'frame', 'frames', 'loop', 'size', 'clip', 'direction']);

/** The registry key of a generator version: genKey('twinkle', 1) is 'twinkle@1'. */
export const genKey = (id, v) => `${id}@${v}`;

const CARRY = ['on', 'z', 'group', 'glow', 'part', 'shade', 'light', 'far'];
const SPEC_FIELDS = ['id', 'v', 'family', 'about', 'args', 'cost', 'run', 'keyable', 'wraps'];
const ID = /^[a-z][a-zA-Z0-9]*(?:[.-][a-z][a-zA-Z0-9]*)*$/;
const FAMILY = /^[a-z][a-z0-9-]{0,39}$/;
const ARG_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/;
const DIRECTIONS = ['down', 'up', 'side'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const whole = (v) => typeof v === 'number' && Number.isInteger(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const own = (o, k) => {
  const d = Object.getOwnPropertyDescriptor(o, k);
  if (!d) return undefined;
  if (!('value' in d)) throw new Error(`"${k}" is a getter`);
  return d.value;
};
const deepFreeze = (v) => {
  if (v && typeof v === 'object') { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); }
  return v;
};
const copy = (v) => JSON.parse(JSON.stringify(v));
const message = (e) => String(e?.message ?? e).slice(0, 300);

class NestedFailure extends Error {}

/** The context a generator runs with: ctx checked (unknown fields refused) and filled with defaults, frozen. Throws on a bad one. */
function cleanCtx(ctx) {
  if (ctx === undefined || ctx === null) ctx = {};
  if (!isObj(ctx)) throw new Error('ctx: an object { t, frame, frames, loop, size, clip, direction }');
  for (const k of Object.keys(ctx)) if (!CTX_FIELDS.includes(k)) throw new Error(`ctx: unknown field "${k}" (${CTX_FIELDS.join(', ')})`);
  const c = { t: 0, frame: 0, frames: 1, loop: false, size: [32, 32], clip: '', direction: null };
  for (const k of CTX_FIELDS) { const v = own(ctx, k); if (v !== undefined) c[k] = v; }
  if (!fin(c.t) || c.t < 0 || c.t > 1) throw new Error('ctx.t: the clip phase, 0 to 1');
  if (!whole(c.frames) || c.frames < 1 || c.frames > 256) throw new Error('ctx.frames: 1 to 256');
  if (!whole(c.frame) || c.frame < 0 || c.frame > 255) throw new Error('ctx.frame: 0 to 255');
  if (typeof c.loop !== 'boolean') throw new Error('ctx.loop: true or false');
  if (!Array.isArray(c.size) || c.size.length !== 2 || !whole(c.size[0]) || !whole(c.size[1]) || c.size[0] < 1 || c.size[1] < 1 || c.size[0] > 640 || c.size[1] > 360) throw new Error('ctx.size: [w, h], at most 640 x 360');
  if (typeof c.clip !== 'string' || c.clip.length > 40) throw new Error('ctx.clip: a clip name');
  if (c.direction !== null && !DIRECTIONS.includes(c.direction)) throw new Error(`ctx.direction: null or one of ${DIRECTIONS.join(', ')}`);
  return Object.freeze({ ...c, size: Object.freeze([...c.size]) });
}

class CostWork extends Error {}

const roundBy = (v, round) => (round === 'px' ? Math.round(v) : round === 'half' ? Math.round(v * 2) / 2 : v);
const NO_SLOT = new Set(['shape', 'place', 'primitives', 'profile', 'struct']);

// The values a binding can give that its cost must be tried at: a table's two ends (after rounding; a table is
// continuous, so it gives every value between its least and greatest output), or each distinct option of a pick.
function bindingValues(b) {
  if (Array.isArray(b.map)) {
    const outs = b.map.map((pt) => roundBy(pt[1], b.round ?? 'none'));
    const lo = Math.min(...outs), hi = Math.max(...outs);
    return lo === hi ? [lo] : [lo, hi];
  }
  const seen = new Map();
  for (const x of Object.values(b.pick)) { const k = JSON.stringify(x); if (!seen.has(k)) seen.set(k, x); }
  return [...seen.values()];
}

// Every place a binding sits in a call's arguments: a whole argument, a point's coordinate, an item of a paint list, a
// struct's field (and those inside it). Returns [{ arg, path, values }]; shapes, places and primitive lists are left
// alone (what is inside them is costed by costOf, never read as a number).
function bindingSlots(types, args) {
  const slots = [];
  const walk = (type, v, path, arg) => {
    if (v === undefined) return;
    if (isBinding(v) && !NO_SLOT.has(type.type)) { slots.push({ arg, path, values: bindingValues(v) }); return; }
    if ((type.type === 'point' || type.type === 'paints') && Array.isArray(v)) {
      v.forEach((c, i) => { if (isBinding(c)) slots.push({ arg, path: [...path, i], values: bindingValues(c) }); });
    } else if (type.type === 'struct' && isObj(v)) {
      for (const [k, t] of Object.entries(type.args)) walk(t, v[k], [...path, k], arg);
    }
  };
  for (const [a, t] of Object.entries(types)) walk(t, args[a], [a], a);
  return slots;
}

// A fresh state for one check or one run: inspected calls by key (each nested call is inspected once) and the cost
// evaluations made so far (capped by GEN_LIMITS.costWork).
const newState = () => ({ memo: new Map(), work: 0 });

/**
 * A new, empty registry with the full API (defineGenerator, generator, generators, versionsOf, describe, checkCall,
 * runGenerator, expandList). The site uses the one this module makes; tests make their own for throwaway generators.
 */
export function createRegistry() {
  const table = new Map();

  /**
   * Declares a generator version and registers it; returns its frozen entry { id, v, key, family, about, args, keyable,
   * wraps, cost, run }. Throws on a bad declaration or a version already registered (load-time framework error).
   */
  function defineGenerator(spec) {
    if (!isObj(spec)) throw new Error('defineGenerator: a declaration object');
    for (const k of Object.keys(spec)) if (!SPEC_FIELDS.includes(k)) throw new Error(`defineGenerator: unknown field "${k}" (${SPEC_FIELDS.join(', ')})`);
    const { id, v, family, about, args, cost, run, keyable = [], wraps = false } = spec;
    const name = typeof id === 'string' ? id : '?';
    if (typeof id !== 'string' || id.length > 40 || !ID.test(id)) throw new Error(`defineGenerator: id ${JSON.stringify(id)} is not a generator id (lowercase words joined by . or -, at most 40 characters)`);
    if (!whole(v) || v < 1 || v > 999) throw new Error(`${name}: the version v is a whole number 1 to 999`);
    if (typeof family !== 'string' || !FAMILY.test(family)) throw new Error(`${name}@${v}: family is a lowercase id`);
    if (typeof about !== 'string' || !about.trim() || about.length > 300) throw new Error(`${name}@${v}: about is one sentence (at most 300 characters)`);
    if (!isObj(args)) throw new Error(`${name}@${v}: args is { name: type }`);
    for (const [a, t] of Object.entries(args)) {
      if (!ARG_NAME.test(a)) throw new Error(`${name}@${v}: argument name "${a}" is not a camelCase word`);
      if (CALL_FIELDS.includes(a)) throw new Error(`${name}@${v}: argument name "${a}" is reserved for calls (${CALL_FIELDS.join(', ')})`);
      if (!isArgType(t)) throw new Error(`${name}@${v}: argument "${a}" needs a type from engine/gen/args.js`);
    }
    if (typeof cost !== 'function') throw new Error(`${name}@${v}: cost(args) is a function`);
    if (typeof run !== 'function') throw new Error(`${name}@${v}: run(args, ctx) is a function`);
    if (!Array.isArray(keyable) || keyable.some((k) => !Object.hasOwn(args, k))) throw new Error(`${name}@${v}: keyable lists argument names`);
    if (typeof wraps !== 'boolean') throw new Error(`${name}@${v}: wraps is true or false`);
    const key = genKey(id, v);
    if (table.has(key)) throw new Error(`${key} is already registered: a released version never changes; declare v ${v + 1}`);
    // cost and run also work when called bare (catalog/sprite-schema.js calls cost(args)). Bare, cost is the call's
    // worst case over its bindings with defaults filled, exactly checkCall's cost (NaN when the arguments are wrong);
    // with helpers it is the declared function itself (the registry's own use). A bare run gets this registry's helpers.
    const bareCost = (a) => {
      try {
        if (!isObj(a) || plainErrors(a).length) return NaN;
        const r = inspect({ ...a, gen: id, v }, { bindings: true }, 0, 'call', ['at'], newState());
        return r.errors.length ? NaN : r.cost;
      } catch {
        return NaN;
      }
    };
    const call = (child, c) => {
      const r = runGenerator(child, c ?? {});
      if (!r.ok) throw new NestedFailure(r.errors.join('; '));
      return r.primitives;
    };
    const costOf = (child) => {
      if (!isObj(child) || !Object.hasOwn(child, 'gen')) return 1;
      const r = inspect(child, { bindings: true }, 1, 'call', ['at'], newState());
      if (r.errors.length) throw new NestedFailure(r.errors.join('; '));
      return Math.max(1, r.cost);
    };
    const entry = Object.freeze({
      id, v, key, family, about, args: Object.freeze({ ...args }), keyable: Object.freeze([...keyable]), wraps,
      cost: (a, helpers) => (helpers ? cost(a, helpers) : bareCost(a)),
      run: (a, ctx, helpers) => run(a, ctx ?? cleanCtx({}), helpers ?? { call, costOf }),
    });
    table.set(key, entry);
    return entry;
  }

  /** The entry of generator id at version v, or null. */
  const generator = (id, v) => (typeof id === 'string' && whole(v) ? table.get(genKey(id, v)) ?? null : null);

  /** Every registered entry, sorted by id and then version. */
  const generators = () => [...table.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.v - b.v));

  /** The versions registered for an id, ascending ([] for none). */
  const versionsOf = (id) => generators().filter((g) => g.id === id).map((g) => g.v);

  /** The registry as plain JSON, as the build writes generated/generators.json: { version: 1, generators: [{ id, v, key, family, about, args, keyable, wraps }] }. */
  function describe() {
    return {
      version: 1,
      generators: generators().map((g) => ({
        id: g.id, v: g.v, key: g.key, family: g.family, about: g.about,
        args: Object.fromEntries(Object.entries(g.args).map(([a, t]) => [a, describeArg(t)])),
        keyable: [...g.keyable], wraps: g.wraps,
      })),
    };
  }

  // Checks a call and works out its arguments (defaults filled) and its worst-case cost. opts as checkCall; supplied:
  // argument names the caller will fill (a placed call's `at`); st: the check's state (newState). Each distinct call is
  // inspected once per check (st.memo), so nesting costs as many inspections as there are calls written, not a power of
  // them. Returns { errors, cost, args, entry }.
  function inspect(node, opts, depth, path, supplied, st) {
    if (!isObj(node)) return { errors: [`${path}: a generator call is an object { gen, v, ...args }`], cost: 0 };
    const plain = plainErrors(node, path);
    if (plain.length) return { errors: plain, cost: 0 };
    const need = supplied.filter((a) => !Object.hasOwn(node, a));
    const key = `${depth}|${need.join(',')}|${JSON.stringify(node)}`;
    if (st.memo.has(key)) return st.memo.get(key);
    const r = inspectFresh(node, opts, depth, path, need, st);
    st.memo.set(key, r);
    return r;
  }

  function inspectFresh(node, opts, depth, path, supplied, st) {
    const id = node.gen, v = node.v;
    if (typeof id !== 'string') return { errors: [`${path}: a generator call names its generator: gen`], cost: 0 };
    const where = `${path === 'call' ? '' : `${path}: `}`;
    if (depth > GEN_LIMITS.depth) return { errors: [`${where}${id.slice(0, 40)}: calls nested too deep (at most ${GEN_LIMITS.depth})`], cost: 0 };
    if (!versionsOf(id).length) return { errors: [`${where}no generator "${id.slice(0, 40)}"`], cost: 0 };
    if (!whole(v)) return { errors: [`${where}${id}: say which version: v (versions: ${versionsOf(id).join(', ')})`], cost: 0 };
    const g = generator(id, v);
    if (!g) return { errors: [`${where}generator "${id}" has no version ${v} (versions: ${versionsOf(id).join(', ')})`], cost: 0 };
    const errors = [];
    for (const k of Object.keys(node)) {
      if (k === 'gen' || k === 'v') continue;
      if (CALL_FIELDS.includes(k)) errors.push(...checkField(k, node[k], { path: `${g.key}.${k}`, bindings: opts.bindings, controls: opts.controls }));
      else if (!Object.hasOwn(g.args, k)) errors.push(`${g.key}: unknown argument "${k.slice(0, 40)}" (arguments: ${Object.keys(g.args).join(', ')})`);
    }
    const args = {};
    const checkCall = (child, p, { placed }) => {
      const r = inspect(child, opts, depth + 1, p, placed ? ['at'] : [], st);
      if (!r.errors.length && placed) {
        const cg = generator(child.gen, child.v);
        if (cg && cg.args.at?.type !== 'point') return [`${p}: ${cg.key} cannot be placed: it has no "at" point argument`];
      }
      return r.errors;
    };
    for (const [a, t] of Object.entries(g.args)) {
      const value = node[a];
      if (value === undefined) {
        if (supplied.includes(a)) { args[a] = [0, 0]; continue; }
        if (t.optional) { args[a] = t.default; continue; }
        errors.push(`${g.key}.${a}: missing`);
        continue;
      }
      errors.push(...checkArg(t, value, { ...opts, path: `${g.key}.${a}`, checkCall }));
      args[a] = value;
    }
    if (errors.length) return { errors, cost: 0, entry: g };
    try {
      return { errors: [], cost: worstCost(g, args, opts, depth, st), args, entry: g };
    } catch (e) {
      if (e instanceof CostWork) return { errors: [`${g.key}: too much work to cost (more than ${GEN_LIMITS.costWork} cost evaluations in one check): bind fewer settings or nest fewer calls`], cost: 0, entry: g };
      return { errors: [`${g.key}: ${message(e)}`], cost: 0, entry: g };
    }
  }

  // The greatest cost a call can have over every setting of its bindings (see COST in the header). Only the bound
  // arguments the cost function reads are combined: their values are read through getters that note the read, and the
  // combinations are tried again whenever a new argument is read. Throws CostWork past GEN_LIMITS.costWork evaluations.
  function worstCost(g, args, opts, depth, st) {
    const costOf = (child) => {
      if (!isObj(child) || !Object.hasOwn(child, 'gen')) return 1;
      const r = inspect(child, opts, depth + 1, 'nested call', ['at'], st);
      if (r.errors.length) throw new NestedFailure(r.errors.join('; '));
      return Math.max(1, r.cost);
    };
    const slots = bindingSlots(g.args, args);
    const bound = new Set(slots.map((s) => s.arg));
    const fixed = {};
    for (const [a, x] of Object.entries(args)) if (!bound.has(a)) fixed[a] = deepFreeze(copy(x));
    const read = new Set();
    const evalAt = (choice) => {
      st.work += 1;
      if (st.work > GEN_LIMITS.costWork) throw new CostWork();
      const vals = {};
      for (const a of bound) vals[a] = copy(args[a]);
      slots.forEach((s, i) => {
        const value = copy(s.values[choice.get(i) ?? 0]);
        if (s.path.length === 1) { vals[s.arg] = value; return; }
        let o = vals[s.arg];
        for (const k of s.path.slice(1, -1)) o = o[k];
        o[s.path[s.path.length - 1]] = value;
      });
      const a = {};
      for (const name of Object.keys(args)) {
        const value = bound.has(name) ? deepFreeze(vals[name]) : fixed[name];
        Object.defineProperty(a, name, { get() { read.add(name); return value; }, enumerable: true });
      }
      const c = g.cost(Object.freeze(a), { costOf });
      if (!fin(c) || c < 0) throw new Error('cost(args) did not give a number 0 or more');
      return c;
    };
    let cost = evalAt(new Map());
    let tried = '';
    for (;;) {
      const active = slots.map((s, i) => i).filter((i) => read.has(slots[i].arg) && slots[i].values.length > 1);
      const key = active.join(',');
      if (key === tried) return cost;
      const combos = active.reduce((n, i) => n * slots[i].values.length, 1);
      if (combos > GEN_LIMITS.costCombos) throw new Error(`${combos} combinations of bound settings to cost (at most ${GEN_LIMITS.costCombos}): bind fewer of the arguments its cost reads, or give them fewer options`);
      const choice = new Map(active.map((i) => [i, 0]));
      for (let n = 0; n < combos; n++) {
        let rest = n;
        for (const i of active) { choice.set(i, rest % slots[i].values.length); rest = Math.floor(rest / slots[i].values.length); }
        cost = Math.max(cost, evalAt(choice));
      }
      tried = key;
    }
  }

  /**
   * Checks a generator call before anything draws: the name and version exist, no unknown argument, every argument fits
   * its type, nested calls too, and the worst-case cost is within the budget. Returns { ok, errors, cost }; never throws.
   * Arguments: node ({ gen, v, ...args } plus CALL_FIELDS); opts { bindings (default true), controls, colourRules (as
   * args.js checkArg), budget (default GEN_LIMITS.primitives) }.
   */
  function checkCall(node, opts = {}) {
    try {
      const budget = opts.budget ?? GEN_LIMITS.primitives;
      const r = inspect(node, { bindings: opts.bindings ?? true, controls: opts.controls, colourRules: opts.colourRules }, 0, 'call', [], newState());
      const errors = [...r.errors];
      if (!errors.length && r.cost > budget) errors.push(`${r.entry.key}: cost ${r.cost} is over the budget of ${budget}`);
      return { ok: !errors.length, errors, cost: r.cost };
    } catch (e) {
      return { ok: false, errors: [`call: could not be read (${message(e)})`], cost: 0 };
    }
  }

  function runAt(node, ctx, opts, depth, st) {
    const c = cleanCtx(ctx);
    const r = inspect(node, { bindings: false, colourRules: opts.colourRules }, depth, 'call', [], st);
    if (r.errors.length) return { ok: false, primitives: [], errors: r.errors, cost: r.cost };
    const budget = opts.budget ?? GEN_LIMITS.primitives;
    if (r.cost > budget) return { ok: false, primitives: [], errors: [`${r.entry.key}: cost ${r.cost} is over the budget of ${budget}`], cost: r.cost };
    const g = r.entry;
    const call = (child, cctx = c) => {
      const inner = runAt(child, cctx, { colourRules: opts.colourRules }, depth + 1, st);
      if (!inner.ok) throw new NestedFailure(inner.errors.join('; '));
      return inner.primitives;
    };
    const costOf = (child) => {
      if (!isObj(child) || !Object.hasOwn(child, 'gen')) return 1;
      const k = inspect(child, { bindings: false, colourRules: opts.colourRules }, depth + 1, 'nested call', ['at'], st);
      if (k.errors.length) throw new NestedFailure(k.errors.join('; '));
      return Math.max(1, k.cost);
    };
    let out;
    try {
      out = g.run(deepFreeze(copy(r.args)), c, { call, costOf });
    } catch (e) {
      return { ok: false, primitives: [], errors: [`${g.key}: ${e instanceof NestedFailure ? '' : 'failed: '}${message(e)}`], cost: r.cost };
    }
    if (!Array.isArray(out)) return { ok: false, primitives: [], errors: [`${g.key}: did not return a list of primitives`], cost: r.cost };
    if (out.length > r.cost) return { ok: false, primitives: [], errors: [`${g.key}: returned ${out.length} primitives, more than its cost ${r.cost}`], cost: r.cost };
    const errors = out.flatMap((p, i) => checkPrimitive(p, { bindings: false, path: `${g.key} output ${i}`, colourRules: opts.colourRules })).slice(0, 20);
    if (errors.length) return { ok: false, primitives: [], errors, cost: r.cost };
    const pixels = stampPixels(out);
    if (pixels > SHAPE_CAPS.stampPixels) return { ok: false, primitives: [], errors: [`${g.key}: returned ${pixels} stamp pixels, over the ${SHAPE_CAPS.stampPixels} a frame may hold`], cost: r.cost };
    const primitives = copy(out);
    for (const p of primitives) for (const k of CARRY) if (Object.hasOwn(node, k) && !Object.hasOwn(p, k)) p[k] = copy(node[k]);
    return { ok: true, primitives, errors: [], cost: r.cost };
  }

  /**
   * Runs one generator call whose arguments are resolved (no bindings left): checks it as checkCall does, runs it with
   * frozen copies of its arguments and the context, checks what it returns (the shape-list type, its caps, at most its
   * cost) and copies the call's on, z, group, glow, part, shade, light and far onto each primitive that has none.
   * Returns { ok, primitives, errors, cost }; never throws.
   * Arguments: node; ctx ({ t, frame, frames, loop, size, clip, direction }, all optional); opts { budget, colourRules }.
   */
  function runGenerator(node, ctx = {}, opts = {}) {
    try {
      return runAt(node, ctx, opts, 0, newState());
    } catch (e) {
      return { ok: false, primitives: [], errors: [message(e)], cost: 0 };
    }
  }

  /**
   * Expands a draw list for one frame: primitives pass through (checked), generator calls are replaced by what they
   * return, in place. At most GEN_LIMITS.calls calls, the summed cost and the primitives within the budget, and stamp
   * pixels within SHAPE_CAPS.stampPixels; on any
   * error nothing is returned. Returns { ok, primitives, errors, cost, calls }; never throws.
   * Arguments: items (a list of primitives and calls, resolved); ctx (as runGenerator); opts { budget, colourRules }.
   */
  function expandList(items, ctx = {}, opts = {}) {
    const budget = opts.budget ?? GEN_LIMITS.primitives;
    const fail = (errors, cost = 0, calls = 0) => ({ ok: false, primitives: [], errors, cost, calls });
    try {
      if (!Array.isArray(items)) return fail(['draw list: a list of primitives and generator calls']);
      const out = [], errors = [];
      let cost = 0, calls = 0;
      for (const [i, item] of items.entries()) {
        if (isObj(item) && Object.hasOwn(item, 'gen')) {
          calls += 1;
          if (calls > GEN_LIMITS.calls) { errors.push(`draw list: more than ${GEN_LIMITS.calls} generator calls`); break; }
          const r = runGenerator(item, ctx, { budget, colourRules: opts.colourRules });
          cost += r.cost;
          if (!r.ok) errors.push(...r.errors.map((e) => `item ${i}: ${e}`));
          else out.push(...r.primitives);
        } else {
          const e = checkPrimitive(item, { bindings: false, path: `item ${i}`, colourRules: opts.colourRules });
          if (e.length) errors.push(...e);
          else out.push(copy(item));
        }
        if (errors.length > 20) break;
      }
      if (cost > budget) errors.push(`draw list: the generators cost ${cost} in all, over the frame budget of ${budget}`);
      if (out.length > GEN_LIMITS.primitives) errors.push(`draw list: ${out.length} primitives, over the ${GEN_LIMITS.primitives} a frame may hold`);
      const pixels = stampPixels(out);
      if (pixels > SHAPE_CAPS.stampPixels) errors.push(`draw list: ${pixels} stamp pixels, over the ${SHAPE_CAPS.stampPixels} a frame may hold`);
      return errors.length ? fail(errors, cost, calls) : { ok: true, primitives: out, errors: [], cost, calls };
    } catch (e) {
      return fail([`draw list: could not be read (${message(e)})`]);
    }
  }

  return { defineGenerator, generator, generators, versionsOf, describe, checkCall, runGenerator, expandList };
}

const site = createRegistry();

/** Declares and registers a generator version in the site's registry (see the header); returns its frozen entry. */
export const defineGenerator = site.defineGenerator;

/** The site's entry of generator id at version v, or null. */
export const generator = site.generator;

/** Every generator in the site's registry, sorted by id and version. */
export const generators = site.generators;

/** The versions the site's registry holds for an id, ascending. */
export const generatorVersions = site.versionsOf;

/** The site's registry as plain JSON, for generated/generators.json and window.loadout.framework.gen.list(). */
export const describeGenerators = site.describe;

/** Checks a generator call against the site's registry before anything draws: { ok, errors, cost }. */
export const checkCall = site.checkCall;

/** Runs one resolved generator call from the site's registry: { ok, primitives, errors, cost }. */
export const runGenerator = site.runGenerator;

/** Expands a frame's draw list with the site's registry: { ok, primitives, errors, cost, calls }. */
export const expandList = site.expandList;
