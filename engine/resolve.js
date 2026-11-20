// The settings resolver (docs/data-sprites.md section 4.1 step 2, build item B4; Contract 15). A sprite is data: a
// `loadout-sprite` definition (version 2, catalog/sprite-schema.js; version 1 bone rigs too) whose numbers may be
// bound to the person's settings by tables, whose shapes may hold only while settings say so, whose colours may be
// worked out from other colours by named rules, and which may name shared pieces (pieces/, engine/pieces.js). This
// module turns a definition plus one person's settings into concrete values, with nothing left to work out:
//
//   resolveSprite(def, settings, { pieces, generators })   -> the resolved sprite (below), once per settings
//   expandFrame(resolved, list, ctx)                       -> the shape list of one frame (engine/draw-list.js draws it)
//
// What resolveSprite does, in order:
//   1. checks the definition (catalog/sprite-schema.js validateSprite; `validated: true` skips the check but keeps the
//      plain-data wall and every cap below);
//   2. cleans the settings (cleanSettings): every control at a value it takes, old saved settings mapped (a choice's
//      `was` for a renamed option, the sprite's `was: { controls: { oldKey: newKey } }` for a renamed control, a
//      removed control dropped), sliders clamped, colours "#rrggbb";
//   3. works out which controls are in effect and which parts are off (Contract 3: `when`, parts and their none);
//   4. the palette: each slot's colour at the settings, derived slots by their colour rule (engine/data-rules.js);
//   5. the body: every binding ({ from, map, round } a table from a slider, { from, pick } a value per option,
//      { from } the setting itself) replaced by its value; every item whose `when` fails, and every shape of a part
//      that is off, left out; a `when` naming clip or direction kept (only that part of it) for the frame to decide;
//      pieces named with `use` drawn in (their args from values or bindings, held to the piece's own types; their
//      colour slots painted as engine/pieces.js bindSlots says: the use's paint map, else the palette slot of the same
//      id, else the slot's default); a base piece (`extends`) merged into the rig by id; skins and materials named
//      with `use` resolved in place; the scale of each bone and shape from sliders with `scales`;
//   6. the clips: inherited from the base (`from`), fps at the Speed setting, sound cues whose `when` fails left out.
// Generator calls ({ gen, v, ...args }) stay calls, their arguments resolved: they run per frame (expandFrame), where
// clip and direction are known, through the generator registry (engine/gen/registry.js), and the pieces they place
// are drawn in, and colour rules still standing in paints become '#rrggbb'.
//
// THE RESOLVED SPRITE (deep-frozen plain data; a failed one has ok false, errors, and null body, palette and clips):
//   { ok, errors, warnings, version, id, name, meta, size, pivot, grounded, styles, preview, rev, made,
//     params      every setting as used (cleanSettings), notes (what cleaning did), active (controls in effect),
//     partsOff    names of the parts that are off,
//     palette     { slot: { hex, detail, material, derived?, piece?, slot?, lost? } }: the sprite's slots and the slots a
//                 piece's colour needed (a tone or a rule mapped to a piece slot, or a piece slot's default), each a slot
//                 of its own so its tones work; engine/draw-list.js takes it as its palette. lost: true marks a slot
//                 whose colour could not be worked out (its hex is FALLBACK only as a stand-in; never test the colour),
//     lost        the ids of the palette's lost slots (engine/data-sprite.js makes a frame painting one an error),
//     materials   { rest, slots: { slot: material } } (Contract 7 read from the data; materialTable gives theme.js's form),
//     scales      { bones: { id: factor }, shapes: { id: factor } },
//     body        { kind, <kind>: the body resolved } (kind: rig, tiles, layers, panel, emitters, pictures; an emitters
//                 body also carries its `nodes` and `draw` beside them, resolved alike), base (the
//                 base piece "id@v" a rig extends, or null), pieces (every piece drawn, "id@v", sorted),
//     clips       { name: { label, frames, fps, fpsBase, loop, keys, frameEdits, sounds, from?, noText? } },
//     points, slice, textArea }
// A piece drawn in takes the id of its use (so show, hide and frame edits act on the whole piece), the use's `on`, its
// z added to each item's, and its group, glow, hidden, far, part, shade and light where an item sets none; a use with
// `at` moves the piece's points by it. Inside a piece's body a binding or a `when` names the piece's args.
//
// SAFETY (section 3.4). Nothing in a definition or a setting is ever run: no getter is read, no valueOf called, no
// text evaluated. Every walk is capped (RESOLVE_LIMITS: values, nesting, list lengths, pieces drawn, pieces inside
// pieces, slots added), and a cap reached is an error, never a hang. Every function returns plain data and never throws.
// Deterministic: no clock, no randomness; the same definition and settings give the same result.
// Pure JavaScript with no page, worker or Node in it: the site, the build and the tests all import this file.
import { paintColour, COLOUR_RULES, FALLBACK, whenMatches } from './data-rules.js';
import { ramp, farRamp, INK, hexToRgb } from './color.js';
import { lerp } from './motion.js';
import { lostPaints } from './draw-list.js';
import { restMaterial } from './materials.js';
import { parsePieceRef, pieceRegistry } from './pieces.js';
import { validateSprite, plainSpriteData, checkMaterialPiece } from '../catalog/sprite-schema.js';   // checkMaterialPiece: build item B15 review
import * as SITE from './gen/index.js';
import { tileClips, tileClipNames } from './gen/tiles-clips.js';

/** The caps of one resolve: setting keys read, text of a setting, notes kept, values walked, nesting, items in a list, pieces drawn, pieces inside pieces, slots pieces may add, points of a table. */
export const RESOLVE_LIMITS = Object.freeze({ settings: 256, text: 64, notes: 64, values: 60000, depth: 24, list: 4000, uses: 256, pieceDepth: 4, slots: 64, mapPoints: 32 });

/** The Speed setting's effect on every clip: fps times lerp(SPEED_FPS[0], SPEED_FPS[1], speed), as every catalogue clip plays. */
export const SPEED_FPS = Object.freeze([0.65, 1.45]);

/** The bodies a definition may have, one per kind of sprite (docs/data-sprites.md 1.2). */
export const RESOLVED_BODIES = Object.freeze(['rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures']);

const L = RESOLVE_LIMITS;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SLOT_ID = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const BINDING_KEYS = new Set(['from', 'map', 'round', 'pick']);
const SCENE = new Set(['clip', 'direction']);
const TONES = new Set(['light', 'base', 'dark', 'deep', 'far']);
const NUMBER_TYPES = new Set(['px', 'share', 'count', 'angle', 'seed']);
const TYPE_RANGE = { share: [0, 1], angle: [-720, 720], seed: [0, 9999] };
// Keys whose text, when it names a piece slot, is a paint (a piece body's own fields: a skin's, a material's). Text
// with a tone ("face.dark") is a paint wherever it stands.
const PAINT_KEYS = new Set(['paint', 'base', 'colour', 'outline', 'core', 'tint', 'light', 'grain', 'shadow', 'rim', 'edge', 'fill', 'ink']);
const PAINT_LIST_KEYS = new Set(['paints', 'stops']);
const CARRY = ['group', 'glow', 'hidden', 'far', 'part', 'shade', 'light'];
const DROP = Symbol('drop');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => isObj(o) && Object.hasOwn(o, k);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const cap = (s) => (typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1) : s);
const say = (v) => { try { return typeof v === 'string' ? `"${v.slice(0, 40)}"` : String(JSON.stringify(v)).slice(0, 40); } catch { return typeof v; } };
const msg = (e) => String(e?.message ?? e).slice(0, 300);
const lower = (h) => (typeof h === 'string' && HEX.test(h) ? h.toLowerCase() : null);
const same = (a, b) => (typeof a === 'string' && typeof b === 'string' && HEX.test(a) && HEX.test(b) ? a.toLowerCase() === b.toLowerCase() : Object.is(a, b) || (a === 0 && b === 0));
const deepFreeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); } return v; };

class Stop extends Error {}

// ---- the settings table ---------------------------------------------------------------------------------------------

/** The palette slots of a definition: version 2 `palette` (or its alias `colours` as a list), or version 1's rig colours with the sprite's `colours` defaults. */
function slotsOf(def) {
  if (!isObj(def)) return [];
  const list = Array.isArray(def.palette) ? def.palette : Array.isArray(def.colours) ? def.colours : null;
  if (list) return list.filter((s) => isObj(s) && typeof s.id === 'string').slice(0, 32);
  const rig = isObj(def.body) && isObj(def.body.rig) ? def.body.rig : null;
  const given = isObj(def.colours) ? def.colours : {};
  return (Array.isArray(rig?.colours) ? rig.colours : []).filter((s) => isObj(s) && typeof s.id === 'string').slice(0, 32)
    .map((s) => ({ ...s, default: lower(has(given, s.id) ? given[s.id] : null) ?? s.default }));
}

/** The parts of a definition as one shape: [{ name, selector, params, none (a list), shapes }]. Version 1's { label, shapes, default } is an on/off keyed by its name. */
function partsOf(def) {
  const out = [];
  if (!isObj(def) || !isObj(def.parts)) return out;
  for (const name of Object.keys(def.parts).slice(0, 32)) {
    const p = def.parts[name];
    if (!isObj(p) || BAD_KEYS.has(name)) continue;
    const shapes = Array.isArray(p.shapes) ? p.shapes.filter((s) => typeof s === 'string') : [];
    if (Array.isArray(p.params) && p.params.length) out.push({ name, selector: p.params[0], params: p.params.filter((k) => typeof k === 'string'), none: p.none === undefined ? undefined : [].concat(p.none), shapes });
    else out.push({ name, selector: name, params: [name], none: [false], shapes, v1: true, default: p.default !== false });
  }
  return out;
}

const TABLES = new WeakMap();
/** The settings of a definition as a Map key -> { key, kind, min, max, step?, default, values?, was?, when?, scales?, look?, speed?, slot? }. */
function tableOf(def) {
  if (!isObj(def)) return new Map();
  if (Object.isFrozen(def) && TABLES.has(def)) return TABLES.get(def);
  const T = new Map();
  const slots = slotsOf(def);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const colourSlot = (s) => s && s.derive === undefined && s.detail !== true;
  for (const c of Array.isArray(def.controls) ? def.controls.slice(0, 64) : []) {
    if (!isObj(c) || typeof c.key !== 'string' || BAD_KEYS.has(c.key)) continue;
    const base = { key: c.key, label: typeof c.label === 'string' ? c.label : undefined };
    if (c.when !== undefined) base.when = c.when;
    if (c.look !== undefined) base.look = c.look;
    if (c.standard === 'speed') { T.set('speed', { ...base, key: 'speed', kind: 'range', min: 0, max: 1, default: 0.5, speed: true }); continue; }
    const kind = c.kind === 'slider' || c.kind === undefined ? 'range' : c.kind;
    if (kind === 'colour') {
      const s = slotById.get(c.key);
      if (colourSlot(s)) T.set(c.key, { ...base, kind: 'colour', default: lower(s.default) ?? '#000000', slot: true });
      continue;
    }
    if (kind === 'choice') {
      const values = (Array.isArray(c.options) ? c.options : []).map((o) => (isObj(o) ? o.value : o)).filter((v) => typeof v === 'string');
      if (!values.length) continue;
      T.set(c.key, { ...base, kind: 'choice', values, default: values.includes(c.default) ? c.default : values[0], ...(isObj(c.was) ? { was: c.was } : {}) });
      continue;
    }
    if (kind === 'toggle') { T.set(c.key, { ...base, kind: 'toggle', default: c.default === true }); continue; }
    if (kind !== 'range') continue;
    const min = fin(c.min) ? c.min : 0, max = fin(c.max) && c.max > min ? c.max : min + 1;
    const e = { ...base, kind: 'range', min, max, default: fin(c.default) ? clamp(c.default, min, max) : (min + max) / 2 };
    if (fin(c.step)) e.step = c.step;
    if (isObj(c.scales)) e.scales = c.scales;
    T.set(c.key, e);
  }
  for (const s of slots) if (colourSlot(s) && !T.has(s.id) && !BAD_KEYS.has(s.id)) T.set(s.id, { key: s.id, label: s.label, kind: 'colour', default: lower(s.default) ?? '#000000', slot: true });
  for (const p of partsOf(def)) if (p.v1 && !T.has(p.name)) T.set(p.name, { key: p.name, kind: 'toggle', default: p.default, part: true });
  if (Object.isFrozen(def)) TABLES.set(def, T);
  return T;
}

/** Every setting of a definition, keyed by its key: { kind (range, choice, toggle, colour), min, max, default, values, was, when, scales, speed, slot } (colour slots with a control and version 1 part switches included). Arguments: def. */
export function settingTable(def) {
  try { return Object.fromEntries([...tableOf(def)].map(([k, v]) => [k, clone(v)])); } catch { return {}; }
}

/** Every setting of a definition at its default: { key: value }. Arguments: def. */
export function defaultSettings(def) {
  try { return Object.fromEntries([...tableOf(def)].map(([k, v]) => [k, v.default])); } catch { return {}; }
}

/** Own plain values of an input object, read without running anything: at most RESOLVE_LIMITS.settings keys, no getters, prototype keys skipped. */
function readValues(x) {
  const out = new Map();
  if (!isObj(x)) return out;
  let keys;
  try { keys = Object.keys(x); } catch { return out; }
  for (const k of keys.slice(0, L.settings)) {
    if (BAD_KEYS.has(k)) continue;
    let d;
    try { d = Object.getOwnPropertyDescriptor(x, k); } catch { continue; }
    if (!d || !('value' in d)) continue;
    const v = d.value;
    if (typeof v === 'number' || typeof v === 'boolean' || v === null || (typeof v === 'string' && v.length <= L.text) || (k === 'params' && isObj(v))) out.set(k, v);
    else out.set(k, undefined);
  }
  return out;
}

const TRUE = new Set([true, 'true', 1, '1', 'on', 'yes']);
const FALSE = new Set([false, 'false', 0, '0', 'off', 'no']);

/**
 * A person's settings cleaned against a definition: every setting at a value it takes. Old saved settings are mapped
 * (docs/data-sprites.md section 7): a key renamed by the sprite's `was: { controls: { old: new } }` is read under its
 * new key (the new key wins when both are given), an option renamed by a choice's `was` becomes its new name, a key the
 * sprite no longer has is dropped. Sliders are clamped, on/off read from true/false/1/0/"true"..., colours "#rrggbb".
 * Takes the settings or a bag item's { params }. Returns { params, notes: { renamed: { old: new }, remapped: { key:
 * [old, new] }, dropped: [keys], clamped: [keys], refused: [keys] } }; never throws. Arguments: def, input.
 */
export function cleanSettings(def, input) {
  const notes = { renamed: {}, remapped: {}, dropped: [], clamped: [], refused: [] };
  const T = (() => { try { return tableOf(def); } catch { return new Map(); } })();
  const params = {};
  for (const [k, d] of T) params[k] = d.default;
  try {
    let src = readValues(input);
    if (src.has('params') && isObj(src.get('params')) && !T.has('params')) src = readValues(src.get('params'));
    src.delete('params');
    const ren = isObj(def) && isObj(def.was) && isObj(def.was.controls) ? def.was.controls : null;
    if (ren) {
      for (const old of Object.keys(ren).slice(0, 64)) {
        const now = ren[old];
        if (BAD_KEYS.has(old) || typeof now !== 'string' || !T.has(now) || T.has(old) || !src.has(old)) continue;
        if (!src.has(now) || src.get(now) === undefined || src.get(now) === null) src.set(now, src.get(old));
        src.delete(old);
        notes.renamed[old] = now;
      }
    }
    for (const k of src.keys()) if (!T.has(k) && notes.dropped.length < L.notes) notes.dropped.push(k);
    for (const [k, d] of T) {
      if (!src.has(k)) continue;
      const v = src.get(k);
      if (v === null) continue;
      const refuse = () => { if (notes.refused.length < L.notes) notes.refused.push(k); };
      if (v === undefined) { refuse(); continue; }
      if (d.kind === 'range') {
        const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
        if (!Number.isFinite(n)) { refuse(); continue; }
        const c = clamp(n, d.min, d.max);
        if (c !== n) notes.clamped.push(k);
        params[k] = c;
      } else if (d.kind === 'choice') {
        if (typeof v === 'string' && d.values.includes(v)) { params[k] = v; continue; }
        const s = String(v);
        if (isObj(d.was) && Object.hasOwn(d.was, s) && d.values.includes(d.was[s])) { params[k] = d.was[s]; notes.remapped[k] = [s, d.was[s]]; continue; }
        refuse();
      } else if (d.kind === 'toggle') {
        if (TRUE.has(v)) params[k] = true; else if (FALSE.has(v)) params[k] = false; else refuse();
      } else if (d.kind === 'colour') {
        const h = lower(v);
        if (h) params[k] = h; else refuse();
      }
    }
  } catch { /* the defaults stand */ }
  return { params, notes };
}

/** A ready-made version's settings (Contract 1), cleaned as cleanSettings does (so old names in it are mapped): { params, notes }, or null when the definition has no version of that name. Arguments: def, name. */
export function versionSettings(def, name) {
  try {
    const v = (isObj(def) && Array.isArray(def.versions) ? def.versions : []).find((x) => isObj(x) && x.name === name);
    return v ? cleanSettings(def, isObj(v.params) ? v.params : {}) : null;
  } catch { return null; }
}

// ---- conditions, parts, bindings ----------------------------------------------------------------------------------

const valueOf = (T, params, k) => (isObj(params) && Object.hasOwn(params, k) && params[k] !== undefined ? params[k] : T.get(k)?.default);

/**
 * Splits a `when` against the settings: true (holds), false (fails), or what is left of it once every control is
 * decided: the clip and direction conditions of the alternatives still open (same form: an object, or a list). With a
 * scene ({ clip, direction }) those are decided too. ctx: { T, params, def (null inside a piece: args are always in
 * effect), scene, trail }.
 */
function splitWhen(when, ctx) {
  if (when === undefined || when === null) return true;
  const alts = Array.isArray(when) ? when : [when];
  const open = [];
  for (const alt of alts.slice(0, 16)) {
    if (!isObj(alt)) continue;
    let ok = true;
    const rest = {};
    for (const k of Object.keys(alt).slice(0, 32)) {
      const vals = Array.isArray(alt[k]) ? alt[k] : [alt[k]];
      if (SCENE.has(k)) {
        if (ctx.scene) { if (!vals.some((v) => same(v, ctx.scene[k] ?? null))) { ok = false; break; } }
        else rest[k] = [...vals];
        continue;
      }
      if (!ctx.T.has(k)) { ok = false; break; }
      if (!vals.some((v) => same(v, valueOf(ctx.T, ctx.params, k)))) { ok = false; break; }
      if (ctx.def && !effective(ctx.T, ctx.def, k, ctx.params, ctx.trail ?? [])) { ok = false; break; }
    }
    if (!ok) continue;
    if (!Object.keys(rest).length) return true;
    open.push(rest);
  }
  if (!open.length) return false;
  return Array.isArray(when) ? open : open[0];
}

/** A control's part (the part whose params name it), as partsOf gives it, or null. */
const partFor = (def, key) => partsOf(def).find((p) => p.params.includes(key)) ?? null;

/** True when a part is off: its selector is at one of its none values (an on/off part with no none: when off). */
function removed(T, def, part, params) {
  const v = valueOf(T, params, part.selector);
  const none = part.none ?? (T.get(part.selector)?.kind === 'toggle' ? [false] : undefined);
  return Array.isArray(none) && none.some((x) => same(x, v));
}

function effective(T, def, key, params, trail) {
  if (trail.includes(key) || trail.length > 64) return true;
  const d = T.get(key), next = [...trail, key];
  if (d && d.when !== undefined && splitWhen(d.when, { T, params, def, trail: next }) !== true) return false;
  const part = partFor(def, key);
  if (!part || key === part.selector) return true;
  return !removed(T, def, part, params) && effective(T, def, part.selector, params, next);
}

/**
 * Whether a `when` holds at these settings (Contract 3: every key at one of its values, a list any one; a control named
 * must itself be in effect): true or false, or null when it depends on clip or direction and no scene ({ clip,
 * direction }) is given. Settings left out take their defaults. Never throws. Arguments: def, when, params, scene.
 */
export function whenHolds(def, when, params = {}, scene = undefined) {
  try {
    const r = splitWhen(when, { T: tableOf(def), params, def, scene: isObj(scene) ? scene : null });
    return r === true ? true : r === false ? false : null;
  } catch { return false; }
}

/** False for a setting that does nothing at these settings: its own `when` fails, or it belongs to a part that is off (engine/sprite.js inEffect, for a definition). Arguments: def, key, params. */
export function settingInEffect(def, key, params = {}) {
  try { return effective(tableOf(def), def, key, params, []); } catch { return false; }
}

/** The keys of the settings in effect at these settings, in the definition's order. Arguments: def, params. */
export function activeSettings(def, params = {}) {
  try { const T = tableOf(def); return [...T.keys()].filter((k) => effective(T, def, k, params, [])); } catch { return []; }
}

/** The names of the parts that are off at these settings (Contract 3: the selector at a none value; an on/off part off). Arguments: def, params. */
export function partsOff(def, params = {}) {
  try { const T = tableOf(def); return partsOf(def).filter((p) => removed(T, def, p, params)).map((p) => p.name); } catch { return []; }
}

/** Is v a binding a definition may write here: { from, map | pick } (round with map), or a bare { from } naming a setting of T. */
function isBindingIn(v, T) {
  if (!isObj(v) || typeof v.from !== 'string') return false;
  const keys = Object.keys(v);
  if (!keys.every((k) => BINDING_KEYS.has(k))) return false;
  if (Object.hasOwn(v, 'map') || Object.hasOwn(v, 'pick')) return true;
  return keys.length === 1 && T.has(v.from);
}

/**
 * The value a binding gives at these settings (docs/data-sprites.md 2.6): { from, map: [[in, out], ...], round }
 * piecewise linear between the points, held at the first and last ("px" rounds to whole pixels, "half" to halves);
 * { from, pick: { option: value } } the value of the option ("true" / "false" for an on/off); { from } the setting
 * itself. A table, never a formula. undefined when it cannot be read. Arguments: binding, params, table (settingTable
 * of the definition, or the Map it is made from).
 */
export function bindingValue(binding, params = {}, table = {}) {
  try {
    const T = table instanceof Map ? table : new Map(Object.entries(isObj(table) ? table : {}));
    const b = binding;
    if (!isObj(b) || typeof b.from !== 'string' || !T.has(b.from)) return undefined;
    const d = T.get(b.from);
    const v = valueOf(T, params, b.from);
    if (Object.hasOwn(b, 'map')) {
      const m = b.map;
      if (!Array.isArray(m) || m.length < 2 || m.length > L.mapPoints) return undefined;
      for (let i = 0; i < m.length; i++) if (!Array.isArray(m[i]) || m[i].length !== 2 || !fin(m[i][0]) || !fin(m[i][1]) || (i && !(m[i][0] > m[i - 1][0]))) return undefined;
      const x = fin(v) ? v : fin(d.default) ? d.default : m[0][0];
      let y;
      if (x <= m[0][0]) y = m[0][1];
      else if (x >= m[m.length - 1][0]) y = m[m.length - 1][1];
      else {
        let i = 1;
        while (x > m[i][0]) i++;
        const [x0, y0] = m[i - 1], [x1, y1] = m[i];
        const f = (x - x0) / (x1 - x0);
        y = y0 * (1 - f) + y1 * f;
      }
      const round = b.round ?? 'none';
      return round === 'px' ? Math.round(y) + 0 : round === 'half' ? Math.round(y * 2) / 2 + 0 : y;
    }
    if (Object.hasOwn(b, 'pick')) {
      if (!isObj(b.pick)) return undefined;
      const k = String(v);
      return Object.hasOwn(b.pick, k) && !BAD_KEYS.has(k) ? clone(b.pick[k]) : undefined;
    }
    return v;
  } catch { return undefined; }
}

// ---- colours ---------------------------------------------------------------------------------------------------

/** One palette entry's colour: { hex } from a palette entry, a '#rrggbb' string, or null (also for an entry flagged lost: its colour was never worked out). */
const slotHex = (palette, id) => {
  if (!isObj(palette) || !Object.hasOwn(palette, id) || BAD_KEYS.has(id)) return null;
  const s = palette[id];
  if (isObj(s) && s.lost === true) return null;
  return lower(typeof s === 'string' ? s : isObj(s) ? s.hex : null);
};

/**
 * A colour rule with every colour argument a '#rrggbb' (paint refs and nested rules worked out) and every bound number a
 * number, ready for engine/data-rules.js paintColour; null when a colour it reads cannot be worked out here (a framework
 * colour rule inside it, a slot the palette has not got, clear, a colour or a list of colours missing), so it is never
 * worked out with engine/data-rules.js's magenta standing in for that colour.
 */
function ruleWithColours(rule, palette, params, T, depth) {
  const spec = COLOUR_RULES[rule.rule].args;
  const out = { rule: rule.rule };
  let lost = false;
  const hex = (x) => { const h = hexOf(x, palette, params, T, depth + 1); if (!h) lost = true; return h; };
  for (const [name, a] of Object.entries(spec)) {
    const v = rule[name];
    if (v === undefined) { if (a.kind === 'colour' || a.kind === 'colours') lost = true; continue; }
    if (a.kind === 'colour') out[name] = hex(v);
    else if (a.kind === 'colours') {
      if (!Array.isArray(v) || !v.length) lost = true;
      else out[name] = v.slice(0, 8).map((x) => (Array.isArray(x) ? [hex(x[0]), fin(x[1]) ? x[1] : 0.15] : hex(x)));
    } else if (a.kind === 'number') out[name] = isBindingIn(v, T) ? bindingValue(v, params, T) : v;
    else out[name] = clone(v);
    if (lost) return null;
  }
  return lost ? null : out;
}

function hexOf(ref, palette, params, T, depth = 0) {
  if (depth > 8) return null;
  if (typeof ref === 'string') {
    if (ref === 'ink') return INK.toLowerCase();
    if (ref === 'clear') return null;
    if (HEX.test(ref)) return ref.toLowerCase();
    const dot = ref.indexOf('.');
    const base = slotHex(palette, dot < 0 ? ref : ref.slice(0, dot));
    if (!base) return null;
    if (dot < 0) return base;
    const t = ref.slice(dot + 1);
    if (!TONES.has(t)) return null;
    if (t === 'base') return base;
    if (t === 'far') return lower(farRamp(base).base);
    return lower(ramp(base)[t]);
  }
  if (isObj(ref) && T && isBindingIn(ref, T)) return hexOf(bindingValue(ref, params, T), palette, params, T, depth + 1);
  if (isObj(ref) && typeof ref.rule === 'string') {
    if (!Object.hasOwn(COLOUR_RULES, ref.rule)) return null;
    // choose reads only the branch the settings take (as engine/data-rules.js does), so the other may be anything
    if (ref.rule === 'choose') return hexOf(whenMatches(isObj(ref.when) || Array.isArray(ref.when) ? ref.when : { '': [] }, isObj(params) ? params : {}) ? ref.then : ref.else, palette, params, T, depth + 1);
    const r = ruleWithColours(ref, palette, params, T, depth);
    return r ? lower(paintColour(r, params)) ?? null : null;
  }
  return null;
}

/**
 * The colour a paint gives at these settings, '#rrggbb' (lowercase): a palette slot, a tone of one ("gold.dark",
 * light, base, dark, deep, far as engine/draw-list.js gives them), ink, a colour written out, or a colour rule of
 * engine/data-rules.js (choose reads the settings). null for clear, a slot the palette has not, or a rule this module
 * cannot work out: a registry colour rule, or a data-rules rule holding a colour it cannot work out anywhere inside
 * (never a colour worked out with magenta standing in). Arguments: ref, palette ({ slot: { hex } | '#rrggbb' }), params.
 */
export function paintHex(ref, palette = {}, params = {}) {
  try { return hexOf(ref, palette, params, null, 0); } catch { return null; }
}

/** Every paint ref text standing at a colour position of a colour rule (the slots it reads). */
function ruleRefs(rule, out = [], depth = 0) {
  if (depth > 8 || !isObj(rule)) return out;
  if (typeof rule.rule !== 'string' || !Object.hasOwn(COLOUR_RULES, rule.rule)) return out;
  for (const [name, a] of Object.entries(COLOUR_RULES[rule.rule].args)) {
    const v = rule[name];
    const one = (x) => { if (typeof x === 'string') out.push(x.split('.')[0]); else if (isObj(x)) ruleRefs(x, out, depth + 1); };
    if (a.kind === 'colour') one(v);
    else if (a.kind === 'colours' && Array.isArray(v)) v.forEach((x) => one(Array.isArray(x) ? x[0] : x));
  }
  return out;
}

/**
 * The palette at these settings: { slot: { hex, detail, material, derived?, label?, lost? } }. A slot with a colour setting
 * takes the person's colour, a detail slot its default, a derived slot its colour rule (engine/data-rules.js, in the
 * order the rules need each other) and, when it names none, the material of the first slot its rule reads. A slot
 * whose colour cannot be worked out (a rule it cannot work out, a loop, no default) is flagged lost: true, with the
 * hex FALLBACK only so old readers still get a colour: a lost colour is told by the flag, never by its colour.
 * Never throws. Arguments: def, params (settings; those left out take their defaults).
 */
export function resolvePalette(def, params = {}) {
  const out = {};
  try {
    const T = tableOf(def);
    const p = { ...defaultSettings(def), ...(isObj(params) ? params : {}) };
    const slots = slotsOf(def);
    const pending = [];
    for (const s of slots) {
      if (BAD_KEYS.has(s.id)) continue;
      const e = { hex: '#000000', detail: s.detail === true, material: typeof s.material === 'string' ? s.material : null };
      if (typeof s.label === 'string') e.label = s.label;
      if (s.derive !== undefined) { e.derived = true; out[s.id] = e; pending.push(s); continue; }
      const own = T.get(s.id)?.kind === 'colour' ? lower(p[s.id]) : null;
      e.hex = own ?? lower(s.default) ?? FALLBACK;
      if (!own && !lower(s.default)) e.lost = true;
      out[s.id] = e;
    }
    const done = new Set(Object.keys(out).filter((k) => !out[k].derived));
    for (let pass = 0; pass <= pending.length && pending.length; pass++) {
      for (let i = 0; i < pending.length; i++) {
        const s = pending[i];
        const needs = ruleRefs(s.derive).filter((r) => Object.hasOwn(out, r));
        if (!needs.every((r) => done.has(r))) continue;
        const hex = hexOf(s.derive, out, p, T, 0);
        out[s.id].hex = hex ?? FALLBACK;
        if (!hex) out[s.id].lost = true;
        if (!out[s.id].material) out[s.id].material = needs.map((r) => out[r].material).find(Boolean) ?? null;
        done.add(s.id);
        pending.splice(i--, 1);
      }
    }
    for (const s of pending) { out[s.id].hex = FALLBACK; out[s.id].lost = true; }
  } catch { /* what was worked out stands */ }
  return out;
}

/**
 * The material table of Contract 7 for a resolved sprite, in engine/theme.js's form { rest, total, colours: Map(rgb ->
 * { n, material, control }), looks: Map }: every palette colour and its tones (light, dark, deep, far) with its slot's
 * material, read from the data instead of found by drawing. Arguments: resolved (resolveSprite's result).
 */
export function materialTable(resolved) {
  const rest = resolved?.materials?.rest ?? 'paint';
  const table = { rest, total: 0, colours: new Map(), looks: new Map() };
  try {
    for (const [id, s] of Object.entries(resolved?.palette ?? {})) {
      const hex = lower(s?.hex);
      if (!hex) continue;
      const material = resolved.materials?.slots?.[id] ?? s.material ?? rest;
      const control = s.piece || s.derived || s.detail ? null : id;
      const r = ramp(hex), f = farRamp(hex);
      const tones = s.detail ? [hex] : [hex, r.light, r.dark, r.deep, f.base, f.light, f.dark];
      for (const t of tones) {
        const c = lower(t);
        if (!c) continue;
        const [R, G, B] = hexToRgb(c);
        const key = (R << 16) | (G << 8) | B;
        if (table.colours.has(key)) continue;
        table.colours.set(key, { n: 1, material, control });
        table.total += 1;
      }
    }
  } catch { /* what was listed stands */ }
  return table;
}

// ---- pieces -----------------------------------------------------------------------------------------------------

/** The piece of a store (engine/pieces.js createPieceStore: get(id, v)) or a function (id, v) -> piece. Throws Stop with words a person can act on. */
function getPiece(S, id, v) {
  const r = parsePieceRef(id, v);
  if (!r.ok) throw new Stop(`a piece: ${r.error}`);
  const src = S.pieces;
  let p;
  try { p = typeof src === 'function' ? src(r.id, r.v) : src && typeof src.get === 'function' ? src.get(r.id, r.v) : undefined; } catch { p = undefined; }
  if (!src) throw new Stop(`${r.ref}: no pieces were given to draw it with (load them first: engine/pieces.js store.loadFor(definition))`);
  if (!isObj(p) || !isObj(p.body)) throw new Stop(`${r.ref}: the piece is not loaded (load it first: engine/pieces.js store.loadFor(definition))`);
  S.used.add(r.ref);
  return { piece: p, ref: r.ref, kind: r.kind };
}

/** A piece's args as settings: number types as ranges, words as choices, flags as on/off. */
function argTable(piece) {
  const T = new Map();
  for (const [name, t] of Object.entries(isObj(piece.args) ? piece.args : {}).slice(0, 16)) {
    if (!isObj(t) || BAD_KEYS.has(name)) continue;
    if (NUMBER_TYPES.has(t.type)) { const [lo, hi] = TYPE_RANGE[t.type] ?? [fin(t.lo) ? t.lo : 0, fin(t.hi) ? t.hi : 1]; T.set(name, { kind: 'range', min: fin(t.lo) ? t.lo : lo, max: fin(t.hi) ? t.hi : hi, default: t.default, type: t.type }); }
    else if (t.type === 'word') { const values = (Array.isArray(t.options) ? t.options : Array.isArray(t.values) ? t.values : []).filter((x) => typeof x === 'string'); T.set(name, { kind: 'choice', values, default: t.default, type: 'word' }); }
    else if (t.type === 'flag') T.set(name, { kind: 'toggle', default: t.default, type: 'flag' });
    else T.set(name, { kind: 'any', default: t.default, type: t.type });
  }
  return T;
}

/** A use's args held to the piece's types: a number clamped (whole for count and seed), a word one of its options, a flag true or false; else the default, with a warning. */
function pieceArgs(S, piece, ref, given) {
  const T = argTable(piece);
  const out = {};
  const g = isObj(given) ? given : {};
  for (const k of Object.keys(g)) if (!T.has(k)) S.warn(`${ref}: takes no arg ${say(k)}; it was left out`);
  for (const [name, d] of T) {
    let v = Object.hasOwn(g, name) ? g[name] : undefined;
    const fallback = () => { if (d.default === undefined) throw new Stop(`${ref}: needs its arg "${name}" (${d.type})`); return clone(d.default); };
    if (v === undefined) { out[name] = fallback(); continue; }
    if (d.kind === 'range') {
      if (!fin(v)) { S.warn(`${ref}: arg "${name}" ${say(v)} is not a number; its default was used`); out[name] = fallback(); continue; }
      let x = clamp(v, d.min, d.max);
      if (d.type === 'count' || d.type === 'seed') x = Math.round(x);
      if (x !== v) S.warn(`${ref}: arg "${name}" ${say(v)} is held to ${d.min} to ${d.max}`);
      out[name] = x;
    } else if (d.kind === 'choice') {
      if (d.values.includes(v)) out[name] = v; else { S.warn(`${ref}: arg "${name}" ${say(v)} is not one of ${d.values.join(', ')}; its default was used`); out[name] = fallback(); }
    } else if (d.kind === 'toggle') {
      if (typeof v === 'boolean') out[name] = v; else { S.warn(`${ref}: arg "${name}" ${say(v)} is not true or false; its default was used`); out[name] = fallback(); }
    } else out[name] = clone(v);
  }
  return { T, params: out };
}

/** A slot id of the palette not taken yet, for a piece slot that needs a colour of its own. */
function freshSlot(S, slot) {
  const stem = SLOT_ID.test(slot) ? slot.slice(0, 32) : 'c';
  for (let n = 1; n < 1000; n++) { const id = `${stem}-p${n}`; if (!Object.hasOwn(S.palette, id)) return id; }
  throw new Stop('too many piece colours');
}

/**
 * How each slot of a piece is painted, as a paint the sprite's palette can draw with a tone: a slot of the palette
 * (bare), ink or clear. Order (engine/pieces.js bindSlots): the use's paint map, else what the enclosing level calls
 * a slot of that id (the sprite's palette, or the outer piece's slots), else the slot's default. A paint that is a tone,
 * a rule or a colour becomes a palette slot of its own (so "<slot>.dark" still works inside the piece).
 */
function slotMapOf(S, env, piece, ref, paint) {
  const map = {};
  const pm = isObj(paint) ? paint : {};
  for (const s of (Array.isArray(piece.slots) ? piece.slots : []).slice(0, 12)) {
    const id = typeof s === 'string' ? s : isObj(s) ? s.id : null;
    if (typeof id !== 'string' || BAD_KEYS.has(id)) continue;
    let target;
    if (Object.hasOwn(pm, id)) target = pm[id];
    else if (env.byName(id) !== undefined) target = env.byName(id);
    else if (isObj(s) && lower(s.default)) target = lower(s.default);
    else throw new Stop(`${ref}: its colour "${id}" has none: map it in paint, add a palette slot "${id}", or give the piece's slot a default`);
    map[id] = bareRef(S, target, { ref, slot: id, material: isObj(s) && typeof s.material === 'string' ? s.material : null });
  }
  return map;
}

function bareRef(S, target, { ref, slot, material }) {
  if (target === 'ink' || target === 'clear') return target;
  if (typeof target === 'string' && !target.includes('.') && Object.hasOwn(S.palette, target) && !BAD_KEYS.has(target)) return target;
  const hex = lower(target) ?? hexOf(target, S.palette, S.params, S.T, 0);
  if (!hex) S.warn(`${ref}: the colour given for its slot "${slot}" could not be worked out; it is drawn magenta`);
  const src = typeof target === 'string' ? S.palette[target.split('.')[0]]
    : isObj(target) && has(target, 'rule') ? ruleRefs(target).filter((r) => Object.hasOwn(S.palette, r) && !BAD_KEYS.has(r)).map((r) => S.palette[r]).find((s) => s?.material) : null;   // a rule: the first slot it reads that has a material
  const mat = src?.material ?? material ?? null;   // the colour is the sprite's slot's when it comes from one (a tone of it), else the piece slot's own
  const key = `${ref}|${slot}|${hex ?? FALLBACK}|${mat}`;
  if (S.synth.has(key)) return S.synth.get(key);
  if (S.synth.size >= L.slots) throw new Stop(`pieces need more than ${L.slots} colours of their own; at most ${L.slots}`);
  const id = freshSlot(S, slot);
  S.palette[id] = { hex: hex ?? FALLBACK, detail: false, material: mat, derived: true, piece: ref, slot, ...(hex ? {} : { lost: true }) };
  S.synth.set(key, id);
  return id;
}

/**
 * The palette slot standing for the colour a colour rule gives (Contract 15 rule 9: every paint is a slot with a
 * material, so it is shaded with its ramp and listed in the material table): named after the first slot the rule
 * reads, with the material of the first of those that has one. One slot per colour and material; counted with the
 * slots pieces add. Arguments: S, rule, hex (the colour it gives).
 */
function ruleSlot(S, rule, hex) {
  const reads = ruleRefs(rule).filter((r) => Object.hasOwn(S.palette, r) && !BAD_KEYS.has(r));
  const mat = reads.map((r) => S.palette[r]?.material).find(Boolean) ?? null;
  const key = `rule|${hex}|${mat}`;
  if (S.synth.has(key)) return S.synth.get(key);
  if (S.synth.size >= L.slots) throw new Stop(`colour rules and pieces need more than ${L.slots} colours of their own; at most ${L.slots}`);
  const stem = SLOT_ID.test(reads[0] ?? '') ? reads[0].slice(0, 32) : 'c';
  let id = null;
  for (let n = 1; n < 1000 && !id; n++) if (!Object.hasOwn(S.palette, `${stem}-r${n}`)) id = `${stem}-r${n}`;
  if (!id) throw new Stop('too many colours from colour rules');
  S.palette[id] = { hex, detail: false, material: mat, derived: true, rule: String(rule.rule).slice(0, 40) };
  S.synth.set(key, id);
  return id;
}

/** A paint text with its piece slot replaced (tones kept): "hair.dark" with hair -> "moss" is "moss.dark". */
function renamePaint(v, map) {
  if (typeof v !== 'string') return v;
  const dot = v.indexOf('.');
  const slot = dot < 0 ? v : v.slice(0, dot);
  if (!Object.hasOwn(map, slot) || BAD_KEYS.has(slot)) return v;
  const to = map[slot];
  if (dot < 0 || to === 'ink' || to === 'clear') return to;
  return `${to}${v.slice(dot)}`;
}

/** A copy of a piece's body with every paint naming one of its slots renamed by map (see PAINT_KEYS). Capped. */
function renameBody(S, x, map, depth = 0, key = null) {
  if (++S.values > L.values) throw new Stop(`more than ${L.values} values to work out; at most ${L.values}`);
  if (depth > L.depth) throw new Stop(`a piece is nested more than ${L.depth} deep`);
  const paintAt = (v, d) => {
    if (typeof v === 'string') return renamePaint(v, map);
    if (Array.isArray(v)) return v.map((y) => paintAt(y, d + 1));
    if (isObj(v) && has(v, 'rule')) return renameRule(v, d + 1);
    if (isObj(v) && has(v, 'pick') && typeof v.from === 'string') return { ...v, pick: Object.fromEntries(Object.entries(v.pick).map(([k, y]) => [k, paintAt(y, d + 1)])) };
    if (isObj(v) && !has(v, 'from')) return Object.fromEntries(Object.entries(v).filter(([k]) => !BAD_KEYS.has(k)).map(([k, y]) => [k, paintAt(y, d + 1)]));
    return clone(v);
  };
  const renameRule = (r, d) => {
    if (d > L.depth) throw new Stop(`a piece's colour rules are nested more than ${L.depth} deep`);
    const out = {};
    const spec = Object.hasOwn(COLOUR_RULES, r.rule) ? COLOUR_RULES[r.rule].args : null;
    const entry = !spec && S.reg && typeof S.reg.generator === 'function' ? safeEntry(S.reg, r.rule, r.v ?? 1) : null;
    for (const [k, v] of Object.entries(r)) {
      if (BAD_KEYS.has(k)) continue;
      const kind = spec?.[k]?.kind ?? (entry?.args?.[k]?.type === 'paint' ? 'colour' : entry?.args?.[k]?.type === 'paints' ? 'colours' : null);
      if (kind === 'colour') out[k] = paintAt(v, d);
      else if (kind === 'colours') out[k] = Array.isArray(v) ? v.map((y) => (Array.isArray(y) ? [paintAt(y[0], d), y[1]] : paintAt(y, d))) : clone(v);
      else out[k] = clone(v);
    }
    return out;
  };
  if (typeof x === 'string') return (key && PAINT_KEYS.has(key)) || /\.(light|base|dark|deep|far)$/.test(x) ? renamePaint(x, map) : x;
  if (Array.isArray(x)) return x.map((y) => renameBody(S, y, map, depth + 1, PAINT_LIST_KEYS.has(key) ? 'paint' : null));
  if (!isObj(x)) return x;
  if (has(x, 'rule')) return renameRule(x, depth);
  const entry = has(x, 'gen') && S.reg && typeof S.reg.generator === 'function' ? safeEntry(S.reg, x.gen, x.v) : null;
  const stampish = x.kind === 'stamp' || Array.isArray(x.rows);
  const out = {};
  for (const k of Object.keys(x)) {
    if (BAD_KEYS.has(k)) continue;
    const v = x[k];
    const t = entry?.args?.[k]?.type;
    if (k === 'when' && !has(x, 'rule')) out[k] = clone(v);
    else if (t === 'paint' || (k === 'paint')) out[k] = paintAt(v, depth);
    else if (t === 'paints' || PAINT_LIST_KEYS.has(k)) out[k] = Array.isArray(v) ? v.map((y) => paintAt(y, depth)) : paintAt(v, depth);
    else if (k === 'key' && stampish && isObj(v)) out[k] = paintAt(v, depth);
    else out[k] = renameBody(S, v, map, depth + 1, k);
  }
  return out;
}

const safeEntry = (reg, id, v) => { try { return reg.generator(id, v) ?? null; } catch { return null; } };

/** Moves the points of a primitive or call written at a piece's origin by [dx, dy]: at, from, to (points only), points, areas and shapes. */
function moveBy(x, d, depth = 0) {
  if (!isObj(x) || depth > 6) return x;
  const out = { ...x };
  const pt = (p) => (Array.isArray(p) && p.length === 2 && fin(p[0]) && fin(p[1]) ? [p[0] + d[0], p[1] + d[1]] : p);
  for (const f of ['at', 'from', 'to']) if (Object.hasOwn(x, f)) out[f] = pt(x[f]);
  if (Array.isArray(x.points)) out.points = x.points.map(pt);
  for (const f of ['area', 'shape']) if (isObj(x[f])) out[f] = moveBy(x[f], d, depth + 1);
  return out;
}

/** The items a piece drawn by a use stands for: a stamp piece's one stamp, or a part's or held thing's draw list resolved with its args. */
function drawPiece(S, env, use, depth) {
  if (++S.uses > L.uses) throw new Stop(`more than ${L.uses} pieces to draw; at most ${L.uses}`);
  if (env.pieceDepth >= L.pieceDepth) throw new Stop(`pieces inside pieces go more than ${L.pieceDepth} deep`);
  const { piece, ref, kind } = getPiece(S, use.use, use.v);
  const args = pieceArgs(S, piece, ref, use.args);
  const map = slotMapOf(S, env, piece, ref, use.paint);
  const body = renameBody(S, piece.body, map);
  const penv = { T: args.T, params: args.params, def: null, pieceDepth: env.pieceDepth + 1, byName: (id) => (Object.hasOwn(map, id) ? map[id] : undefined), ref };
  let items;
  if (Array.isArray(body.rows)) {
    const chars = [...new Set(body.rows.join(''))].filter((c) => c !== '.' && c !== ' ');
    const st = { kind: 'stamp', at: Array.isArray(body.at) ? body.at : [0, 0], rows: body.rows, key: isObj(body.key) ? body.key : Object.fromEntries(chars.map((c) => [c, renamePaint(c, map)])) };
    for (const f of ['anchor', 'variants', 'mirror', 'detail', 'alt', 'paint']) if (body[f] !== undefined) st[f] = body[f];
    if (st.paint !== undefined && st.key) delete st.paint;
    items = [settle(S, penv, st, depth + 1)];
  } else if (Array.isArray(body.draw)) items = settleList(S, penv, body.draw, depth + 1);
  else throw new Stop(`${ref}: a ${kind} piece is not drawn as a shape (it has no draw list or rows)`);
  const out = [];
  for (let it of items) {
    if (!isObj(it)) continue;
    if (Array.isArray(use.at)) it = moveBy(it, use.at);
    if (use.on !== undefined) { it.on = use.on; delete it.bone; }
    else if (use.bone !== undefined) { it.bone = use.bone; delete it.on; }
    if (typeof use.id === 'string') it.id = use.id;
    if (fin(use.z)) it.z = clamp(use.z + (fin(it.z) ? it.z : 0), -100, 100);
    for (const f of CARRY) if (use[f] !== undefined && it[f] === undefined) it[f] = clone(use[f]);
    if (use.when !== undefined) it.when = it.when === undefined ? clone(use.when) : joinWhen(use.when, it.when);
    out.push(it);
  }
  return out;
}

/** Both of two clip/direction conditions (what is left of them after the settings): one object when both are, else the outer one. */
function joinWhen(a, b) {
  if (isObj(a) && isObj(b)) {
    const out = clone(b);
    for (const [k, v] of Object.entries(a)) out[k] = Object.hasOwn(out, k) ? out[k].filter((x) => v.includes(x)) : clone(v);
    return out;
  }
  return clone(a);
}

/** A piece named in place (a panel's skin, a tile material, anything with `use` that is not drawn as a shape): { use, v, ref, kind, args, slots, body } with its body resolved and painted. */
function pieceObject(S, env, x, depth) {
  if (++S.uses > L.uses) throw new Stop(`more than ${L.uses} pieces to draw; at most ${L.uses}`);
  const { piece, ref, kind } = getPiece(S, x.use, x.v);
  if (kind === 'material') { const bad = checkMaterialPiece(piece).errors; if (bad.length) throw new Stop(`${ref}: ${bad.slice(0, 3).join('; ')}`); }   // build item B15 review: a shared material is held to the material rules
  const args = pieceArgs(S, piece, ref, x.args);
  const map = slotMapOf(S, env, piece, ref, x.paint);
  const body = renameBody(S, piece.body, map);
  const penv = { T: args.T, params: args.params, def: null, pieceDepth: env.pieceDepth + 1, byName: (id) => (Object.hasOwn(map, id) ? map[id] : undefined), ref };
  const out = { use: x.use, v: x.v, ref, kind, args: args.params, slots: map, body: settle(S, penv, body, depth + 1) };
  for (const k of Object.keys(x)) if (!['use', 'v', 'args', 'paint'].includes(k) && !BAD_KEYS.has(k)) out[k] = settle(S, env, x[k], depth + 1);
  return out;
}

// ---- the walk ---------------------------------------------------------------------------------------------------

const isUseShape = (x) => isObj(x) && x.kind === 'use' && typeof x.use === 'string' && x.use.includes(':');
const isPieceObject = (x) => isObj(x) && typeof x.use === 'string' && x.use.includes(':') && x.kind === undefined && !has(x, 'gen');

/** A value of the definition with every binding replaced, every failing item left out (DROP), pieces drawn in. key: the field it stands in. */
function settle(S, env, x, depth, key = null) {
  if (++S.values > L.values) throw new Stop(`the definition holds more than ${L.values} values to work out; at most ${L.values}`);
  if (depth > L.depth) throw new Stop(`the definition is nested more than ${L.depth} deep`);
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return settleList(S, env, x, depth);
  if (isBindingIn(x, env.T)) {
    const v = bindingValue(x, env.params, env.T);
    if (v === undefined) throw new Stop(`${env.ref ? `${env.ref}: ` : ''}the binding on ${say(x.from)} gives no value at these settings`);
    // a picked value is part of the definition too: bindings, conditions and pieces inside it are worked out (capped as the rest)
    return v !== null && typeof v === 'object' ? settle(S, env, v, depth + 1, key) : v;
  }
  if (!has(x, 'rule') && Object.hasOwn(x, 'when')) {
    const w = splitWhen(x.when, { T: env.T, params: env.params, def: env.def });
    if (w === false) return DROP;
    x = { ...x };
    if (w === true) delete x.when; else x.when = w;
  }
  if (env.def && !has(x, 'rule')) {
    if (typeof x.part === 'string' && S.off.has(x.part)) return DROP;
    if (typeof x.id === 'string' && S.offIds.has(x.id) && (x.kind !== undefined || has(x, 'gen'))) return DROP;
  }
  if (key !== 'place' && isPieceObject(x)) return pieceObject(S, env, x, depth);
  const out = {};
  for (const k of Object.keys(x)) {
    if (BAD_KEYS.has(k)) continue;
    if (k === 'when') { out[k] = clone(x[k]); continue; }
    const v = settle(S, env, x[k], depth + 1, k);
    if (v !== DROP) out[k] = v;
  }
  if (env.def && typeof out.id === 'string' && S.partOf.has(out.id) && out.part === undefined && (out.kind !== undefined || has(out, 'gen'))) out.part = S.partOf.get(out.id);
  // a primitive's colour rules become palette slots now (the settings decide them); a rule this module cannot work out waits for the frame
  if (typeof out.kind === 'string' && out.kind !== 'use' && !has(out, 'gen')) return finishPaints(S, out, 0, false);
  return out;
}

/** A list of the definition: items whose `when` fails or whose part is off left out, pieces used as shapes drawn in. */
function settleList(S, env, list, depth) {
  const out = [];
  for (const item of list) {
    // a use shape written here or chosen by a binding (a pick) is drawn in the same way
    const v = settle(S, env, item, depth + 1);
    if (v === DROP) continue;
    if (isUseShape(v)) out.push(...drawPiece(S, env, v, depth + 1));
    else out.push(v);
    if (out.length > L.list) throw new Stop(`a list holds more than ${L.list} items once pieces are drawn in; at most ${L.list}`);
  }
  return out;
}

// ---- bodies -----------------------------------------------------------------------------------------------------

const byId = (list) => new Map((Array.isArray(list) ? list : []).filter((x) => isObj(x) && typeof x.id === 'string').map((x) => [x.id, x]));

/** Base list then the asset's: an asset item replaces the base item of the same id in its place (all items of that id), the rest are added at the end. */
function mergeById(base, own) {
  const mine = new Map();
  for (const x of own) if (isObj(x) && typeof x.id === 'string') { if (!mine.has(x.id)) mine.set(x.id, []); mine.get(x.id).push(x); }
  const out = [], placed = new Set();
  for (const x of base) {
    if (isObj(x) && typeof x.id === 'string' && mine.has(x.id)) { if (!placed.has(x.id)) { out.push(...mine.get(x.id)); placed.add(x.id); } continue; }
    out.push(x);
  }
  for (const x of own) if (!(isObj(x) && typeof x.id === 'string' && placed.has(x.id))) out.push(x);
  return out;
}

/** body.rig: the base piece merged by id (bones and nodes added, shapes replaced in place, dropped or added, ik, points and direction overlays by id) and the asset's own rig resolved. */
function rigOf(S, env, rig, depth) {
  const own = { ...rig };
  delete own.extends;
  const mine = settle(S, env, own, depth + 1);
  if (!isObj(rig.extends)) return { rig: mine, base: null, baseClips: null, baseEnv: null };
  const e = settle(S, env, rig.extends, depth + 1, 'place');
  const { piece, ref, kind } = getPiece(S, e.use, e.v);
  if (kind !== 'base') throw new Stop(`extends takes a base piece; ${ref} is a ${kind}`);
  const args = pieceArgs(S, piece, ref, e.args);
  const map = slotMapOf(S, env, piece, ref, e.paint);
  const body = renameBody(S, piece.body, map);
  const benv = { T: args.T, params: args.params, def: null, pieceDepth: 1, byName: (id) => (Object.hasOwn(map, id) ? map[id] : undefined), ref };
  const brig = settle(S, benv, isObj(body.rig) ? body.rig : {}, depth + 1);
  const drop = new Set(Array.isArray(e.drop) ? e.drop : []);
  const baseShapes = (Array.isArray(brig.shapes) ? brig.shapes : []).filter((s) => !(isObj(s) && (drop.has(s.id) || S.offIds.has(s.id) || (typeof s.part === 'string' && S.off.has(s.part)))))
    .map((s) => (isObj(s) && typeof s.id === 'string' && S.partOf.has(s.id) && s.part === undefined ? { ...s, part: S.partOf.get(s.id) } : s));
  const out = { ...brig, ...mine };
  out.bones = mergeById(brig.bones ?? [], mine.bones ?? []);
  if (brig.nodes || mine.nodes) out.nodes = mergeById(brig.nodes ?? [], mine.nodes ?? []);
  out.shapes = mergeById(baseShapes, mine.shapes ?? []);
  for (const f of ['ik', 'points']) if (brig[f] || mine[f]) out[f] = mergeById(brig[f] ?? [], mine[f] ?? []);
  if (isObj(brig.directions) || isObj(mine.directions)) {
    const d = {};
    for (const dir of new Set([...Object.keys(brig.directions ?? {}), ...Object.keys(mine.directions ?? {})])) {
      const a = brig.directions?.[dir] ?? {}, b = mine.directions?.[dir] ?? {};
      d[dir] = {};
      for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) d[dir][f] = isObj(a[f]) && isObj(b[f]) ? { ...a[f], ...b[f] } : clone(b[f] ?? a[f]);
    }
    out.directions = d;
  }
  const clips = isObj(body.clips) ? body.clips : isObj(body.rig?.clips) ? body.rig.clips : {};
  delete out.clips;
  return { rig: out, base: ref, baseClips: clips, baseEnv: benv };
}

/** The clip names of a body: a panel's states, a background's layers, a tileset's tiles (tile.clips, engine/gen/tiles-clips.js), then a base's clips, then the definition's own. */
function clipNames(def, kind, body, baseClips) {
  const layout = kind === 'panel' ? (Array.isArray(body?.states) ? body.states : ['normal', 'hover', 'pressed', 'disabled'])
    : kind === 'layers' ? (Array.isArray(body) ? body.map((l) => l?.name) : []) : kind === 'tiles' ? tileClipNames(body) : [];
  return [...new Set([...layout, ...Object.keys(baseClips ?? {}), ...Object.keys(isObj(def.clips) ? def.clips : {})])].filter((n) => typeof n === 'string' && !BAD_KEYS.has(n)).slice(0, 64);
}

function cuesOf(S, env, list) {
  const out = [];
  for (const c of (Array.isArray(list) ? list : []).slice(0, 64)) {
    if (!isObj(c)) continue;
    const w = c.when === undefined ? true : splitWhen(c.when, { T: env.T, params: env.params, def: env.def });
    if (w !== true) continue;
    const x = clone(c);
    delete x.when;
    out.push(x);
  }
  return out;
}

/** The clips at these settings: inherited from the base where they say `from` (or are the base's own), fps at the Speed setting, cues whose `when` fails left out. */
function clipsOf(S, def, names, baseClips, baseEnv, speed, laid = null) {
  const out = {};
  const own = isObj(def.clips) ? def.clips : {};
  const k = speed === null ? 1 : lerp(SPEED_FPS[0], SPEED_FPS[1], speed);
  for (const name of names) {
    const c = isObj(own[name]) ? own[name] : null;
    const fromName = c && typeof c.from === 'string' ? c.from : c ? null : name;
    const b = fromName && isObj(baseClips) && isObj(baseClips[fromName]) ? baseClips[fromName] : null;
    // what the layout says of the clip (a tileset's tile: label, frames, fps, block kind, decal place), under the definition's own
    const lay = isObj(laid) && Object.hasOwn(laid, name) && isObj(laid[name]) ? laid[name] : null;
    const pickOf = (f) => (c && c[f] !== undefined ? c[f] : b && b[f] !== undefined ? b[f] : lay && lay[f] !== undefined ? lay[f] : undefined);
    const frames = Number.isInteger(pickOf('frames')) && pickOf('frames') >= 1 ? pickOf('frames') : 1;
    const fpsBase = fin(pickOf('fps')) && pickOf('fps') > 0 ? pickOf('fps') : 10;
    const r = {
      label: typeof c?.label === 'string' ? c.label : typeof b?.label === 'string' ? b.label : typeof lay?.label === 'string' ? lay.label : cap(name),
      frames, fps: fpsBase * k, fpsBase, loop: typeof pickOf('loop') === 'boolean' ? pickOf('loop') : true,
      keys: clone(Array.isArray(pickOf('keys')) ? pickOf('keys') : []),
      frameEdits: { ...clone(isObj(b?.frameEdits) ? b.frameEdits : {}), ...clone(isObj(c?.frameEdits) ? c.frameEdits : {}) },
      sounds: c && c.sounds !== undefined ? cuesOf(S, S.env, c.sounds) : b ? cuesOf(S, baseEnv ?? S.env, b.sounds) : [],
    };
    if (c && typeof c.from === 'string') r.from = c.from;
    if (c && c.noText === true) r.noText = true;
    if (lay && typeof lay.block === 'string') r.block = lay.block;
    if (lay && typeof lay.place === 'string') r.place = lay.place;
    out[name] = r;
  }
  return out;
}

/** The scale of each bone and shape at these settings from sliders with `scales` (version 2's by: [smallest, biggest] across the slider; version 1's: the value itself); sliders scaling the same one multiply. */
function scalesOf(T, params) {
  const out = { bones: {}, shapes: {} };
  for (const [key, d] of T) {
    if (d.kind !== 'range' || !isObj(d.scales)) continue;
    const v = valueOf(T, params, key);
    const by = Array.isArray(d.scales.by) && fin(d.scales.by[0]) && fin(d.scales.by[1]) ? d.scales.by : null;
    const t = (v - d.min) / (d.max - d.min);
    const f = by ? by[0] * (1 - t) + by[1] * t : v;
    for (const what of ['bones', 'shapes']) for (const id of Array.isArray(d.scales[what]) ? d.scales[what] : []) if (typeof id === 'string' && !BAD_KEYS.has(id)) out[what][id] = (out[what][id] ?? 1) * f;
  }
  return out;
}

const FAILED = (errors, warnings = []) => deepFreeze({ ok: false, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50), params: null, palette: null, body: null, clips: null });
const CONTEXT = new WeakMap();

/** The pieces as the v2 schema reads them, from a store, a registry or nothing. */
function pieceListOf(p) {
  if (!p) return undefined;
  if (typeof p.piece === 'function') return p;
  if (typeof p.get === 'function' && typeof p.list === 'function') return pieceRegistry(p);
  return undefined;
}

/**
 * A definition and one person's settings resolved: every value concrete (THE RESOLVED SPRITE in the header). The
 * definition is checked first (catalog/sprite-schema.js validateSprite with the given generators and pieces), unless
 * opts.validated is true (then only the plain-data wall). Never throws: a definition that fails, a piece that is not
 * loaded or a cap reached gives { ok: false, errors }. Arguments: def (an object or JSON text), settings (as
 * cleanSettings takes them), opts { pieces (a store from engine/pieces.js createPieceStore, with every piece the
 * definition names loaded; or a function (id, v) -> piece), generators (the registry: validateSprite's for the check,
 * and expandFrame's when it can run; default the site's), validated }.
 */
export function resolveSprite(def, settings = {}, opts = {}) {
  const warnings = [];
  try {
    const o = isObj(opts) ? opts : {};
    let d;
    if (o.validated === true) {
      const w = plainSpriteData(def);
      if (!w.ok) return FAILED(w.errors, w.warnings);
      d = w.value;
      if (!isObj(d) || d.format !== 'loadout-sprite' || !isObj(d.body)) return FAILED(['The definition: must be a loadout-sprite with a body']);
    } else {
      const v = validateSprite(def, { ...(o.generators ? { generators: o.generators } : {}), ...(pieceListOf(o.pieces) ? { pieces: pieceListOf(o.pieces) } : {}) });
      if (!v.ok) return FAILED(v.errors, v.warnings);
      d = v.value;
      if (!isObj(d) || !isObj(d.body)) return FAILED(['The definition: a standalone rig (loadout-rig) has no settings to resolve; give a loadout-sprite']);
    }
    const kind = RESOLVED_BODIES.find((k) => Object.hasOwn(d.body, k));
    if (!kind) return FAILED([`The definition: its body is not one this Loadout draws (${RESOLVED_BODIES.join(', ')})`]);
    const T = tableOf(d);
    const { params, notes } = cleanSettings(d, settings);
    const off = new Set(partsOff(d, params));
    const offIds = new Set(), partOf = new Map();
    for (const p of partsOf(d)) for (const id of p.shapes) { partOf.set(id, p.name); if (off.has(p.name)) offIds.add(id); }
    const palette = resolvePalette(d, params);
    const S = {
      T, params, palette, off, offIds, partOf, pieces: o.pieces, reg: o.generators ?? SITE, used: new Set(), synth: new Map(), values: 0, uses: 0,
      warn: (w) => { if (warnings.length < 50 && !warnings.includes(w)) warnings.push(w); },
    };
    const env = { T, params, def: d, pieceDepth: 0, byName: (id) => (Object.hasOwn(palette, id) && !palette[id].piece ? id : undefined), ref: null };
    S.env = env;
    let body, base = null, baseClips = null, baseEnv = null;
    if (kind === 'rig') ({ rig: body, base, baseClips, baseEnv } = rigOf(S, env, d.body.rig, 1));
    else body = settle(S, env, d.body[kind], 1);
    // an emitters body's node tree and draw list sit beside its emitters (docs/data-sprites.md 2.5c; build item B12b)
    const beside = kind === 'emitters' ? Object.fromEntries(['nodes', 'draw'].filter((f) => d.body[f] !== undefined).map((f) => [f, settle(S, env, d.body[f], 1)]).filter(([, v]) => v !== DROP)) : null;
    if (body === DROP) body = null;
    const speed = T.get('speed')?.speed ? valueOf(T, params, 'speed') : null;
    const clips = clipsOf(S, d, clipNames(d, kind, kind === 'panel' ? d.body.panel : kind === 'layers' ? d.body.layers : kind === 'tiles' ? d.body.tiles : null, baseClips), baseClips, baseEnv, speed, kind === 'tiles' ? tileClips(d.body.tiles) : null);
    const extra = (f) => (d[f] === undefined ? null : (() => { const v = settle(S, env, d[f], 1); return v === DROP ? null : v; })());
    const rest = restMaterial({ meta: d.meta, materials: d.materials });
    const materials = { rest, slots: Object.fromEntries(Object.entries(palette).map(([id, s]) => [id, s.material ?? rest])) };
    const out = {
      ok: true, errors: [], warnings, version: d.version, id: d.id ?? null, name: d.name ?? null, meta: clone(d.meta) ?? null,
      size: clone(d.size) ?? null, pivot: clone(d.pivot) ?? null, grounded: d.grounded ?? null, styles: clone(d.styles) ?? ['pixel'],
      preview: typeof d.preview === 'string' && Object.hasOwn(clips, d.preview) ? d.preview : Object.keys(clips)[0] ?? null,
      rev: d.rev ?? null, made: clone(d.made) ?? null,
      params, notes, active: activeSettings(d, params), partsOff: [...off],
      palette, lost: Object.keys(palette).filter((k) => palette[k].lost === true), materials, scales: scalesOf(T, params),
      body: { kind, [kind]: body, ...beside }, base, pieces: [...S.used].sort(),
      clips, points: extra('points'), slice: extra('slice'), textArea: extra('textArea'),
    };
    deepFreeze(out);
    CONTEXT.set(out, { pieces: o.pieces, generators: o.generators });
    return out;
  } catch (e) {
    return FAILED([e instanceof Stop ? msg(e) : `The definition could not be resolved: ${msg(e)}`], warnings);
  }
}

// ---- one frame ----------------------------------------------------------------------------------------------------

/**
 * A resolved list for one frame: items whose remaining `when` (clip, direction) fails, and calls whose `clip` list
 * does not name the clip, left out; the conditions decided are removed from what stays (also inside generator
 * arguments). Never throws. Arguments: list, scene ({ clip, direction }; direction null for a body with none).
 */
export function sceneItems(list, scene = {}) {
  try {
    const sc = { clip: isObj(scene) && typeof scene.clip === 'string' ? scene.clip : null, direction: isObj(scene) && typeof scene.direction === 'string' ? scene.direction : null };
    let budget = L.values;
    const keep = (x, depth) => {
      if (--budget < 0 || depth > L.depth) throw new Stop('too much to read');
      if (Array.isArray(x)) { const out = []; for (const y of x) { const v = keep(y, depth + 1); if (v !== DROP) out.push(v); } return out; }
      if (!isObj(x)) return x;
      if (has(x, 'rule')) return x;
      let o = x;
      if (Object.hasOwn(x, 'when')) {
        if (!sceneOnlyHolds(x.when, sc)) return DROP;
        o = { ...o };
        delete o.when;
      }
      if (Array.isArray(o.clip) && (has(o, 'gen') || o.kind !== undefined)) {
        if (!o.clip.includes(sc.clip)) return DROP;
        o = { ...o };
        delete o.clip;
      }
      const out = {};
      for (const k of Object.keys(o)) { if (BAD_KEYS.has(k)) continue; const v = keep(o[k], depth + 1); if (v !== DROP) out[k] = v; }
      return out;
    };
    return Array.isArray(list) ? keep(list, 0) : [];
  } catch { return []; }
}

/** A clip/direction condition at a scene (controls in it, which the settings already decided, are taken as holding). */
function sceneOnlyHolds(when, sc) {
  const alts = Array.isArray(when) ? when : [when];
  return alts.some((alt) => isObj(alt) && Object.entries(alt).every(([k, v]) => !SCENE.has(k) || (Array.isArray(v) ? v : [v]).some((x) => same(x, sc[k]))));
}

const CTX_KEYS = ['t', 'frame', 'frames', 'loop', 'size', 'clip', 'direction'];

/**
 * Every paint of a primitive that is a colour rule worked out to a palette slot of its own (ruleSlot: shaded with its
 * ramp, its source's material): paint, a stamp's key, band stops, a text's outline, areas and shapes inside. A rule this
 * module cannot work out is left as it is (frame false: the frame may) or, in a frame, painted FALLBACK with a warning
 * and listed in S.lost ({ rule }), so the frame reports it by that list, never by the colour.
 */
function finishPaints(S, p, depth = 0, frame = true) {
  if (!isObj(p) || depth > 6) return p;
  const fix = (v) => {
    if (!isObj(v) || !has(v, 'rule')) return v;
    const h = hexOf(v, S.palette, S.params, null, 0);
    if (h) return ruleSlot(S, v, h);
    if (!frame) return v;
    S.warn(`the colour rule "${String(v.rule).slice(0, 40)}" cannot be worked out here; it is drawn magenta`);
    if (Array.isArray(S.lost) && !S.lost.some((x) => x.index === S.at && x.rule === String(v.rule).slice(0, 40))) S.lost.push({ index: S.at, rule: String(v.rule).slice(0, 40) });
    return FALLBACK;
  };
  const out = { ...p };
  if (Object.hasOwn(p, 'paint')) out.paint = fix(p.paint);
  if (isObj(p.key)) out.key = Object.fromEntries(Object.entries(p.key).filter(([k]) => !BAD_KEYS.has(k)).map(([k, v]) => [k, fix(v)]));
  if (Array.isArray(p.stops)) out.stops = p.stops.map(fix);
  if (Object.hasOwn(p, 'outline') && p.kind === 'text') out.outline = fix(p.outline);
  for (const f of ['area', 'shape']) if (isObj(p[f])) out[f] = finishPaints(S, p[f], depth + 1, frame);
  return out;
}

/**
 * The shape list of one frame from a resolved list (a rig's shapes, a picture's draw list, a layer's, an emitter
 * list...): the scene decided (sceneItems), every generator call run through the registry (engine/gen/registry.js
 * expandList: checked, budgeted, its node and z carried), every piece a generator placed drawn in, every colour rule
 * left in a paint worked out to '#rrggbb'. The result is what engine/draw-list.js draws (with `palette`). Never
 * throws. Returns { ok, primitives, errors, warnings, cost, palette (the resolved palette plus any slot a placed piece
 * needed), lost ([{ index, rule } | { index, slot }]: each primitive painting a colour that could not be worked out, a
 * colour rule this module cannot work out or a slot the palette flags lost; empty when every colour was) }. Arguments: resolved (resolveSprite's result), list, ctx ({ t, frame, frames, loop, size, clip, direction },
 * all optional; size defaults to the sprite's), opts { generators (default: resolveSprite's when it can run, else the
 * site's), pieces (default: resolveSprite's), budget }.
 */
export function expandFrame(resolved, list, ctx = {}, opts = {}) {
  const warnings = [];
  const fail = (errors) => ({ ok: false, primitives: [], errors: errors.slice(0, 50), warnings, cost: 0, palette: resolved?.palette ?? {}, lost: [] });
  try {
    if (!isObj(resolved) || resolved.ok !== true) return fail(['nothing to expand: the sprite was not resolved']);
    if (!Array.isArray(list)) return fail(['a draw list is a list of primitives and generator calls']);
    const o = isObj(opts) ? opts : {};
    const kept = CONTEXT.get(resolved) ?? {};
    const reg = [o.generators, kept.generators, SITE].find((r) => r && typeof r.expandList === 'function');
    const c = isObj(ctx) ? ctx : {};
    const rctx = {};
    for (const k of CTX_KEYS) if (c[k] !== undefined) rctx[k] = c[k];
    if (rctx.size === undefined && Array.isArray(resolved.size)) rctx.size = [...resolved.size];
    const items = sceneItems(list, { clip: c.clip, direction: c.direction });
    const palette = Object.fromEntries(Object.entries(resolved.palette ?? {}).map(([k, v]) => [k, { ...v }]));
    const S = {
      T: new Map(), params: resolved.params ?? {}, palette, off: new Set(), offIds: new Set(), partOf: new Map(),
      pieces: o.pieces ?? kept.pieces, reg, used: new Set(), synth: new Map(), values: 0, uses: 0,
      warn: (w) => { if (warnings.length < 50 && !warnings.includes(w)) warnings.push(w); },
    };
    const env = { T: S.T, params: S.params, def: null, pieceDepth: 0, byName: (id) => (Object.hasOwn(palette, id) && !palette[id].piece ? id : undefined), ref: null };
    let todo = items, cost = 0;
    const done = [];
    for (let round = 0; round <= L.pieceDepth; round++) {
      const r = reg.expandList(todo, rctx, o.budget !== undefined ? { budget: o.budget } : {});
      cost += r.cost ?? 0;
      if (!r.ok) return fail(r.errors);
      const next = [];
      let more = false;
      for (const p of r.primitives) {
        if (isUseShape(p)) {
          const drawn = sceneItems(drawPiece(S, env, p, 1), { clip: c.clip, direction: c.direction });
          for (const q of drawn) { if (has(q, 'gen') || isUseShape(q)) more = true; next.push(q); }
        } else next.push(p);
      }
      if (!more) { done.push(...next); todo = null; break; }
      todo = next;
    }
    if (todo) return fail([`pieces and generators nest more than ${L.pieceDepth} deep`]);
    if (done.length > L.list) return fail([`the frame holds more than ${L.list} primitives; at most ${L.list}`]);
    for (const [id, s] of Object.entries(palette)) if (s && s.rule && lower(s.hex)) S.synth.set(`rule|${lower(s.hex)}|${s.material ?? null}`, id);   // the rule slots resolveSprite made
    S.lost = [];
    const primitives = done.map((p, i) => { S.at = i; return finishPaints(S, p, 0, true); });
    // what could not be worked out, by flag: rules (above) and slots the palette flags lost that a primitive paints
    const lost = [...S.lost, ...lostPaints(primitives, palette)].sort((a, b) => a.index - b.index).slice(0, 50);
    return { ok: true, primitives, errors: [], warnings, cost, palette, lost };
  } catch (e) {
    return fail([e instanceof Stop ? msg(e) : `the frame could not be expanded: ${msg(e)}`]);
  }
}
