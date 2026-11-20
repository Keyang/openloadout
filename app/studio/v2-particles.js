// The particle editor's model (build item B19a; docs/data-sprites.md sections 2.5c, 6 and 9 row B19; Contract 15
// rules 1 to 3 and 6): pure reads and changes of the emitters of a `loadout-sprite` version 2 definition, for the
// studio's particle editor (app/studio/v2-particles-pane.js) and anyone driving it. An effect's body is `emitters`
// ({ emitters, nodes?, draw? }); a picture (a prop, a pickup, a projectile) may have `body.pictures.emitters` too.
//   - each emitter: its behaviour (a generator of family fx from the registry: a shared behaviour, or an effect port
//     `effect.<id>`, which draws an old code sprite whole and so has only its sliders to change), the clips it draws
//     in, and its price, worked out exactly as catalog/sprite-schema.js prices it (the generator's cost at its worst
//     arguments: a table at its largest value), beside the definition's total against the 4,000-primitive budget;
//   - its keys over a clip (`clips.<name>.keys[i].emit.<id>`: amount 0..1, at, and only the arguments its behaviour
//     lists as keyable; a size argument (engine/gen/index.js SIZE_KEYS) held at or below what the emitter itself sets,
//     B12b), each key put on a frame at the renderer's exact phase (rigs/keypose.js framePhase: no rounded 0.857143);
//     the amount each frame draws, blended as engine/gen/emit-keys.js reads it (an emitter some key gives an amount
//     is off wherever its blended amount is 0; one no key gives an amount always draws);
//   - its spawn point (`at`, put on its node when it has `on`), how far it reaches and its box (`area`), in frame
//     pixels for the stage, and moving them by whole pixels: a point the clip's keys move is moved in the key at the
//     frame in hand (or a key is made there); a point or a box a control sets is not moved;
//   - a new emitter from the registry, a behaviour swapped for another (id, place, clips and the keys that still fit kept);
//   - the validator's messages matched to the card ("Emitter "id": ...") and the key ("Clip "hit", key 2: emit "id" ...")
//     they are about, and those about the budget and the frame's stamp pixels (shown at the meter).
// Every change gives a new definition (never in place) or null when it cannot be made. No DOM: browser and Node.
import { SPRITE_LIMITS } from '../../catalog/sprite-schema.js';
import { generator, SIZE_KEYS } from '../../engine/gen/index.js';
import { nodeFrame, placeOn } from '../../engine/draw-list.js';
import { clipPose, framePhase } from '../../rigs/keypose.js';
import { getAt, setAt, paintRefs, nodesOf, itemIds, uniqueId } from './v2-model.js';
import { generatorsFor, generatorDoc, newCall } from './v2-gen.js';
import { checkFull } from './v2-check.js';

/** The budget a frame's primitives are held to after the generators run (catalog/sprite-schema.js SPRITE_LIMITS.expanded: 4,000). */
export const PARTICLE_BUDGET = SPRITE_LIMITS.expanded;

/** The fields of an emitter that are not its behaviour's arguments (engine/gen/registry.js CALL_FIELDS). */
const CALL_FIELDS = ['gen', 'v', 'id', 'on', 'z', 'when', 'group', 'hidden', 'glow', 'part', 'clip'];
/** Argument names that say how far an emitter reaches, in the order the stage looks for one. */
const REACH_ARGS = ['dist', 'r1', 'r', 'reach', 'length'];
const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
const SAME_T = 1e-9;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isBinding = (v) => isObj(v) && typeof v.from === 'string';
const safeName = (s) => typeof s === 'string' && s.length > 0 && !PROTO.has(s);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The emitter lists a definition has: [{ path, label, word }] (an effect's `body.emitters`, a picture's `body.pictures.emitters`). Arguments: def. */
export function emitterLists(def) {
  if (!isObj(def) || !isObj(def.body)) return [];
  if (Object.hasOwn(def.body, 'emitters')) return [{ path: ['body', 'emitters'], label: 'Emitters', word: 'Emitter' }];
  if (isObj(def.body.pictures)) return [{ path: ['body', 'pictures', 'emitters'], label: 'Bursts and sparks', word: 'Emitter' }];
  return [];
}

/**
 * Every emitter of a definition, in list order: { path, index, list (the list's path), id (or null), gen, v, key
 * ('particles@1'), doc (the registry's documentation, or null), port (an effect port: one opaque generator), clip (the
 * clips it is kept to, or null), on (its node, or null), call (the emitter as written) }. Arguments: def.
 */
export function emittersOf(def) {
  const out = [];
  for (const l of emitterLists(def)) {
    const list = getAt(def, l.path);
    if (!Array.isArray(list)) continue;
    list.forEach((e, index) => {
      if (!isObj(e)) return;
      const gen = typeof e.gen === 'string' ? e.gen : null;
      const v = Number.isInteger(e.v) ? e.v : null;
      out.push({ path: [...l.path, index], index, list: l.path, id: typeof e.id === 'string' ? e.id : null, gen, v, key: gen ? `${gen}@${v ?? '?'}` : null,
        doc: gen && v !== null ? generatorDoc(gen, v) : null, port: !!gen && gen.startsWith('effect.'), clip: Array.isArray(e.clip) ? e.clip.filter((c) => typeof c === 'string') : null,
        on: typeof e.on === 'string' ? e.on : null, call: e });
    });
  }
  return out;
}

/** Does the emitter draw in a clip (no `clip` list, or the list names it)? Its `when` is not read. Arguments: emitter (from emittersOf, or the call), clip. */
export function inClip(e, clip) {
  const list = Array.isArray(e?.clip) ? e.clip : null;
  return !list || list.includes(clip);
}

/** The behaviours an emitter may name: { shared (the behaviours, newest version of each), ports (the effect ports) }, each { id, v, key, family, about, args, keyable }. */
export function behaviours() {
  const seen = new Set();
  const newest = generatorsFor('emitter').filter((g) => (seen.has(g.id) ? false : seen.add(g.id)));
  return { shared: newest.filter((g) => !g.id.startsWith('effect.')), ports: newest.filter((g) => g.id.startsWith('effect.')) };
}

// ---- controls and bindings: the value a setting has at the controls tried on the page ----------------------------

/** The controls by key: { kind, min, max, default, options }. */
function controlTable(def) {
  const t = new Map();
  for (const c of Array.isArray(def?.controls) ? def.controls : []) {
    if (!isObj(c) || typeof c.key !== 'string' || c.standard) continue;
    const kind = c.kind === 'slider' ? 'range' : c.kind;
    t.set(c.key, { kind, min: fin(c.min) ? c.min : 0, max: fin(c.max) ? c.max : 1, default: c.default, options: c.options });
  }
  return t;
}

/** A control's value: the one tried (params), else its default, else its low end. */
function controlValue(table, key, params) {
  const c = table.get(key);
  if (params && Object.hasOwn(params, key)) return params[key];
  if (!c) return undefined;
  if (c.default !== undefined) return c.default;
  if (c.kind === 'range') return c.min;
  if (c.kind === 'toggle') return false;
  return Array.isArray(c.options) ? (isObj(c.options[0]) ? c.options[0].value : c.options[0]) : undefined;
}

const rounded = (b, x) => (b.round === 'px' ? Math.round(x) : b.round === 'half' ? Math.round(x * 2) / 2 : x);

/** A value with every binding in it worked out at the controls (a table read piecewise, a pick by the option), as the renderer reads it. */
function worked(v, table, params, depth = 0) {
  if (depth > 12) return v;
  if (isBinding(v)) {
    const x = controlValue(table, v.from, params);
    if (Array.isArray(v.map) && v.map.length && v.map.every((p) => Array.isArray(p) && fin(p[0]) && fin(p[1]))) {
      const m = v.map;
      const n = fin(x) ? x : m[0][0];
      if (n <= m[0][0]) return rounded(v, m[0][1]);
      for (let i = 1; i < m.length; i++) if (n <= m[i][0]) { const [a, b] = m[i - 1], [c, d] = m[i]; return rounded(v, b + ((n - a) / (c - a || 1)) * (d - b)); }
      return rounded(v, m[m.length - 1][1]);
    }
    if (isObj(v.pick)) return worked(v.pick[String(x)], table, params, depth + 1);
    return x;
  }
  if (Array.isArray(v)) return v.map((y) => worked(y, table, params, depth + 1));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, worked(y, table, params, depth + 1)]));
  return v;
}

/** A value with every binding at the largest number it can give (catalog/sprite-schema.js boundWorst): what the price reads. */
function worstOf(v, table, depth = 0) {
  if (depth > 12) return v;
  if (isBinding(v)) {
    if (Array.isArray(v.map)) { const outs = v.map.filter((p) => Array.isArray(p) && fin(p[1])).map((p) => rounded(v, p[1])); return outs.length ? Math.max(...outs) : 0; }
    if (isObj(v.pick)) { const nums = Object.values(v.pick).filter(fin); return nums.length ? Math.max(...nums) : v; }
    const c = table.get(v.from);
    return c?.kind === 'range' ? c.max : v;
  }
  if (Array.isArray(v)) return v.map((y) => worstOf(y, table, depth + 1));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, worstOf(y, table, depth + 1)]));
  return v;
}

/** An emitter's arguments at their worst: those it gives at their largest, the optional ones it leaves out at their defaults. */
function worstArgs(def, call, doc) {
  const table = controlTable(def);
  const out = {};
  for (const [name, type] of Object.entries(doc.args ?? {})) {
    if (Object.hasOwn(call, name)) out[name] = worstOf(call[name], table);
    else if (type.default !== undefined) out[name] = clone(type.default);
  }
  return out;
}

// ---- the price ---------------------------------------------------------------------------------------------------

/** One emitter's price in primitives a frame, as the validator charges it (its generator's cost at its worst arguments), or null when it cannot be read. Arguments: def, path. */
export function emitterCost(def, path) {
  const e = getAt(def, path);
  if (!isObj(e) || typeof e.gen !== 'string') return null;
  let entry = null;
  try { entry = generator(e.gen, e.v); } catch { entry = null; }
  const doc = generatorDoc(e.gen, e.v);
  if (!entry || typeof entry.cost !== 'function' || !doc) return null;
  try {
    const c = entry.cost(Object.freeze(worstArgs(def, e, doc)), { costOf: () => 1 });
    return fin(c) && c >= 0 ? c : null;
  } catch { return null; }
}

const checked = new WeakMap();
/** The validator's answer for a definition, worked out once per definition object. */
function checkOf(def) {
  if (!isObj(def)) return null;
  if (!checked.has(def)) { let v = null; try { v = checkFull(def); } catch { v = null; } checked.set(def, v); }
  return checked.get(def);
}

/**
 * The price against the budget: { total, budget (4,000), emitters: [{ id, path, cost }], rest (what the body's own
 * draw list costs), over (total above the budget), share (total / budget) }. The total is the validator's (its
 * `cost.expanded`), never less than the emitters' own prices. Arguments: def.
 */
export function costSummary(def) {
  const emitters = emittersOf(def).map((e) => ({ id: e.id, path: e.path, cost: emitterCost(def, e.path) ?? 0 }));
  const sum = emitters.reduce((a, e) => a + e.cost, 0);
  const v = checkOf(def);
  const all = fin(v?.cost?.expanded) ? v.cost.expanded : sum;
  const rest = Math.max(0, all - sum);
  const total = sum + rest;
  return { total, budget: PARTICLE_BUDGET, emitters, rest, over: total > PARTICLE_BUDGET, share: total / PARTICLE_BUDGET };
}

// ---- clips and keys ----------------------------------------------------------------------------------------------

/** Is n a clip's frame count the schema allows (a whole number from 1 to SPRITE_LIMITS.framesPerClip, 64)? */
const framesOk = (n) => Number.isInteger(n) && n >= 1 && n <= SPRITE_LIMITS.framesPerClip;

/** The clip as the definition writes it (an object), or null. */
function ownClip(def, clip) {
  if (!safeName(clip) || !isObj(def?.clips) || !Object.hasOwn(def.clips, clip) || !isObj(def.clips[clip])) return null;
  return def.clips[clip];
}

/**
 * A clip's frames: { name, frames, loop, own (the definition writes it, so keys can be set in it), phases (each frame's
 * phase, as the renderer gives it) }, or null. A clip the layout names takes its frames from `sprite` (the drawn sprite).
 * Arguments: def, clip, sprite (optional: { clips: { name: { frames, loop } } }).
 */
export function clipInfo(def, clip, sprite) {
  if (!safeName(clip)) return null;
  const own = ownClip(def, clip);
  const drawn = isObj(sprite?.clips) && Object.hasOwn(sprite.clips, clip) && isObj(sprite.clips[clip]) ? sprite.clips[clip] : null;
  // the draft is kept even when the validator refuses it, so a count it writes is used only inside the limit
  const frames = framesOk(own?.frames) ? own.frames : framesOk(drawn?.frames) ? drawn.frames : null;
  if (!frames) return null;
  const loop = typeof own?.loop === 'boolean' ? own.loop : typeof drawn?.loop === 'boolean' ? drawn.loop : true;
  return { name: clip, frames, loop, own: !!own, phases: Array.from({ length: frames }, (_, f) => framePhase({ frames, loop }, f)) };
}

/** The frame whose phase is t exactly (within a billionth), or null. */
function frameAt(info, t) {
  if (!info || !fin(t)) return null;
  const f = info.phases.findIndex((p) => Math.abs(p - t) < SAME_T);
  return f < 0 ? null : f;
}

/** One emitter's keys in a clip, in time order: [{ key (its index in the clip's keys), t, frame (the frame it sits on, or null between frames), ease, fields (a copy of what it sets) }]. Arguments: def, clip, id. */
export function emitterTrack(def, clip, id) {
  const c = ownClip(def, clip);
  if (!c || !Array.isArray(c.keys) || !safeName(id)) return [];
  const info = clipInfo(def, clip);
  const out = [];
  c.keys.forEach((k, i) => {
    if (!isObj(k) || !isObj(k.emit) || !Object.hasOwn(k.emit, id) || !isObj(k.emit[id])) return;
    out.push({ key: i, t: k.t, frame: frameAt(info, k.t), ease: typeof k.ease === 'string' ? k.ease : null, fields: clone(k.emit[id]) });
  });
  return out.sort((a, b) => (fin(a.t) ? a.t : 0) - (fin(b.t) ? b.t : 0));
}

/** Is the emitter given an amount by any key of any clip (so it is off where no key gives it one above 0)? */
function amountKeyedAnywhere(def, id) {
  for (const c of Object.values(isObj(def?.clips) ? def.clips : {})) {
    for (const k of Array.isArray(c?.keys) ? c.keys : []) if (isObj(k?.emit) && isObj(k.emit[id]) && k.emit[id].amount !== undefined) return true;
  }
  return false;
}

/** The blended key of an emitter at a frame of a clip (rigs/keypose.js clipPose), or null. info: the clipInfo the frame is counted in (default: the definition's own, inside the limit). */
function poseOf(def, clip, frame, id, info = clipInfo(def, clip)) {
  const c = ownClip(def, clip);
  if (!c || !Array.isArray(c.keys) || !info) return null;
  const pose = clipPose({ frames: info.frames, loop: info.loop, keys: c.keys }, frame);
  return isObj(pose?.emit) && isObj(pose.emit[id]) ? pose.emit[id] : null;
}

/**
 * The amount an emitter draws in each frame of a clip: { keyed (some key in some clip gives it an amount), frames:
 * [{ frame, amount (0..1 as blended; null for an emitter no key gives an amount), on (it draws) }] }. Its `when` is
 * not read; a clip it is kept out of draws it in no frame. Arguments: def, clip, id, sprite (optional, for a clip the layout names).
 */
export function amountsOf(def, clip, id, sprite) {
  const info = clipInfo(def, clip, sprite);
  const e = emittersOf(def).find((x) => x.id === id);
  const keyed = safeName(id) && amountKeyedAnywhere(def, id);
  if (!info) return { keyed, frames: [] };
  const frames = info.phases.map((_, frame) => {
    if (!e || !inClip(e, clip)) return { frame, amount: keyed ? 0 : null, on: false };
    if (!keyed) return { frame, amount: null, on: true };
    const k = poseOf(def, clip, frame, id, info);
    const amount = fin(k?.amount) ? clamp(k.amount, 0, 1) : 0;
    return { frame, amount, on: amount > 0 };
  });
  return { keyed, frames };
}

/** The index of the key on a frame of a clip that sets something of the emitter, or -1. Arguments: def, clip, frame, id. */
export function keyAt(def, clip, frame, id) {
  const info = clipInfo(def, clip);
  if (!info || !Number.isInteger(frame) || frame < 0 || frame >= info.frames) return -1;
  const t = info.phases[frame];
  const keys = ownClip(def, clip)?.keys;
  if (!Array.isArray(keys)) return -1;
  return keys.findIndex((k) => isObj(k) && fin(k.t) && Math.abs(k.t - t) < SAME_T && isObj(k.emit) && isObj(k.emit[id]));
}

/**
 * What a key of an emitter may set: [{ name, type (the registry's described type), about, sized (a size argument:
 * keys may lower it, never raise it), most (the highest a key may set it: what the emitter sets) }]: amount, at, then
 * the arguments its behaviour lists as keyable, in the registry's order. Arguments: def, path (the emitter's).
 */
export function keyableFields(def, path) {
  const e = getAt(def, path);
  if (!isObj(e)) return [];
  const doc = generatorDoc(e.gen, e.v);
  const out = [{ name: 'amount', type: { type: 'share', lo: 0, hi: 1 }, about: 'How much of it draws: 0 is off', sized: false }];
  if (!doc) return out;
  if (doc.args.at) out.push({ name: 'at', type: doc.args.at, about: doc.args.at.about ?? 'Where it is', sized: false });
  const sized = SIZE_KEYS[`${e.gen}@${e.v}`] ?? [];
  const worst = worstArgs(def, e, doc);
  for (const name of Array.isArray(doc.keyable) ? doc.keyable : []) {
    const type = doc.args[name];
    if (!type || name === 'at' || name === 'amount') continue;
    const s = sized.includes(name);
    out.push({ name, type, about: type.about ?? '', sized: s, ...(s && fin(worst[name]) ? { most: worst[name] } : {}) });
  }
  return out;
}

/** A key's fields kept to what the emitter's behaviour lets keys set: amount held to 0..1, a size argument to what the emitter sets, numbers to their type's range. */
function fitKeyFields(def, path, fields) {
  const can = new Map(keyableFields(def, path).map((k) => [k.name, k]));
  const out = {};
  for (const [f, v0] of Object.entries(isObj(fields) ? fields : {})) {
    const k = can.get(f);
    if (!k || PROTO.has(f)) continue;
    let v = clone(v0);
    if (f === 'amount') { if (!fin(v)) continue; v = clamp(v, 0, 1); }
    else if (f === 'at') { if (!Array.isArray(v) || v.length !== 2 || !v.every(fin)) continue; }
    else if (fin(v)) {
      if (fin(k.type?.lo) && fin(k.type?.hi)) v = clamp(v, k.type.lo, k.type.hi);
      if (k.sized && fin(k.most)) v = Math.min(v, k.most);
    }
    out[f] = v;
  }
  return out;
}

/** The clip's keys with empty emitter entries, empty `emit` maps and keys left with nothing to say taken out. */
function tidyKeys(keys) {
  return keys.filter((k) => {
    if (!isObj(k)) return true;
    if (isObj(k.emit)) {
      for (const [id, x] of Object.entries(k.emit)) if (isObj(x) && !Object.keys(x).length) delete k.emit[id];
      if (!Object.keys(k.emit).length) delete k.emit;
    }
    return Object.keys(k).some((f) => f !== 't' && f !== 'ease');
  });
}

/** The emitter of a definition with this id, or null. */
const emitterById = (def, id) => (safeName(id) ? emittersOf(def).find((e) => e.id === id) ?? null : null);

/**
 * The definition with a key of an emitter on a frame of a clip: the fields (amount, at, keyable arguments, each kept
 * as keyableFields says) merged into the key already on that frame, or a new key at the frame's exact phase put in
 * time order. Null for a clip the definition does not write, an emitter it has not got, a frame outside the clip, or
 * no field the key may set. Arguments: def, clip, id, frame, fields.
 */
export function setKey(def, clip, id, frame, fields) {
  const info = clipInfo(def, clip);
  const e = emitterById(def, id);
  if (!info || !info.own || !e || !Number.isInteger(frame) || frame < 0 || frame >= info.frames) return null;
  const f = fitKeyFields(def, e.path, fields);
  if (!Object.keys(f).length) return null;
  const t = info.phases[frame];
  const keys = clone(Array.isArray(def.clips[clip].keys) ? def.clips[clip].keys : []);
  const i = keys.findIndex((k) => isObj(k) && fin(k.t) && Math.abs(k.t - t) < SAME_T);
  if (i >= 0) {
    const k = keys[i];
    if (!isObj(k.emit)) k.emit = {};
    k.emit[id] = { ...(isObj(k.emit[id]) ? k.emit[id] : {}), ...f };
  } else {
    const at = keys.findIndex((k) => isObj(k) && fin(k.t) && k.t > t);
    keys.splice(at < 0 ? keys.length : at, 0, { t, emit: { [id]: f } });
  }
  return setAt(def, ['clips', clip, 'keys'], keys);
}

/** The definition with one field of an emitter's entry in a key set (kept as keyableFields says) or, for value undefined, taken out (an emptied entry and an emptied key go). Null when the key is not there. Arguments: def, clip, keyIndex, id, field, value. */
export function setKeyField(def, clip, keyIndex, id, field, value) {
  const c = ownClip(def, clip);
  const e = emitterById(def, id);
  if (!c || !e || !Array.isArray(c.keys) || !Number.isInteger(keyIndex) || !isObj(c.keys[keyIndex]) || !safeName(field)) return null;
  const keys = clone(c.keys);
  const k = keys[keyIndex];
  if (value === undefined) {
    if (isObj(k.emit) && isObj(k.emit[id])) delete k.emit[id][field];
  } else {
    const f = fitKeyFields(def, e.path, { [field]: value });
    if (!Object.hasOwn(f, field)) return null;
    if (!isObj(k.emit)) k.emit = {};
    k.emit[id] = { ...(isObj(k.emit[id]) ? k.emit[id] : {}), ...f };
  }
  return setAt(def, ['clips', clip, 'keys'], tidyKeys(keys));
}

/** The definition without an emitter's entry in a key (the key goes when nothing is left in it). Arguments: def, clip, keyIndex, id. */
export function removeKey(def, clip, keyIndex, id) {
  const c = ownClip(def, clip);
  if (!c || !Array.isArray(c.keys) || !Number.isInteger(keyIndex) || !isObj(c.keys[keyIndex]) || !safeName(id)) return null;
  const keys = clone(c.keys);
  if (isObj(keys[keyIndex].emit)) delete keys[keyIndex].emit[id];
  return setAt(def, ['clips', clip, 'keys'], tidyKeys(keys));
}

/** The definition with an emitter's entry in a key moved to another frame (merged into a key already there). Arguments: def, clip, keyIndex, id, frame. */
export function moveKey(def, clip, keyIndex, id, frame) {
  const c = ownClip(def, clip);
  const fields = c && Array.isArray(c.keys) && isObj(c.keys[keyIndex]?.emit) && isObj(c.keys[keyIndex].emit[id]) ? clone(c.keys[keyIndex].emit[id]) : null;
  if (!fields) return null;
  const info = clipInfo(def, clip);
  if (!info || !Number.isInteger(frame) || frame < 0 || frame >= info.frames) return null;
  const without = removeKey(def, clip, keyIndex, id);
  return without && (setKey(without, clip, id, frame, fields) ?? without);
}

// ---- the spawn point and box on the stage -------------------------------------------------------------------------

/** A point in a node's frame put in the sprite's frame, through the node and its parents (their at, turn and scale as written). */
function onNode(def, nodeId, p) {
  const b = isObj(def?.body) ? def.body : {};
  const nodes = (Array.isArray(b.nodes) ? b.nodes : isObj(b.pictures) && Array.isArray(b.pictures.nodes) ? b.pictures.nodes : []).filter((n) => isObj(n) && typeof n.id === 'string');
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let at = p;
  let n = byId.get(nodeId);
  for (let depth = 0; n && depth < 64; depth++) {
    const pt = Array.isArray(n.at) && n.at.every(fin) ? n.at : [0, 0];
    at = placeOn({ kind: 'dot', at }, nodeFrame({ at: pt, turn: fin(n.turn) ? n.turn : 0, scale: fin(n.scale) ? n.scale : 1 })).at;
    n = typeof n.parent === 'string' ? byId.get(n.parent) : null;
  }
  return at;
}

/** A move of (dx, dy) picture pixels at a point of a node, as a move in the node's own pixels (its chain's turns and scales undone). */
function nodeDelta(def, nodeId, local, dx, dy) {
  const o = onNode(def, nodeId, local), ex = onNode(def, nodeId, [local[0] + 1, local[1]]), ey = onNode(def, nodeId, [local[0], local[1] + 1]);
  const a = ex[0] - o[0], b = ex[1] - o[1], c = ey[0] - o[0], d = ey[1] - o[1];
  const det = a * d - b * c;
  if (!fin(det) || Math.abs(det) < 1e-9) return [dx, dy];
  return [(d * dx - c * dy) / det, (a * dy - b * dx) / det];
}

/** Is the emitter's `at` moved by a key of this clip? */
const atKeyed = (def, clip, id) => emitterTrack(def, clip, id).some((k) => Array.isArray(k.fields.at));

/**
 * Where an emitter spawns, for the stage: { at ([x, y] in frame pixels, on its node), local (its `at` before the node),
 * reach (how far it throws, in pixels, or null), area ({ x0, y0, x1, y1 } or null), boxable (its behaviour takes a
 * box), movable (its point can be dragged), why (when it cannot), keyed (the clip's keys move its point), areaMovable }.
 * Bindings are read at the controls tried (params) or their defaults. Null for no emitter. Arguments: def, path,
 * { clip, frame, params }.
 */
export function spawnOf(def, path, { clip, frame, params } = {}) {
  const e = getAt(def, path);
  if (!isObj(e)) return null;
  const table = controlTable(def);
  const doc = typeof e.gen === 'string' ? generatorDoc(e.gen, e.v) : null;
  const boundAt = Array.isArray(e.at) && e.at.some(isBinding);
  let local = worked(e.at, table, params);
  const id = typeof e.id === 'string' ? e.id : null;
  const keyed = !!id && clip !== undefined && atKeyed(def, clip, id);
  if (keyed && Number.isInteger(frame)) {
    const k = poseOf(def, clip, frame, id);
    if (Array.isArray(k?.at) && k.at.every(fin)) local = k.at;
  }
  if (!Array.isArray(local) || local.length !== 2 || !local.every(fin)) local = [0, 0];
  const at = typeof e.on === 'string' ? onNode(def, e.on, local) : [...local];
  let reach = null;
  for (const name of REACH_ARGS) {
    const v = Object.hasOwn(e, name) ? worked(e[name], table, params) : doc?.args?.[name]?.default;
    const n = Array.isArray(v) ? Math.max(...v.filter(fin)) : v;
    if (fin(n) && n > 0) { reach = n; break; }
  }
  const a = isObj(e.area) ? worked(e.area, table, params) : null;
  const area = a && ['x0', 'y0', 'x1', 'y1'].every((k) => fin(a[k])) ? { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 } : null;
  const movable = keyed || (!boundAt && Array.isArray(e.at));
  return { at, local, reach, area, boxable: !!doc?.args?.area, movable, keyed, areaMovable: !!area && Object.values(e.area).every(fin),
    why: movable ? '' : boundAt ? 'Its place is set by a control: change the numbers in its table' : 'It has no place of its own to move' };
}

/** The frame's size [w, h]. */
const frameOf = (def) => (Array.isArray(def?.size) && def.size.length === 2 && def.size.every(fin) ? def.size : [32, 32]);

/**
 * The definition with an emitter's spawn moved by whole pixels: 'at' its point (in the key on the frame in hand when
 * the clip's keys move it, a key made there if none is), 'area' its box (kept inside the frame), 'corner' the box's
 * bottom right corner (the box at least a pixel). Null when it cannot be moved (set by a control, no box, no emitter).
 * dx and dy are the node's own pixels, or with space 'frame' the picture's (a drag: the point follows the cursor
 * through the turns and scales of its node and the node's parents, rounded to the node's whole pixels).
 * Arguments: def, path, what ('at' | 'area' | 'corner'), dx, dy, { clip, frame, space ('node', the default, | 'frame') }.
 */
export function moveSpawn(def, path, what, dx, dy, { clip, frame, space = 'node' } = {}) {
  const e = getAt(def, path);
  if (!isObj(e) || !fin(dx) || !fin(dy)) return null;
  if (what === 'at') {
    const s = spawnOf(def, path, { clip, frame });
    if (space === 'frame' && typeof e.on === 'string') [dx, dy] = nodeDelta(def, e.on, s.local, dx, dy);
    dx = Math.round(dx); dy = Math.round(dy);
    if (s.keyed && Number.isInteger(frame) && typeof e.id === 'string') return setKey(def, clip, e.id, frame, { at: [s.local[0] + dx, s.local[1] + dy] });
    if (!s.movable || !Array.isArray(e.at) || !e.at.every(fin)) return null;
    return setAt(def, [...path, 'at'], [e.at[0] + dx, e.at[1] + dy]);
  }
  dx = Math.round(dx); dy = Math.round(dy);
  const a = e.area;
  if (!isObj(a) || !['x0', 'y0', 'x1', 'y1'].every((k) => fin(a[k]))) return null;
  const [W, H] = frameOf(def);
  let box;
  if (what === 'area') {
    const w = a.x1 - a.x0, h = a.y1 - a.y0;
    const x0 = clamp(a.x0 + dx, 0, Math.max(0, W - w)), y0 = clamp(a.y0 + dy, 0, Math.max(0, H - h));
    box = { x0, y0, x1: x0 + w, y1: y0 + h };
  } else if (what === 'corner') {
    box = { x0: a.x0, y0: a.y0, x1: clamp(a.x1 + dx, a.x0 + 1, Math.max(a.x0 + 1, W)), y1: clamp(a.y1 + dy, a.y0 + 1, Math.max(a.y0 + 1, H)) };
  } else return null;
  return setAt(def, [...path, 'area'], { ...a, ...box });
}

/** The definition with an emitter's box set ({ x0, y0, x1, y1 }, whole pixels kept in the frame) or, for null, taken out. Null when its behaviour takes no box. Arguments: def, path, box. */
export function setArea(def, path, box) {
  const e = getAt(def, path);
  if (!isObj(e) || !generatorDoc(e.gen, e.v)?.args?.area) return null;
  if (box === null) return setAt(def, [...path, 'area'], undefined);
  if (!isObj(box) || !['x0', 'y0', 'x1', 'y1'].every((k) => fin(box[k]))) return null;
  const [W, H] = frameOf(def);
  const x0 = clamp(Math.round(Math.min(box.x0, box.x1)), 0, W - 1), y0 = clamp(Math.round(Math.min(box.y0, box.y1)), 0, H - 1);
  const x1 = clamp(Math.round(Math.max(box.x0, box.x1)), x0 + 1, W), y1 = clamp(Math.round(Math.max(box.y0, box.y1)), y0 + 1, H);
  return setAt(def, [...path, 'area'], { x0, y0, x1, y1 });
}

// ---- new emitters and behaviours swapped --------------------------------------------------------------------------

/** The ids in use in a definition (draw items, emitters, nodes). */
function idsIn(def) {
  const out = new Set(itemIds(def));
  for (const e of emittersOf(def)) if (e.id) out.add(e.id);
  for (const n of nodesOf(def)) out.add(n);
  return [...out];
}

/**
 * A new emitter of a behaviour (family fx) at the end of a list: { def, path }, or null for a generator an emitter
 * cannot name. It sits on the first node when the body has nodes (at [0, 0]), else at the frame's middle; it has an id
 * of its own and every argument it needs, the rest left to their defaults. Arguments: def, listPath, gen, v.
 */
export function newEmitter(def, listPath, gen, v) {
  const g = generatorsFor('emitter').find((x) => x.id === gen && x.v === v);
  if (!g || !emitterLists(def).some((l) => l.path.join('.') === listPath.join('.'))) return null;
  const list = getAt(def, listPath);
  if (list !== undefined && !Array.isArray(list)) return null;
  const nodes = nodesOf(def);
  const call = newCall(g, { on: nodes[0], paints: paintRefs(def), frame: frameOf(def) });
  const [W, H] = frameOf(def);
  if (!nodes.length && Object.hasOwn(g.args, 'at')) call.at = [Math.round(W / 2), Math.round(H / 2)];
  const out = { id: uniqueId(gen.split('.')[0].replace(/^effect$/, gen.split('.')[1] ?? 'effect'), idsIn(def)), ...call };
  const items = Array.isArray(list) ? list : [];
  return { def: setAt(def, listPath, [...items, out]), path: [...listPath, items.length] };
}

/** Does a value fit an argument's described type well enough to keep it when the behaviour changes (same type; numbers in range)? */
function fits(v, from, to) {
  if (!from || !to || from.type !== to.type) return false;
  const inRange = (n) => !fin(n) || ((!fin(to.lo) || n >= to.lo) && (!fin(to.hi) || n <= to.hi));
  if (fin(v)) return inRange(v);
  if (Array.isArray(v)) return v.every((x) => (fin(x) ? inRange(x) : true));
  if (isBinding(v) && Array.isArray(v.map)) return v.map.every((p) => Array.isArray(p) && inRange(p[1]));
  return true;
}

/**
 * The definition with an emitter's behaviour swapped: its id, node, clips, when, glow and the like kept, its point
 * kept, each argument of the same name and type that fits the new one's range kept, the rest the new one's starting
 * values; in every clip, key fields the new behaviour cannot be keyed by are taken out. Null for a generator an emitter
 * cannot name. Arguments: def, path, gen, v.
 */
export function changeBehaviour(def, path, gen, v) {
  const e = getAt(def, path);
  const g = generatorsFor('emitter').find((x) => x.id === gen && x.v === v);
  if (!isObj(e) || !g) return null;
  const was = generatorDoc(e.gen, e.v);
  const call = newCall(g, { on: typeof e.on === 'string' ? e.on : undefined, paints: paintRefs(def), frame: frameOf(def) });
  delete call.on;
  const next = {};
  for (const f of CALL_FIELDS) if (Object.hasOwn(e, f) && f !== 'gen' && f !== 'v') next[f] = clone(e[f]);
  next.gen = g.id; next.v = g.v;
  for (const [name, val] of Object.entries(call)) if (name !== 'gen' && name !== 'v') next[name] = val;
  for (const [name, val] of Object.entries(e)) {
    if (CALL_FIELDS.includes(name) || !Object.hasOwn(g.args, name)) continue;
    if (name === 'at' || fits(val, was?.args?.[name], g.args[name])) next[name] = clone(val);
  }
  const order = ['id', 'gen', 'v', 'on'];
  const tidy = Object.fromEntries([...order.filter((k) => Object.hasOwn(next, k)).map((k) => [k, next[k]]), ...Object.entries(next).filter(([k]) => !order.includes(k))]);
  let out = setAt(def, path, tidy);
  // the keys: what the new behaviour cannot be keyed by goes; a size argument is held to what the emitter now sets
  if (typeof e.id === 'string' && isObj(out.clips)) {
    for (const [name, c] of Object.entries(out.clips)) {
      if (!isObj(c) || !Array.isArray(c.keys)) continue;
      const keys = clone(c.keys);
      let changed = false;
      for (const k of keys) {
        if (!isObj(k?.emit) || !isObj(k.emit[e.id])) continue;
        const kept = fitKeyFields(out, path, k.emit[e.id]);
        if (JSON.stringify(kept) !== JSON.stringify(k.emit[e.id])) { k.emit[e.id] = kept; changed = true; }
      }
      if (changed) out = setAt(out, ['clips', name, 'keys'], tidyKeys(keys));
    }
  }
  return out;
}

/** The definition without an emitter, and without its entries in every clip's keys (an emptied key goes). Null for no emitter. Arguments: def, path. */
export function deleteEmitter(def, path) {
  const e = getAt(def, path);
  if (!isObj(e)) return null;
  let out = setAt(def, path, undefined);
  if (typeof e.id === 'string' && isObj(out.clips)) {
    for (const [name, c] of Object.entries(out.clips)) {
      if (!isObj(c) || !Array.isArray(c.keys) || !c.keys.some((k) => isObj(k?.emit) && Object.hasOwn(k.emit, e.id))) continue;
      const keys = clone(c.keys);
      for (const k of keys) if (isObj(k?.emit)) delete k.emit[e.id];
      out = setAt(out, ['clips', name, 'keys'], tidyKeys(keys));
    }
  }
  return out;
}

/** A copy of an emitter put after it: { def, path }, with an id of its own (<id>-2 ...) and no keys (so it always draws until keyed). Null for no emitter. Arguments: def, path. */
export function copyEmitter(def, path) {
  const e = getAt(def, path);
  const list = getAt(def, path.slice(0, -1));
  if (!isObj(e) || !Array.isArray(list)) return null;
  const c = clone(e);
  c.id = uniqueId(typeof e.id === 'string' ? e.id : 'emitter', idsIn(def));
  const at = path[path.length - 1] + 1;
  const next = [...list.slice(0, at), c, ...list.slice(at)];
  return { def: setAt(def, path.slice(0, -1), next), path: [...path.slice(0, -1), at] };
}

// ---- the validator's messages -------------------------------------------------------------------------------------

/** The validator's messages about one emitter: those about its card ('Emitter "sparks": ...', or by its place in the list) and those about its keys in any clip. Arguments: errors (messages), def, path. */
export function emitterErrors(errors, def, path) {
  const e = getAt(def, path);
  const id = isObj(e) && typeof e.id === 'string' ? e.id : null;
  const index = path[path.length - 1];
  const res = [];
  if (Number.isInteger(index) && !id) res.push(new RegExp(`^Emitter ${index + 1}(?![0-9])`));
  if (id) res.push(new RegExp(`^Emitter "${esc(id)}"`), new RegExp(`^Clip "[^"]*", key [0-9]+: emit "${esc(id)}"`));
  return (Array.isArray(errors) ? errors : []).filter((m) => typeof m === 'string' && res.some((r) => r.test(m)));
}

/** The validator's messages about one emitter's entry in one key of a clip. Arguments: errors, clip, keyIndex (0-based), id. */
export function keyErrors(errors, clip, keyIndex, id) {
  const r = new RegExp(`^Clip "${esc(clip)}", key ${keyIndex + 1}: emit "${esc(id)}"`);
  return (Array.isArray(errors) ? errors : []).filter((m) => typeof m === 'string' && r.test(m));
}

/** The validator's messages about the budget and the stamp pixels the emitters paint in a frame (shown at the meter). Arguments: errors. */
export function budgetErrors(errors) {
  return (Array.isArray(errors) ? errors : []).filter((m) => typeof m === 'string' && (/^The sprite costs about /.test(m) || /^The emitters (and the body's stamps )?can paint/.test(m)));
}
