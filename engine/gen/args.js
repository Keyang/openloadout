// Argument types for named generators (docs/data-sprites.md section 3.1), the bindings a setting reaches an argument
// through (section 2.6), paint refs, and the shape-list type: the primitives a generator returns (section 2.7).
// Pure data checks: no drawing, nothing run, works the same in the browser and in Node.
//
//   import { px, count, paint, point, checkArg } from './args.js';
//   args: { at: point(), size: count(0, 4, { default: 1, about: 'Arm length' }), paint: paint() }
//   checkArg(count(0, 4), { from: 'amount', map: [[0, 1], [1, 4]], round: 'px' })   // -> [] (no errors)
//
// A type is a frozen plain object { type, lo?, hi?, values?, n?, args?, default?, optional, about? } made only by the
// constructors below. Every constructor takes a last argument { default, about }: an argument with a default may be
// left out of a call. Every number argument (px, share, count, angle, seed, and each coordinate of a point) also takes
// a table binding { from: <control>, map: [[in, out], ...], round?: 'px' | 'half' | 'none' }; every argument that is
// not a shape, a place, a primitive list, a profile or a struct takes a pick binding { from: <control>, pick: { <option>: value } }.
// A binding is a table, never a formula; engine/resolve.js (B4) turns it into a value before a generator runs.
//
// THE SHAPE-LIST TYPE (what a generator returns, and what engine/draw-list.js draws). A list of plain JSON objects,
// each { kind, ... } with kind one of PRIMITIVE_KINDS, in the coordinates of the call's arguments (frame pixels, or a
// node's own frame when the call carries `on`). Common optional fields: paint (a paint ref, below), z (-100..100),
// group, glow, part, on, hidden, id, bone, when, shade, light, far (checkField). Required fields per kind are
// PRIMITIVE_FIELDS and the only other fields a kind takes are KIND_FIELDS; numbers, lists and text are capped as section
// 2.7 says (checkPrimitive; stamp pixels in all: stampPixels). A stamp is
//   { kind: 'stamp', at: [x, y], anchor: 'tl', rows: ['..a..', 'aabaa'], key: { a: 'gold', b: 'shine' }, variants?, mirror? }
// rows of at most 32 x 32 characters, '.' or ' ' see-through, every other character a key to a paint ref; it is placed
// at its node's point, never turned. A paint ref is a palette slot ("gold"), a slot tone ("gold.light", TONES), a
// fixed paint (FIXED_PAINTS: ink, clear) or a colour rule { rule, ...args } (engine/data-rules.js names them). White is
// not a fixed paint (section 2.6): a sprite that wants a white glint declares a slot for it ("shine": "#ffffff").
// engine/draw-list.js (B3) is the second gate: it draws only what it understands and skips the rest, never throwing.

/** How far a coordinate written in a definition may reach, in pixels (the largest frame is 640 x 360). */
export const MAX_COORD = 640;

/** How far a coordinate in a generator's output may reach, in pixels: room for things drawn partly off the frame. */
export const MAX_OUT_COORD = 2048;

/** The names of the argument types, in the order docs/data-sprites.md section 3.1 lists them, plus struct (a small object of typed fields, such as a ridge's litEdge). */
export const ARG_TYPES = Object.freeze(['px', 'share', 'count', 'angle', 'seed', 'word', 'flag', 'paint', 'paints', 'profile', 'point', 'shape', 'place', 'primitives', 'struct']);

/** Paints every definition may name without a palette slot (section 2.6): ink (the outline colour) and clear (see-through). */
export const FIXED_PAINTS = Object.freeze(['ink', 'clear']);

/** The tones a paint ref may ask of a slot: "gold.light", "gold.dark" ... ("far" is the step darker of far limbs). */
export const TONES = Object.freeze(['light', 'base', 'dark', 'deep', 'far']);

/** Primitive kinds a shape list may hold (docs/data-sprites.md 2.7; the v1 bone kinds first). A generator call ({ gen }) is not one. */
export const PRIMITIVE_KINDS = Object.freeze(['limb', 'capsule', 'ellipse', 'poly', 'dot', 'rect', 'line', 'arc', 'ring', 'stamp', 'dither', 'bands', 'text', 'use', 'outline', 'tint', 'cut']);

/** The fields each primitive kind must carry (others optional); `at` is left to the placing generator inside a `place`. */
export const PRIMITIVE_FIELDS = Object.freeze({
  limb: Object.freeze([]), capsule: Object.freeze([]), ellipse: Object.freeze(['at', 'r']), poly: Object.freeze(['points']),
  dot: Object.freeze(['at']), rect: Object.freeze(['at', 'size']), line: Object.freeze(['from', 'to']),
  arc: Object.freeze(['at', 'r', 'a0', 'a1']), ring: Object.freeze(['at', 'r']), stamp: Object.freeze(['at', 'rows', 'key']),
  dither: Object.freeze(['area']), bands: Object.freeze(['area', 'stops']), text: Object.freeze(['at', 'text']),
  use: Object.freeze(['use', 'v']), outline: Object.freeze([]), tint: Object.freeze([]), cut: Object.freeze(['shape']),
});

/** Primitive kinds a `place` argument may hold: the ones positioned by a single `at` point. */
export const PLACEABLE_KINDS = Object.freeze(['dot', 'rect', 'ellipse', 'arc', 'ring', 'stamp', 'text', 'use']);

/** Where a stamp's `at` sits on its block of pixels: top-left, top-centre, ... bottom-right. */
export const STAMP_ANCHORS = Object.freeze(['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br']);

/** Largest stamp, in pixels each way. */
export const MAX_STAMP = 32;

/** Most primitives a `primitives` argument may hold (the written cap of section 2.7). */
export const MAX_WRITTEN = 400;

/** How deep colour rules may nest (engine/data-rules.js PAINT_DEPTH). */
export const PAINT_DEPTH = 6;

const SLOT = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const CONTROL = /^[a-z][a-zA-Z0-9]{0,39}$/;
const WORD = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const RULE = /^[a-z][a-zA-Z0-9.]{0,39}$/;
const PIECE = /^[a-z]+:[a-z][a-z0-9-]{0,39}$/;
const NUMBERS = new Set(['px', 'share', 'count', 'angle', 'seed']);
const WHOLE = new Set(['count', 'seed']);
const NO_BINDING = new Set(['shape', 'place', 'primitives', 'profile', 'struct']);
const ARG_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 20;

const made = new WeakSet();
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const whole = (v) => fin(v) && Number.isInteger(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => isObj(o) && Object.hasOwn(o, k);
const show = (v) => { try { return typeof v === 'string' ? `"${v.slice(0, 40)}"` : JSON.stringify(v)?.slice(0, 60) ?? String(v); } catch { return typeof v; } };

// ---- plain data -------------------------------------------------------------------------------------------------

/** Errors when v is not plain JSON data: functions, symbols, getters, class instances, prototype keys, cycles, non-finite numbers. */
function jsonErrors(v, path, depth = 0) {
  if (depth > MAX_DEPTH) return [`${path}: nested too deep (at most ${MAX_DEPTH} levels)`];
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return [];
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [`${path}: ${v} is not a finite number`];
  if (typeof v !== 'object') return [`${path}: a ${typeof v} is not data`];
  const proto = Object.getPrototypeOf(v);
  if (Array.isArray(v) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return [`${path}: only plain lists and objects are data`];
  const out = [];
  for (const k of Reflect.ownKeys(v)) {
    if (typeof k === 'symbol') { out.push(`${path}: a symbol key is not data`); continue; }
    if (Array.isArray(v) && k === 'length') continue;
    if (BAD_KEYS.has(k)) { out.push(`${path}: the key "${k}" is not allowed`); continue; }
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (!('value' in d)) { out.push(`${path}.${k}: a getter is not data`); continue; }
    out.push(...jsonErrors(d.value, `${path}.${k}`, depth + 1));
    if (out.length > 20) break;
  }
  return out;
}

/** Errors when v is not plain JSON data (functions, symbols, getters, class instances, the keys __proto__, constructor and prototype, cycles, nesting over 20, non-finite numbers); never runs a getter. Arguments: v, path (prefix of the messages). */
export function plainErrors(v, path = 'value') {
  try {
    return jsonErrors(v, path);
  } catch {
    return [`${path}: could not be read`];
  }
}

// ---- type constructors ------------------------------------------------------------------------------------------

function makeType(type, fields, opt = {}) {
  if (!isObj(opt)) throw new Error(`${type}: the last argument is { default, about }`);
  for (const k of Object.keys(opt)) if (k !== 'default' && k !== 'about') throw new Error(`${type}: unknown option "${k}" (options: default, about${type === 'point' ? ', lo, hi' : ''})`);
  const t = { type, ...fields, optional: Object.hasOwn(opt, 'default') };
  if (t.optional) t.default = opt.default;
  if (opt.about !== undefined) {
    if (typeof opt.about !== 'string' || !opt.about || opt.about.length > 200) throw new Error(`${type}: about is one short line`);
    t.about = opt.about;
  }
  const frozen = Object.freeze(t);
  made.add(frozen);
  if (frozen.optional) {
    const errs = checkArg(frozen, frozen.default, { bindings: false, path: `${type} default` });
    if (errs.length) { made.delete(frozen); throw new Error(`${type}: the default does not fit the type: ${errs.join('; ')}`); }
  }
  return frozen;
}

const range = (name, lo, hi, isWhole) => {
  if (!fin(lo) || !fin(hi)) throw new Error(`${name}: lo and hi are finite numbers`);
  if (isWhole && (!whole(lo) || !whole(hi) || lo < 0)) throw new Error(`${name}: lo and hi are whole numbers, 0 or more`);
  if (!(lo < hi) && !(isWhole && lo === hi)) throw new Error(`${name}: lo must be below hi`);
  if (Math.abs(lo) > 100000 || Math.abs(hi) > 100000) throw new Error(`${name}: lo and hi within 100000`);
};

/** A length or position in pixels, lo to hi (decimals allowed). Arguments: lo, hi, options { default, about }. */
export function px(lo, hi, opt) { range('px', lo, hi); return makeType('px', { lo, hi }, opt); }

/** A share from 0 to 1 (an amount, a phase, a mix). Arguments: options { default, about }. */
export function share(opt) { return makeType('share', { lo: 0, hi: 1 }, opt); }

/** A whole number of things, lo to hi; it bounds the generator's cost. Arguments: lo, hi (whole, 0 or more), options { default, about }. */
export function count(lo, hi, opt) { range('count', lo, hi, true); return makeType('count', { lo, hi }, opt); }

/** An angle in degrees, rig convention (0 down, 90 picture-right, 180 up), -720 to 720. Arguments: options { default, about }. */
export function angle(opt) { return makeType('angle', { lo: -720, hi: 720 }, opt); }

/** A seed, a whole number 0 to 9999: the only source of variety a generator has (through engine/motion.js hash). Arguments: options { default, about }. */
export function seed(opt) { return makeType('seed', { lo: 0, hi: 9999 }, opt); }

/** One word from a fixed list (a style, a cut, a mark's name). Arguments: options (the words: lowercase ids, no repeats), opt { default, about }. */
export function word(options, opt) {
  if (!Array.isArray(options) || !options.length || options.length > 64) throw new Error('word: 1 to 64 options');
  if (options.some((o) => typeof o !== 'string' || !WORD.test(o))) throw new Error('word: each option is a lowercase id');
  if (new Set(options).size !== options.length) throw new Error('word: an option is listed twice');
  return makeType('word', { values: Object.freeze([...options]) }, opt);
}

/** On or off. Arguments: options { default, about }. */
export function flag(opt) { return makeType('flag', {}, opt); }

/** One paint ref: a palette slot, a slot tone, ink, clear or a colour rule; never a hex. Arguments: options { default, about }. */
export function paint(opt) { return makeType('paint', {}, opt); }

/** A list of 1 to n paint refs, hottest or lightest first. Arguments: n (1..16), options { default, about }. */
export function paints(n, opt) {
  if (!whole(n) || n < 1 || n > 16) throw new Error('paints: n is a whole number 1 to 16');
  return makeType('paints', { n }, opt);
}

/** A profile: the name of a number list the layout holds (tile edge dips), or the list itself (1 to 64 numbers, -64..64). Arguments: options { default, about }. */
export function profile(opt) { return makeType('profile', {}, opt); }

/** A point [x, y] in pixels, each coordinate lo to hi (default and at most -MAX_COORD to MAX_COORD); each coordinate also takes a table binding. Arguments: options { lo, hi, default, about }. */
export function point(opt = {}) {
  const { lo = -MAX_COORD, hi = MAX_COORD, ...rest } = isObj(opt) ? opt : {};
  range('point', lo, hi);
  if (lo < -MAX_COORD || hi > MAX_COORD) throw new Error(`point: lo and hi within -${MAX_COORD} to ${MAX_COORD}`);
  return makeType('point', { lo, hi }, isObj(opt) ? rest : opt);
}

/** One primitive of the shape list (a body to dither inside, a shape to cut). Arguments: options { default, about }. */
export function shape(opt) { return makeType('shape', {}, opt); }

/** A thing a generator puts at its own points: a primitive positioned by `at` (PLACEABLE_KINDS), a piece { use, v }, or a generator call { gen, v } with an `at` argument. Arguments: options { default, about }. */
export function place(opt) { return makeType('place', {}, opt); }

/** A list of at most MAX_WRITTEN primitives or generator calls (a decal's drawing). Arguments: options { default, about }. */
export function primitives(opt) { return makeType('primitives', {}, opt); }

/**
 * A small object of typed fields (a ridge's litEdge: { depth, paint }): every field is checked by its own type, unknown
 * fields are refused, optional fields may be left out. Fields may not themselves be structs.
 * Arguments: fields ({ name: type }, 1 to 16), options { default, about }.
 */
export function struct(fields, opt) {
  if (!isObj(fields) || !Object.keys(fields).length || Object.keys(fields).length > 16) throw new Error('struct: 1 to 16 fields { name: type }');
  for (const [k, t] of Object.entries(fields)) {
    if (!ARG_NAME.test(k)) throw new Error(`struct: field name "${k}" is not a camelCase word`);
    if (!made.has(t)) throw new Error(`struct: field "${k}" needs a type from this module`);
    if (t.type === 'struct') throw new Error('struct: a field may not be another struct');
  }
  return makeType('struct', { args: Object.freeze({ ...fields }) }, opt);
}

/** True when t is an argument type made by this module's constructors. */
export const isArgType = (t) => made.has(t);

// ---- refs and bindings ------------------------------------------------------------------------------------------

/** True for a paint ref written as text: a slot ("gold"), a slot tone ("gold.light") or a fixed paint (ink, clear). */
export function isPaintRef(v) {
  if (typeof v !== 'string') return false;
  const [slot, tone, more] = v.split('.');
  if (more !== undefined || !SLOT.test(slot)) return false;
  return tone === undefined || TONES.includes(tone);
}

/** True when v has the shape of a binding: a plain object naming a control in `from`, with a `map` table or a `pick` list. */
export function isBinding(v) {
  return isObj(v) && typeof v.from === 'string' && (Object.hasOwn(v, 'map') || Object.hasOwn(v, 'pick'));
}

function paintErrors(v, path, opts, depth = 0) {
  if (typeof v === 'string') return isPaintRef(v) ? [] : [`${path}: ${show(v)} is not a paint: name a palette slot ("gold"), a tone of one ("gold.light"), ${FIXED_PAINTS.join(', ')}, or a colour rule; never a hex`];
  if (!isObj(v)) return [`${path}: a paint is a slot name or a colour rule { rule, ... }`];
  if (typeof v.rule !== 'string' || !RULE.test(v.rule)) return [`${path}: a colour rule names its rule: { "rule": "tone", ... }`];
  if (opts.colourRules && !opts.colourRules.includes(v.rule)) return [`${path}: no colour rule "${v.rule}" (rules: ${opts.colourRules.join(', ')})`];
  if (depth >= PAINT_DEPTH) return [`${path}: colour rules nest too deep (at most ${PAINT_DEPTH})`];
  const out = [];
  const inner = (x, p) => {
    if (isObj(x) && has(x, 'rule')) out.push(...paintErrors(x, p, opts, depth + 1));
    else if (Array.isArray(x)) x.forEach((y, i) => inner(y, `${p}.${i}`));
  };
  for (const [k, x] of Object.entries(v)) if (k !== 'rule') inner(x, `${path}.${k}`);
  return out;
}

const roundBy = (v, round) => (round === 'px' ? Math.round(v) : round === 'half' ? Math.round(v * 2) / 2 : v);

function bindingErrors(type, b, opts, path) {
  if (opts.bindings === false) return [`${path}: a binding must be resolved to a value before the generator runs`];
  if (NO_BINDING.has(type.type)) return [`${path}: a ${type.type} takes no binding`];
  const out = [];
  if (!CONTROL.test(b.from)) out.push(`${path}.from: ${show(b.from)} is not a control key`);
  else if (opts.controls && !opts.controls.includes(b.from)) out.push(`${path}.from: no control "${b.from}"`);
  if (Object.hasOwn(b, 'map')) {
    for (const k of Object.keys(b)) if (!['from', 'map', 'round'].includes(k)) out.push(`${path}: unknown field "${k}" in a binding (from, map, round)`);
    if (!NUMBERS.has(type.type)) return [...out, `${path}: a ${type.type} takes a pick binding, not a map`];
    const round = b.round ?? 'none';
    if (!['px', 'half', 'none'].includes(round)) out.push(`${path}.round: ${show(round)} is not px, half or none`);
    if (!Array.isArray(b.map) || b.map.length < 2 || b.map.length > 32) return [...out, `${path}.map: a table of 2 points or more (at most 32): [[in, out], ...]`];
    let last = -Infinity;
    for (const [i, pt] of b.map.entries()) {
      if (!Array.isArray(pt) || pt.length !== 2 || !fin(pt[0]) || !fin(pt[1])) { out.push(`${path}.map.${i}: a point is [in, out], two numbers`); continue; }
      if (!(pt[0] > last)) out.push(`${path}.map.${i}: the in values must be ascending`);
      last = pt[0];
      if (WHOLE.has(type.type) && !Number.isInteger(pt[1])) out.push(`${path}.map.${i}: a ${type.type} is a whole number; write whole outputs`);
      else out.push(...valueErrors(type, roundBy(pt[1], round), { ...opts, bindings: false }, `${path}.map.${i}`));
    }
    if (WHOLE.has(type.type) && round !== 'px') out.push(`${path}: a ${type.type} binding needs round: "px" so the values between the points are whole`);
    return out;
  }
  for (const k of Object.keys(b)) if (!['from', 'pick'].includes(k)) out.push(`${path}: unknown field "${k}" in a binding (from, pick)`);
  if (!isObj(b.pick)) return [...out, `${path}.pick: { option: value, ... }`];
  const keys = Object.keys(b.pick);
  if (!keys.length) return [...out, `${path}.pick: empty: list at least one option`];
  if (keys.length > 64) out.push(`${path}.pick: at most 64 options`);
  for (const k of keys.slice(0, 64)) {
    if (k.length > 40) out.push(`${path}.pick: an option name is at most 40 characters`);
    out.push(...valueErrors(type, b.pick[k], { ...opts, bindings: false }, `${path}.pick.${k}`));
  }
  return out;
}

// ---- checking a value -------------------------------------------------------------------------------------------

function numberErrors(type, v, path) {
  if (!fin(v)) return [`${path}: ${show(v)} is not a number`];
  if (WHOLE.has(type.type) && !Number.isInteger(v)) return [`${path}: ${v} must be a whole number`];
  if (v < type.lo) return [`${path}: ${v} is below ${type.lo} (least)`];
  if (v > type.hi) return [`${path}: ${v} is above ${type.hi} (most)`];
  return [];
}

function valueErrors(type, v, opts, path) {
  if (isBinding(v) && type.type !== 'place' && type.type !== 'shape') return bindingErrors(type, v, opts, path);
  switch (type.type) {
    case 'px': case 'share': case 'count': case 'angle': case 'seed': return numberErrors(type, v, path);
    case 'word': return typeof v === 'string' && type.values.includes(v) ? [] : [`${path}: ${show(v)} is not one of ${type.values.join(', ')}`];
    case 'flag': return typeof v === 'boolean' ? [] : [`${path}: ${show(v)} is not true or false`];
    case 'paint': return paintErrors(v, path, opts);
    case 'paints': {
      if (!Array.isArray(v)) return [`${path}: a list of paints`];
      if (!v.length) return [`${path}: at least one paint`];
      if (v.length > type.n) return [`${path}: at most ${type.n} paints`];
      return v.flatMap((p, i) => (isBinding(p) ? bindingErrors(paint(), p, opts, `${path}.${i}`) : paintErrors(p, `${path}.${i}`, opts)));
    }
    case 'profile': {
      if (typeof v === 'string') return SLOT.test(v) ? [] : [`${path}: ${show(v)} is not a profile name`];
      if (!Array.isArray(v) || !v.length || v.length > 64) return [`${path}: a profile is a name or a list of 1 to 64 numbers`];
      return v.some((x) => !fin(x) || Math.abs(x) > 64) ? [`${path}: profile numbers are between -64 and 64`] : [];
    }
    case 'point': {
      if (!Array.isArray(v) || v.length !== 2) return [`${path}: a point is [x, y]`];
      const coord = px(type.lo, type.hi);
      return v.flatMap((c, i) => (isBinding(c) ? bindingErrors(coord, c, opts, `${path}.${i}`) : numberErrors(coord, c, `${path}.${i}`)));
    }
    case 'shape': return checkPrimitive(v, { ...opts, path });
    case 'struct': {
      if (!isObj(v)) return [`${path}: an object { ${Object.keys(type.args).join(', ')} }`];
      const out = [];
      for (const k of Object.keys(v)) if (!Object.hasOwn(type.args, k)) out.push(`${path}: unknown field "${k}" (fields: ${Object.keys(type.args).join(', ')})`);
      for (const [k, t] of Object.entries(type.args)) {
        if (!Object.hasOwn(v, k)) { if (!t.optional) out.push(`${path}.${k}: missing`); continue; }
        out.push(...valueErrors(t, v[k], opts, `${path}.${k}`));
      }
      return out;
    }
    case 'place': return placeErrors(v, opts, path);
    case 'primitives': {
      if (!Array.isArray(v)) return [`${path}: a list of primitives`];
      if (v.length > MAX_WRITTEN) return [`${path}: at most ${MAX_WRITTEN} primitives`];
      return v.flatMap((p, i) => (has(p, 'gen') ? callErrors(p, opts, `${path}.${i}`, false) : checkPrimitive(p, { ...opts, path: `${path}.${i}` })));
    }
    default: return [`${path}: unknown type`];
  }
}

function callErrors(v, opts, path, placed) {
  if (typeof v.gen !== 'string') return [`${path}.gen: the generator's name`];
  if (!whole(v.v) || v.v < 1) return [`${path}: say which version of "${v.gen}": v`];
  return opts.checkCall ? opts.checkCall(v, path, { placed }) : [];
}

function placeErrors(v, opts, path) {
  if (!isObj(v)) return [`${path}: a place is a primitive, a piece { use, v } or a generator call { gen, v }`];
  if (has(v, 'gen')) return callErrors(v, opts, path, true);
  if (has(v, 'use') && !has(v, 'kind')) {
    if (typeof v.use !== 'string' || !PIECE.test(v.use)) return [`${path}.use: ${show(v.use)} is not a piece name ("stamp:clod")`];
    if (!whole(v.v) || v.v < 1) return [`${path}: say which version of "${v.use}": v`];
    // a piece placed is a `use` primitive the generator gives a point: its paint map, args and fields checked as one
    return primitiveErrors({ kind: 'use', ...v }, { ...opts, placed: true }, path, 0);
  }
  const errs = checkPrimitive(v, { ...opts, path, placed: true });
  if (!errs.length && !PLACEABLE_KINDS.includes(v.kind)) return [`${path}: a ${v.kind} has no single "at" to place it by (${PLACEABLE_KINDS.join(', ')} have)`];
  return errs;
}

/**
 * Checks one argument value against its type: returns a list of error strings, empty when it fits. Never throws.
 * Arguments: type (from a constructor above); value; opts { bindings (default true: bindings allowed, as the validator
 * sees a definition; false: a value as a generator receives it), controls (control keys a binding may name),
 * colourRules (rule names a colour rule may name), path (prefix of the messages), checkCall(node, path, { placed })
 * (checks a nested generator call; the registry passes one) }.
 */
export function checkArg(type, value, opts = {}) {
  const path = opts.path ?? type?.type ?? 'argument';
  if (!made.has(type)) return [`${path}: not an argument type`];
  try {
    if (value === undefined) return [`${path}: missing`];
    const plain = jsonErrors(value, path);
    if (plain.length) return plain;
    return valueErrors(type, value, opts, path);
  } catch {
    return [`${path}: could not be read`];
  }
}

// ---- fields and primitives ------------------------------------------------------------------------------------------

/** Ids a definition gives things (a shape's id, a group, a part, the node named by `on`, a bone): a lowercase letter, then letters, digits or dashes, at most 40 (as catalog/studio-schema.js ID_PATTERN). */
export const ID_PATTERN = /^[a-z][a-zA-Z0-9-]{0,39}$/;

/** Caps of section 2.7 the shape-list check holds: text characters, polygon points, stamp pixels in one list, a stroke's thickness, `alt` shapes of a stamp. */
export const SHAPE_CAPS = Object.freeze({ text: 40, polyPoints: 64, stampPixels: 8192, thick: 64, alt: 16 });

/** The fields each primitive kind may carry besides COMMON_FIELDS (a field not listed is refused). */
export const KIND_FIELDS = Object.freeze({
  limb: Object.freeze(['from', 'to', 'width']), capsule: Object.freeze(['from', 'to', 'r', 'offset']), ellipse: Object.freeze(['at', 'r', 'turn']),
  poly: Object.freeze(['points']), dot: Object.freeze(['at', 'size']), rect: Object.freeze(['at', 'size']),
  line: Object.freeze(['from', 'to', 'thick']), arc: Object.freeze(['at', 'r', 'a0', 'a1', 'thick']), ring: Object.freeze(['at', 'r', 'thick']),
  stamp: Object.freeze(['at', 'anchor', 'rows', 'key', 'variants', 'variant', 'mirror', 'alt', 'detail']),
  dither: Object.freeze(['area', 'pattern', 'amount']), bands: Object.freeze(['area', 'dir', 'stops', 'edges']),
  text: Object.freeze(['font', 'size', 'cap', 'text', 'at', 'align', 'outline']), use: Object.freeze(['use', 'v', 'at', 'args']),
  outline: Object.freeze(['only', 'sides']), tint: Object.freeze(['only']), cut: Object.freeze(['shape', 'from']),
});

/** Fields any primitive may carry (section 2.7 and engine/draw-list.js): paint, z, group, glow, hidden, id, shade, light, far, on, when, part, bone. */
export const COMMON_FIELDS = Object.freeze(['paint', 'z', 'group', 'glow', 'hidden', 'id', 'shade', 'light', 'far', 'on', 'when', 'part', 'bone']);

const OUT = px(-MAX_OUT_COORD, MAX_OUT_COORD);
const RADIUS = px(0, MAX_OUT_COORD);
const SIDE = px(0, MAX_OUT_COORD);
const THICK = px(0, SHAPE_CAPS.thick);
const WIDTH = count(1, SHAPE_CAPS.thick);
const DOT_SIZE = count(1, 2);
const Z = px(-100, 100);
const SHADE = px(0, 3);
const LIGHT = px(0, 2);
const SHARE = share();
const ANGLE = angle();
const FLAG = flag();
const PAINT = paint();
const CLIP_NAME = /^[a-z][a-zA-Z0-9_-]{0,39}$/;
const FONT = /^(?:font:[a-z][a-z0-9-]{0,39}@[1-9][0-9]{0,2}|[a-z][a-z0-9-]{0,39})$/;
const TEXT_CHARS = /^[\x20-\x7e]*$/;
const AREA_KINDS = ['limb', 'capsule', 'ellipse', 'poly', 'rect', 'ring', 'arc'];

const num = (type, v, q, o) => (isBinding(v) ? bindingErrors(type, v, o, q) : numberErrors(type, v, q));
const oneOf = (list) => (v, q) => (list.includes(v) ? [] : [`${q}: ${show(v)} is not one of ${list.join(', ')}`]);
const idErr = (v, q) => (typeof v === 'string' && ID_PATTERN.test(v) ? [] : [`${q}: ${show(v)} is not an id (a lowercase word, at most 40 characters)`]);
const boolErr = (v, q, o) => (isBinding(v) ? bindingErrors(FLAG, v, o, q) : typeof v === 'boolean' ? [] : [`${q}: ${show(v)} is not true or false`]);
const paintRef = (v, q, o) => (isBinding(v) ? bindingErrors(PAINT, v, o, q) : paintErrors(v, q, o));
const pointErr = (v, q, o) => {
  if (!Array.isArray(v) || v.length !== 2) return [`${q}: a point is [x, y]`];
  return v.flatMap((c, i) => num(OUT, c, `${q}.${i}`, o));
};
const radiusErr = (pair) => (v, q, o) => {
  if (!Array.isArray(v)) return num(RADIUS, v, q, o);
  if (!pair || v.length !== 2) return [`${q}: ${pair ? 'a radius or [rx, ry]' : 'a radius'}`];
  return v.flatMap((c, i) => num(RADIUS, c, `${q}.${i}`, o));
};

function whenErrors(w, q, o) {
  const list = Array.isArray(w) ? w : [w];
  if (!list.length || list.length > 8) return [`${q}: when is { control: [values] } or a list of 1 to 8 of them`];
  const out = [];
  for (const [i, c] of list.entries()) {
    const p = Array.isArray(w) ? `${q}.${i}` : q;
    if (!isObj(c) || !Object.keys(c).length || Object.keys(c).length > 16) { out.push(`${p}: when is { control: [values] } (1 to 16 controls)`); continue; }
    for (const [k, vals] of Object.entries(c)) {
      if (!CONTROL.test(k)) { out.push(`${p}: ${show(k)} is not a control key`); continue; }
      if (o.controls && k !== 'clip' && k !== 'direction' && !o.controls.includes(k)) out.push(`${p}.${k}: no control "${k}"`);
      if (!Array.isArray(vals) || !vals.length || vals.length > 64) { out.push(`${p}.${k}: a list of 1 to 64 values`); continue; }
      if (vals.some((x) => !(typeof x === 'boolean' || fin(x) || (typeof x === 'string' && x.length <= 40)))) out.push(`${p}.${k}: each value is a word (at most 40 characters), a number, true or false`);
    }
  }
  return out;
}

const clipErr = (v, q) => (Array.isArray(v) && v.length >= 1 && v.length <= 16 && v.every((c) => typeof c === 'string' && CLIP_NAME.test(c)) ? [] : [`${q}: a list of 1 to 16 clip names`]);

const FIELD_CHECKS = {
  z: (v, q, o) => num(Z, v, q, o), shade: (v, q, o) => num(SHADE, v, q, o), light: (v, q, o) => num(LIGHT, v, q, o),
  group: idErr, part: idErr, id: idErr, on: idErr, bone: idErr,
  glow: boolErr, hidden: boolErr, far: boolErr, when: whenErrors, clip: clipErr,
};

/**
 * Checks one field that primitives and generator calls may carry: z (-100..100), shade (0..3), light (0..2), group,
 * part, id, on, bone (ids), glow, hidden, far (true or false), when (Contract 3) and clip (clip names, calls only).
 * Numbers and flags take bindings unless opts.bindings is false. Returns error strings, empty when it fits; never throws.
 * Arguments: name; value; opts { path, bindings, controls }.
 */
export function checkField(name, value, opts = {}) {
  const path = opts.path ?? name;
  if (!Object.hasOwn(FIELD_CHECKS, name)) return [`${path}: not a field primitives and calls carry`];
  try {
    const plain = jsonErrors(value, path);
    return plain.length ? plain : FIELD_CHECKS[name](value, path, opts);
  } catch {
    return [`${path}: could not be read`];
  }
}

function polyErr(v, q, o) {
  if (!Array.isArray(v) || v.length < 3) return [`${q}: a poly needs points: [[x, y], ...], at least 3`];
  if (v.length > SHAPE_CAPS.polyPoints) return [`${q}: at most ${SHAPE_CAPS.polyPoints} points`];
  return v.flatMap((p, i) => pointErr(p, `${q}.${i}`, o)).slice(0, 20);
}

function textErr(v, q) {
  if (typeof v !== 'string') return [`${q}: text is a string`];
  if (v.length > SHAPE_CAPS.text) return [`${q}: at most ${SHAPE_CAPS.text} characters`];
  return TEXT_CHARS.test(v) ? [] : [`${q}: text uses printable characters only (letters, digits, space, punctuation)`];
}

function paintMapErr(v, q, o) {
  if (!isObj(v)) return [`${q}: a piece's paint is a map { slot: paint }`];
  const keys = Object.keys(v);
  if (!keys.length || keys.length > 24) return [`${q}: 1 to 24 slots`];
  return keys.flatMap((k) => (SLOT.test(k) ? paintRef(v[k], `${q}.${k}`, o) : [`${q}: ${show(k)} is not a slot name`]));
}

function pieceArgsErr(v, q, o) {
  if (!isObj(v)) return [`${q}: a piece's args are { name: value }`];
  if (Object.keys(v).length > 16) return [`${q}: at most 16 args`];
  const out = [];
  for (const [k, x] of Object.entries(v)) {
    if (!ARG_NAME.test(k)) { out.push(`${q}: ${show(k)} is not an argument name`); continue; }
    if (isBinding(x)) { if (o.bindings === false) out.push(`${q}.${k}: a binding must be resolved to a value before the piece is drawn`); continue; }
    const scalar = (y) => typeof y === 'boolean' || fin(y) || (typeof y === 'string' && y.length <= 40);
    if (!(scalar(x) || (Array.isArray(x) && x.length <= 64 && x.every(fin)))) out.push(`${q}.${k}: a word, a number, true or false, or a list of at most 64 numbers`);
  }
  return out;
}

function areaErr(v, q, o, depth) {
  if (!isObj(v) || !AREA_KINDS.includes(v.kind)) return [`${q}: an area is a shape (${AREA_KINDS.join(', ')})`];
  return primitiveErrors(v, { ...o, placed: false }, q, depth + 1);
}

function altErr(v, q, o, depth) {
  if (depth > 0) return [`${q}: an alt shape has no alt of its own`];
  if (!isObj(v) || !Object.keys(v).length || Object.keys(v).length > 4) return [`${q}: { style: [shapes] }, 1 to 4 styles`];
  const out = [];
  for (const [k, list] of Object.entries(v)) {
    if (!ID_PATTERN.test(k)) out.push(`${q}: ${show(k)} is not a style name`);
    else if (!Array.isArray(list) || list.length > SHAPE_CAPS.alt) out.push(`${q}.${k}: a list of at most ${SHAPE_CAPS.alt} shapes`);
    else list.forEach((s, i) => out.push(...primitiveErrors(s, { ...o, placed: false }, `${q}.${k}.${i}`, depth + 1)));
  }
  return out;
}

// Per-kind checks of the fields KIND_FIELDS lists (rows and key of a stamp are checked together by stampErrors).
const KIND_CHECKS = {
  limb: { from: pointErr, to: pointErr, width: (v, q, o) => num(WIDTH, v, q, o) },
  capsule: { from: pointErr, to: pointErr, r: radiusErr(true), offset: (v, q, o) => num(OUT, v, q, o) },
  ellipse: { at: pointErr, r: radiusErr(true), turn: (v, q, o) => num(ANGLE, v, q, o) },
  poly: { points: polyErr },
  dot: { at: pointErr, size: (v, q, o) => num(DOT_SIZE, v, q, o) },
  rect: { at: pointErr, size: (v, q, o) => (Array.isArray(v) && v.length === 2 ? v.flatMap((c, i) => num(SIDE, c, `${q}.${i}`, o)) : [`${q}: a size is [w, h]`]) },
  line: { from: pointErr, to: pointErr, thick: (v, q, o) => num(THICK, v, q, o) },
  arc: { at: pointErr, r: radiusErr(false), a0: (v, q, o) => num(ANGLE, v, q, o), a1: (v, q, o) => num(ANGLE, v, q, o), thick: (v, q, o) => num(THICK, v, q, o) },
  ring: { at: pointErr, r: radiusErr(false), thick: (v, q, o) => num(THICK, v, q, o) },
  stamp: {
    at: pointErr, variant: idErr, detail: boolErr, alt: altErr,
    mirror: (v, q, o) => (v === 'x' ? [] : boolErr(v, q, o).length ? [`${q}: true, false or "x"`] : []),
  },
  dither: { pattern: oneOf(['checker', 'bayer2', 'bayer4', 'lines-h', 'lines-v']), amount: (v, q, o) => num(SHARE, v, q, o), area: areaErr },
  bands: {
    area: areaErr, dir: oneOf(['down', 'up', 'in', 'out']), edges: oneOf(['hard', 'dither']),
    stops: (v, q, o) => (Array.isArray(v) && v.length >= 1 && v.length <= 16 ? v.flatMap((x, i) => paintRef(x, `${q}.${i}`, o)) : [`${q}: a list of 1 to 16 paints`]),
  },
  text: {
    at: pointErr, text: textErr, size: (v, q, o) => num(SHARE, v, q, o), cap: oneOf([5, 7, 9]), align: oneOf(['left', 'centre', 'right']),
    font: (v, q) => (typeof v === 'string' && FONT.test(v) ? [] : [`${q}: ${show(v)} is not a font ("font:chunky@1" or a style name)`]),
    outline: (v, q, o) => (v === 'none' ? [] : paintRef(v, q, o)),
  },
  use: {
    at: pointErr, args: pieceArgsErr,
    use: (v, q) => (typeof v === 'string' && PIECE.test(v) ? [] : [`${q}: ${show(v)} is not a piece name ("stamp:clod")`]),
    v: (v, q) => (whole(v) && v >= 1 && v <= 999 ? [] : [`${q}: a piece version, 1 to 999`]),
  },
  outline: { only: idErr, sides: oneOf(['outer', 'all']) },
  tint: { only: idErr },
  cut: { shape: areaErr, from: idErr },
};

function primitiveErrors(p, opts, path, depth) {
  if (!isObj(p)) return [`${path}: a primitive is an object { kind, ... }`];
  if (has(p, 'gen')) return [`${path}: a generator call is not a primitive here`];
  if (typeof p.kind !== 'string' || !PRIMITIVE_KINDS.includes(p.kind)) return [`${path}: unknown kind ${show(p.kind)} (kinds: ${PRIMITIVE_KINDS.join(', ')})`];
  const out = [];
  for (const f of PRIMITIVE_FIELDS[p.kind]) if (!has(p, f) && !(f === 'at' && opts.placed)) out.push(`${path}: a ${p.kind} needs "${f}"`);
  const own = KIND_FIELDS[p.kind], checks = KIND_CHECKS[p.kind];
  for (const k of Object.keys(p)) {
    if (k === 'kind') continue;
    const q = `${path}.${k}`;
    if (!own.includes(k) && !COMMON_FIELDS.includes(k)) { out.push(`${path}: a ${p.kind} has no field "${k.slice(0, 40)}" (fields: ${[...own, ...COMMON_FIELDS].join(', ')})`); continue; }
    if (k === 'paint') out.push(...(p.kind === 'use' ? paintMapErr(p.paint, q, opts) : paintRef(p.paint, q, opts)));
    else if (Object.hasOwn(checks, k)) out.push(...checks[k](p[k], q, opts, depth));
    else if (Object.hasOwn(FIELD_CHECKS, k)) out.push(...FIELD_CHECKS[k](p[k], q, opts));
    if (out.length > 20) break;
  }
  if (p.kind === 'stamp') out.push(...stampErrors(p, path, opts));
  return out;
}

/**
 * Checks one primitive of a shape list (see THE SHAPE-LIST TYPE above): returns error strings, empty when it fits.
 * Plain data, the kind, its required fields, no field its kind does not take (KIND_FIELDS, COMMON_FIELDS), and every
 * field by type and cap: paints, points, radii, sizes, angles, polygon points (64), text (40 printable characters),
 * stamps (32 x 32), areas, ids, when. Stamp pixels in all (8,192) are a list's cap: stampPixels.
 * Arguments: p; opts { path, bindings (false: every number already resolved), placed (true: `at` may be left out), colourRules, controls }.
 */
export function checkPrimitive(p, opts = {}) {
  const path = opts.path ?? 'primitive';
  try {
    const plain = jsonErrors(p, path);
    if (plain.length) return plain;
    return primitiveErrors(p, opts, path, 0);
  } catch {
    return [`${path}: could not be read`];
  }
}

/** How many stamp pixels a list of primitives holds (each stamp's rows, width times height); section 2.7 caps a frame at SHAPE_CAPS.stampPixels. */
export function stampPixels(list) {
  let n = 0;
  for (const p of Array.isArray(list) ? list : []) if (isObj(p) && p.kind === 'stamp' && Array.isArray(p.rows) && typeof p.rows[0] === 'string') n += p.rows.length * p.rows[0].length;
  return n;
}

function rowsErrors(rows, key, path, size) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_STAMP) return [`${path}: 1 to ${MAX_STAMP} rows of text`];
  if (rows.some((r) => typeof r !== 'string' || !r.length || r.length > MAX_STAMP)) return [`${path}: each row is 1 to ${MAX_STAMP} characters`];
  const w = rows[0].length;
  if (rows.some((r) => r.length !== w)) return [`${path}: every row is as long as the first`];
  if (size && (rows.length !== size[1] || w !== size[0])) return [`${path}: a variant is the same size as the stamp`];
  const out = [];
  for (const ch of new Set(rows.join(''))) if (ch !== '.' && ch !== ' ' && !(isObj(key) && Object.hasOwn(key, ch))) out.push(`${path}: "${ch}" has no paint in the key`);
  return out;
}

function stampErrors(p, path, opts) {
  const out = [];
  if (!isObj(p.key)) return [`${path}.key: { character: paint }`];
  if (Object.keys(p.key).length > 32) return [`${path}.key: at most 32 characters`];
  for (const [ch, v] of Object.entries(p.key)) {
    if (ch.length !== 1 || ch === '.' || ch === ' ') out.push(`${path}.key: "${ch.slice(0, 8)}" is not one character (other than . and space)`);
    out.push(...paintRef(v, `${path}.key.${ch.slice(0, 8)}`, opts));
  }
  out.push(...rowsErrors(p.rows, p.key, `${path}.rows`));
  if (has(p, 'anchor') && !STAMP_ANCHORS.includes(p.anchor)) out.push(`${path}.anchor: ${show(p.anchor)} is not one of ${STAMP_ANCHORS.join(', ')}`);
  if (has(p, 'variants')) {
    if (!isObj(p.variants) || Object.keys(p.variants).length > 16) out.push(`${path}.variants: { name: rows }, at most 16`);
    else if (!out.length) {
      for (const [name, rows] of Object.entries(p.variants)) {
        if (!ID_PATTERN.test(name)) out.push(`${path}.variants: ${show(name)} is not a variant name`);
        else out.push(...rowsErrors(rows, p.key, `${path}.variants.${name}`, [p.rows[0].length, p.rows.length]));
      }
    }
  }
  return out;
}

// ---- describing ---------------------------------------------------------------------------------------------------

/** A type as plain JSON for generated/generators.json and the docs: { type, lo?, hi?, options?, n?, default?, optional, binding, about? }. */
export function describeArg(type) {
  if (!made.has(type)) return null;
  const d = { type: type.type };
  if (NUMBERS.has(type.type) || type.type === 'point') { d.lo = type.lo; d.hi = type.hi; }
  if (type.values) d.values = [...type.values];
  if (type.args) d.args = Object.fromEntries(Object.entries(type.args).map(([k, t]) => [k, describeArg(t)]));
  if (type.n !== undefined) d.n = type.n;
  if (type.optional) d.default = JSON.parse(JSON.stringify(type.default));
  d.optional = type.optional;
  d.binding = !NO_BINDING.has(type.type);
  if (type.about) d.about = type.about;
  return d;
}

/** Values at a type's limits that pass and values just outside it that fail: { valid, invalid }. For the goldens harness's fuzz and tools/gen.mjs sheets. */
export function typeSamples(type) {
  const t = type;
  switch (t.type) {
    case 'px': case 'share': case 'angle': return { valid: [t.lo, t.hi, (t.lo + t.hi) / 2], invalid: [t.lo - 0.01, t.hi + 0.01, NaN, '1', null] };
    case 'count': case 'seed': return { valid: [t.lo, t.hi], invalid: [t.lo - 1, t.hi + 1, t.lo + 0.5, null] };
    case 'word': return { valid: [...t.values], invalid: ['not-an-option', 3, ''] };
    case 'flag': return { valid: [true, false], invalid: [1, 'true', null] };
    case 'paint': return { valid: ['ink', 'clear', 'slot.light'], invalid: ['#ffffff', 'Gold', 7] };
    case 'paints': return { valid: [['ink'], Array(t.n).fill('slot')], invalid: [[], Array(t.n + 1).fill('ink'), 'ink'] };
    case 'profile': return { valid: ['dips', [0, 1]], invalid: ['', [], 'Not a name'] };
    case 'point': return { valid: [[t.lo, t.lo], [t.hi, t.hi], [t.lo, t.hi]], invalid: [[t.lo], [NaN, t.lo], [t.hi + 1, t.lo]] };
    case 'struct': {
      const entries = Object.entries(t.args);
      const need = Object.fromEntries(entries.filter(([, f]) => !f.optional).map(([k, f]) => [k, typeSamples(f).valid[0]]));
      const all = Object.fromEntries(entries.map(([k, f]) => [k, typeSamples(f).valid[0]]));
      return { valid: [need, all], invalid: ['x', { ...all, notAField: 1 }, null] };
    }
    case 'shape': return { valid: [{ kind: 'dot', at: [0, 0], paint: 'ink' }, { kind: 'rect', at: [0, 0], size: [2, 2], paint: 'ink' }], invalid: [{ kind: 'blob' }, {}] };
    case 'place': return { valid: [{ kind: 'dot', paint: 'ink' }, { kind: 'stamp', rows: ['a'], key: { a: 'ink' } }], invalid: ['x', { kind: 'blob' }, { gen: 'x' }] };
    case 'primitives': return { valid: [[], [{ kind: 'outline', paint: 'ink' }]], invalid: ['x', [{ kind: 'blob' }]] };
    default: return { valid: [], invalid: [] };
  }
}
