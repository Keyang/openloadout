// A sprite that is data (docs/studio.md, sections 2.3 and 8, item S4; docs/architecture.md, Contract 14 rule 4).
// A studio definition (`loadout-sprite`) is checked by catalog/studio-schema.js and becomes an ordinary
// defineSprite() result whose render() and sockets() are framework code: the key blender (rigs/keypose.js) poses
// the bone rig and the bone renderer (rigs/bones.js) draws it. Nothing in the definition ever runs. So renderSheet,
// describeSheet, the looks (Contract 7), the export and the quality bar (quality/sprite.js) take it like any sprite.
//
//   import { dataSprite } from '../engine/data-sprite.js';
//   export default dataSprite({ "format": "loadout-sprite", "version": 1, ... });   // a library file (studio.md 2.4)
//
// What the definition becomes (studio.md 2.3):
//   colour slots  one color() control per slot that is not a detail (label and material from the slot; swatches:
//                 the slot's colour first, then the engine's list for its material); detail slots are drawn flat
//                 in their colour and get no control
//   controls      range() sliders that scale the named bones (length) or shapes (size); { standard: "speed" } is
//                 the usual Speed slider (0..1, default 0.5) and every clip's fps becomes fps * lerp(0.65, 1.45, speed)
//   parts         a toggle() per part, as a Contract 3 part ({ params: [name, ...], none: false }). A colour slot or
//                 slider whose shapes all belong to one part is put in that part, so it hides with it
//   clips         frames, loop, label; fps (a number, or a function of Speed); each clip's sounds -> sprite.sounds
//   points        sockets(clip, t, p): the rig's attach points for that frame (Contract 3), absent when it has none
//   the rest      id, name, blurb, meta, size, pivot, grounded, preview; kind from meta.type; `made` and the cleaned
//                 `definition` (frozen plain JSON, for the bag, the studio and the library file to read back)
//
// TOP-DOWN BONE RIGS (studio.md section 9, Q4: in version 1; Contract 2: one clip per direction). The data shape:
//   - ONE rig with `view: "top-down"` and an optional `directions` object: an overlay per direction, any of
//     "down", "up", "side", each { bones: { id: { angle, at, length, from } }, shapes: { id: { z, far, hidden, shade,
//     light, and the shape's own geometry: width | from, to, r, offset | at, r | points | at, size } } }. An overlay
//     re-poses and re-proportions the SAME bones and shapes for that view (the body points down the picture facing
//     down, its head drawn last; the eyes hidden facing up; a foreshortened body). The rig's own values are what a
//     direction without an overlay draws, so a template writes its side view as the rig and overlays down and up.
//   - Clips are named `<action>_<down|up|side>` (walk_down, walk_up, walk_side, idle_down ...), each with its own key
//     poses, which hold angles as they are in that direction's rig. A clip with no direction (hurt, die) is drawn
//     facing down, as rigs/topdown.js reads clip names. Side faces right; games mirror it.
//   - catalog/studio-schema.js (S1) does not know top-down yet (it refuses view "top-down" and names with "_"), so
//     validateDataSprite() below lets it check everything else on a copy (view "none", direction clips renamed
//     walk-down for the check and back, error messages naming them as written) and checks `directions` itself.
//     When S1 learns top-down, that shim becomes a pass-through.
//   - Before the shim, the WHOLE definition given as an object (directions included) gets the same wall as S1's:
//     plainDefinition() copies it as plain data without running getters, refuses code, class instances and loops,
//     caps values, nesting and the 64 KB of JSON. The overlay is then checked field by field (checkDirections), and
//     each direction as overlaid goes through S1's validateStudioRig too (checkOverlaid), so the checks between fields
//     see overlaid values. Errors and warnings are capped at MAX_MESSAGES each.
//
// LIBRARY BODIES ({ library: "humanoid", figure }) are validated but not drawn yet: their renderer comes with studio
// item S6 (rigs/humanoid-studio.js). dataSprite() throws a clear error for them; makeDataSprite() returns it.
//
// Pure: no DOM, no Node, no clock, no randomness. Runs unchanged in the browser and in Node.

import { defineSprite, range, color, toggle, SKIN, CLOTH, METAL } from './sprite.js';
import { lerp } from './motion.js';
import { validateStudioSprite, validateStudioRig, parseStudioJson, STANDARD_CLIPS, STUDIO_LIMITS } from '../catalog/studio-schema.js';
import { compileKeys, sampleKeys, framePhase, frameOfPhase } from '../rigs/keypose.js';
import { drawRig, solveRig, rigPoints } from '../rigs/bones.js';

/** The three drawn directions of a top-down sprite, in clip order (Contract 2; side faces right, games mirror it). */
export const TOPDOWN_DIRECTIONS = Object.freeze(['down', 'up', 'side']);

/** What a direction overlay may change on a bone, and on a shape of each kind (besides z, far, hidden, shade, light). */
export const DIRECTION_FIELDS = Object.freeze({
  bone: Object.freeze(['angle', 'at', 'length', 'from']),
  shape: Object.freeze(['z', 'far', 'hidden', 'shade', 'light']),
  kinds: Object.freeze({ limb: Object.freeze(['width']), capsule: Object.freeze(['from', 'to', 'r', 'offset']), ellipse: Object.freeze(['at', 'r']), poly: Object.freeze(['points']), dot: Object.freeze(['at', 'size']) }),
});

const DIR_RE = /^(.+)_(down|up|side)$/;
const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const q = (s) => `"${s}"`;
const say = (v) => { try { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 60) + '...' : s; } catch { return 'something that is not data'; } };
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** Which way a clip of a top-down sprite faces, from its name: 'down', 'up' or 'side'; a name with no direction ('hurt') is 'down'. Arguments: name (a clip name). */
export function directionOf(name) {
  const m = DIR_RE.exec(String(name));
  return m ? m[2] : 'down';
}

/** The most errors, and the most warnings, validateDataSprite returns; past it one last message says how many more there were. */
export const MAX_MESSAGES = 50;

const capList = (list) => (list.length > MAX_MESSAGES ? [...list.slice(0, MAX_MESSAGES), `... and ${list.length - MAX_MESSAGES} more like these`] : list);
const someOf = (names, n = 8) => (names.length > n ? `${names.slice(0, n).join(', ')} and ${names.length - n} more` : names.join(', '));

// ---- reading input without running it ------------------------------------------------------------------------

const L = STUDIO_LIMITS;
const PROTO_KEYS_RE = /^(?:__proto__|constructor|prototype)$/;
const utf8Length = (s) => (typeof TextEncoder === 'function' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);

/**
 * The wall of Contract 14 rule 6 for a definition given as an object, the WHOLE of it (top-down `directions`
 * included, which catalog/studio-schema.js never reads): a plain-data copy taken once, reading fields through their
 * descriptors so no getter runs (and a Proxy's get trap never runs; its ownKeys, getPrototypeOf and
 * getOwnPropertyDescriptor traps do, as in S1's own copy, but only that one time, and nothing of it is kept). Refuses
 * functions, getters, class instances (Map, Date, ...), loops of objects, holes and undefined in lists, nesting over
 * 20 and more than 40,000 values; drops __proto__, constructor and prototype keys; then measures the copy as JSON
 * against the 64 KB cap. Stops early once a cap is passed. Returns the copy, or undefined after errors (pushed on C).
 * The same rules and caps as catalog/studio-schema.js plainCopy and prepare, which that file does not export.
 */
function plainDefinition(C, v) {
  let nodes = 0, chars = 0, removed = 0, stopped = false;
  const stack = new Set();
  const fail = (path, m) => { if (!stopped) C.err(`${path || 'The definition'}: ${m}`); };
  const walk = (x, path, depth) => {
    if (stopped) return undefined;
    if (++nodes > L.nodes) { fail('', `holds more than ${L.nodes.toLocaleString('en')} values; it cannot fit in 64 KB`); stopped = true; return undefined; }
    if (typeof x === 'string') {
      chars += x.length;
      if (chars > L.jsonBytes) { fail('', `is more than 64 KB of text; the most is 64 KB`); stopped = true; return undefined; }
      return x;
    }
    if (x === null || typeof x === 'boolean') return x;
    if (typeof x === 'number') { if (!Number.isFinite(x)) fail(path, `numbers must be finite; got ${String(x)}`); return x; }
    if (typeof x === 'function') { fail(path, 'is code (a function); a definition holds data only'); return undefined; }
    if (typeof x !== 'object') { fail(path, `is ${typeof x === 'undefined' ? 'missing (undefined)' : `a ${typeof x}`}, not plain data`); return undefined; }
    if (depth > L.nesting) { fail(path, `is nested more than ${L.nesting} levels deep; a definition never needs that`); stopped = true; return undefined; }
    if (stack.has(x)) { fail(path, 'contains itself (a loop of objects); a definition is a tree'); return undefined; }
    stack.add(x);
    try {
      if (Array.isArray(x)) {
        const d0 = Object.getOwnPropertyDescriptor(x, 'length');
        const n = d0 && 'value' in d0 ? d0.value : 0;
        if (n > L.nodes) { fail(path, `is a list of ${n} entries; it cannot fit in 64 KB`); stopped = true; return undefined; }
        const out = new Array(n);
        for (let i = 0; i < n && !stopped; i++) {
          const d = Object.getOwnPropertyDescriptor(x, i);
          if (!d || !('value' in d)) { fail(`${path}[${i}]`, d ? 'is worked out by code (a getter); a definition holds data only' : 'is missing (an empty place in a list)'); continue; }
          if (d.value === undefined) { fail(`${path}[${i}]`, 'is missing (undefined); a list holds data only'); continue; }
          out[i] = walk(d.value, `${path}[${i}]`, depth + 1);
        }
        return out;
      }
      const proto = Object.getPrototypeOf(x);
      if (proto !== Object.prototype && proto !== null) {
        let name = 'special object';
        try { const d = proto && Object.getOwnPropertyDescriptor(proto, 'constructor'); const f = d && 'value' in d ? d.value : null; const nd = typeof f === 'function' ? Object.getOwnPropertyDescriptor(f, 'name') : null; if (nd && typeof nd.value === 'string') name = nd.value.slice(0, 40); } catch { /* keep the plain words */ }
        fail(path, `is a ${name}, not plain data (an object of fields)`);
        return undefined;
      }
      const out = {};
      for (const k of Object.keys(x)) {
        if (stopped) break;
        if (PROTO_KEYS_RE.test(k)) { removed++; continue; }
        const d = Object.getOwnPropertyDescriptor(x, k);
        if (!d) continue;
        if (!('value' in d)) { fail(path ? `${path}.${k}` : k, 'is worked out by code (a getter); a definition holds data only'); continue; }
        if (d.value === undefined) continue;                     // as JSON would: an undefined field is absent
        chars += k.length;
        out[k] = walk(d.value, path ? `${path}.${k}` : k, depth + 1);
      }
      return out;
    } finally { stack.delete(x); }
  };
  const before = C.errors.length;
  let out;
  try { out = walk(v, '', 0); } catch (e) { C.err(`The definition could not be read: ${String(e?.message ?? e).slice(0, 120)}`); return undefined; }
  if (removed) C.warn(`Removed ${removed} key${removed === 1 ? '' : 's'} named __proto__, constructor or prototype: they could change how objects behave`);
  if (C.errors.length > before) return undefined;
  const json = JSON.stringify(out);
  if (json === undefined) { C.err('The definition is empty'); return undefined; }
  const bytes = utf8Length(json);
  if (bytes > L.jsonBytes) { C.err(`The definition is ${Math.ceil(bytes / 1024)} KB as JSON; the most is 64 KB`); return undefined; }
  return out;
}

/** An own data field of o: { ok: true, v } (v undefined when absent), or { ok: false } for a getter or when o is not an object. */
function field(o, k) {
  if (o === null || typeof o !== 'object') return { ok: false };
  let d;
  try { d = Object.getOwnPropertyDescriptor(o, k); } catch { return { ok: false }; }
  if (!d) return { ok: true, v: undefined };
  return 'value' in d ? { ok: true, v: d.value } : { ok: false };
}

/** A shallow copy of a plain object's own data fields (prototype names kept as own fields, for the validator to drop and say so); null when it is not one or has a getter. */
function shallow(o) {
  if (!isObj(o)) return null;
  let proto;
  try { proto = Object.getPrototypeOf(o); } catch { return null; }
  if (proto !== Object.prototype && proto !== null) return null;
  const out = {};
  let keys;
  try { keys = Object.keys(o); } catch { return null; }
  for (const k of keys) {
    const f = field(o, k);
    if (!f.ok) return null;
    Object.defineProperty(out, k, { value: f.v, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

// ---- the top-down shim around catalog/studio-schema.js --------------------------------------------------------

/**
 * Prepares a definition for the S1 validator: returns { input (what to give it), names (temporary clip name -> as
 * written), topDown, metaView (meta.view to put back), directions (the raw overlay), errors, warnings }. Anything it
 * cannot read safely is passed through unchanged, so the validator refuses it with its own words.
 */
function splitTopDown(d) {
  const S = { input: d, names: new Map(), topDown: false, metaView: undefined, directions: undefined, errors: [], warnings: [] };
  const top = shallow(d);
  if (!top) return S;
  const body = shallow(top.body);
  const rig = body && shallow(body.rig);
  if (!rig) return S;
  const view = rig.view;
  S.topDown = view === 'top-down';
  const hasDirs = Object.prototype.hasOwnProperty.call(rig, 'directions');
  if (S.topDown) {
    rig.view = 'none';
    S.directions = rig.directions;
    delete rig.directions;
  } else if (hasDirs) {
    S.warnings.push(`Body: rig: directions are for a top-down body (view "top-down"); this one is seen from ${say(view)}, so they were dropped`);
    delete rig.directions;
  }
  body.rig = rig;
  top.body = body;
  const meta = shallow(top.meta);
  if (meta && typeof meta.view === 'string') {
    if (S.topDown && meta.view === 'top-down') { S.metaView = 'top-down'; meta.view = 'none'; }
    else if (S.topDown && ['side', 'front', 'none'].includes(meta.view)) {
      S.warnings.push(`meta: view ${q(meta.view)} is not the body's view "top-down"`);
      S.metaView = meta.view; meta.view = 'none';
    } else if (!S.topDown && meta.view === 'top-down') {
      S.errors.push(`meta: view "top-down" needs a top-down body (rig view "top-down"); this body is seen from ${say(view)}`);
      delete meta.view;
    }
    top.meta = meta;
  }
  const clips = shallow(top.clips);
  if (clips) {
    const names = Object.keys(clips);
    const out = {};
    for (const name of names) {
      const m = DIR_RE.exec(name);
      let key = name;
      if (m) {
        key = `${m[1]}-${m[2]}`;
        if (!S.topDown) S.errors.push(`Clip ${q(name)}: a name ending _down, _up or _side is a direction clip, for a top-down body; this body is seen from ${say(view)}`);
        else if (names.includes(key)) { S.errors.push(`Clip ${q(name)}: there is also a clip ${q(key)}; a name may be written only one way (use ${q(name)})`); key = name; }
        else S.names.set(key, name);
      }
      Object.defineProperty(out, key, { value: clips[name], enumerable: true, writable: true, configurable: true });
    }
    top.clips = out;
    if (typeof top.preview === 'string' && DIR_RE.test(top.preview)) {
      const m = DIR_RE.exec(top.preview);
      if (S.names.has(`${m[1]}-${m[2]}`)) top.preview = `${m[1]}-${m[2]}`;
    }
  }
  S.input = top;
  return S;
}

/** The validator's messages with every temporary clip name put back as written. */
function renameBack(list, names) {
  if (!names.size) return list;
  return list.map((m) => { let s = m; for (const [tmp, orig] of names) s = s.split(q(tmp)).join(q(orig)); return s; });
}

// ---- checking a direction overlay -----------------------------------------------------------------------------

function checkDirections(C, raw, rig) {
  const where = 'Body: rig directions';
  if (raw === undefined) { C.warn(`${where}: a top-down body has no directions, so down, up and side draw the same body; give down and up their own pose`); return undefined; }
  if (!isObj(raw)) { C.err(`${where}: must be an object of direction: { bones, shapes }; got ${say(raw)}`); return undefined; }
  const [W, H] = rig.size ?? [128, 96], P = Math.max(W, H);
  const bones = new Map(rig.bones.map((b) => [b.id, b])), shapes = new Map(rig.shapes.map((s) => [s.id, s]));
  const num = (place, f, v, lo, hi) => {
    if (!fin(v)) { C.err(`${place}: ${f} must be a number from ${lo} to ${hi}; got ${say(v)}`); return undefined; }
    const c = Math.min(hi, Math.max(lo, v));
    if (c !== v) C.warn(`${place}: ${f} ${say(v)} is outside ${lo} to ${hi}; kept as ${say(c)}`);
    return c;
  };
  const pair = (place, f, v, lo, hi) => {
    if (!Array.isArray(v) || v.length !== 2) { C.err(`${place}: ${f} must be two numbers in a list, like [1, 2]; got ${say(v)}`); return undefined; }
    const a = num(place, `${f} (first number)`, v[0], lo, hi), b = num(place, `${f} (second number)`, v[1], lo, hi);
    return a === undefined || b === undefined ? undefined : [a, b];
  };
  // a root bone's place, clamped per axis as catalog/studio-schema.js clamps the rig's own (x to [-W, 2W], y to [-H, 2H])
  const pairXY = (place, f, v, [xlo, xhi], [ylo, yhi]) => {
    if (!Array.isArray(v) || v.length !== 2) { C.err(`${place}: ${f} must be two numbers in a list, like [1, 2]; got ${say(v)}`); return undefined; }
    const a = num(place, `${f} (x)`, v[0], xlo, xhi), b = num(place, `${f} (y)`, v[1], ylo, yhi);
    return a === undefined || b === undefined ? undefined : [a, b];
  };
  const flag = (place, f, v) => { if (typeof v !== 'boolean') { C.err(`${place}: ${f} must be true or false; got ${say(v)}`); return undefined; } return v; };
  const out = {};
  for (const dir of Object.keys(raw)) {
    if (PROTO.has(dir)) continue;
    if (!TOPDOWN_DIRECTIONS.includes(dir)) { C.err(`${where}: ${q(dir)} is not a direction; use down, up, side (a game mirrors side for left)`); continue; }
    const o = raw[dir], place0 = `${where}, ${dir}`;
    if (!isObj(o)) { C.err(`${place0}: must be an object with bones and shapes; got ${say(o)}`); continue; }
    const extra = Object.keys(o).filter((k) => k !== 'bones' && k !== 'shapes');
    if (extra.length) C.warn(`${place0}: dropped what a direction does not know: ${someOf(extra)}`);
    const d = {};
    if (o.bones !== undefined) {
      if (!isObj(o.bones)) C.err(`${place0}: bones must be an object of bone id: changes; got ${say(o.bones)}`);
      else for (const id of Object.keys(o.bones)) {
        if (PROTO.has(id)) continue;
        const place = `${place0}, bone ${q(id)}`;
        const b = bones.get(id);
        if (!b) { C.err(`${place0}: ${q(id)} is not a bone of this body`); continue; }
        const v = o.bones[id];
        if (!isObj(v)) { C.err(`${place}: must be an object with ${DIRECTION_FIELDS.bone.join(', ')}; got ${say(v)}`); continue; }
        const unknown = Object.keys(v).filter((k) => !DIRECTION_FIELDS.bone.includes(k));
        if (unknown.length) C.warn(`${place}: dropped what a direction does not know: ${someOf(unknown)}`);
        const x = {};
        if (v.angle !== undefined) { const a = num(place, 'angle', v.angle, -720, 720); if (a !== undefined) x.angle = a; }
        if (v.length !== undefined) { const l = num(place, 'length', v.length, 1, P); if (l !== undefined) x.length = l; }
        if (v.at !== undefined) {
          if (b.parent !== null) C.warn(`${place}: at is only for a bone with no parent (a root); dropped`);
          else { const a = pairXY(place, 'at', v.at, [-W, 2 * W], [-H, 2 * H]); if (a) x.at = a; }
        }
        if (v.from !== undefined) {
          if (b.parent === null) C.warn(`${place}: from is only for a bone that hangs from another; dropped`);
          else { const f = num(place, 'from', v.from, 0, 1); if (f !== undefined) x.from = f; }
        }
        if (Object.keys(x).length) (d.bones ??= {})[id] = x;
      }
    }
    if (o.shapes !== undefined) {
      if (!isObj(o.shapes)) C.err(`${place0}: shapes must be an object of shape id: changes; got ${say(o.shapes)}`);
      else for (const id of Object.keys(o.shapes)) {
        if (PROTO.has(id)) continue;
        const place = `${place0}, shape ${q(id)}`;
        const s = shapes.get(id);
        if (!s) { C.err(`${place0}: ${q(id)} is not a shape of this body`); continue; }
        const v = o.shapes[id];
        if (!isObj(v)) { C.err(`${place}: must be an object of what changes facing ${dir}; got ${say(v)}`); continue; }
        const own = DIRECTION_FIELDS.kinds[s.kind] ?? [];
        const allowed = [...DIRECTION_FIELDS.shape, ...own];
        const unknown = Object.keys(v).filter((k) => !allowed.includes(k));
        if (unknown.length) C.warn(`${place}: dropped what a direction cannot change on a ${s.kind}: ${someOf(unknown)}`);
        const x = {};
        for (const k of Object.keys(v)) {
          if (!allowed.includes(k)) continue;
          const val = v[k];
          let c;
          if (k === 'z') c = num(place, k, val, -100, 100);
          else if (k === 'far' || k === 'hidden') c = flag(place, k, val);
          else if (k === 'shade') c = num(place, k, val, 0, 2);
          else if (k === 'light') c = num(place, k, val, 0, 1);
          else if (k === 'width') { c = fin(val) ? num(place, k, Math.round(val), 1, 16) : num(place, k, val, 1, 16); if (fin(val) && val !== Math.round(val)) C.warn(`${place}: width is in whole pixels; ${say(val)} was rounded`); }
          else if (k === 'from' || k === 'to') c = num(place, k, val, 0, 1);
          else if (k === 'offset') c = num(place, k, val, -P, P);
          else if (k === 'r') c = pair(place, k, val, 0, 32);
          else if (k === 'at') c = pair(place, k, val, -P, P);
          else if (k === 'size') { if (val !== 1 && val !== 2) C.err(`${place}: a dot's size is 1 or 2 pixels; got ${say(val)}`); else c = val; }
          else if (k === 'points') {
            if (!Array.isArray(val) || val.length < 3 || val.length > 24) C.err(`${place}: points must be 3 to 24 points [u, v]; got ${say(val)}`);
            else { const pts = val.map((p, i) => pair(place, `point ${i + 1}`, p, -P, P)); if (pts.every(Boolean)) c = pts; }
          }
          if (c !== undefined) x[k] = c;
        }
        if (Object.keys(x).length) (d.shapes ??= {})[id] = x;
      }
    }
    out[dir] = d;
  }
  return out;
}

/**
 * Runs catalog/studio-schema.js validateStudioRig on each direction as overlaid, so the checks between fields (a limb
 * 1 pixel thin, a shape too thin to draw, ...) see the overlaid values too. Only what the rig as written does not
 * already say is reported, prefixed "Body: rig facing <direction>:"; its errors are errors.
 */
function checkOverlaid(C, rig) {
  const asRig = (r) => ({ ...r, view: 'none' });
  const base = validateStudioRig(asRig(directionRig(rig, null)));
  const known = new Set([...base.errors, ...base.warnings]);
  for (const dir of TOPDOWN_DIRECTIONS) {
    if (!Object.hasOwn(rig.directions, dir)) continue;
    const v = validateStudioRig(asRig(directionRig(rig, dir)));
    for (const m of v.errors) if (!known.has(m)) C.err(`Body: rig facing ${dir}: ${m}`);
    for (const m of v.warnings) if (!known.has(m)) C.warn(`Body: rig facing ${dir}: ${m}`);
  }
}

/** The style guide's advice on clip names (section 4), for the action of each direction clip, and the three walks Contract 2 asks of a top-down character. */
function adviseTopDown(C, clips) {
  const names = Object.keys(clips);
  const missing = ['walk_down', 'walk_up', 'walk_side'].filter((n) => !names.includes(n));
  if (missing.length) C.warn(`Clips: a top-down sprite walks in three directions (Contract 2); add ${missing.join(', ')}`);
  for (const name of names) {
    const m = DIR_RE.exec(name);
    if (!m) continue;
    const std = Object.hasOwn(STANDARD_CLIPS, m[1]) ? STANDARD_CLIPS[m[1]] : null;
    const c = clips[name];
    if (std) {
      if (c.frames !== std.frames) C.warn(`Clip ${q(name)}: the style guide's ${m[1]} has ${std.frames} frames; this one has ${c.frames}`);
      if (c.loop !== std.loop) C.warn(`Clip ${q(name)}: the style guide's ${m[1]} ${std.loop ? 'loops' : 'plays once (no loop)'}`);
    }
    if ((m[1] === 'hurt' || m[1] === 'die') && !c.frameEdits?.['0']?.flash) C.warn(`Clip ${q(name)}: the style guide starts ${m[1]} on a white flash; turn on the white flash on frame 0`);
  }
}

/**
 * Checks a studio sprite for drawing: catalog/studio-schema.js validateStudioSprite, plus top-down bone rigs (their
 * `directions` and direction clips). Returns { ok, errors, warnings, value } and never throws; value is the cleaned
 * definition (plain JSON) when ok.
 * Arguments: input (the definition, an object or JSON text), opts (as validateStudioSprite takes them: strict, soundIds, catalogIds).
 */
export function validateDataSprite(input, opts = {}) {
  const errors = [], warnings = [];
  const C = { errors, err: (m) => errors.push(m), warn: (m) => warnings.push(m) };
  const done = (ok, value) => ({ ok, errors: capList(errors), warnings: capList(warnings), value: ok ? value : null });
  try {
    let d = input;
    if (typeof input === 'string') {
      const p = parseStudioJson(input);
      warnings.push(...p.warnings);
      if (!p.ok) { errors.push(...p.errors); return done(false); }
      d = p.value;
    }
    // the whole definition, directions included, becomes our own plain copy before anything reads it
    d = plainDefinition(C, d);
    if (errors.length) return done(false);
    const S = splitTopDown(d);
    errors.push(...S.errors); warnings.push(...S.warnings);
    const v = validateStudioSprite(S.input, opts);
    errors.push(...renameBack(v.errors, S.names));
    warnings.push(...renameBack(v.warnings, S.names));
    if (!v.ok || errors.length) return done(false);
    const value = v.value;
    if (S.names.size) {
      const clips = {};
      for (const [name, c] of Object.entries(value.clips)) {
        const orig = S.names.get(name);
        if (orig) {
          const m = DIR_RE.exec(orig);
          if (c.label === cap(name)) c.label = `${cap(m[1])} (${m[2]})`;
          clips[orig] = c;
        } else clips[name] = c;
      }
      value.clips = clips;
      if (S.names.has(value.preview)) value.preview = S.names.get(value.preview);
    }
    if (S.topDown && value.body?.rig) {
      value.body.rig.view = 'top-down';
      const dirs = checkDirections(C, S.directions, value.body.rig);
      if (dirs !== undefined) {
        value.body.rig.directions = dirs;
        if (!errors.length) checkOverlaid(C, value.body.rig);
      }
      adviseTopDown(C, value.clips);
    }
    if (S.metaView !== undefined && value.meta) value.meta.view = S.metaView;
    return done(!errors.length, value);
  } catch (e) {
    errors.push(`The definition could not be checked: ${String(e?.message ?? e).slice(0, 120)}`);
    return done(false);
  }
}

// ---- posing and drawing -----------------------------------------------------------------------------------------

/**
 * A top-down rig as seen from one direction: a copy of the rig with that direction's overlay applied (bones re-posed,
 * shapes re-ordered, shown or hidden, re-proportioned) and no `directions` field. Any other rig, or a direction with
 * no overlay, comes back as a plain copy. Arguments: rig (a loadout-rig, cleaned), direction ('down', 'up' or 'side').
 */
export function directionRig(rig, direction) {
  const out = JSON.parse(JSON.stringify(rig ?? {}));
  const over = isObj(out.directions) && TOPDOWN_DIRECTIONS.includes(direction) && Object.hasOwn(out.directions, direction) ? out.directions[direction] : null;
  delete out.directions;
  if (!isObj(over)) return out;
  const patch = (list, changes, allowed) => {
    if (!Array.isArray(list) || !isObj(changes)) return;
    for (const item of list) {
      const c = item && Object.hasOwn(changes, item.id) ? changes[item.id] : null;
      if (!isObj(c)) continue;
      for (const k of allowed(item)) if (Object.hasOwn(c, k)) item[k] = c[k];
    }
  };
  patch(out.bones, over.bones, () => DIRECTION_FIELDS.bone);
  patch(out.shapes, over.shapes, (s) => [...DIRECTION_FIELDS.shape, ...(DIRECTION_FIELDS.kinds[s.kind] ?? [])]);
  return out;
}

const compiled = new WeakMap();
const compiledOf = (clip) => {
  let c = compiled.get(clip);
  if (!c) { c = compileKeys(clip.keys); compiled.set(clip, c); }
  return c;
};

/** The pose at phase t with frame `frame`'s edits on it. */
function poseAt(def, clipName, t, frame) {
  const c = def?.clips?.[clipName];
  if (!isObj(c)) return {};
  const loop = c.loop !== false;
  const pose = sampleKeys(compiledOf(c), t, { loop });
  const e = isObj(c.frameEdits) && Object.hasOwn(c.frameEdits, String(frame)) ? c.frameEdits[String(frame)] : null;
  if (isObj(e)) {
    if (Array.isArray(e.nudge)) pose.nudge = [e.nudge[0], e.nudge[1]];
    if (e.flash) pose.flash = true;
    const show = Array.isArray(e.show) ? e.show : [], hide = Array.isArray(e.hide) ? e.hide : [];
    if (show.length || hide.length) {
      pose.show = (pose.show ?? []).filter((id) => !hide.includes(id));
      pose.hide = (pose.hide ?? []).filter((id) => !show.includes(id));
      for (const id of show) if (!pose.show.includes(id)) pose.show.push(id);
      for (const id of hide) if (!pose.hide.includes(id)) pose.hide.push(id);
    }
  }
  return pose;
}

/**
 * The pose rigs/bones.js draws for one frame of a clip: the clip's keys blended at the frame's phase (rigs/keypose.js),
 * then the frame's edits (nudge, flash, show and hide, which win over the keys). Never throws; {} for an unknown clip.
 * Arguments: def (a cleaned loadout-sprite, as validateDataSprite or sprite.definition gives it), clip (its name), frame (0..frames-1).
 */
export function framePose(def, clip, frame) {
  const c = def?.clips?.[clip];
  if (!isObj(c)) return {};
  return poseAt(def, clip, framePhase(c, frame), frame);
}

/**
 * The drawing options of rigs/bones.js drawRig for a set of control values: { colours, partsOff, scale: { bones, shapes } }.
 * Sliders that scale the same bone or shape multiply. Arguments: def (a cleaned loadout-sprite with a bone rig), p (control values; missing ones take their defaults).
 */
export function drawOptions(def, p = {}) {
  const rig = def?.body?.rig ?? {};
  const colours = {};
  for (const s of rig.colours ?? []) {
    const given = !s.detail && typeof p[s.id] === 'string' ? p[s.id] : undefined;
    colours[s.id] = given ?? def.colours?.[s.id] ?? s.default;
  }
  const partsOff = Object.keys(def?.parts ?? {}).filter((n) => p[n] === false);
  const scale = { bones: {}, shapes: {} };
  for (const c of def?.controls ?? []) {
    if (!c.scales) continue;
    const k = fin(p[c.key]) ? Math.min(c.max, Math.max(c.min, p[c.key])) : c.default;
    for (const [what, ids] of Object.entries(c.scales)) for (const id of ids) scale[what][id] = (scale[what][id] ?? 1) * k;
  }
  return { colours, partsOff, scale };
}

// ---- building the sprite ----------------------------------------------------------------------------------------

const KIND = { character: 'Character', creature: 'Creature', effect: 'Effect', projectile: 'Effect', background: 'Effect', prop: 'Item', pickup: 'Item', icon: 'Item', ui: 'Item', tileset: 'Item' };   // as the library files set kind for each meta.type
const SWATCHES = { skin: SKIN, metal: METAL };

function swatchesFor(hex, material) {
  const out = [hex];
  for (const c of SWATCHES[material] ?? CLOTH) if (!out.includes(c) && out.length < 8) out.push(c);
  return out;
}

const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

/** The shapes a control changes: those painted with a colour slot, those it scales, those on the bones it scales and their children. */
function shapesOfControl(rig, what, ids) {
  if (what === 'paint') return rig.shapes.filter((s) => s.paint === ids[0]).map((s) => s.id);
  if (what === 'shapes') return ids;
  const under = new Set(ids);
  for (const b of rig.bones) if (b.parent !== null && under.has(b.parent)) under.add(b.id);
  return rig.shapes.filter((s) => under.has(s.bone)).map((s) => s.id);
}

/** The one part that owns every shape in the list, or null. */
function partOwning(parts, shapeIds) {
  if (!shapeIds.length) return null;
  const owner = new Map();
  for (const [name, part] of Object.entries(parts)) for (const s of part.shapes ?? []) owner.set(s, name);
  const first = owner.get(shapeIds[0]);
  return first && shapeIds.every((s) => owner.get(s) === first) ? first : null;
}

/** Builds the defineSprite result from a cleaned definition (validateDataSprite's value). Throws for a library body. */
function build(def) {
  if (def.body?.library !== undefined) {
    throw new Error(`studio sprite ${def.id}: the library body ${q(def.body.library)} is not drawn yet: library bodies arrive with studio item S6 (rigs/humanoid-studio.js); use a bone rig until then`);
  }
  const definition = deepFreeze(JSON.parse(JSON.stringify(def)));
  const rig = definition.body.rig;
  const topDown = rig.view === 'top-down';
  const views = topDown ? Object.fromEntries(TOPDOWN_DIRECTIONS.map((d) => [d, deepFreeze(directionRig(rig, d))])) : null;
  const rigOf = (clip) => (topDown ? views[directionOf(clip)] : rig);

  // controls: colour slots, sliders, parts; a control whose shapes all belong to one part goes into that part
  const params = {};
  const partMembers = Object.fromEntries(Object.keys(definition.parts).map((n) => [n, []]));
  const join = (key, shapeIds) => { const part = partOwning(definition.parts, shapeIds); if (part) partMembers[part].push(key); };
  for (const s of rig.colours) {
    if (s.detail) continue;
    const hex = definition.colours[s.id] ?? s.default;
    params[s.id] = color(s.label, hex, swatchesFor(hex, s.material), s.material ? { material: s.material } : {});
    join(s.id, shapesOfControl(rig, 'paint', [s.id]));
  }
  let speed = false;
  for (const c of definition.controls) {
    if (c.standard === 'speed') { speed = true; params.speed = range(c.label ?? 'Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }); continue; }
    params[c.key] = range(c.label, c.default, { min: c.min, max: c.max, ...(c.lo !== undefined ? { lo: c.lo } : {}), ...(c.hi !== undefined ? { hi: c.hi } : {}) });
    const [what, ids] = Object.entries(c.scales)[0];
    join(c.key, shapesOfControl(rig, what, ids));
  }
  const parts = {};
  for (const [name, part] of Object.entries(definition.parts)) {
    params[name] = toggle(part.label, part.default !== false);
    parts[name] = { label: part.label, params: [name, ...partMembers[name]] };
  }

  // clips and sounds
  const clips = {}, sounds = {};
  for (const [name, c] of Object.entries(definition.clips)) {
    const fps = c.fps;
    clips[name] = { frames: c.frames, loop: c.loop, label: c.label, fps: speed ? (p) => fps * lerp(0.65, 1.45, fin(p?.speed) ? p.speed : 0.5) : fps };
    if (c.sounds?.length) sounds[name] = c.sounds.map((s) => ({ ...s }));
  }

  const hasPoints = rig.points.length > 0;
  const sprite = {
    id: definition.id,
    name: definition.name,
    blurb: definition.blurb,
    ...(KIND[definition.meta?.type] ? { kind: KIND[definition.meta.type] } : {}),
    ...(definition.meta ? { meta: JSON.parse(JSON.stringify(definition.meta)) } : {}),
    size: [...definition.size],
    pivot: [...definition.pivot],
    grounded: definition.grounded !== false,
    params,
    parts,
    clips,
    sounds,
    preview: definition.preview,
    render(g, { clip, t, frame, p }) {
      drawRig(g, rigOf(clip), poseAt(definition, clip, t, frame), drawOptions(definition, p));
    },
    made: definition.made,
    definition,
  };
  if (hasPoints) {
    sprite.sockets = (clip, t, p) => {
      const c = definition.clips[clip];
      if (!c) return {};
      const r = rigOf(clip);
      return rigPoints(r, solveRig(r, poseAt(definition, clip, t, frameOfPhase(c, t)), drawOptions(definition, p)));
    };
  }
  return defineSprite(sprite);
}

/** A readable name for error messages: the definition's id when it can be read safely. */
function idHint(input) {
  let d = input;
  if (typeof input === 'string') { const p = parseStudioJson(input); d = p.ok ? p.value : null; }
  const f = field(d, 'id');
  return f.ok && typeof f.v === 'string' && f.v.length <= 40 ? f.v : '?';
}

/**
 * Turns a studio definition (`loadout-sprite`, an object or JSON text) into a sprite, as defineSprite does for a sprite
 * file: validated, then drawn by framework code. Throws an Error naming what is wrong (every error of the validator) for a
 * definition that does not pass, and for a library body until studio item S6 lands. The default export of a library file.
 * Arguments: input (the definition), opts (as validateDataSprite takes them).
 */
export function dataSprite(input, opts = {}) {
  const v = validateDataSprite(input, opts);
  if (!v.ok) throw new Error(`studio sprite ${idHint(input)}: ${v.errors.slice(0, 12).join('; ')}${v.errors.length > 12 ? `; and ${v.errors.length - 12} more` : ''}`);
  return build(v.value);
}

/**
 * The same as dataSprite, but never throws: { ok, errors, warnings, sprite } (sprite null when not ok). For the studio,
 * the bag and window.loadout, which report problems instead of failing.
 * Arguments: input (the definition, an object or JSON text), opts (as validateDataSprite takes them).
 */
export function makeDataSprite(input, opts = {}) {
  const v = validateDataSprite(input, opts);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, sprite: null };
  try {
    return { ok: true, errors: [], warnings: v.warnings, sprite: build(v.value) };
  } catch (e) {
    return { ok: false, errors: [String(e?.message ?? e)], warnings: v.warnings, sprite: null };
  }
}
