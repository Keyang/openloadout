// Generator calls in the studio (build item B17; docs/data-sprites.md section 3, Contract 15 rule 3). A definition
// never holds code: where it needs computed variety it names a generator of the fixed registry, { gen, v, ...args }.
// This module reads the registry's own documentation (engine/gen/index.js describeGenerators: id, version, family,
// about, and each argument's type, range, default and words) and turns it into what the studio's pictures editor
// shows: which generators a place offers, a new call with a starting value for each argument it needs, how each
// argument type is edited (a number in its range, a whole number, a word from its list, on/off, a paint from the
// palette, a list of paints, a point, or the field tree for shapes and lists), and a setting bound to a control by a
// table (never a formula). Pure: browser and Node.
import { describeGenerators } from '../../engine/gen/index.js';
import { GENERATOR_PLACES } from '../../catalog/sprite-schema.js';

/** Families no draw list takes: they have places of their own (motion, emitters, a panel's piece, colour rules) or are the layouts themselves. */
const NOT_DRAWN = new Set(['motion', 'fx', 'ui', 'colour', 'layout']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(fin(hi) ? hi : v, Math.max(fin(lo) ? lo : v, v));
const NUMBER_STEP = { px: 0.5, share: 0.05, count: 1, seed: 1, angle: 1, number: 0.5 };

let described = null;
/** The registry's documentation, read once: [{ id, v, key, family, about, args: { name: described type } }], by family, id, newest version first. */
function all() {
  if (!described) {
    const d = describeGenerators();
    const list = (Array.isArray(d) ? d : d.generators ?? []).map((g) => ({ id: g.id, v: g.v, key: g.key ?? `${g.id}@${g.v}`, family: g.family, about: g.about ?? '', args: g.args ?? {}, keyable: g.keyable ?? [] }));
    list.sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : b.v - a.v));
    described = Object.freeze(list);
  }
  return described;
}

/**
 * The generators a place in a definition takes: 'draw' (a draw list: every family but those with places of their own),
 * 'motion', 'emitter', 'piece' (a panel's piece), 'fit' and 'colour' (catalog/sprite-schema.js GENERATOR_PLACES).
 * Each { id, v, key, family, about, args, keyable }, newest version first. Arguments: place.
 */
export function generatorsFor(place) {
  const families = place === 'shapes' || place === 'draw' ? null : GENERATOR_PLACES[place] ?? null;
  return all().filter((g) => (families ? families.includes(g.family) : !NOT_DRAWN.has(g.family)));
}

/** One generator's documentation by id and version, or null. Arguments: id, v. */
export function generatorDoc(id, v) {
  return all().find((g) => g.id === id && g.v === v) ?? null;
}

/**
 * How an argument of a type is edited: { input: 'number', min, max, step } | { input: 'word', options } | { input: 'flag' } |
 * { input: 'paint' } | { input: 'paints', most } | { input: 'point', min, max, step } | { input: 'tree' } (shapes, places,
 * shape lists, structs and profiles: the field tree), each with `binding` (may it be set by a control). Arguments: type (described).
 */
export function argInput(type) {
  const t = isObj(type) ? type.type : null;
  const binding = !['shape', 'place', 'primitives', 'struct', 'profile'].includes(t);
  if (Object.hasOwn(NUMBER_STEP, t)) return { input: 'number', min: type.lo, max: type.hi, step: NUMBER_STEP[t], binding };
  if (t === 'word') return { input: 'word', options: [...(type.values ?? type.options ?? [])], binding };
  if (t === 'flag') return { input: 'flag', binding };
  if (t === 'paint') return { input: 'paint', binding };
  if (t === 'paints') return { input: 'paints', most: type.n, binding };
  if (t === 'point') return { input: 'point', min: type.lo, max: type.hi, step: 0.5, binding };
  return { input: 'tree', binding: false };
}

/**
 * A starting value for an argument the call must have, that the registry takes: a small size, the middle of a share, a
 * whole number at the low end, the first word, off, the first paint, the node's own point (or the frame's middle), a box,
 * a dot, an empty list. Arguments: type (described), ctx { paints (the definition's paint refs), frame ([w, h]), onNode (does the call sit on a node) }.
 */
export function starterArg(type, { paints = ['ink'], frame = [32, 32], onNode = true } = {}) {
  const t = type?.type;
  const paint = paints[0] ?? 'ink';
  switch (t) {
    case 'px': case 'number': return type.lo < 0 && type.hi > 0 ? 0 : clamp(4, type.lo, type.hi);
    case 'share': return clamp(0.5, type.lo, type.hi);
    case 'count': return clamp(2, type.lo, type.hi);
    case 'seed': return clamp(1, type.lo, type.hi);
    case 'angle': return clamp(0, type.lo, type.hi);
    case 'word': return (type.values ?? type.options ?? [])[0];
    case 'flag': return false;
    case 'paint': return paint;
    case 'paints': return [paint];
    case 'point': {
      // a point the type allows 0 in sits on its node; one that does not (a size written as two numbers) starts small
      const c = (fin(type.lo) ? type.lo : -1) <= 0 && (fin(type.hi) ? type.hi : 1) >= 0 ? 0 : clamp(4, type.lo, type.hi);
      return onNode || c !== 0 ? [c, c] : [clamp(Math.round(frame[0] / 2), type.lo, type.hi), clamp(Math.round(frame[1] / 2), type.lo, type.hi)];
    }
    case 'shape': return { kind: 'rect', at: [-2, -2], size: [4, 4], paint };
    case 'place': return { kind: 'dot', paint };
    case 'primitives': return [];
    case 'profile': return [0, 1];
    case 'struct': return Object.fromEntries(Object.entries(type.args ?? {}).filter(([, f]) => !f.optional).map(([k, f]) => [k, starterArg(f, { paints, frame, onNode })]));
    default: return null;
  }
}

/**
 * A new call of a generator: { gen, v, on?, ...every argument it needs } (optional arguments left to their defaults).
 * Arguments: g (from generatorsFor), ctx { on (a node), node (for a motion), paints, frame }.
 */
export function newCall(g, { on, node, paints, frame } = {}) {
  const call = { gen: g.id, v: g.v };
  if (on) call.on = on;
  if (node && Object.hasOwn(g.args, 'node')) call.node = node;
  for (const [k, t] of Object.entries(g.args)) {
    if (t.optional || Object.hasOwn(call, k)) continue;
    call[k] = starterArg(t, { paints, frame, onNode: !!on });
  }
  return call;
}

/** Is a value a binding (a setting reached through a control: { from, map } or { from, pick })? Arguments: value. */
export const isBound = (v) => isObj(v) && typeof v.from === 'string' && (Array.isArray(v.map) || isObj(v.pick) || Object.keys(v).length === 1);

/**
 * The rows of a call's arguments, in the registry's order: { name, type, about, optional, set (the call gives it), value,
 * default (when optional), isDefault (set to its default, so it may be left out), input (argInput) }. Arguments: g, call.
 */
export function argRows(g, call) {
  return Object.entries(g.args).map(([name, type]) => {
    const set = isObj(call) && Object.hasOwn(call, name);
    const value = set ? call[name] : undefined;
    const row = { name, type, about: type.about ?? '', optional: !!type.optional, set, value, input: argInput(type) };
    if (type.optional) { row.default = type.default; row.isDefault = set && JSON.stringify(value) === JSON.stringify(type.default); }
    return row;
  });
}

/**
 * A number, word, flag or paint bound to a control: a range control gives a two-point table from its low end to its
 * high end ([[min, value], [max, about twice the value]], within the type's range); a choice or on/off control a pick
 * with every option set to the value now (each option then changed in the field tree). A table, never a formula.
 * Arguments: key (the control's key), type (described), value (now), options (a choice's options, or ['true', 'false'] for a toggle; leave out for a range), range ([min, max] of a range control; default [0, 1]).
 */
export function bindTo(key, type, value, options, range = [0, 1]) {
  if (Array.isArray(options)) return { from: key, pick: Object.fromEntries(options.map((o) => [String(o), value])) };
  const v = fin(value) ? value : 0;
  let hi = clamp(v === 0 ? 4 : v * 2, type?.lo, type?.hi);
  if (hi === v) hi = clamp(type?.lo ?? 0, type?.lo, type?.hi);
  return { from: key, map: [[range[0], v], [range[1], hi]] };
}

/** A bound value made fixed again: the table's first value, or the first option's. Arguments: binding, type (described). */
export function unbind(binding, type) {
  if (Array.isArray(binding?.map) && Array.isArray(binding.map[0])) return binding.map[0][1];
  if (isObj(binding?.pick)) return Object.values(binding.pick)[0];
  return starterArg(type ?? { type: 'px', lo: 0, hi: 4 });
}
