// The key blender (docs/studio.md, sections 2.2 and 8, item S2; Contract 14, rule 3). A studio clip is a list of key
// poses, each { t, ease?, ...what it changes }, and this module turns them into the pose of any phase or frame.
// It knows nothing of bones or bodies: the same blender serves a bone rig (root, bones, ik, stretch, show, hide)
// and a library body (the fields of rigs/humanoid.js pose(): lean, footF { x, y }, armF { a, e }, blink, ...).
//
//   import { clipPose } from '../rigs/keypose.js';
//   const pose = clipPose({ frames: 8, loop: true, keys: [...] }, frame);     // what the renderer draws
//
// Rules, in the words of the design:
//   - A key holds only what it changes. Every number in it, at any depth, is its own track ("bones.tail1",
//     "ik.footF.0", "armF.a"), blended between the keys that set it, so a tail can sway on four keys while the
//     legs use eight. A list made only of numbers ([dx, dy]) is a pair of tracks; any other list is one value.
//   - Everything that is not a number (flags, words, other lists) is stepped: it changes at its key. In a loop,
//     before a stepped track's first key the last key's value holds (it wrapped round); in a one-shot no key has a
//     say yet, so the field is left unset, or `base`'s value stands (a flash on frame 2 does not flash frame 0).
//     Numbers in a one-shot hold their first key's value before it, as motion.keys does.
//   - `show` and `hide` (the top-level lists of shape ids) are decided shape by shape: the latest key at or before t
//     that names a shape, in either list, decides it (inside one key, hide wins). The pose carries clean `show` and
//     `hide` lists, no shape in both; a shape in neither keeps its own `hidden` (studio.md 2.1). The lists appear
//     when a key or `base` names any shape.
//   - `ease` says how a track leaves its key toward the next: smooth (the default), linear, in, out, hold.
//   - t is the phase 0..1 exactly as engine/sprite.js gives it to render (framePhase). Key times are clamped to
//     0..1. A loop wraps t and closes by blending the last key back to the first (as motion.loopKeys, with each
//     key's own ease); a one-shot holds its first and last numbers outside its keys (as motion.keys).
//   - Angles are plain numbers: 0 -> 720 is two whole turns, never the shortest way round.
//   - Data in should come through catalog/studio-schema.js validateStudio(), which caps every count. This module
//     still treats it as untrusted and caps it itself (KEYPOSE_LIMITS): keys without a finite t, non-finite numbers,
//     __proto__ / constructor / prototype, nesting deeper than 8 levels and malformed compiled tracks are skipped.
//     Nothing here throws for bad data, and the output is a fresh plain object every call.
// Cost: a maximal clip (64 keys, 48 bones, 8 IK targets, show / hide) is about 1 ms a frame through blendKeys /
// clipPose, which compile every call, and under 0.1 ms through compileKeys once per clip + sampleKeys per frame
// (the renderer's way; sampleKeys checks each compiled track before it uses it).
// Joint limits, frame edits (nudge, show, hide, flash) and IK are the renderer's (rigs/bones.js, engine/data-sprite.js).
import { clamp, fract, smooth, easeIn, easeOut } from '../engine/motion.js';

const EASE_FN = {
  smooth,
  linear: (x) => clamp(x),
  in: easeIn,
  out: easeOut,
  hold: (x) => (x >= 1 ? 1 : 0),
};

/** The names of the five eases a key can leave by, in the order the studio lists them; smooth is the default. */
export const EASES = Object.freeze(['smooth', 'linear', 'in', 'out', 'hold']);

/** The blender's own caps, for data that skipped the validator: keys used per clip, list entries, map fields, tracks, shapes, nesting. */
export const KEYPOSE_LIMITS = Object.freeze({ keys: 64, list: 256, fields: 256, tracks: 2048, shapes: 256, depth: 8 });
const LIM = KEYPOSE_LIMITS;

const hasEase = (name) => typeof name === 'string' && Object.prototype.hasOwnProperty.call(EASE_FN, name);

/** Apply an ease by its name to x (0..1, clamped): smooth, linear, in, out or hold; an unknown or missing name is smooth. */
export function easeBy(name, x) {
  const f = hasEase(name) ? EASE_FN[name] : smooth;
  return f(Number.isFinite(x) ? x : 0);
}

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const VIS_FIELDS = ['show', 'hide'];       // in this order, so inside one key hide has the last word
const NONE = Symbol('no say');             // a stepped track with no key at or before t (one-shot)
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumList = (v) => Array.isArray(v) && v.length > 0 && v.slice(0, LIM.list).every((n) => typeof n === 'number');
const isShapeId = (v) => typeof v === 'string' && v.length > 0 && !BAD_KEYS.has(v);

// The own fields of a plain object, at most LIM.fields of them, prototype names dropped.
function fieldsOf(o) {
  const out = [];
  for (const k in o) {
    if (!Object.prototype.hasOwnProperty.call(o, k) || BAD_KEYS.has(k)) continue;
    out.push([k, o[k]]);
    if (out.length >= LIM.fields) break;
  }
  return out;
}

// Copy plain data (numbers, text, flags, lists, maps), dropping prototype keys, functions, anything too deep or too long.
function copyData(v, depth = 0) {
  if (depth > LIM.depth) return undefined;
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length && out.length < LIM.list; i++) {
      const c = copyData(v[i], depth + 1);
      if (c !== undefined) out.push(c);
    }
    return out;
  }
  if (isPlain(v)) {
    const out = {};
    for (const [k, x] of fieldsOf(v)) {
      const c = copyData(x, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' || typeof v === 'boolean' || v === null) return v;
  return undefined;
}

// The shape ids of a show or hide list: text only, no prototype names, no repeats, capped. Not a list: none.
function shapeIds(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (let i = 0; i < v.length && out.length < LIM.list; i++) if (isShapeId(v[i]) && !out.includes(v[i])) out.push(v[i]);
  return out;
}

// Visit every leaf of one key's value: numbers (finite), and stepped leaves (flags, text, null, non-number lists).
function leaves(v, path, depth, visit) {
  if (depth > LIM.depth) return;
  if (isNumList(v)) {
    const n = Math.min(v.length, LIM.list);
    for (let i = 0; i < n; i++) if (Number.isFinite(v[i])) visit([...path, i], v[i]);
  } else if (isPlain(v)) {
    for (const [k, x] of fieldsOf(v)) leaves(x, [...path, k], depth + 1, visit);
  } else if (typeof v === 'number') {
    if (Number.isFinite(v)) visit(path, v);
  } else {
    const c = copyData(v, depth);
    if (c !== undefined) visit(path, c);
  }
}

// The valid keys (the first LIM.keys in the list), t clamped to 0..1, sorted by t (stable: at a shared t the later key in the list comes later).
function cleanKeys(keys) {
  if (!Array.isArray(keys)) return [];
  const found = [];
  for (let i = 0; i < keys.length && found.length < LIM.keys; i++) {
    const k = keys[i];
    if (isPlain(k) && typeof k.t === 'number' && Number.isFinite(k.t)) found.push({ k, t: clamp(k.t), i });
  }
  return found.sort((a, b) => a.t - b.t || a.i - b.i).map(({ k, t }) => ({ k, t }));
}

/**
 * Turn a clip's key list into tracks, once, for sampling many frames: { tracks: [{ path, numeric, keys: [{ t, v, ease }] }], shapes: [{ id, keys: [{ t, v }] }] }.
 * Arguments: keys, the clip's keys ({ t, ease?, ...fields }), in any order. The result is plain data and does not share anything with the keys.
 * shapes holds the show / hide decisions, one stepped track per shape id (v true: shown, false: hidden).
 */
export function compileKeys(keys) {
  const byPath = new Map();
  const byShape = new Map();
  for (const { k: key, t } of cleanKeys(keys)) {
    const ease = hasEase(key.ease) ? key.ease : 'smooth';
    for (const field of VIS_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(key, field)) continue;
      for (const id of shapeIds(key[field])) {
        let tr = byShape.get(id);
        if (!tr) {
          if (byShape.size >= LIM.shapes) continue;
          tr = { id, keys: [] }; byShape.set(id, tr);
        }
        tr.keys.push({ t, v: field === 'show' });
      }
    }
    for (const [field, value] of fieldsOf(key)) {
      if (field === 't' || field === 'ease' || VIS_FIELDS.includes(field)) continue;
      leaves(value, [field], 1, (path, v) => {
        const id = path.map((p) => (typeof p === 'number' ? `\u0002${p}` : p)).join('\u0001');
        let tr = byPath.get(id);
        if (!tr) {
          if (byPath.size >= LIM.tracks) return;
          tr = { path, numeric: true, keys: [] }; byPath.set(id, tr);
        }
        if (typeof v !== 'number') tr.numeric = false;
        tr.keys.push({ t, v, ease });
      });
    }
  }
  return { tracks: [...byPath.values()], shapes: [...byShape.values()] };
}

// The index of the last key at or before t (-1 when t is before every key).
function lastAtOrBefore(ks, t) {
  let i = -1;
  for (let j = 0; j < ks.length && ks[j].t <= t; j++) i = j;
  return i;
}

// A stepped value at phase t: the last key at or before t; before the first key, the last key in a loop, NONE in a one-shot.
function steppedKey(ks, t, loop) {
  const i = lastAtOrBefore(ks, t);
  if (i >= 0) return ks[i];
  return loop ? ks[ks.length - 1] : NONE;
}

// The value of one track at phase t (already wrapped for a loop, clamped for a one-shot); NONE when it has no say.
function trackValue(tr, t, loop) {
  const ks = tr.keys;
  const n = ks.length;
  if (!tr.numeric) {
    const k = steppedKey(ks, t, loop);
    return k === NONE ? NONE : copyData(k.v);
  }
  const i = lastAtOrBefore(ks, t);
  let a, b, t0, t1;
  if (i < 0) {
    if (!loop) return ks[0].v;
    a = ks[n - 1]; b = ks[0]; t0 = a.t - 1; t1 = b.t;
  } else if (i === n - 1) {
    if (!loop) return ks[i].v;
    a = ks[i]; b = ks[0]; t0 = a.t; t1 = b.t + 1;
  } else {
    a = ks[i]; b = ks[i + 1]; t0 = a.t; t1 = b.t;
  }
  const u = (t - t0) / (t1 - t0 || 1e-6);
  return a.v + (b.v - a.v) * easeBy(a.ease, u);
}

// Keys of a compiled track that sampling can trust: a non-empty list, each plain with a finite t, in time order, v checked by ok(v).
function goodKeys(ks, ok) {
  if (!Array.isArray(ks) || ks.length === 0 || ks.length > LIM.keys) return false;
  let last = -Infinity;
  for (const k of ks) {
    if (!isPlain(k) || typeof k.t !== 'number' || !Number.isFinite(k.t) || k.t < last || !ok(k.v)) return false;
    last = k.t;
  }
  return true;
}

// A path segment that is safe to write: a field name (not a prototype name) or a list index under the list cap.
const goodSegment = (s) => (typeof s === 'string' && !BAD_KEYS.has(s)) || (Number.isInteger(s) && s >= 0 && s < LIM.list);

// A compiled track that sampling can trust (compileKeys makes only these; anything else is skipped).
function goodTrack(tr) {
  if (!isPlain(tr) || !Array.isArray(tr.path) || tr.path.length === 0 || tr.path.length > LIM.depth + 2) return false;
  if (!tr.path.every(goodSegment)) return false;
  return goodKeys(tr.keys, tr.numeric === false ? () => true : (v) => typeof v === 'number' && Number.isFinite(v));
}

// Write v at path inside out, making maps and lists on the way (a number in the path means a list). Paths are goodTrack's.
function put(out, path, v) {
  let o = out;
  for (let d = 0; d < path.length - 1; d++) {
    const k = path[d];
    const wantList = typeof path[d + 1] === 'number';
    const here = Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
    if (here === null || typeof here !== 'object' || Array.isArray(here) !== wantList) o[k] = wantList ? [] : {};
    o = o[k];
  }
  o[path[path.length - 1]] = v;
}

// Settle show / hide on out: base's lists first (hide wins a shape in both), then every shape a key has a say on at t.
function settleShapes(out, shapes, t, loop) {
  const said = new Map();
  const fromBase = VIS_FIELDS.some((f) => Array.isArray(out[f]));
  for (const f of VIS_FIELDS) for (const id of shapeIds(out[f])) { said.delete(id); said.set(id, f === 'show'); }
  let any = fromBase;
  for (let s = 0; s < shapes.length && s < LIM.shapes; s++) {
    const tr = shapes[s];
    if (!isPlain(tr) || !isShapeId(tr.id) || !goodKeys(tr.keys, (v) => typeof v === 'boolean')) continue;
    any = true;
    const k = steppedKey(tr.keys, t, loop);
    if (k !== NONE) said.set(tr.id, k.v);
  }
  for (const f of VIS_FIELDS) delete out[f];
  if (!any) return;
  out.show = []; out.hide = [];
  for (const [id, shown] of said) (shown ? out.show : out.hide).push(id);
}

/**
 * Sample compiled keys at phase t: a fresh pose object of the keys' shape, every track blended (numbers) or stepped (the rest).
 * Arguments: compiled, from compileKeys; t, phase 0..1 (wrapped for a loop, clamped for a one-shot); loop: true (default) closes the
 * loop last key -> first; base: a pose whose fields stand where no key sets them or has a say yet (copied, never changed).
 */
export function sampleKeys(compiled, t, { loop = true, base } = {}) {
  const out = isPlain(base) ? copyData(base) : {};
  const c = isPlain(compiled) ? compiled : {};
  const tracks = Array.isArray(c.tracks) ? c.tracks : [];
  const shapes = Array.isArray(c.shapes) ? c.shapes : [];
  let at = Number.isFinite(t) ? t : 0;
  at = loop ? fract(at) : clamp(at);
  for (let i = 0; i < tracks.length && i < LIM.tracks; i++) {
    const tr = tracks[i];
    if (!goodTrack(tr)) continue;
    const v = trackValue(tr, at, loop);
    if (v !== NONE) put(out, tr.path, v);
  }
  settleShapes(out, shapes, at, loop);
  return out;
}

/**
 * Blend key poses at phase t: the pose, with each track blended between the keys that set it by the leaving key's ease.
 * Arguments: keys, [{ t, ease?, ...fields }]; t, phase 0..1; loop: true (default) or false for a one-shot; base: fields no key sets.
 */
export function blendKeys(keys, t, { loop = true, base } = {}) {
  return sampleKeys(compileKeys(keys), t, { loop, base });
}

/** The phase 0..1 of a frame of a clip ({ frames, loop }), exactly as engine/sprite.js gives it: loops stop short of 1, one-shots end on it. */
export function framePhase(clip, frame) {
  const frames = Math.max(1, Math.floor(clip?.frames) || 1);
  const loop = clip?.loop ?? true;
  return loop ? frame / frames : frames > 1 ? frame / (frames - 1) : 0;
}

/** The frame of a clip ({ frames, loop }) whose phase is nearest t: wraps round a loop, clamps a one-shot; undoes framePhase. */
export function frameOfPhase(clip, t) {
  const frames = Math.max(1, Math.floor(clip?.frames) || 1);
  const loop = clip?.loop ?? true;
  const at = Number.isFinite(t) ? t : 0;
  if (loop) return Math.round(fract(at) * frames) % frames;
  return frames > 1 ? Math.round(clamp(at) * (frames - 1)) : 0;
}

/**
 * The pose of one frame of a clip: its keys blended at the frame's phase, loops closed. Never throws.
 * Arguments: clip, { frames, loop, keys }; frame, 0..frames-1; base: a pose for the fields no key sets (a library body's rest pose).
 */
export function clipPose(clip, frame, { base } = {}) {
  const loop = clip?.loop ?? true;
  return blendKeys(clip?.keys, framePhase(clip, frame), { loop, base });
}

// Fold b into a (both copies): show / hide merge shape by shape (b's say wins, no shape in both), other maps merge
// field by field, anything else in b replaces a's.
function mergeInto(a, b, top = true) {
  for (const [k, v] of Object.entries(b)) {
    if (top && VIS_FIELDS.includes(k)) continue;
    if (isPlain(v) && isPlain(a[k])) mergeInto(a[k], v, false);
    else a[k] = v;
  }
  if (top) {
    for (const f of VIS_FIELDS) {
      if (!Array.isArray(b[f])) continue;
      const other = f === 'show' ? 'hide' : 'show';
      const mine = Array.isArray(a[f]) ? a[f] : (a[f] = []);
      for (const id of b[f]) {
        if (Array.isArray(a[other])) a[other] = a[other].filter((x) => x !== id);
        if (!mine.includes(id)) mine.push(id);
      }
    }
  }
  return a;
}

/**
 * Put every key on a frame of the clip (when its frame count or looping changed), keeping its place in the motion.
 * Keys that land on one frame become one key (later keys' fields win, maps merge, show / hide merge shape by shape);
 * returns { keys, merged: [{ frame, keys }] }. Arguments: keys, the clip's keys; clip, { frames, loop } as it is now. The input is not changed.
 */
export function snapKeys(keys, clip) {
  const byFrame = new Map();
  for (const { k: key, t } of cleanKeys(keys)) {
    const frame = frameOfPhase(clip, t);
    const c = copyData(key);
    const slot = byFrame.get(frame);
    if (!slot) byFrame.set(frame, { key: c, count: 1 });
    else { mergeInto(slot.key, c); slot.count++; }
  }
  const frames = [...byFrame.keys()].sort((a, b) => a - b);
  return {
    keys: frames.map((f) => ({ ...byFrame.get(f).key, t: framePhase(clip, f) })),
    merged: frames.filter((f) => byFrame.get(f).count > 1).map((f) => ({ frame: f, keys: byFrame.get(f).count })),
  };
}

// ---- travel: how far a clip's keys move (build item F5; docs/data-sprites.md 2.2 "Motion sliders") ----------------
// A data sprite cannot scale a clip's motion by code, so a clip may list `travel` entries, { tracks, by, about? }:
// every numeric track a path names ("root.1", "ik.legF.0") or that lies under it ("ik.legF", "bones") moves `by`
// times as far from its pivot as its keys say. Pivots (about): first (the track's value at its earliest key, the
// default), mid (halfway between its least and most), least, most, or a number. engine/resolve.js works `by` out at
// the person's settings and calls travelKeys on each resolved clip, so the keys are scaled before they are blended.

/** The caps of travelKeys: entries read per clip, tracks per entry, path segments per track, the largest factor (each entry's by is held to 0..most). */
export const TRAVEL_LIMITS = Object.freeze({ entries: 16, tracks: 16, segments: 4, most: 3 });

/** The named pivots a travel entry scales about (`about`); a number is also a pivot. */
export const TRAVEL_ABOUT = Object.freeze(['first', 'mid', 'least', 'most']);

/** The sides a travel entry may keep to (`side`): only the values below (less than) or above (more than) the pivot move; left out, both. */
export const TRAVEL_SIDES = Object.freeze(['below', 'above']);

const TRAVEL_FIXED = new Set(['t', 'ease', ...VIS_FIELDS, 'swap', 'emit']);   // never scaled: times, eases, shape lists, stamp swaps, emitter keys (priced once, B12b)

// A track path as segments, or null: text of 1..TRAVEL_LIMITS.segments dot-separated names, none empty or a prototype name, not a fixed field.
function travelPath(s) {
  if (typeof s !== 'string' || !s || s.length > 160) return null;
  const segs = s.split('.');
  if (segs.length > TRAVEL_LIMITS.segments || segs.some((x) => !x || BAD_KEYS.has(x)) || TRAVEL_FIXED.has(segs[0])) return null;
  return segs;
}

// One entry made safe: { paths, k, about } or null when it does nothing (no good track, a factor of 1 or not a number, a bad pivot).
function travelEntry(e) {
  if (!isPlain(e) || !Array.isArray(e.tracks) || typeof e.by !== 'number' || !Number.isFinite(e.by)) return null;
  const k = Math.min(TRAVEL_LIMITS.most, Math.max(0, e.by));
  if (k === 1) return null;
  const about = e.about === undefined ? 'first' : e.about;
  if (!(TRAVEL_ABOUT.includes(about) || (typeof about === 'number' && Number.isFinite(about)))) return null;
  if (e.side !== undefined && !TRAVEL_SIDES.includes(e.side)) return null;
  const paths = e.tracks.slice(0, TRAVEL_LIMITS.tracks).map(travelPath).filter(Boolean);
  return paths.length ? { paths, k, about, side: e.side } : null;
}

const under = (track, path) => track.length <= path.length && track.every((s, i) => s === String(path[i]));

// Write v at path inside a copied key (the path exists: it came from leaves() of that key).
function putAt(o, path, v) {
  let x = o;
  for (let d = 0; d < path.length - 1; d++) x = x[path[d]];
  x[path[path.length - 1]] = v;
}

/**
 * Scale how far a clip's keys travel: a fresh copy of keys with each named track moved `by` times as far from its pivot.
 * Arguments: keys, the clip's keys; entries, [{ tracks: ["root.1", "ik.legF", ...], by: number, about?: first | mid |
 * least | most | number }] applied in order (by held to 0..TRAVEL_LIMITS.most; by exactly 1 leaves a track as it is);
 * limit(path) -> [lo, hi] | null, what each scaled value is held to. t, ease, show, hide, swap and emit never move.
 * Never throws; the keys given are not changed.
 */
export function travelKeys(keys, entries, { limit } = {}) {
  const out = Array.isArray(keys) ? keys.slice(0, LIM.list).map((k) => copyData(k) ?? null) : [];
  const list = Array.isArray(entries) ? entries.slice(0, TRAVEL_LIMITS.entries).map(travelEntry).filter(Boolean) : [];
  const hold = (path, v) => {
    if (typeof limit !== 'function') return v;
    let r;
    try { r = limit(path); } catch { return v; }
    return Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] <= r[1] ? Math.min(r[1], Math.max(r[0], v)) : v;
  };
  for (const { paths, k, about, side } of list) {
    // every numeric leaf a path names, by track: its keys in time order (a key's place in the list breaks ties)
    const byTrack = new Map();
    const timed = out.map((key, i) => ({ key, i })).filter(({ key }) => isPlain(key) && typeof key.t === 'number' && Number.isFinite(key.t));
    timed.sort((a, b) => a.key.t - b.key.t || a.i - b.i);
    for (const { key } of timed) {
      for (const [field, value] of fieldsOf(key)) {
        if (TRAVEL_FIXED.has(field)) continue;
        leaves(value, [field], 1, (path, v) => {
          if (typeof v !== 'number' || !paths.some((p) => under(p, path))) return;
          const id = path.join('\u0001');
          let tr = byTrack.get(id);
          if (!tr) { if (byTrack.size >= LIM.tracks) return; tr = { path, at: [] }; byTrack.set(id, tr); }
          tr.at.push({ key, v });
        });
      }
    }
    for (const tr of byTrack.values()) {
      const vs = tr.at.map((a) => a.v);
      const lo = Math.min(...vs), hi = Math.max(...vs);
      const pivot = typeof about === 'number' ? about : about === 'mid' ? (lo + hi) / 2 : about === 'least' ? lo : about === 'most' ? hi : vs[0];
      for (const a of tr.at) {
        if ((side === 'below' && !(a.v < pivot)) || (side === 'above' && !(a.v > pivot))) continue;   // only that side of the pivot moves
        const v = hold(tr.path, pivot + (a.v - pivot) * k);
        if (Number.isFinite(v)) putAt(a.key, tr.path, v === 0 ? 0 : v);
      }
    }
  }
  return out;
}

/**
 * The track paths a clip's travel names that no key of the clip moves (review fix of build item F5): each such path,
 * once, in the order named, whatever its factor (a slider at its middle still hears of "ik.lefF"); t, ease, show, hide,
 * swap and emit always count as missed. engine/resolve.js turns them into warnings, since a base's IK chains are not in
 * the summary the schema checks against. Arguments: keys, entries (as travelKeys). Never throws.
 */
export function travelMisses(keys, entries) {
  const ks = Array.isArray(keys) ? keys.slice(0, LIM.list).filter(isPlain) : [];
  const out = [];
  for (const e of Array.isArray(entries) ? entries.slice(0, TRAVEL_LIMITS.entries) : []) {
    if (!isPlain(e) || !Array.isArray(e.tracks)) continue;
    for (const s of e.tracks.slice(0, TRAVEL_LIMITS.tracks)) {
      if (typeof s !== 'string' || !s || s.length > 160 || out.includes(s)) continue;
      const segs = s.split('.');
      if (segs.some((x) => !x || BAD_KEYS.has(x))) continue;
      const path = travelPath(s);
      let hit = false;
      if (path) {
        for (const key of ks) {
          for (const [field, value] of fieldsOf(key)) {
            if (hit || TRAVEL_FIXED.has(field) || field !== path[0]) continue;
            leaves(value, [field], 1, (p, v) => { if (!hit && typeof v === 'number' && under(path, p)) hit = true; });
          }
          if (hit) break;
        }
      }
      if (!hit) out.push(s);
    }
  }
  return out;
}
