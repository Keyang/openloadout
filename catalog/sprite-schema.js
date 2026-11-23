// Sprite definitions, format version 2: the validator for every kind of sprite (docs/data-sprites.md section 2,
// build item B1; docs/architecture.md Contract 15). Every sprite is one JSON object, `loadout-sprite` version 2, whose
// `body` is one of six layouts: rig (characters, creatures), tiles, layers (backgrounds), panel (interface pieces),
// emitters (effects) or pictures (props, pickups, projectiles, icons). Nothing in a definition is ever run: framework
// code draws it, and where a definition needs computed variety it NAMES a generator of the fixed registry
// (engine/gen/registry.js, build item B2) or a piece (pieces/, build item B7) by id and version.
//
// So this file is the wall for version 2, as catalog/studio-schema.js is for version 1 (which it calls, unchanged, for
// every version 1 definition: they stay valid and are cleaned exactly as before). What it guarantees, each tested in
// tests/unit/sprite-schema-*.test.mjs:
//   - plain data only (catalog/plain-data.js, the same walk as version 1): no functions, getters, class instances,
//     symbols, loops of objects, holes or undefined in lists, non-finite numbers; at most 128 KB of JSON and 20 levels
//     of nesting, refused before parsing; __proto__, constructor and prototype keys dropped wherever they appear, and
//     no id may be a name every object already has;
//   - unknown fields dropped with a warning naming them (so text such as "function (g) ..." in a field is never read);
//   - every reference resolved: palette slots, controls, nodes and bones, shapes, stamps and their variants, emitters,
//     clips, profiles, layer items, parts, sockets;
//   - every generator looked up by id and version in the registry, every argument checked against its type and range
//     (refused, never clamped), every count capped, the summed cost under the budget (section 3.4);
//   - every control does something: one nothing names (no binding, `when`, `scales` or part) is refused, and so is a
//     colour slot with a control that nothing paints;
//   - text returned as given (trimmed), never interpreted; control and invisible characters refused.
//
// THE REGISTRY INTERFACE (injected; the default is the site's, engine/gen/index.js). opts.generators is an object with
//   generator(id, v)  -> the entry of that version or null: { id, v, family, args: { name: type }, keyable: [names],
//                        cost(args, { costOf }) -> number }   (engine/gen/registry.js)
//   generators()      -> every entry (optional: used to name the versions there are)
// and an argument type is the plain object of engine/gen/args.js: { type, lo?, hi?, options?, n?, optional, default? },
// type one of px, share, count, angle, seed, word, flag, paint, paints, profile, point, shape, place, primitives.
// Fields a call carries that are not arguments: engine/gen/registry.js CALL_FIELDS, plus `node` on a motion generator
// that does not declare it. Colour rules are engine/data-rules.js COLOUR_RULES or registry entries of family "colour".
//
// THE PIECE INTERFACE (injected, optional until pieces/ exists). opts.pieces is an object with
//   piece(id, v)      -> { id, v, kind, slots?: [names], bones?: [ids], shapes?: [ids], clips?: { name: {...} } | [names],
//                          args?: { name: type }, glyphs?: text, cost?: number } or null
//   pieces()          -> every entry (optional)
// Without it a piece name is checked for its form only (kind:name and a version); engine/resolve.js (B4) refuses an
// unknown one before drawing, and shapes on a base's bones cannot be checked here.
//
// Every function returns { ok, errors, warnings, value, ... } and never throws. errors block drawing; warnings are
// advice or say what was cleaned. value is the cleaned copy (plain JSON) when ok, else null.
// Pure JavaScript with no page, worker or Node in it: the site, the build and the tests all import this file.

import { validateStudio, ID_PATTERN, SPRITE_ID_PATTERN, RESERVED_IDS, STANDARD_CLIPS, CLIP_SYNONYMS, EASES, SOCKET_NAMES, TOPDOWN_DIRECTIONS, STUDIO_VIEWS, defaultPivot } from './studio-schema.js';
import { plainData } from './plain-data.js';
import { validateMeta, META_FIELDS, SPRITE_TYPES, SPRITE_ROLES, VIEWS, LICENSES, THEMES, GAME_TYPES } from './schema.js';
import { MATERIAL_IDS } from '../engine/materials.js';
import { COLOUR_RULES, PAINT_DEPTH, WHEN_BOUNDS, whenValueHolds } from '../engine/data-rules.js';   // WHEN_BOUNDS: build item B15b (thresholds)
import { thresholdProblem } from '../engine/sprite.js';   // build item F3: the one check of a threshold, shared with defineSprite (engine/styles.js already brings sprite.js in)
import { swatches as paletteSwatches } from '../engine/palettes.js';
import { styleIds } from '../engine/styles.js';
import { PRIMITIVE_KINDS as GEN_PRIMITIVE_KINDS, TONES, FIXED_PAINTS as GEN_FIXED_PAINTS, STAMP_ANCHORS as GEN_STAMP_ANCHORS, PLACEABLE_KINDS as GEN_PLACEABLE_KINDS } from '../engine/gen/args.js';
import * as SITE_GENERATORS from '../engine/gen/index.js';
import { tileClipNames, groupDrawsMiddles, TILE_DECAL_ORDERS } from '../engine/gen/tiles-clips.js';
import { TRAVEL_LIMITS, TRAVEL_ABOUT, TRAVEL_SIDES } from '../rigs/keypose.js';   // build item F5: a clip's travel (motion sliders)

// ---- the tables ---------------------------------------------------------------------------------------------------

/** The caps on a version 2 definition (docs/data-sprites.md 2.1, 2.5, 2.7 and 3.4). Frozen numbers. */
export const SPRITE_LIMITS = Object.freeze({
  jsonBytes: 128 * 1024,   // the whole definition as JSON text, UTF-8
  nesting: 20,             // lists and objects inside each other
  values: 80_000,          // values in all; 128 KB of JSON cannot hold more
  messages: 100,           // errors (and warnings) reported; the rest are counted in one last message
  idChars: 40, nameChars: 60, blurbChars: 300, wordChars: 30, metaList: 30,
  frameWidth: 640, frameHeight: 360,
  palette: 12,             // colour slots
  controls: 48,            // every control in all: colour slots with a control, sliders, choices, toggles, parts, speed
  options: 24, swatches: 16, whenAlternatives: 8, versions: 24, parts: 16,
  mapPoints: 32,           // points of a binding's table (engine/gen/args.js takes 32)
  primitives: 400,         // primitives, stamps, pieces and generator calls written in the definition
  expanded: 4000,          // primitives a frame after expansion: the cost budget
  stampPixels: 8192,       // stamp cells in all, variants included
  stampSide: 32,           // a stamp is at most 32 by 32
  generatorCalls: 64, nodes: 64, pieces: 24,
  clips: 64, framesPerClip: 64, frames: 256, keysPerClip: 64, soundsPerClip: 16,
  boneDepth: 16, ik: 8, points: 16, polyPoints: 24,
  variants: 16,            // variants of one stamp
  layers: 8, emitters: 16, motion: 16, states: 12, pictures: 64,
  tileGroups: 8, decals: 26, extraTiles: 16, profiles: 16, profileLength: 64, bandRules: 16, fillVersions: 6,
  text: 40,                // characters of a text primitive
  angle: 720, z: 100, fps: 30,
  scale: Object.freeze([0.25, 4]),
  stretch: Object.freeze([0.5, 1.5]),
});
const L = SPRITE_LIMITS;

/** The formats and the newest version of each this file reads (version 1 goes to catalog/studio-schema.js). */
export const SPRITE_FORMATS = Object.freeze({ 'loadout-sprite': 2, 'loadout-rig': 2 });

/** The six bodies of version 2, one per kind of sprite (docs/data-sprites.md 1.2). */
export const BODY_KINDS = Object.freeze(['rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures']);

/** The primitive kinds a draw list may hold (engine/gen/args.js PRIMITIVE_KINDS: v1's five bone kinds, the new ones, use and the operations outline, tint, cut). */
export const PRIMITIVE_KINDS = GEN_PRIMITIVE_KINDS;

/** The tones a paint ref may ask of a slot: "gold.light", "gold.dark" ... (engine/gen/args.js TONES). */
export const PAINT_TONES = TONES;

/** Paints a definition may name without a palette slot (engine/gen/args.js FIXED_PAINTS: ink, clear). */
export const FIXED_PAINTS = GEN_FIXED_PAINTS;

/**
 * Paints a palette slot's `derive` rule may name besides the slots and FIXED_PAINTS (build item B15b): white, so a light
 * mark is a colour mixed toward white as the library's are (engine/tiles.js textureLight). Nowhere else: a sprite that
 * paints white declares a slot. A slot called white wins over it.
 */
export const DERIVE_PAINTS = Object.freeze(['white']);

/** The kinds of a control in version 2; "slider" is version 1's word for "range" and is kept. */
export const CONTROL_KINDS = Object.freeze(['range', 'slider', 'choice', 'toggle', 'colour']);

/** The kinds of piece (pieces/, docs/data-sprites.md 3.3): a piece is named "<kind>:<name>" with a version. */
export const PIECE_KINDS = Object.freeze(['base', 'part', 'held', 'skin', 'material', 'stamp', 'font']);

/** Where a stamp's `at` sits on its block of pixels (engine/gen/args.js STAMP_ANCHORS). */
export const STAMP_ANCHORS = GEN_STAMP_ANCHORS;

/** The patterns of a dither primitive. */
export const DITHER_PATTERNS = Object.freeze(['checker', 'bayer2', 'bayer4', 'lines-h', 'lines-v']);

/** Which way a bands primitive steps (its bands run down, up, in or out). */
export const BAND_DIRS = Object.freeze(['down', 'up', 'in', 'out']);
/** How the edges between bands are drawn: a hard step, or a dithered row. */
export const BAND_EDGES = Object.freeze(['hard', 'dither']);

/** The kinds of a tileset group (docs/data-sprites.md 2.3) and the piece sets a group may ask for. */
export const TILE_GROUP_KINDS = Object.freeze(['block', 'floor', 'liquid', 'platform', 'slope', 'stack']);
/** The piece sets a tile group may ask the tile.clips generator for. */
export const TILE_PIECES = Object.freeze(['block', 'narrow', 'thin', 'slope', 'inner', 'lanes', 'cap', 'mid', 'foot']);   // lanes, cap, mid, foot: build item B15 (a stack's pieces; a liquid's foot)
/** Where a tile decal goes (engine/tiles.js decoClips). */
export const DECAL_PLACES = Object.freeze(['on', 'above', 'below', 'face', 'rim']);
/** The edges of a tile material. */
export const TILE_EDGES = Object.freeze(['top', 'left', 'right', 'bottom']);

/** The usual states of an interface piece (its clips); a panel may name others. */
export const PANEL_STATES = Object.freeze(['normal', 'hover', 'pressed', 'disabled']);

/** Which families of generator each place in a definition takes (a family not listed for a place is refused there). */
export const GENERATOR_PLACES = Object.freeze({
  motion: Object.freeze(['motion']), emitter: Object.freeze(['fx']), piece: Object.freeze(['ui']), fit: Object.freeze(['icon']), colour: Object.freeze(['colour']),
});

const CALL_FIELDS = Object.freeze(['gen', 'v', 'id', 'on', 'z', 'when', 'group', 'hidden', 'glow', 'part', 'clip']);   // engine/gen/registry.js CALL_FIELDS
const V1_KINDS = new Set(['limb', 'capsule', 'ellipse', 'poly', 'dot']);
const OPS = new Set(['outline', 'tint', 'cut']);
const AREA_KINDS = new Set(['rect', 'ellipse', 'poly', 'capsule', 'ring']);
const NUMBER_TYPES = new Set(['px', 'share', 'count', 'angle', 'seed', 'number']);
const WHOLE_TYPES = new Set(['count', 'seed']);
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const RESERVED = new Set(RESERVED_IDS);
const SCENE_KEYS = new Set(['clip', 'direction']);       // `when` keys that are not controls
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060\u2066-\u2069\ufeff]/;
const GEN_ID = /^[a-z][a-zA-Z0-9]*(?:[.-][a-z][a-zA-Z0-9]*)*$/;
const PIECE_ID = new RegExp(`^(${PIECE_KINDS.join('|')}):[a-z][a-z0-9-]{0,39}$`);
const FONT_REF = /^(font:[a-z][a-z0-9-]{0,39})@([1-9]\d{0,2})$/;
const CLIP_NAME = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const DIR_CLIP_RE = /^(.+)_(down|up|side)$/;
const REV_RE = /^[a-z0-9]{1,40}$/;
const MADE_IN = { studio: /^(?:new|template:[a-z][a-z0-9-]{0,39}|library:[a-z][a-z0-9-]{0,39})$/, library: /^(?:new|code:[a-z][a-z0-9-]{0,39})$/ };
const META_VALUES = { type: SPRITE_TYPES, role: SPRITE_ROLES, view: VIEWS, license: LICENSES, themes: THEMES, gameTypes: GAME_TYPES };
const SHINY = new Set(['metal', 'water', 'light', 'magic']);

// ---- small helpers ------------------------------------------------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
function say(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toPrecision(6)) : String(v);
  try { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 60) + '...' : s; } catch { return 'something that is not data'; }
}
const q = (v) => (typeof v === 'string' ? `"${v.length > 40 ? v.slice(0, 40) + '...' : v}"` : say(v));
const someOf = (names, n = 8) => (names.length > n ? `${names.slice(0, n).join(', ')} and ${names.length - n} more` : names.join(', '));
const listOf = (xs) => xs.join(', ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const kb = (n) => `${Math.ceil(n / 1024)} KB`;
const grand = (n) => n.toLocaleString('en');
const utf8Length = (s) => (typeof TextEncoder === 'function' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);

function context(opts) {
  const o = isObj(opts) ? opts : {};
  const C = { errors: [], warnings: [], fails: 0, moreE: 0, moreW: 0, opts: o };
  C.err = (m) => { C.fails++; if (C.errors.length < L.messages) C.errors.push(m); else C.moreE++; };
  C.warn = (m) => { if (C.warnings.length < L.messages) C.warnings.push(m); else C.moreW++; };
  return C;
}
function finish(C) {
  const errors = [...C.errors], warnings = [...C.warnings];
  if (C.moreE) errors.push(`... and ${grand(C.moreE)} more errors like these`);
  if (C.moreW) warnings.push(`... and ${grand(C.moreW)} more warnings like these`);
  return { errors, warnings };
}

function knownOnly(C, place, o, allowed) {
  const extra = Object.keys(o).filter((k) => !allowed.includes(k));
  if (extra.length) C.warn(`${place}: dropped what this format does not know: ${someOf(extra)}`);
}

/** A number in [lo, hi]: refused when not a number; outside the range clamped with a warning (clamp) or refused. */
function num(C, place, field, v, lo, hi, { need = false, clamp = true, whole = false } = {}) {
  if (v === undefined) { if (need) C.err(`${place}: ${field} is missing; give a number from ${lo} to ${hi}`); return undefined; }
  if (!fin(v)) { C.err(`${place}: ${field} must be a number from ${lo} to ${hi}; got ${say(v)}`); return undefined; }
  if (whole && !Number.isInteger(v)) { C.err(`${place}: ${field} must be a whole number; got ${say(v)}`); return undefined; }
  const c = Math.min(hi, Math.max(lo, v));
  if (c !== v) {
    if (!clamp) { C.err(`${place}: ${field} ${say(v)} is outside ${lo} to ${hi}`); return undefined; }
    C.warn(`${place}: ${field} ${say(v)} is outside ${lo} to ${hi}; kept as ${say(c)}`);
  }
  return c === 0 ? 0 : c;
}

function wholePx(C, place, field, v) {
  if (!fin(v) || Number.isInteger(v)) return v;
  const r = Math.round(v);
  C.warn(`${place}: ${field} is in whole pixels; ${say(v)} was rounded to ${r}`);
  return r;
}

function text(C, place, field, v, max, { need = false, empty = false } = {}) {
  if (v === undefined) { if (need) C.err(`${place}: ${field} is missing; give text of at most ${max} characters`); return undefined; }
  if (typeof v !== 'string') { C.err(`${place}: ${field} must be text; got ${say(v)}`); return undefined; }
  const s = v.trim();
  if (!s && !empty) { C.err(`${place}: ${field} is empty; give text of at most ${max} characters`); return undefined; }
  if (s.length > max) { C.err(`${place}: ${field} has ${s.length} characters; the most is ${max}`); return undefined; }
  if (BAD_CHARS.test(s)) { C.err(`${place}: ${field} has control or invisible characters; remove them`); return undefined; }
  return s;
}

function bool(C, place, field, v) {
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') { C.err(`${place}: ${field} must be true or false; got ${say(v)}`); return undefined; }
  return v;
}

function hex(C, place, field, v, { need = false } = {}) {
  if (v === undefined) { if (need) C.err(`${place}: ${field} is missing; give a colour as "#rrggbb"`); return undefined; }
  if (typeof v !== 'string' || !HEX_RE.test(v)) { C.err(`${place}: ${field} must be a colour written "#rrggbb" (six hex digits); got ${say(v)}`); return undefined; }
  return v.toLowerCase();
}

function idOf(C, place, v, { pattern = ID_PATTERN, what = 'id' } = {}) {
  if (typeof v !== 'string') { C.err(`${place}: ${what} is missing or not text; got ${say(v)}`); return undefined; }
  if (RESERVED.has(v)) { C.err(`${place}: ${q(v)} cannot be used as ${what === 'id' ? 'an id' : `a ${what}`}: it is a word every object already has; choose another`); return undefined; }
  if (!pattern.test(v)) {
    const how = pattern === SPRITE_ID_PATTERN ? 'lowercase letters, digits and dashes' : 'a lowercase letter, then letters, digits and dashes';
    C.err(`${place}: ${what} ${q(v)} must be ${how}, starting with a letter, at most ${L.idChars} characters`);
    return undefined;
  }
  return v;
}

function list(C, place, v, max, { min = 0, what = 'entries', need = false } = {}) {
  if (v === undefined) { if (need || min > 0) C.err(`${place}: ${what} are missing; give a list of ${min ? `${min} to ` : 'at most '}${max}`); return need || min > 0 ? null : []; }
  if (!Array.isArray(v)) { C.err(`${place}: ${what} must be a list; got ${say(v)}`); return null; }
  if (v.length > max) { C.err(`${place}: has ${grand(v.length)} ${what}; the most is ${max}`); return null; }
  if (v.length < min) { C.err(`${place}: needs at least ${min} ${what}`); return null; }
  return v;
}

/** An object used as a map of name: value with at most `max` names, each an id. Returns its names, or null after an error. */
function mapNames(C, place, v, max, what) {
  if (!isObj(v)) { C.err(`${place}: must be an object of ${what}; got ${say(v)}`); return null; }
  const names = Object.keys(v);
  if (names.length > max) { C.err(`${place}: has ${names.length} ${what}; the most is ${max}`); return null; }
  return names;
}

// ---- reading: JSON text and plain data ----------------------------------------------------------------------------

function nestingOf(s, stopAt) {
  let depth = 0, most = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inStr) { if (c === 92) i++; else if (c === 34) inStr = false; continue; }
    if (c === 34) inStr = true;
    else if (c === 123 || c === 91) { if (++depth > most) { most = depth; if (most > stopAt) return most; } }
    else if (c === 125 || c === 93) depth--;
  }
  return most;
}

/**
 * Reads version 2 JSON text safely: refuses text over 128 KB or nested over 20 deep before parsing, and drops every
 * __proto__, constructor and prototype key while parsing. Returns { ok, errors, warnings, value } (value: the parsed data).
 * Arguments: textIn (the JSON text).
 */
export function parseSpriteJson(textIn) {
  const C = context();
  const value = parseText(C, textIn);
  const { errors, warnings } = finish(C);
  return { ok: errors.length === 0, errors, warnings, value: errors.length ? null : value };
}

function parseText(C, textIn) {
  try {
    if (typeof textIn !== 'string') { C.err(`The definition must be JSON text; got ${typeof textIn}`); return undefined; }
    const size = textIn.length > L.jsonBytes ? textIn.length : utf8Length(textIn);
    if (size > L.jsonBytes) { C.err(`The definition is ${kb(size)} of text; the most is 128 KB`); return undefined; }
    if (nestingOf(textIn, L.nesting) > L.nesting) { C.err(`The definition is nested more than ${L.nesting} levels deep (lists inside lists); a definition never needs that`); return undefined; }
    let removed = 0, value;
    try {
      value = JSON.parse(textIn, (k, v) => { if (PROTO_KEYS.has(k)) { removed++; return undefined; } return v; });
    } catch (e) {
      C.err(`The definition is not JSON and could not be read: ${String(e?.message ?? e).slice(0, 120)}`);
      return undefined;
    }
    if (removed) C.warn(`Removed ${removed} key${removed === 1 ? '' : 's'} named __proto__, constructor or prototype: they could change how objects behave`);
    return value;
  } catch (e) {
    C.err(`The definition could not be read: ${String(e?.message ?? e).slice(0, 120)}`);
    return undefined;
  }
}

/** Text or data in, plain data out (or undefined after errors), with the 128 KB cap applied either way. */
function prepare(C, input) {
  if (typeof input === 'string') {
    const before = C.fails;
    input = parseText(C, input);
    if (C.fails > before) return undefined;
  }
  const p = plainData(input, { jsonBytes: L.jsonBytes, nesting: L.nesting, nodes: L.values });
  for (const e of p.errors) C.err(e.replace(/64 KB/g, '128 KB'));
  if (p.removed) C.warn(`Removed ${p.removed} key${p.removed === 1 ? '' : 's'} named __proto__, constructor or prototype: they could change how objects behave`);
  if (p.errors.length) return undefined;
  let json;
  try { json = JSON.stringify(p.value); } catch { C.err('The definition is not plain data'); return undefined; }
  if (json === undefined) { C.err('The definition is empty'); return undefined; }
  const bytes = utf8Length(json);
  if (bytes > L.jsonBytes) { C.err(`The definition is ${kb(bytes)} as JSON; the most is 128 KB`); return undefined; }
  return p.value;
}

/**
 * The plain-data wall of version 2 alone (docs/data-sprites.md 3.4, rule 3), for code that must read a definition before
 * checking it: JSON text or an object in, a plain-data copy out, nothing in the input ever run, 128 KB at most.
 * Returns { ok, errors, warnings, value } (value: the copy, or null). Arguments: input (an object or JSON text).
 */
export function plainSpriteData(input) {
  const C = context();
  let v;
  try { v = prepare(C, input); } catch (e) { C.err(`The definition could not be read: ${String(e?.message ?? e).slice(0, 120)}`); }
  const { errors, warnings } = finish(C);
  return { ok: errors.length === 0, errors, warnings, value: errors.length ? null : v };
}

// ---- registries ---------------------------------------------------------------------------------------------------

const SITE_REGISTRY = Object.freeze({ generator: SITE_GENERATORS.generator, generators: SITE_GENERATORS.generators });

/** The generator registry a check uses: opts.generators when given (an object with generator(id, v)), else the site's. */
function registryOf(opts) {
  const r = opts.generators;
  if (r === undefined) return SITE_REGISTRY;
  return isObj(r) && typeof r.generator === 'function' ? r : null;
}

/** An argument type of engine/gen/args.js as this file reads it: { name, lo, hi, options, n, optional, args }. */
function typeInfo(t) {
  if (!isObj(t)) return { name: null };
  const name = typeof t.type === 'string' ? t.type : typeof t.kind === 'string' ? t.kind : null;
  const dflt = { share: [0, 1], angle: [-L.angle, L.angle], seed: [0, 9999], point: [-640, 640] }[name] ?? [-Infinity, Infinity];
  return {
    name, lo: fin(t.lo) ? t.lo : fin(t.min) ? t.min : dflt[0], hi: fin(t.hi) ? t.hi : fin(t.max) ? t.max : dflt[1],
    options: Array.isArray(t.options) ? t.options : Array.isArray(t.values) ? t.values : null,
    n: fin(t.n) ? t.n : fin(t.most) ? t.most : 16,
    optional: t.optional === true || t.default !== undefined,
    args: isObj(t.args) ? t.args : isObj(t.fields) ? t.fields : null,
  };
}

function lookupGenerator(C, id, v) {
  const reg = C.reg;
  if (!reg) return { entry: null, versions: [] };
  let entry = null, versions = [];
  try { entry = reg.generator(id, v) ?? null; } catch { entry = null; }
  if (entry && !isObj(entry) && typeof entry !== 'function') entry = null;
  if (!entry) {
    try {
      const all = typeof reg.generators === 'function' ? reg.generators() : [];
      if (Array.isArray(all)) versions = [...new Set(all.filter((g) => g && g.id === id && Number.isInteger(g.v)).map((g) => g.v))].sort((a, b) => a - b);
    } catch { versions = []; }
  }
  return { entry, versions };
}

/** The piece id of a use's text ("material:dirt", without @v), or null. */
const parsePieceUse = (u) => (/^[a-z]+:[a-z][a-z0-9-]{0,39}$/.test(u) ? u : null);

function lookupPiece(C, id, v) {
  const reg = C.pieceReg;
  if (!reg) return { entry: undefined, versions: [] };
  let entry = null, versions = [];
  try { entry = reg.piece(id, v) ?? null; } catch { entry = null; }
  if (!isObj(entry)) entry = null;
  if (!entry) {
    try {
      const all = typeof reg.pieces === 'function' ? reg.pieces() : [];
      if (Array.isArray(all)) versions = [...new Set(all.filter((p) => p && p.id === id && Number.isInteger(p.v)).map((p) => p.v))].sort((a, b) => a - b);
    } catch { versions = []; }
  }
  return { entry, versions };
}

// ---- bindings, paints, `when` -------------------------------------------------------------------------------------

const isBindingLike = (v) => isObj(v) && Object.hasOwn(v, 'from');

/** What a control can be bound to: { kind: 'number', lo, hi, whole } | { kind: 'word', options } | { kind: 'flag' } | { kind: 'paint' } | { kind: 'any' }. */
function targetOf(info) {
  if (NUMBER_TYPES.has(info.name)) return { kind: 'number', lo: info.lo, hi: info.hi, whole: WHOLE_TYPES.has(info.name) };
  if (info.name === 'word') return { kind: 'word', options: info.options ?? [] };
  if (info.name === 'flag') return { kind: 'flag' };
  if (info.name === 'paint') return { kind: 'paint' };
  return null;
}

const targetWords = (t) => (t.kind === 'number' ? `a number from ${t.lo} to ${t.hi}` : t.kind === 'word' ? `one of ${someOf(t.options.map(q))}` : t.kind === 'flag' ? 'true or false' : 'a paint');

/** One value given straight (not bound) for a binding target; returns the value or undefined after an error. */
function targetValue(C, place, field, v, t) {
  if (t.kind === 'number') {
    if (!fin(v)) { C.err(`${place}: ${field} must be a number from ${t.lo} to ${t.hi}; got ${say(v)}`); return undefined; }
    if (t.whole && !Number.isInteger(v)) { C.err(`${place}: ${field} must be a whole number from ${t.lo} to ${t.hi}; got ${say(v)}`); return undefined; }
    if (v < t.lo || v > t.hi) { C.err(`${place}: ${field} ${say(v)} is outside ${t.lo} to ${t.hi}`); return undefined; }
    return v;
  }
  if (t.kind === 'word') { if (typeof v === 'string' && t.options.includes(v)) return v; C.err(`${place}: ${field} ${say(v)} is not one of ${someOf(t.options.map(q), 12)}`); return undefined; }
  if (t.kind === 'flag') { if (typeof v === 'boolean') return v; C.err(`${place}: ${field} must be true or false; got ${say(v)}`); return undefined; }
  if (t.kind === 'paint') return paintRef(C, `${place}, ${field}`, v);
  // any: a piece argument whose type is not known here: plain data, checked by the piece when it is resolved
  return v;
}

/**
 * A binding (docs/data-sprites.md 2.6): { from, map, round } (a table from a slider to numbers), { from, pick } (a value
 * per option of a choice or on/off) or { from } (the control's own value, when it fits the target). Marks the control
 * used. Returns { value, worst } (worst: the largest number it can give, for the cost), or undefined after an error.
 */
function binding(C, place, field, b, t) {
  knownOnly(C, `${place}, ${field}`, b, ['from', 'map', 'round', 'pick']);
  const from = b.from;
  const d = typeof from === 'string' ? C.table.get(from) : undefined;
  if (!d) { C.err(`${place}: ${field} is bound to ${q(from)}, which is not one of the sprite's controls (${someOf([...C.table.keys()].filter((k) => C.table.get(k).kind !== 'colour'))})`); return undefined; }
  C.used.add(from);
  const out = { from };
  if (b.map !== undefined && b.pick !== undefined) { C.err(`${place}: ${field} gives both map and pick; a binding is a table (map) for a slider or a pick for a choice or on/off`); return undefined; }
  if (b.map !== undefined) {
    if (d.kind !== 'range') { C.err(`${place}: ${field} is bound to the ${d.kind === 'toggle' ? 'on/off' : d.kind} ${q(from)} with a table; a ${d.kind === 'toggle' ? 'on/off' : d.kind} is bound with pick: { option: value }`); return undefined; }
    if (t.kind !== 'number' && t.kind !== 'any') { C.err(`${place}: ${field} takes ${targetWords(t)}; a table (map) gives numbers: use pick with a choice`); return undefined; }
    if (!Array.isArray(b.map) || b.map.length < 2 || b.map.length > L.mapPoints) { C.err(`${place}: ${field}'s map must be a table of 2 to ${L.mapPoints} points [[in, out], ...]; got ${say(b.map)}`); return undefined; }
    const round = b.round ?? 'none';
    if (!['px', 'half', 'none'].includes(round)) { C.err(`${place}: ${field}'s round must be "px", "half" or "none"; got ${say(b.round)}`); return undefined; }
    let last = -Infinity, worst = -Infinity, ok = true;
    const map = [];
    for (const pt of b.map) {
      if (!Array.isArray(pt) || pt.length !== 2 || !fin(pt[0]) || !fin(pt[1])) { C.err(`${place}: ${field}'s map: each point is [in, out], two numbers; got ${say(pt)}`); ok = false; break; }
      if (!(pt[0] > last)) { C.err(`${place}: ${field}'s map: the in values must be in ascending order, each once`); ok = false; break; }
      last = pt[0];
      if (pt[0] < d.min || pt[0] > d.max) { C.err(`${place}: ${field}'s map: in ${say(pt[0])} is outside the slider ${q(from)} (${d.min} to ${d.max})`); ok = false; break; }
      const o = round === 'px' ? Math.round(pt[1]) : round === 'half' ? Math.round(pt[1] * 2) / 2 : pt[1];
      if (t.kind === 'number') {
        if (t.whole && !Number.isInteger(pt[1])) { C.err(`${place}: ${field} is a whole number; write whole numbers out of the map`); ok = false; break; }
        if (o < t.lo || o > t.hi) { C.err(`${place}: ${field}'s map gives ${say(pt[1])}, outside ${t.lo} to ${t.hi}`); ok = false; break; }
      }
      worst = Math.max(worst, o);
      map.push([pt[0], pt[1]]);
    }
    if (!ok) return undefined;
    if (t.kind === 'number' && t.whole && round !== 'px') { C.err(`${place}: ${field} is a whole number, so its binding needs round: "px" (the values between the points are not whole)`); return undefined; }
    out.map = map;
    if (b.round !== undefined) out.round = round;
    return { value: out, worst };
  }
  if (b.pick !== undefined) {
    if (d.kind !== 'choice' && d.kind !== 'toggle') { C.err(`${place}: ${field} is bound to the slider ${q(from)} with pick; a slider is bound with a table: map: [[in, out], ...]`); return undefined; }
    if (!isObj(b.pick)) { C.err(`${place}: ${field}'s pick must be an object of option: value; got ${say(b.pick)}`); return undefined; }
    const options = d.kind === 'toggle' ? ['true', 'false'] : d.values;
    const pick = {};
    let ok = true, worst = -Infinity;
    for (const [k, v] of Object.entries(b.pick)) {
      if (!options.includes(k)) { C.err(`${place}: ${field}'s pick names ${q(k)}, which ${q(from)} never is (${someOf(options.map(q))})`); ok = false; continue; }
      const x = targetValue(C, place, `${field} (for ${q(k)})`, v, t);
      if (x === undefined && t.kind !== 'any') { ok = false; continue; }
      pick[k] = x;
      if (fin(x)) worst = Math.max(worst, x);
    }
    const missing = options.filter((o) => !Object.hasOwn(b.pick, o));
    if (missing.length) { C.err(`${place}: ${field}'s pick gives no value for ${someOf(missing.map(q))}; give every ${d.kind === 'toggle' ? 'side of the on/off' : 'option'} a value`); ok = false; }
    if (!ok) return undefined;
    out.pick = pick;
    return { value: out, worst: worst === -Infinity ? undefined : worst };
  }
  // the control's own value
  if (t.kind === 'any') return { value: out, worst: d.kind === 'range' ? d.max : undefined };
  if (d.kind === 'range' && t.kind === 'number') {
    if (t.whole) { C.err(`${place}: ${field} is a whole number; bind it with a table and round: "px"`); return undefined; }
    if (d.min < t.lo || d.max > t.hi) { C.err(`${place}: ${field} takes ${targetWords(t)}, but ${q(from)} goes from ${d.min} to ${d.max}; bind it with a table (map)`); return undefined; }
    return { value: out, worst: d.max };
  }
  if (d.kind === 'choice' && t.kind === 'word') {
    const bad = d.values.filter((v) => !t.options.includes(v));
    if (bad.length) { C.err(`${place}: ${field} takes ${targetWords(t)}, but ${q(from)} can also be ${someOf(bad.map(q))}; bind it with pick`); return undefined; }
    return { value: out };
  }
  if (d.kind === 'toggle' && t.kind === 'flag') return { value: out };
  C.err(`${place}: ${field} takes ${targetWords(t)}; the ${d.kind === 'toggle' ? 'on/off' : d.kind} ${q(from)} cannot give it as it is: bind it with ${d.kind === 'range' ? 'a table (map)' : 'pick'}`);
  return undefined;
}

/** The largest number a cleaned binding can give (for the cost): a map's largest output after its rounding, a pick's largest, or the slider's max for the control itself. */
function boundWorst(C, b) {
  const r = (x) => (b.round === 'px' ? Math.round(x) : b.round === 'half' ? Math.round(x * 2) / 2 : x);
  const outs = Array.isArray(b.map) ? b.map.map((m) => r(m[1])) : isObj(b.pick) ? Object.values(b.pick).filter(fin) : [C.table.get(b.from)?.max].filter(fin);
  return outs.length ? Math.max(...outs) : 0;
}

/** A number or a binding to one: { value, worst } or undefined. clamp: v1 geometry clamps with a warning; new fields refuse. */
function numOrBind(C, place, field, v, lo, hi, { need = false, clamp = false, whole = false } = {}) {
  if (isBindingLike(v)) return binding(C, place, field, v, { kind: 'number', lo, hi, whole });
  const x = num(C, place, field, v, lo, hi, { need, clamp, whole });
  return x === undefined ? undefined : { value: x, worst: x };
}

/** A pair [a, b] whose numbers may each be bound; returns the cleaned pair or undefined. */
function pairOf(C, place, field, v, [alo, ahi], [blo, bhi], { need = false, clamp = false, whole = false, bind = true } = {}) {
  if (v === undefined) { if (need) C.err(`${place}: ${field} is missing; give two numbers, like [1, 2]`); return undefined; }
  if (!Array.isArray(v) || v.length !== 2) { C.err(`${place}: ${field} must be two numbers in a list, like [1, 2]; got ${say(v)}`); return undefined; }
  const one = (x, lo, hi, which) => (bind && isBindingLike(x) ? binding(C, place, `${field} (${which} number)`, x, { kind: 'number', lo, hi, whole }) : (() => { const n = num(C, place, `${field} (${which} number)`, whole && clamp ? wholePx(C, place, field, x) : x, lo, hi, { need: true, clamp, whole: whole && !clamp }); return n === undefined ? undefined : { value: n, worst: n }; })());
  const a = one(v[0], alo, ahi, 'first'), b = one(v[1], blo, bhi, 'second');
  return a && b ? [a.value, b.value] : undefined;
}

/**
 * A paint ref (docs/data-sprites.md 2.6): a palette slot "gold", a tone "gold.dark", a fixed paint (ink, clear, white), a
 * colour rule { rule, ... } or a pick binding. Never a hex. Marks the slot painted. Returns the cleaned ref or undefined.
 */
function paintRef(C, place, v, depth = 0) {
  if (typeof v === 'string') {
    if (FIXED_PAINTS.includes(v)) return v;
    if (DERIVE_PAINTS.includes(v) && !C.slots.has(v)) {   // B15b: white, inside a derived slot's rule only
      if (C.inDerive) return v;
      C.err(`${place}: ${q(v)} is a fixed paint only inside a derived slot's rule (palette derive: { "rule": "mix", "of": "floor.light", "with": "white", "amount": 0.3 }); to paint ${v}, add a slot for it`);
      return undefined;
    }
    if (HEX_RE.test(v)) { C.err(`${place}: ${q(v)} is a colour written out; a colour belongs in the palette: add a slot and paint with its name`); return undefined; }
    const [slot, tone, more] = v.split('.');
    if (more !== undefined || !C.slots.has(slot)) { C.err(`${place}: ${q(v)}: ${q(slot)} is not a colour of the palette (${someOf([...C.slots.keys()])}), nor ${listOf(FIXED_PAINTS)}`); return undefined; }
    if (tone !== undefined && !TONES.includes(tone)) { C.err(`${place}: ${q(v)}: ${q(tone)} is not a tone; use ${listOf(TONES)}`); return undefined; }
    C.painted.add(slot);
    return v;
  }
  if (isBindingLike(v)) { const b = binding(C, place, 'paint', v, { kind: 'paint' }); return b?.value; }
  if (isObj(v) && Object.hasOwn(v, 'rule')) return colourRule(C, place, v, depth);
  C.err(`${place}: a paint is the name of a palette colour ("gold", "gold.dark"), ${listOf(FIXED_PAINTS)}, or a colour rule { "rule": ... }; got ${say(v)}`);
  return undefined;
}

/** A colour rule: one of engine/data-rules.js COLOUR_RULES, or a registry generator of family "colour"; nested at most PAINT_DEPTH deep. */
function colourRule(C, place, e, depth) {
  if (depth >= PAINT_DEPTH) { C.err(`${place}: colour rules are nested too deep (more than ${PAINT_DEPTH} inside each other)`); return undefined; }
  if (typeof e.rule !== 'string' || !GEN_ID.test(e.rule) || e.rule.length > L.idChars) { C.err(`${place}: rule must name a colour rule of the framework; got ${say(e.rule)}`); return undefined; }
  if (e.v !== undefined && (!Number.isInteger(e.v) || e.v < 1)) { C.err(`${place}: the version v of rule ${q(e.rule)} must be a whole number; got ${say(e.v)}`); return undefined; }
  const where = `${place} (${e.rule})`;
  if (Object.hasOwn(COLOUR_RULES, e.rule)) {
    if (e.v !== undefined && e.v !== 1) { C.err(`${where}: the framework has version 1 of this rule; got version ${e.v}`); return undefined; }
    C.uses.add(`${e.rule}@1`);
    const spec = COLOUR_RULES[e.rule].args;
    knownOnly(C, where, e, ['rule', 'v', ...Object.keys(spec)]);
    const out = { rule: e.rule };
    if (e.v !== undefined) out.v = e.v;
    let ok = true;
    for (const [name, a] of Object.entries(spec)) {
      const v = e[name];
      if (v === undefined) { if (!a.optional) { C.err(`${where}: ${name} is missing`); ok = false; } continue; }
      let x;
      if (a.kind === 'colour') x = paintRef(C, `${where}, ${name}`, v, depth + 1);
      else if (a.kind === 'number') x = numOrBind(C, where, name, v, a.min, a.max)?.value;
      else if (a.kind === 'word') { if (a.values.includes(v)) x = v; else C.err(`${where}: ${name} must be one of ${listOf(a.values)}; got ${say(v)}`); }
      else if (a.kind === 'when') x = checkWhen(C, where, v, {});
      else if (a.kind === 'colours') {
        const xs = list(C, where, v, a.most, { min: 1, what: name });
        if (xs) {
          const each = xs.map((item, i) => {
            if (a.pairs && Array.isArray(item)) {
              if (item.length !== 2) { C.err(`${where}: ${name} ${i + 1} must be a colour or [colour, least]; got ${say(item)}`); return undefined; }
              const c = paintRef(C, `${where}, ${name} ${i + 1}`, item[0], depth + 1), least = num(C, where, `${name} ${i + 1} least`, item[1], 0, 1, { need: true });
              return c === undefined || least === undefined ? undefined : [c, least];
            }
            return paintRef(C, `${where}, ${name} ${i + 1}`, item, depth + 1);
          });
          if (each.every((y) => y !== undefined)) x = each;
        }
      }
      if (x === undefined) ok = false; else out[name] = x;
    }
    return ok ? out : undefined;
  }
  const v = e.v ?? 1;
  const { entry } = lookupGenerator(C, e.rule, v);
  if (!entry) { C.err(`${place}: rule ${q(e.rule)} is not a colour rule the framework has; use one of ${listOf(Object.keys(COLOUR_RULES))} or a colour rule of the generator list`); return undefined; }
  if (entry.family !== 'colour') { C.err(`${place}: ${e.rule}@${v} is a generator of family ${q(entry.family)}, not a colour rule`); return undefined; }
  C.uses.add(`${e.rule}@${v}`);
  const { rule, v: _v, ...args } = e;
  const out = { rule, ...(e.v !== undefined ? { v: e.v } : {}) };
  const r = genArgs(C, where, `${e.rule}@${v}`, entry, args, { depth: depth + 1 });
  if (!r) return undefined;
  return { ...out, ...r.args };
}

/**
 * A `when` (Contract 3): { key: [values] } or a list of such (any one enough), each key a control other than `self`,
 * each value one that control takes, or for a slider a threshold { atLeast?, above?, atMost?, below? } (checkThreshold;
 * build item B15b), also in a control's own `when` and a sound cue's (engine/sprite.js reads those with the same rule
 * since build item F3). With scene, also { clip: [names] } (checked once the clips are known) and
 * { direction: [down | up | side] }. Marks each control used. Returns the cleaned copy or undefined after an error.
 */
function checkWhen(C, place, w, { self = null, scene = false } = {}) {
  const one = (alt) => {
    if (!isObj(alt) || !Object.keys(alt).length) { C.err(`${place}: when must be { key: [values] } naming at least one control, or a list of them; got ${say(alt)}`); return undefined; }
    const out = {};
    let ok = true;
    for (const [k, raw] of Object.entries(alt)) {
      const values = Array.isArray(raw) ? raw : [raw];
      if (!values.length || values.length > L.options) { C.err(`${place}: when lists ${q(k)} with ${values.length} values; give 1 to ${L.options}`); ok = false; continue; }
      if (SCENE_KEYS.has(k)) {
        if (!scene) { C.err(`${place}: when names ${q(k)}; this when names controls only (clip and direction may be named in the when of a shape, a generator call, an emitter or a layer item)`); ok = false; continue; }
        if (k === 'direction') {
          const bad = values.filter((v) => !TOPDOWN_DIRECTIONS.includes(v));
          if (bad.length) { C.err(`${place}: when lists the direction ${bad.map(say).join(', ')}; directions are ${listOf(TOPDOWN_DIRECTIONS)}`); ok = false; continue; }
        } else {
          const bad = values.filter((v) => typeof v !== 'string');
          if (bad.length) { C.err(`${place}: when lists clips by name; got ${bad.map(say).join(', ')}`); ok = false; continue; }
          for (const v of values) C.clipRefs.push([place, v]);
        }
        out[k] = [...values];
        continue;
      }
      if (k === self) { C.err(`${place}: when cannot depend on itself (${q(k)})`); ok = false; continue; }
      const d = C.table.get(k);
      if (!d) { C.err(`${place}: when names ${q(k)}, which is not one of the sprite's controls (${someOf([...C.table.keys()])})`); ok = false; continue; }
      const limits = values.filter(isObj);   // thresholds (B15b; in a control's or a sound's when too since F3)
      const kept = limits.map((x) => checkThreshold(C, place, k, d, x));
      if (kept.some((x) => x === undefined)) { ok = false; continue; }
      const bad = values.filter((v) => !isObj(v) && !fits(d, v));
      if (bad.length) { C.err(`${place}: when lists ${bad.map(say).join(', ')} for ${q(k)}, which it can never be; it takes ${shown(d)}`); ok = false; continue; }
      C.used.add(k);
      let n = 0;
      out[k] = values.map((v) => (isObj(v) ? kept[n++] : d.kind === 'colour' ? v.toLowerCase() : v));
    }
    return ok ? out : undefined;
  };
  if (Array.isArray(w)) {
    if (!w.length || w.length > L.whenAlternatives) { C.err(`${place}: when as a list holds 1 to ${L.whenAlternatives} alternatives; got ${w.length}`); return undefined; }
    const alts = w.map(one);
    return alts.every(Boolean) ? alts : undefined;
  }
  return one(w);
}

/**
 * A threshold in a `when` list (build item B15b), checked by engine/sprite.js thresholdProblem, the one check defineSprite
 * uses too (build item F3): { atLeast?, above?, atMost?, below? } on a slider (d.kind range), at least one bound, at most
 * one lower and one upper, each a number inside the slider's range, able to hold. Returns the cleaned threshold (its
 * bounds in WHEN_BOUNDS order) or undefined after an error.
 */
function checkThreshold(C, place, key, d, x) {
  const bad = thresholdProblem(x, d, key);
  if (bad) { C.err(`${place}: ${bad}`); return undefined; }
  return Object.fromEntries(WHEN_BOUNDS.filter((k) => Object.hasOwn(x, k)).map((k) => [k, x[k]]));
}

function fits(d, v) {
  if (d.kind === 'choice') return typeof v === 'string' && d.values.includes(v);
  if (d.kind === 'toggle') return typeof v === 'boolean';
  if (d.kind === 'range') return fin(v) && v >= d.min && v <= d.max;
  return typeof v === 'string' && HEX_RE.test(v);
}
const shown = (d) => (d.kind === 'choice' ? `one of ${someOf(d.values.map((v) => q(v)))}` : d.kind === 'toggle' ? 'true or false' : d.kind === 'range' ? `a number from ${d.min} to ${d.max}` : 'a colour "#rrggbb"');

// ---- generators and pieces ----------------------------------------------------------------------------------------

/**
 * A generator call { gen, v, ...args } (section 3.2) at a place in the definition (role: draw, place, motion, emitter,
 * piece, fit). Looks it up, checks its family fits the place, its call fields, every argument; adds its cost (top-level
 * calls only: a placing generator's cost covers what it places, engine/gen/registry.js costOf). Returns the cleaned
 * call or undefined after an error.
 */
function genCall(C, place, g, { role = 'draw', nested = false, depth = 0 } = {}) {
  if (!isObj(g)) { C.err(`${place}: a generator call is an object { "gen": "<name>", "v": <version>, ...arguments }; got ${say(g)}`); return undefined; }
  if (typeof g.gen !== 'string' || g.gen.length > L.idChars || !GEN_ID.test(g.gen)) { C.err(`${place}: gen must name a generator of the framework, like "scatter"; got ${say(g.gen)}`); return undefined; }
  const id = g.gen;
  if (g.v === undefined) { C.err(`${place}: ${id}: say which version of the generator was used: "v": 1`); return undefined; }
  if (!Number.isInteger(g.v) || g.v < 1) { C.err(`${place}: ${id}: the version v must be a whole number from 1; got ${say(g.v)}`); return undefined; }
  C.cost.generators++;
  if (depth > 4) { C.err(`${place}: ${id}: generators are placed inside each other too deep (at most 4)`); return undefined; }
  const key = `${id}@${g.v}`;
  if (!C.reg) { C.err(`${place}: generator ${key} cannot be looked up: no generator list is loaded (the generators are engine/gen/index.js)`); return undefined; }
  const { entry, versions } = lookupGenerator(C, id, g.v);
  if (!entry) {
    C.err(versions.length
      ? `${place}: there is no ${id} version ${g.v}; the framework has ${id} in version${versions.length === 1 ? '' : 's'} ${listOf(versions)}`
      : `${place}: there is no generator ${q(id)} in the framework; the generators are listed in generated/generators.json`);
    return undefined;
  }
  C.uses.add(key);
  const fam = GENERATOR_PLACES[role];
  if (fam && !fam.includes(entry.family)) { C.err(`${place}: ${key} is a generator of family ${q(entry.family)}; ${role === 'motion' ? 'a motion' : role === 'emitter' ? 'an emitter (a behaviour)' : role === 'piece' ? 'an interface piece' : 'an icon fit'} needs one of family ${listOf(fam)}`); return undefined; }
  if (!fam && ['motion', 'colour', 'layout'].includes(entry.family)) { C.err(`${place}: ${key} is a ${entry.family} generator; it cannot draw here${entry.family === 'motion' ? ' (a motion goes in pictures.motion)' : ''}`); return undefined; }
  const argSpec = isObj(entry.args) ? entry.args : {};
  const callFields = [...CALL_FIELDS, ...(role === 'motion' && !Object.hasOwn(argSpec, 'node') ? ['node'] : [])];
  const out = { gen: id, v: g.v };
  const args = {};
  for (const k of Object.keys(g)) {
    if (k === 'gen' || k === 'v') continue;
    if (callFields.includes(k) && !Object.hasOwn(argSpec, k)) continue;
    args[k] = g[k];
  }
  // call fields
  if (g.id !== undefined) { const i = idOf(C, place, g.id); if (i) out.id = i; }
  if (g.on !== undefined) { if (typeof g.on === 'string') out.on = g.on; else C.err(`${place}: on must name a node, a bone or an earlier item; got ${say(g.on)}`); }
  if (g.node !== undefined && callFields.includes('node')) { if (typeof g.node === 'string') out.node = g.node; else C.err(`${place}: node must name a node; got ${say(g.node)}`); }
  const z = g.z === undefined ? undefined : num(C, place, 'z', g.z, -L.z, L.z);
  if (z !== undefined) out.z = z;
  if (g.group !== undefined) { const gr = idOf(C, place, g.group, { what: 'group' }); if (gr) out.group = gr; }
  for (const f of ['hidden', 'glow']) { const b = bool(C, place, f, g[f]); if (b !== undefined) out[f] = b; }
  if (g.part !== undefined) { const p = idOf(C, place, g.part, { what: 'part' }); if (p) { out.part = p; C.partRefs.push([place, p, out.id]); } }
  if (g.when !== undefined) { const w = checkWhen(C, place, g.when, { scene: true }); if (w !== undefined) out.when = w; }
  if (g.clip !== undefined) {
    const xs = list(C, place, g.clip, L.clips, { min: 1, what: 'clips' });
    if (xs) { const names = xs.filter((c) => { if (typeof c !== 'string') { C.err(`${place}: clip lists clips by name; got ${say(c)}`); return false; } return true; }); for (const c of names) C.clipRefs.push([place, c]); out.clip = names; }
  }
  const r = genArgs(C, place, key, entry, args, { role, depth, placed: role === 'place' });
  if (!r) return undefined;
  Object.assign(out, r.args);
  if (!nested) {
    let cost;
    try {
      const costOf = (child) => (isObj(child) && Object.hasOwn(child, 'gen') ? nestedCost(C, child) : 1);
      cost = entry.cost(Object.freeze({ ...r.worst }), { costOf });
    } catch { cost = NaN; }
    if (!fin(cost) || cost < 0) { C.err(`${place}: the cost of ${key} could not be worked out (the framework's generator gave ${say(cost)}); it cannot be drawn`); return undefined; }
    C.cost.expanded += cost;
    if (role === 'emitter') C.emitterPrice = { worst: { ...r.worst }, cost };
  }
  return out;
}

/** A nested generator's own cost at its worst arguments (for a placing generator's costOf); 1 when it cannot be read. */
function nestedCost(C, node) {
  try {
    const { entry } = lookupGenerator(C, node.gen, node.v);
    if (!entry) return 1;
    const worst = {};
    for (const [k, v] of Object.entries(node)) {
      if (CALL_FIELDS.includes(k)) continue;
      if (isBindingLike(v)) {
        const outs = Array.isArray(v.map) ? v.map.map((p) => (v.round === 'px' ? Math.round(p[1]) : p[1])) : isObj(v.pick) ? Object.values(v.pick).filter(fin) : [];
        worst[k] = outs.length ? Math.max(...outs) : 0;
      } else worst[k] = v;
    }
    const c = entry.cost(Object.freeze(worst), { costOf: (child) => (isObj(child) && Object.hasOwn(child, 'gen') ? nestedCost(C, child) : 1) });
    return fin(c) && c >= 0 ? c : 1;
  } catch { return 1; }
}

/** A generator's arguments against its declared types: { args (cleaned), worst (for the cost) } or undefined. */
function genArgs(C, place, key, entry, given, { role = 'draw', depth = 0, placed = false } = {}) {
  const spec = isObj(entry.args) ? entry.args : {};
  let ok = true;
  const unknown = Object.keys(given).filter((k) => !Object.hasOwn(spec, k));
  if (unknown.length) { C.err(`${place}: ${someOf(unknown.map(q))} ${unknown.length === 1 ? 'is not an argument' : 'are not arguments'} of ${key}; its arguments are ${someOf(Object.keys(spec), 16) || 'none'}`); ok = false; }
  const args = {}, worst = {};
  for (const [name, type] of Object.entries(spec)) {
    const info = typeInfo(type);
    const v = given[name];
    if (v === undefined) {
      if (placed && name === 'at') { worst.at = [0, 0]; continue; }
      if (!info.optional) { C.err(`${place}: ${name} is missing; ${key} needs it`); ok = false; continue; }
      if (type.default !== undefined) worst[name] = type.default;
      continue;
    }
    const r = argValue(C, `${place}`, name, v, info, { depth, key });
    if (!r) { ok = false; continue; }
    args[name] = r.value;
    worst[name] = r.worst ?? r.value;
  }
  if (placed && !Object.hasOwn(spec, 'at')) { C.err(`${place}: ${key} cannot be placed: it has no "at" point argument`); ok = false; }
  return ok ? { args, worst } : undefined;
}

/** One argument value against its type (engine/gen/args.js): refused when outside, never clamped. Returns { value, worst } or undefined. */
function argValue(C, place, name, v, info, { depth = 0, key = '' } = {}) {
  const t = info.name;
  if (NUMBER_TYPES.has(t)) {
    if (isBindingLike(v)) return binding(C, place, name, v, targetOf(info));
    const x = targetValue(C, place, name, v, targetOf(info));
    return x === undefined ? undefined : { value: x, worst: x };
  }
  if (t === 'word' || t === 'flag') {
    const target = targetOf(info);
    if (isBindingLike(v)) return binding(C, place, name, v, target);
    const x = targetValue(C, place, name, v, target);
    return x === undefined ? undefined : { value: x };
  }
  if (t === 'paint') { const x = paintRef(C, `${place}, ${name}`, v); return x === undefined ? undefined : { value: x }; }
  if (t === 'paints') {
    const xs = list(C, place, v, info.n, { min: 1, what: `paints in ${name}` });
    if (!xs) return undefined;
    const each = xs.map((p, i) => paintRef(C, `${place}, ${name} ${i + 1}`, p));
    return each.every((x) => x !== undefined) ? { value: each } : undefined;
  }
  if (t === 'point') {
    const p = pairOf(C, place, name, v, [info.lo, info.hi], [info.lo, info.hi]);
    if (!p) return undefined;
    return { value: p, worst: p.map((c) => (isBindingLike(c) ? boundWorst(C, c) : c)) };
  }
  if (t === 'profile') {
    const x = profileRef(C, place, name, v);
    return x === undefined ? undefined : { value: x };
  }
  if (t === 'shape') {
    const s = primitive(C, `${place}, ${name}`, v, { area: true, nested: true });
    return s === undefined ? undefined : { value: s };
  }
  if (t === 'place') {
    const p = placeThing(C, `${place}, ${name}`, v, depth);
    return p === undefined ? undefined : { value: p };
  }
  if (t === 'primitives') {
    const xs = list(C, place, v, L.primitives, { what: `primitives in ${name}` });
    if (!xs) return undefined;
    const each = xs.map((p, i) => drawItem(C, `${place}, ${name} ${i + 1}`, p, { nested: true, depth: depth + 1 }));
    return each.every((x) => x !== undefined) ? { value: each } : undefined;
  }
  if ((t === 'struct' || t === 'object') && info.args) {
    if (!isObj(v)) { C.err(`${place}: ${name} must be an object of ${listOf(Object.keys(info.args))}; got ${say(v)}`); return undefined; }
    const r = genArgs(C, `${place}, ${name}`, `${key} ${name}`, { args: info.args }, v, { depth });
    return r ? { value: r.args, worst: r.worst } : undefined;
  }
  if (t === 'text') { const s = text(C, place, name, v, info.n ?? L.text); return s === undefined ? undefined : { value: s }; }
  C.err(`${place}: ${name} is an argument of a type this site does not know (${say(t)}); ${key} needs a newer site`);
  return undefined;
}

/**
 * A tile edge's inset or ragged profile: a profile (profileRef) or a pick of one by a choice or an on/off,
 * { from, pick: { option: profile } }, so a style can change the shape of an outline and not only how far it wanders.
 * Every option needs a profile; a table (map) and a slider are refused. Marks the control used. Returns the name, the
 * list or the cleaned binding (engine/resolve.js gives engine/gen/tiles.js the picked one), or undefined after an error.
 */
function profileOrPick(C, place, name, v) {
  if (!isObj(v)) return profileRef(C, place, name, v);
  knownOnly(C, `${place}, ${name}`, v, ['from', 'pick']);
  const d = typeof v.from === 'string' ? C.table.get(v.from) : undefined;
  if (!d) { C.err(`${place}: ${name} is picked by ${q(v.from)}, which is not one of the sprite's controls (${someOf([...C.table.keys()].filter((k) => C.table.get(k).kind !== 'colour'))})`); return undefined; }
  C.used.add(v.from);
  if (d.kind !== 'choice' && d.kind !== 'toggle') { C.err(`${place}: ${name} can be picked by a choice or an on/off only, and ${q(v.from)} is a ${d.kind}; write pick: { option: profile } from one of those, and bind the amount to a slider`); return undefined; }
  if (!isObj(v.pick)) { C.err(`${place}: ${name} must be the name of a profile, a list of numbers or { from, pick: { option: profile } }; got ${say(v)}`); return undefined; }
  const options = d.kind === 'toggle' ? ['true', 'false'] : d.values, pick = {};
  let ok = true;
  for (const [k, x] of Object.entries(v.pick)) {
    if (!options.includes(k)) { C.err(`${place}: ${name}'s pick names ${q(k)}, which ${q(v.from)} never is (${someOf(options.map(q))})`); ok = false; continue; }
    const pr = profileRef(C, place, `${name} (for ${q(k)})`, x);
    if (pr === undefined) ok = false; else pick[k] = pr;
  }
  const missing = options.filter((o) => !Object.hasOwn(v.pick, o));
  if (missing.length) { C.err(`${place}: ${name}'s pick gives no value for ${someOf(missing.map(q))}; give every ${d.kind === 'toggle' ? 'side of the on/off' : 'option'} a profile`); ok = false; }
  return ok ? { from: v.from, pick } : undefined;
}

function profileRef(C, place, name, v) {
  if (typeof v === 'string') {
    if (!C.profiles || !C.profiles.has(v)) { C.err(`${place}: ${name}: ${q(v)} is not a profile of this sprite${C.profiles?.size ? ` (${someOf([...C.profiles.keys()])})` : ' (it has none; give the numbers as a list)'}`); return undefined; }
    return v;
  }
  if (!Array.isArray(v) || !v.length || v.length > L.profileLength || v.some((x) => !fin(x) || Math.abs(x) > 64)) { C.err(`${place}: ${name} must be the name of a profile or a list of 1 to ${L.profileLength} numbers from -64 to 64; got ${say(v)}`); return undefined; }
  return [...v];
}

/** What a placing generator puts at its points: a primitive positioned by `at`, a piece { use, v, paint? } or a generator call. */
function placeThing(C, place, v, depth) {
  if (!isObj(v)) { C.err(`${place}: must be a primitive, a piece { "use": "stamp:clod", "v": 1 } or a generator call { "gen": ..., "v": ... }; got ${say(v)}`); return undefined; }
  if (Object.hasOwn(v, 'gen')) return genCall(C, place, v, { role: 'place', nested: true, depth: depth + 1 });
  if (Object.hasOwn(v, 'use') && !Object.hasOwn(v, 'kind')) {
    knownOnly(C, place, v, ['use', 'v', 'paint', 'args']);
    return pieceUse(C, place, v, {});
  }
  const p = primitive(C, place, v, { placed: true, nested: true });
  if (p && !GEN_PLACEABLE_KINDS.includes(p.kind)) { C.err(`${place}: a ${p.kind} has no single "at" to place it by; ${listOf(GEN_PLACEABLE_KINDS)} have`); return undefined; }
  return p;
}

/**
 * A piece named by id and version (section 3.3, pieces/): "<kind>:<name>" with v. kind, when given, is the kind the
 * place needs (extends needs a base, a panel a skin). Counts the use. Returns { id, v, entry } (entry undefined when no
 * piece list is loaded) or undefined after an error.
 */
function pieceRef(C, place, id, v, kind = null) {
  if (typeof id !== 'string' || !PIECE_ID.test(id)) { C.err(`${place}: ${say(id)} is not a piece name; a piece is named kind:name, like "part:hair" (kinds: ${listOf(PIECE_KINDS)})`); return undefined; }
  if (kind && !id.startsWith(`${kind}:`)) { C.err(`${place}: needs a ${kind} piece ("${kind}:<name>"); ${q(id)} is a ${id.split(':')[0]} piece`); return undefined; }
  if (v === undefined) { C.err(`${place}: ${id}: say which version of the piece was used: "v": 1`); return undefined; }
  if (!Number.isInteger(v) || v < 1) { C.err(`${place}: ${id}: the version v must be a whole number from 1; got ${say(v)}`); return undefined; }
  C.cost.pieces++;
  C.uses.add(`${id}@${v}`);
  C.anyPiece = true;
  const { entry, versions } = lookupPiece(C, id, v);
  if (entry === null) {
    C.err(versions.length ? `${place}: the piece ${id} has version${versions.length === 1 ? '' : 's'} ${listOf(versions)}, not version ${v}` : `${place}: there is no piece ${q(id)} in pieces/`);
    return undefined;
  }
  return { id, v, entry };
}

/** A piece placed: { use, v, args?, paint? } (paint maps the piece's slots to the sprite's paints). Returns the cleaned fields. */
function pieceUse(C, place, s, { kind = null } = {}) {
  const ref = pieceRef(C, place, s.use, s.v, kind);
  if (!ref) return undefined;
  const out = { use: ref.id, v: ref.v };
  const e = ref.entry;
  C.cost.expanded += e && fin(e.cost) && e.cost >= 0 ? e.cost : 1;
  let ok = true;
  if (s.paint !== undefined) {
    const names = mapNames(C, `${place}, paint`, s.paint, 32, "the piece's colour: a paint of the sprite");
    if (!names) ok = false;
    else {
      out.paint = {};
      const slots = Array.isArray(e?.slots) ? e.slots : null;
      for (const k of names) {
        if (slots && !slots.includes(k)) { C.err(`${place}: ${q(k)} is not a colour of ${ref.id}; its colours are ${someOf(slots) || 'none'}`); ok = false; continue; }
        if (!slots && !ID_PATTERN.test(k)) { C.err(`${place}: paint names ${q(k)}, which is not a colour name`); ok = false; continue; }
        const x = paintRef(C, `${place}, paint ${q(k)}`, s.paint[k]);
        if (x === undefined) ok = false; else out.paint[k] = x;
      }
    }
  }
  if (s.args !== undefined) {
    const names = mapNames(C, `${place}, args`, s.args, 32, 'argument: value');
    if (!names) ok = false;
    else {
      const spec = isObj(e?.args) ? e.args : null;
      out.args = {};
      for (const k of names) {
        const v = s.args[k];
        if (spec) {
          if (!Object.hasOwn(spec, k)) { C.err(`${place}: ${q(k)} is not an argument of ${ref.id}; its arguments are ${someOf(Object.keys(spec)) || 'none'}`); ok = false; continue; }
          const r = argValue(C, place, k, v, typeInfo(spec[k]), { key: ref.id });
          if (!r) { ok = false; continue; }
          out.args[k] = r.value;
        } else {
          if (!ID_PATTERN.test(k)) { C.err(`${place}: ${q(k)} is not an argument name`); ok = false; continue; }
          if (isBindingLike(v)) { const b = binding(C, place, k, v, { kind: 'any' }); if (!b) { ok = false; continue; } out.args[k] = b.value; }
          else out.args[k] = v;
        }
      }
    }
  }
  return ok ? out : undefined;
}

// ---- primitives ---------------------------------------------------------------------------------------------------

const COMMON_FIELDS = ['id', 'kind', 'on', 'bone', 'paint', 'z', 'group', 'when', 'hidden', 'glow', 'part', 'far', 'shade', 'light'];
const KIND_FIELDS = {
  limb: ['width'], capsule: ['from', 'to', 'r', 'offset'], ellipse: ['at', 'r'], poly: ['points'], dot: ['at', 'size'],
  rect: ['at', 'size'], line: ['from', 'to', 'thick'], arc: ['at', 'r', 'a0', 'a1', 'thick'], ring: ['at', 'r', 'thick'],
  stamp: ['at', 'anchor', 'rows', 'key', 'variants', 'mirror', 'alt', 'detail'],
  dither: ['area', 'pattern', 'amount'], bands: ['area', 'dir', 'stops', 'edges'],
  text: ['font', 'text', 'at', 'align', 'outline'], use: ['use', 'v', 'args'],
  outline: ['only', 'sides'], tint: [], cut: ['shape', 'from'],
};
const NO_PAINT = new Set(['stamp', 'bands', 'use', 'cut', 'outline']);

/** One thing in a draw list: a generator call or a primitive. ctx as primitive. */
function drawItem(C, place, s, ctx = {}) {
  if (isObj(s) && Object.hasOwn(s, 'gen')) {
    C.cost.written++;
    const g = genCall(C, place, s, { role: 'draw', nested: !!ctx.nested, depth: ctx.depth ?? 0 });
    if (g && g.on !== undefined) onRef(C, place, g.on, ctx);
    if (g?.id) registerId(C, place, g.id, { kind: 'gen' });
    return g;
  }
  return primitive(C, place, s, ctx);
}

function registerId(C, place, id, info) {
  if (C.shapeIds.has(id)) { C.err(`${place}: the id ${q(id)} is used twice; each shape, stamp, piece and item needs its own id`); return false; }
  C.shapeIds.set(id, info);
  return true;
}

/** Checks what `on` names: a node or bone of the body (ctx.refs), or an earlier item (layers). */
function onRef(C, place, on, ctx) {
  if (ctx.items) { if (!ctx.items.has(on)) C.err(`${place}: on ${q(on)} is not an item drawn before it in this body; give the item an id and draw it first`); return; }
  if (!C.nodes) { C.err(`${place}: on ${q(on)}: this body has no nodes or bones to put things on`); return; }
  if (C.loose && !C.nodes.has(on)) { if (!ID_PATTERN.test(on)) C.err(`${place}: on ${q(on)} is not a bone name`); return; }
  if (!C.nodes.has(on)) C.err(`${place}: on: ${q(on)} is not a bone or node of this body (${someOf([...C.nodes.keys()])})`);
}

/**
 * One primitive (docs/data-sprites.md 2.7). ctx: { rig (a bone rig's shape: id and bone needed, v1 rules), items (layer
 * item ids for `on`), placed (inside a place: `at` optional), area (an area of dither, bands or cut: no paint, no id,
 * not counted), nested (inside a generator's argument) }. Returns the cleaned primitive or undefined.
 */
function primitive(C, place, s, ctx = {}) {
  if (!isObj(s)) { C.err(`${place}: must be an object { kind, ... }; got ${say(s)}`); return undefined; }
  if (Object.hasOwn(s, 'gen')) {
    if (ctx.area) { C.err(`${place}: must be a shape (${listOf([...AREA_KINDS])}), not a generator call`); return undefined; }
    return drawItem(C, place, s, ctx);
  }
  const kind = s.kind;
  if (typeof kind !== 'string' || !PRIMITIVE_KINDS.includes(kind)) { C.err(`${place}: kind must be one of ${listOf(PRIMITIVE_KINDS)}; got ${say(kind)}`); return undefined; }
  if (ctx.area && !AREA_KINDS.has(kind)) { C.err(`${place}: an area must be a shape: ${listOf([...AREA_KINDS])}; got a ${kind}`); return undefined; }
  if (!ctx.area) C.cost.written++;
  const pl = `${place}${typeof s.id === 'string' && !place.includes(q(s.id)) ? ` ${q(s.id)}` : ''}`;
  knownOnly(C, pl, s, [...COMMON_FIELDS, ...KIND_FIELDS[kind]]);
  const v1 = V1_KINDS.has(kind);
  const clamp = v1;                                 // v1 kinds clamp as version 1 does; new kinds refuse
  const P = Math.max(C.W, C.H), R = Math.max(32, P);
  const out = {};
  let ok = true;
  const before = C.fails;
  if (s.id !== undefined && !ctx.area) { const id = idOf(C, pl, s.id); if (id && registerId(C, pl, id, { kind, variants: null })) out.id = id; else ok = false; }
  else if (ctx.rig && !ctx.area) { C.err(`${pl}: a shape on a rig needs an id`); ok = false; }
  out.kind = kind;
  // on (v1: bone)
  const on = s.on ?? s.bone;
  if (s.on !== undefined && s.bone !== undefined && s.on !== s.bone) C.err(`${pl}: give on or bone (version 1's name), not both`);
  if (on !== undefined && !ctx.area) {
    if (typeof on !== 'string') C.err(`${pl}: on must name a bone or node; got ${say(on)}`);
    else { onRef(C, pl, on, ctx); if (s.bone !== undefined && s.on === undefined) out.bone = on; else out.on = on; }
  } else if (ctx.rig && !OPS.has(kind) && !ctx.area) C.err(`${pl}: its bone is missing; a shape on a rig names the bone it moves with (on)`);
  // paint
  if (s.paint !== undefined && kind !== 'use') { const p = paintRef(C, `${pl}, paint`, s.paint); if (p !== undefined) out.paint = p; }
  else if (!NO_PAINT.has(kind) && !ctx.area && kind !== 'use') C.err(`${pl}: paint is missing; name a colour of the palette`);
  if (kind === 'outline' && out.paint === undefined && s.paint === undefined) out.paint = 'ink';
  // common fields
  if (s.z !== undefined) { const z = num(C, pl, 'z', s.z, -L.z, L.z); if (z !== undefined) out.z = z; }
  if (s.group !== undefined) { const g = idOf(C, pl, s.group, { what: 'group' }); if (g) { out.group = g; C.groups.add(g); } }
  for (const f of ['far', 'glow', 'hidden']) { const b = bool(C, pl, f, s[f]); if (b !== undefined) out[f] = b; }
  if (s.shade !== undefined) { const x = num(C, pl, 'shade', s.shade, 0, 2); if (x !== undefined) out.shade = x; }
  if (s.light !== undefined) {
    const x = num(C, pl, 'light', s.light, 0, 1);
    if (x !== undefined) {
      out.light = x;
      const slot = typeof out.paint === 'string' ? C.slots.get(out.paint.split('.')[0]) : null;
      if (x > 0 && slot && !SHINY.has(slot.material)) C.warn(`${pl}: light ${x} is for metal, glass and wet things (style guide 2); its colour is ${slot.material ?? 'not given a material'}`);
    }
  }
  if (s.part !== undefined) { const p = idOf(C, pl, s.part, { what: 'part' }); if (p) { out.part = p; C.partRefs.push([pl, p, out.id]); } }
  if (s.when !== undefined) { const w = checkWhen(C, pl, s.when, { scene: true }); if (w !== undefined) out.when = w; }
  const at = (field, need) => pairOf(C, pl, field, s[field], [-P * 2, P * 2], [-P * 2, P * 2], { need: need && !ctx.placed, clamp });
  const setAt = (field, need) => { const p = at(field, need); if (p) out[field] = p; };
  // the kind's own fields
  switch (kind) {
    case 'limb': {
      if (s.width === undefined) C.err(`${pl}: a limb needs a width in whole pixels (2 or more)`);
      else { const w = num(C, pl, 'width', wholePx(C, pl, 'width', s.width), 1, 16); if (w !== undefined) { if (w === 1) C.warn(`${pl}: a limb 1 pixel thin breaks into stairs when it turns; 2 or more looks right`); out.width = w; } }
      const b = typeof on === 'string' ? C.nodes?.get(on) : undefined;
      if (b && b.kind === 'node') C.err(`${pl}: a limb is drawn along its bone, and ${q(on)} is a node with no length; use another shape`);
      break;
    }
    case 'capsule': {
      for (const f of ['from', 'to']) { const x = num(C, pl, f, s[f], 0, 1); if (x !== undefined) out[f] = x; }
      const r = pairOf(C, pl, 'r', s.r, [0, R], [0, R], { need: true, clamp }); if (r) out.r = r;
      if (s.offset !== undefined) { const o = numOrBind(C, pl, 'offset', s.offset, -P, P, { clamp }); if (o) out.offset = o.value; }
      break;
    }
    case 'ellipse': { setAt('at', true); const r = pairOf(C, pl, 'r', s.r, [0, R], [0, R], { need: true, clamp }); if (r) out.r = r; break; }
    case 'poly': {
      const pts = Array.isArray(s.points) && (s.points.length < 3 || s.points.length > L.polyPoints) ? (C.err(`${pl}: a poly needs 3 to ${L.polyPoints} points; got ${s.points.length}`), null) : list(C, pl, s.points, L.polyPoints, { min: 3, what: 'points', need: true });
      if (pts) { const each = pts.map((p, k) => pairOf(C, pl, `point ${k + 1}`, p, [-P * 2, P * 2], [-P * 2, P * 2], { need: true, clamp })); if (each.every(Boolean)) out.points = each; }
      break;
    }
    case 'dot': {
      setAt('at', true);
      if (s.size !== undefined && s.size !== 1 && s.size !== 2) C.err(`${pl}: a dot's size is 1 or 2 pixels; got ${say(s.size)}`);
      out.size = s.size === 2 ? 2 : 1;
      break;
    }
    case 'rect': {
      setAt('at', true);
      const sz = pairOf(C, pl, 'size', s.size, [1, P], [1, P], { need: true, whole: true }); if (sz) out.size = sz;
      break;
    }
    case 'line': {
      setAt('from', true); setAt('to', true);
      if (s.thick !== undefined) { const t = num(C, pl, 'thick', s.thick, 1, 8, { clamp: false, whole: true }); if (t !== undefined) out.thick = t; }
      break;
    }
    case 'arc': case 'ring': {
      setAt('at', true);
      const r = numOrBind(C, pl, 'r', s.r, 0, R, { need: true }); if (r) out.r = r.value;
      if (kind === 'arc') for (const f of ['a0', 'a1']) { const a = numOrBind(C, pl, f, s[f], -L.angle, L.angle, { need: true }); if (a) out[f] = a.value; }
      if (s.thick !== undefined) { const t = num(C, pl, 'thick', s.thick, 1, 8, { clamp: false, whole: true }); if (t !== undefined) out.thick = t; }
      break;
    }
    case 'stamp': stampFields(C, pl, s, out, ctx, at); break;
    case 'dither': {
      out.area = areaOf(C, pl, s.area);
      if (s.pattern === undefined || !DITHER_PATTERNS.includes(s.pattern)) C.err(`${pl}: pattern must be one of ${listOf(DITHER_PATTERNS)}; got ${say(s.pattern)}`); else out.pattern = s.pattern;
      const a = numOrBind(C, pl, 'amount', s.amount ?? 0.5, 0, 1); if (a) out.amount = a.value;
      break;
    }
    case 'bands': {
      out.area = areaOf(C, pl, s.area);
      if (s.dir !== undefined && !BAND_DIRS.includes(s.dir)) C.err(`${pl}: dir must be one of ${listOf(BAND_DIRS)}; got ${say(s.dir)}`); else out.dir = s.dir ?? 'down';
      const xs = list(C, pl, s.stops, 8, { min: 2, what: 'stops (paints, lightest first)', need: true });
      if (xs) { const each = xs.map((p, i) => paintRef(C, `${pl}, stop ${i + 1}`, p)); if (each.every((x) => x !== undefined)) out.stops = each; }
      if (s.edges !== undefined && !BAND_EDGES.includes(s.edges)) C.err(`${pl}: edges must be ${listOf(BAND_EDGES)}; got ${say(s.edges)}`); else out.edges = s.edges ?? 'hard';
      break;
    }
    case 'text': {
      setAt('at', true);
      const m = typeof s.font === 'string' ? FONT_REF.exec(s.font) : null;
      let glyphs = null;
      if (!m) C.err(`${pl}: font must name a font piece and its version, like "font:chunky@1"; got ${say(s.font)}`);
      else { const ref = pieceRef(C, pl, m[1], +m[2], 'font'); if (ref) { out.font = s.font; if (typeof ref.entry?.glyphs === 'string') glyphs = ref.entry.glyphs; } }
      const t = text(C, pl, 'text', s.text, L.text, { need: true });
      if (t !== undefined) {
        if (glyphs) { const missing = [...new Set([...t].filter((ch) => !glyphs.includes(ch)))]; if (missing.length) C.err(`${pl}: the text has characters the font ${m[1]} does not have: ${missing.join(' ')}`); else out.text = t; }
        else out.text = t;
      }
      if (s.align !== undefined) { if (!['left', 'centre', 'center', 'right'].includes(s.align)) C.err(`${pl}: align must be left, centre or right; got ${say(s.align)}`); else out.align = s.align === 'center' ? 'centre' : s.align; }
      if (s.outline !== undefined) { if (typeof s.outline === 'boolean') out.outline = s.outline; else { const o = paintRef(C, `${pl}, outline`, s.outline); if (o !== undefined) out.outline = o; } }
      break;
    }
    case 'use': {
      const u = pieceUse(C, pl, s);
      if (u) Object.assign(out, u); else ok = false;
      if (!ctx.area) C.cost.written--;               // pieces are counted as pieces
      break;
    }
    case 'outline': {
      if (s.only !== undefined) { const g = idOf(C, pl, s.only, { what: 'group' }); if (g) { out.only = g; C.groupRefs.push([pl, g]); } }
      if (s.sides !== undefined && !['outer', 'all'].includes(s.sides)) C.err(`${pl}: sides must be "outer" or "all"; got ${say(s.sides)}`); else if (s.sides !== undefined) out.sides = s.sides;
      break;
    }
    case 'tint': break;
    case 'cut': {
      if (s.shape === undefined) C.err(`${pl}: a cut needs a shape (what is cut away)`);
      else out.shape = areaOf(C, pl, s.shape);
      if (s.from !== undefined) { const g = idOf(C, pl, s.from, { what: 'group' }); if (g) { out.from = g; C.groupRefs.push([pl, g]); } }
      break;
    }
    default: break;
  }
  if (!ctx.area && kind !== 'use') C.cost.expanded += 1;
  return ok && C.fails === before ? out : undefined;
}

function areaOf(C, place, a) {
  if (a === undefined) { C.err(`${place}: area is missing; give a shape (${listOf([...AREA_KINDS])}) to fill`); return undefined; }
  return primitive(C, `${place}, area`, a, { area: true });
}

/** A stamp's own fields: rows (≤ 32 x 32, all the same length), key (one character: a paint), variants, anchor, mirror, alt. */
function stampFields(C, pl, s, out, ctx, at) {
  const p = at('at', true); if (p) out.at = p;
  if (s.anchor !== undefined) { if (!STAMP_ANCHORS.includes(s.anchor)) C.err(`${pl}: anchor must be one of ${listOf(STAMP_ANCHORS)}; got ${say(s.anchor)}`); else out.anchor = s.anchor; }
  if (s.mirror !== undefined) { if (s.mirror !== 'x' && s.mirror !== false) C.err(`${pl}: mirror is "x" (mirrored in a mirrored direction) or false; got ${say(s.mirror)}`); else out.mirror = s.mirror; }
  const det = bool(C, pl, 'detail', s.detail); if (det !== undefined) out.detail = det;
  // key
  const key = {};
  if (!isObj(s.key)) C.err(`${pl}: key must be an object of character: paint; got ${say(s.key)}`);
  else {
    const chars = Object.keys(s.key);
    if (chars.length > 32) C.err(`${pl}: key has ${chars.length} characters; the most is 32`);
    else for (const ch of chars) {
      if ([...ch].length !== 1 || ch === '.' || ch === ' ') { C.err(`${pl}: key ${q(ch)} must be one character (not "." or a space, which are clear)`); continue; }
      const x = paintRef(C, `${pl}, key ${q(ch)}`, s.key[ch]);
      if (x !== undefined) key[ch] = x;
    }
    out.key = key;
  }
  const rowsOf = (rows, where, size) => {
    if (!Array.isArray(rows) || !rows.length) { C.err(`${where}: rows must be a list of 1 to ${L.stampSide} strings of pixels; got ${say(rows)}`); return undefined; }
    if (rows.length > L.stampSide) { C.err(`${where}: has ${rows.length} rows; a stamp is at most ${L.stampSide} by ${L.stampSide}`); return undefined; }
    if (rows.some((r) => typeof r !== 'string' || !r.length)) { C.err(`${where}: every row is a string of 1 to ${L.stampSide} characters`); return undefined; }
    if (rows.some((r) => [...r].length > L.stampSide)) { C.err(`${where}: a row is longer than ${L.stampSide}; a stamp is at most ${L.stampSide} by ${L.stampSide}`); return undefined; }
    const w = [...rows[0]].length;
    if (rows.some((r) => [...r].length !== w)) { C.err(`${where}: every row must be the same length (the stamp is a rectangle; "." is clear)`); return undefined; }
    if (size && (w !== size[0] || rows.length !== size[1])) { C.err(`${where}: is ${w} by ${rows.length}; a variant is the same size as the stamp (${size[0]} by ${size[1]})`); return undefined; }
    const bad = [...new Set(rows.join(''))].filter((ch) => ch !== '.' && ch !== ' ' && !Object.hasOwn(s.key ?? {}, ch));
    if (bad.length) { C.err(`${where}: ${bad.map((ch) => q(ch)).join(', ')} in its rows ${bad.length === 1 ? 'has' : 'have'} no paint in its key`); return undefined; }
    C.cost.stampPixels += w * rows.length;
    return [...rows];
  };
  const rows = rowsOf(s.rows, pl);
  if (rows) out.rows = rows;
  const variants = new Set();
  if (s.variants !== undefined) {
    const names = mapNames(C, `${pl}, variants`, s.variants, L.variants, 'variant name: rows');
    if (names && rows) {
      out.variants = {};
      const size = [[...rows[0]].length, rows.length];
      for (const n of names) {
        if (!idOf(C, `${pl}, variants`, n, { what: 'variant name' })) continue;
        const r = rowsOf(s.variants[n], `${pl}, variant ${q(n)}`, size);
        if (r) { out.variants[n] = r; variants.add(n); }
      }
    }
  }
  if (out.id) { const info = C.shapeIds.get(out.id); if (info) info.variants = variants; C.stamps.set(out.id, variants); }
  if (s.alt !== undefined) {
    const names = mapNames(C, `${pl}, alt`, s.alt, 8, 'style: [primitives]');
    if (names) {
      out.alt = {};
      for (const st of names) {
        if (!ID_PATTERN.test(st) || RESERVED.has(st)) { C.err(`${pl}: alt names ${q(st)}, which is not a style name`); continue; }
        if (!C.styleIds.includes(st)) C.warn(`${pl}: alt names the style ${q(st)}, which the site does not have yet (${listOf(C.styleIds)}); it is kept for when it does`);
        const xs = list(C, `${pl}, alt ${q(st)}`, s.alt[st], 16, { what: 'primitives' });
        if (xs) { const each = xs.map((x, i) => primitive(C, `${pl}, alt ${q(st)} ${i + 1}`, x, { area: false, nested: true, alt: true })); if (each.every(Boolean)) out.alt[st] = each; }
      }
    }
  }
}

// ---- the bodies ---------------------------------------------------------------------------------------------------

/**
 * A tree of nodes or bones listed parents first: refuses loops (each named once), unknown parents, children listed
 * before their parents, and depth over boneDepth. items: [{ o: { id, parent }, place }]; known: ids that already exist (a base's bones).
 */
function checkTree(C, items, known, what) {
  const byId = new Map(items.map(({ o }, i) => [o.id, { o, i }]));
  const inLoop = new Set();
  for (const { o } of items) {
    if (inLoop.has(o.id) || o.parent === null || !byId.has(o.parent)) continue;
    const seen = [o.id];
    let p = o.parent;
    while (p !== null && byId.has(p) && !seen.includes(p) && seen.length <= items.length) { seen.push(p); p = byId.get(p).o.parent; }
    if (p !== null && seen.includes(p)) {
      const loop = seen.slice(seen.indexOf(p));
      if (!loop.some((x) => inLoop.has(x))) {
        loop.forEach((x) => inLoop.add(x));
        C.err(loop.length === 1 ? `${cap(what)} ${q(p)}: hangs from itself (a loop); give it another parent or none` : `${cap(what)}s ${listOf(loop.map(q))} make a loop: each hangs from the next; one of them must hang from one outside the loop`);
      }
    }
  }
  const depth = new Map();
  let deep = false;
  items.forEach(({ o, place }, i) => {
    if (o.parent === null) { depth.set(o.id, 1); return; }
    if (inLoop.has(o.id)) return;
    if (!byId.has(o.parent)) { if (!known.has(o.parent) && !C.loose) C.err(`${place}: its parent ${q(o.parent)} is not a ${what} of this body`); depth.set(o.id, 2); return; }
    if (byId.get(o.parent).i > i) { C.err(`${place}: its parent ${q(o.parent)} comes after it; list parents before their children`); return; }
    const d = (depth.get(o.parent) ?? 1) + 1;
    depth.set(o.id, d);
    if (d > L.boneDepth && !deep) { deep = true; C.err(`${place}: is ${d} deep from its root; the most is ${L.boneDepth}`); }
  });
}

const RIG_FIELDS = ['format', 'version', 'id', 'name', 'view', 'size', 'colours', 'extends', 'bones', 'nodes', 'shapes', 'ik', 'points', 'directions'];
const BONE_FIELDS = ['id', 'parent', 'at', 'from', 'angle', 'length', 'min', 'max', 'label'];
const NODE_FIELDS = ['id', 'parent', 'at', 'from', 'angle', 'length', 'min', 'max', 'label'];

/**
 * extends.clips (2.2; build item B4x): which of the base's clips the sprite takes, in this order, each a clip of the
 * base by name or { name, from } to take it under another name. Without the list a sprite takes every clip of its
 * base; a clip's own `from` may still name any of them. Sets C.takenClips (Map: the sprite's name -> the base's clip)
 * and ext.clips (the cleaned list).
 */
function takenClips(C, place, raw, ext) {
  const xs = list(C, place, raw, L.clips, { what: 'clips' });
  if (!xs) return;
  const taken = new Map(), out = [];
  for (const x of xs) {
    const renamed = isObj(x);
    if (renamed) knownOnly(C, `${place} clips`, x, ['name', 'from']);
    const name = renamed ? x.name : x, from = renamed ? x.from : x;
    if (typeof name !== 'string' || typeof from !== 'string') { C.err(`${place} clips: each is a clip of the base by name, or { "name": "<clip>", "from": "<base clip>" } to take one under another name; got ${say(x)}`); continue; }
    if (!checkClipName(C, `${place} clips`, name)) continue;
    if (C.baseClips && !C.baseClips.has(from)) { C.err(`${place} clips: ${q(from)} is not a clip of ${C.base.id} (${someOf([...C.baseClips.keys()])})`); continue; }
    if (taken.has(name)) { C.err(`${place} clips: ${q(name)} is listed twice; each clip is taken once`); continue; }
    taken.set(name, from);
    out.push(renamed ? { name, from } : name);
  }
  C.takenClips = taken;
  ext.clips = out;
}

/** body.rig: a bone rig, version 1's fields plus extends, nodes, every primitive on a bone, and stamp overlays per direction (2.2). */
function rigBody(C, r, top) {
  const where = 'Body: rig';
  if (!isObj(r)) { C.err(`${where}: must be an object (bones, shapes, ...); got ${say(r)}`); return undefined; }
  knownOnly(C, where, r, RIG_FIELDS);
  const out = {};
  if (r.format !== undefined) { if (r.format !== 'loadout-rig') C.err(`${where}: format must be "loadout-rig"; got ${say(r.format)}`); else out.format = r.format; }
  if (r.version !== undefined) { if (r.version !== 1 && r.version !== 2) C.err(`${where}: version must be 1 or 2; got ${say(r.version)}`); else out.version = r.version; }
  if (r.id !== undefined) { const id = idOf(C, where, r.id, { pattern: SPRITE_ID_PATTERN }); if (id) out.id = id; }
  if (r.name !== undefined) { const n = text(C, where, 'name', r.name, L.nameChars); if (n) out.name = n; }
  if (r.view !== undefined) { if (!STUDIO_VIEWS.includes(r.view)) C.err(`${where}: view must be one of ${listOf(STUDIO_VIEWS)}; got ${say(r.view)}`); else out.view = r.view; }
  const view = out.view ?? top.metaView ?? 'side';
  C.view = view;
  if (r.size !== undefined) out.size = [C.W, C.H];
  if (top.rigColours) out.colours = top.rigColours;
  const P = Math.max(C.W, C.H);
  const nodes = new Map();
  C.nodes = nodes;
  // extends: a base piece
  let base = null;
  if (r.extends !== undefined) {
    const e = r.extends;
    if (!isObj(e)) C.err(`${where}: extends must be { "use": "base:<name>", "v": 1 }; got ${say(e)}`);
    else {
      knownOnly(C, `${where}: extends`, e, ['use', 'v', 'drop', 'paint', 'clips']);   // clips: build item B4x
      const ref = pieceRef(C, `${where}: extends`, e.use, e.v, 'base');
      if (ref) {
        out.extends = { use: ref.id, v: ref.v };
        base = ref;
        C.base = ref;
        if (ref.entry) {
          for (const b of Array.isArray(ref.entry.bones) ? ref.entry.bones : []) if (typeof b === 'string') nodes.set(b, { kind: 'bone', base: true });
          for (const s of Array.isArray(ref.entry.shapes) ? ref.entry.shapes : []) if (typeof s === 'string') C.baseShapes.add(s);
          const clips = Array.isArray(ref.entry.clips) ? ref.entry.clips : isObj(ref.entry.clips) ? Object.keys(ref.entry.clips) : null;
          C.baseClips = clips ? new Map(clips.map((c) => [c, isObj(ref.entry.clips) ? ref.entry.clips[c] : {}])) : null;
          if (!C.baseClips) C.loose = true;
        } else { C.loose = true; C.baseClips = null; }
        C.cost.expanded += fin(ref.entry?.cost) ? ref.entry.cost : 0;
        if (e.clips !== undefined) takenClips(C, `${where}: extends`, e.clips, out.extends);
        if (e.drop !== undefined) {
          const xs = list(C, `${where}: extends`, e.drop, L.primitives, { what: 'shapes to drop' });
          if (xs) {
            out.extends.drop = [];
            for (const id of xs) {
              if (typeof id !== 'string' || (ref.entry && Array.isArray(ref.entry.shapes) && !C.baseShapes.has(id))) { C.err(`${where}: extends drops ${q(id)}, which is not a shape of ${ref.id}`); continue; }
              out.extends.drop.push(id);
            }
          }
        }
        if (e.paint !== undefined) {
          const names = mapNames(C, `${where}: extends paint`, e.paint, 32, "the base's colour: a paint of the sprite");
          if (names) {
            out.extends.paint = {};
            const slots = Array.isArray(ref.entry?.slots) ? ref.entry.slots : null;
            for (const k of names) {
              if (slots && !slots.includes(k)) { C.err(`${where}: extends paint: ${q(k)} is not a colour of ${ref.id}`); continue; }
              const x = paintRef(C, `${where}: extends paint ${q(k)}`, e.paint[k]);
              if (x !== undefined) out.extends.paint[k] = x;
            }
          }
        }
      }
    }
  }
  // bones and nodes
  const tree = [];
  const boneList = (raw, isNode) => {
    const what = isNode ? 'nodes' : 'bones';
    const xs = list(C, `${where} ${what}`, raw, L.nodes, { what, min: !isNode && !base && r.bones !== undefined ? 1 : 0 }) ?? [];
    const res = [];
    xs.forEach((b, i) => {
      const place = `${isNode ? 'Node' : 'Bone'} ${typeof b?.id === 'string' ? q(b.id) : i + 1}`;
      if (!isObj(b)) { C.err(`${place}: must be an object with ${listOf(isNode ? NODE_FIELDS : BONE_FIELDS)}`); return; }
      knownOnly(C, place, b, isNode ? NODE_FIELDS : BONE_FIELDS);
      const id = idOf(C, place, b.id);
      if (id && nodes.has(id)) { C.err(`${place}: is listed twice${nodes.get(id).base ? ' (the base has it)' : ''}; each bone and node needs its own id`); return; }
      let parent = null;
      if (b.parent !== undefined && b.parent !== null) { if (typeof b.parent !== 'string') C.err(`${place}: parent must be the id of a bone or node, or null for a root; got ${say(b.parent)}`); else parent = b.parent; }
      const o = { id, parent };
      if (parent === null) { o.at = pairOf(C, place, 'at', b.at, [-C.W, 2 * C.W], [-C.H, 2 * C.H], { need: true, clamp: true }); if (b.from !== undefined) C.warn(`${place}: from is only for one that hangs from another; dropped`); }
      else { if (b.at !== undefined) C.warn(`${place}: at is only for a root (no parent); dropped`); const f = num(C, place, 'from', b.from, 0, 1); if (f !== undefined) o.from = f; }
      // a node's angle may be bound to a setting (batch M6b: a Hold angle slider turns the node a weapon is drawn on); a bone's stays a number, which keys pose
      o.angle = isNode && isBindingLike(b.angle) ? numOrBind(C, place, 'angle', b.angle, -L.angle, L.angle)?.value : num(C, place, 'angle', b.angle ?? 0, -L.angle, L.angle);
      if (isNode) { if (b.length !== undefined && b.length !== 0) C.err(`${place}: a node has no length (it is a pivot); put a bone in bones for something with length`); }
      else o.length = num(C, place, 'length', b.length, 1, P, { need: true });
      const lo = num(C, place, 'min', b.min, -L.angle, L.angle), hi = num(C, place, 'max', b.max, -L.angle, L.angle);
      if (lo !== undefined && hi !== undefined && lo > hi) C.err(`${place}: min (${lo}) is more than max (${hi}); the bend must go from min up to max`);
      if (lo !== undefined) o.min = lo;
      if (hi !== undefined) o.max = hi;
      const lab = text(C, place, 'label', b.label, L.nameChars); if (lab !== undefined) o.label = lab;
      if (id) { nodes.set(id, { kind: isNode ? 'node' : 'bone', parent }); tree.push({ o, place }); }
      res.push(o);
    });
    return res;
  };
  if (r.bones === undefined && !base) C.err(`${where}: bones are missing; give the bones, or extend a base piece ("extends": { "use": "base:person-side", "v": 1 })`);
  out.bones = boneList(r.bones, false);
  if (r.nodes !== undefined) out.nodes = boneList(r.nodes, true);
  // the base's bones and nodes count too (batch M6b): rigs/bones.js solves at most L.nodes of the merged rig
  const inBase = Array.isArray(base?.entry?.bones) ? base.entry.bones.length : 0, inRig = out.bones.length + (out.nodes?.length ?? 0) + inBase;
  if (inRig > L.nodes) C.err(`${where}: has ${inRig} bones and nodes${inBase ? ` with its base's ${inBase} (${base.id}@${base.v})` : ''}; the most a rig draws is ${L.nodes}`);
  C.cost.nodes += out.bones.length + (out.nodes?.length ?? 0);
  checkTree(C, tree, new Set([...nodes].filter(([, n]) => n.base).map(([k]) => k)), 'bone');
  // shapes
  const xs = list(C, `${where} shapes`, r.shapes, L.primitives, { what: 'shapes' }) ?? [];
  if (Array.isArray(r.shapes) && !r.shapes.length && !base) C.warn(`${where}: has no shapes, so nothing is drawn; add a shape to a bone`);
  out.shapes = [];
  xs.forEach((s, i) => {
    const place = `Shape ${typeof s?.id === 'string' ? q(s.id) : i + 1}`;
    const o = drawItem(C, place, s, { rig: true });
    if (o) out.shapes.push(o);
  });
  // IK chains
  const ik = new Map(), chainOf = new Map();
  if (r.ik !== undefined) {
    out.ik = [];
    const ks = list(C, `${where} IK chains`, r.ik, L.ik, { what: 'IK chains' }) ?? [];
    ks.forEach((k, i) => {
      const place = `IK ${typeof k?.id === 'string' ? q(k.id) : i + 1}`;
      if (!isObj(k)) { C.err(`${place}: must be an object with id, label, bones, bend`); return; }
      knownOnly(C, place, k, ['id', 'label', 'bones', 'bend']);
      const id = idOf(C, place, k.id);
      if (id && ik.has(id)) { C.err(`${place}: is listed twice; each IK chain needs its own id`); return; }
      const o = { id };
      const lab = text(C, place, 'label', k.label, L.nameChars); if (lab !== undefined) o.label = lab;
      if (!Array.isArray(k.bones) || k.bones.length !== 2) C.err(`${place}: bones must be two bones, [upper, lower]; got ${say(k.bones)}`);
      else {
        const [u, l] = k.bones;
        let good = true;
        for (const b of [u, l]) if (typeof b !== 'string' || (!nodes.has(b) && !C.loose) || nodes.get(b)?.kind === 'node') { C.err(`${place}: ${q(b)} is not a bone of this body`); good = false; }
        if (good && nodes.has(l) && !nodes.get(l).base && nodes.get(l).parent !== u) { C.err(`${place}: ${q(l)} must hang from ${q(u)} (its parent) to make a two-bone chain`); good = false; }
        if (good) for (const b of [u, l]) { if (chainOf.has(b)) { C.err(`${place}: bone ${q(b)} is already in IK ${q(chainOf.get(b))}; give it one chain`); good = false; } else chainOf.set(b, id); }
        o.bones = [u, l];
      }
      if (k.bend !== 1 && k.bend !== -1) C.err(`${place}: bend must be 1 or -1 (which way the joint bends); got ${say(k.bend)}`);
      o.bend = k.bend;
      if (id) ik.set(id, o);
      out.ik.push(o);
    });
  }
  C.ik = ik; C.chainOf = chainOf;
  // attach points (version 1's place for them)
  if (r.points !== undefined) out.points = pointsOf(C, `${where} points`, r.points);
  // directions
  if (view === 'top-down') { const d = directionsOf(C, where, r.directions, P); if (d !== undefined) out.directions = d; }
  else if (r.directions !== undefined) C.warn(`${where}: directions are for a top-down body (view "top-down"); this one is seen from ${q(view)}, so they were dropped`);
  return out;
}

const DIR_BONE = ['angle', 'at', 'length', 'from'];
const DIR_SHAPE = ['z', 'far', 'hidden', 'shade', 'light'];
const DIR_KIND = { limb: ['width'], capsule: ['from', 'to', 'r', 'offset'], ellipse: ['at', 'r'], poly: ['points'], dot: ['at', 'size'], rect: ['at', 'size'], line: ['from', 'to'], arc: ['at', 'r'], ring: ['at', 'r'] };

/** A top-down rig's overlays per direction (docs/studio.md 2.1; docs/data-sprites.md 2.2: stamps too). */
function directionsOf(C, where, raw, P) {
  const at = `${where} directions`;
  if (raw === undefined) { C.warn(`${at}: a top-down body has no directions, so down, up and side draw the same body; give down and up their own pose`); return undefined; }
  if (!isObj(raw)) { C.err(`${at}: must be an object of direction: { bones, shapes, stamps }; got ${say(raw)}`); return undefined; }
  const out = {};
  for (const dir of Object.keys(raw)) {
    if (!TOPDOWN_DIRECTIONS.includes(dir)) { C.err(`${at}: ${q(dir)} is not a direction; use ${listOf(TOPDOWN_DIRECTIONS)} (a game mirrors side for left)`); continue; }
    const o = raw[dir], p0 = `${at}, ${dir}`;
    if (!isObj(o)) { C.err(`${p0}: must be an object with bones, shapes and stamps; got ${say(o)}`); continue; }
    knownOnly(C, p0, o, ['bones', 'shapes', 'stamps']);
    const d = {};
    const each = (field, check) => {
      if (o[field] === undefined) return;
      const names = mapNames(C, `${p0}, ${field}`, o[field], L.primitives, `id: changes`);
      if (!names) return;
      for (const id of names) { const x = check(id, o[field][id], `${p0}, ${field.replace(/s$/, '')} ${q(id)}`); if (x && Object.keys(x).length) (d[field] ??= {})[id] = x; }
    };
    each('bones', (id, v, place) => {
      const b = C.nodes.get(id);
      if (!b && !C.loose) { C.err(`${p0}: ${q(id)} is not a bone of this body`); return null; }
      if (!isObj(v)) { C.err(`${place}: must be an object with ${listOf(DIR_BONE)}; got ${say(v)}`); return null; }
      knownOnly(C, place, v, DIR_BONE);
      const x = {};
      const a = num(C, place, 'angle', v.angle, -L.angle, L.angle); if (a !== undefined) x.angle = a;
      const l = num(C, place, 'length', v.length, 1, P); if (l !== undefined) x.length = l;
      if (v.at !== undefined) { if (b && b.parent !== null && b.parent !== undefined) C.warn(`${place}: at is only for a root; dropped`); else { const p = pairOf(C, place, 'at', v.at, [-C.W, 2 * C.W], [-C.H, 2 * C.H], { clamp: true }); if (p) x.at = p; } }
      if (v.from !== undefined) { const f = num(C, place, 'from', v.from, 0, 1); if (f !== undefined) x.from = f; }
      return x;
    });
    each('shapes', (id, v, place) => {
      const s = C.shapeIds.get(id);
      if (!s && !C.baseShapes.has(id)) { C.err(`${p0}: ${q(id)} is not a shape of this body`); return null; }
      if (!isObj(v)) { C.err(`${place}: must be an object of what changes facing ${dir}; got ${say(v)}`); return null; }
      const allowed = [...DIR_SHAPE, ...(DIR_KIND[s?.kind] ?? [])];
      knownOnly(C, place, v, allowed);
      const x = {};
      for (const k of Object.keys(v)) {
        if (!allowed.includes(k)) continue;
        const val = v[k];
        let c;
        if (k === 'z') c = num(C, place, k, val, -L.z, L.z);
        else if (k === 'far' || k === 'hidden') c = bool(C, place, k, val);
        else if (k === 'shade') c = num(C, place, k, val, 0, 2);
        else if (k === 'light') c = num(C, place, k, val, 0, 1);
        else if (k === 'width') c = num(C, place, k, wholePx(C, place, k, val), 1, 16);
        else if (k === 'from' || k === 'to') c = s?.kind === 'line' ? pairOf(C, place, k, val, [-2 * P, 2 * P], [-2 * P, 2 * P], { clamp: true }) : num(C, place, k, val, 0, 1);
        else if (k === 'offset') c = num(C, place, k, val, -P, P);
        else if (k === 'r') c = Array.isArray(val) ? pairOf(C, place, k, val, [0, Math.max(32, P)], [0, Math.max(32, P)], { clamp: true }) : num(C, place, k, val, 0, Math.max(32, P));
        else if (k === 'at') c = pairOf(C, place, k, val, [-2 * P, 2 * P], [-2 * P, 2 * P], { clamp: true });
        else if (k === 'size') { if (s?.kind === 'dot') { if (val !== 1 && val !== 2) C.err(`${place}: a dot's size is 1 or 2 pixels; got ${say(val)}`); else c = val; } else c = pairOf(C, place, k, val, [1, P], [1, P], { whole: true }); }
        else if (k === 'points') {
          if (!Array.isArray(val) || val.length < 3 || val.length > L.polyPoints) C.err(`${place}: points must be 3 to ${L.polyPoints} points [u, v]; got ${say(val)}`);
          else { const pts = val.map((p, i) => pairOf(C, place, `point ${i + 1}`, p, [-2 * P, 2 * P], [-2 * P, 2 * P], { clamp: true })); if (pts.every(Boolean)) c = pts; }
        }
        if (c !== undefined) x[k] = c;
      }
      return x;
    });
    each('stamps', (id, v, place) => {
      const variants = C.stamps.get(id);
      if (!variants) { C.err(`${p0}: ${q(id)} is not a stamp of this body`); return null; }
      if (!isObj(v)) { C.err(`${place}: must be an object with at, variant, hidden, mirror; got ${say(v)}`); return null; }
      knownOnly(C, place, v, ['at', 'variant', 'hidden', 'mirror']);
      const x = {};
      if (v.at !== undefined) { const p = pairOf(C, place, 'at', v.at, [-2 * P, 2 * P], [-2 * P, 2 * P], { clamp: true }); if (p) x.at = p; }
      if (v.variant !== undefined) { if (typeof v.variant !== 'string' || !variants.has(v.variant)) C.err(`${place}: ${q(v.variant)} is not a variant of stamp ${q(id)}${variants.size ? ` (${listOf([...variants])})` : ' (it has none)'}`); else x.variant = v.variant; }
      const h = bool(C, place, 'hidden', v.hidden); if (h !== undefined) x.hidden = h;
      if (v.mirror !== undefined) { if (v.mirror !== 'x' && v.mirror !== false) C.err(`${place}: mirror is "x" or false; got ${say(v.mirror)}`); else x.mirror = v.mirror; }
      return x;
    });
    out[dir] = d;
  }
  return out;
}

/** Attach points: [{ id, on (or v1 bone), at, angle? }] or { id, ground: true }, at most 16 (Contract 3 sockets). */
function pointsOf(C, where, raw) {
  const xs = list(C, where, raw, L.points, { what: 'attach points' }) ?? [];
  const out = [];
  for (const [i, p] of xs.entries()) {
    const place = `Point ${typeof p?.id === 'string' ? q(p.id) : i + 1}`;
    if (!isObj(p)) { C.err(`${place}: must be an object with id, on, at, angle (or ground: true)`); continue; }
    knownOnly(C, place, p, ['id', 'on', 'bone', 'at', 'angle', 'ground']);
    const id = idOf(C, place, p.id);
    if (id && C.points.has(id)) { C.err(`${place}: is listed twice; each attach point needs its own id`); continue; }
    const o = { id };
    if (p.ground === true) {
      const extra = ['on', 'bone', 'at', 'angle'].filter((f) => p[f] !== undefined);
      if (extra.length) C.warn(`${place}: a ground point sits on the ground under the body; its ${listOf(extra)} dropped`);
      o.ground = true;
    } else {
      if (p.ground !== undefined && p.ground !== false) C.err(`${place}: ground must be true or false; got ${say(p.ground)}`);
      const on = p.on ?? p.bone;
      if (typeof on !== 'string') C.err(`${place}: on must name the bone or node it sits on; got ${say(on)}`);
      else { onRef(C, place, on, {}); if (p.bone !== undefined && p.on === undefined) o.bone = on; else o.on = on; }
      const P = Math.max(C.W, C.H);
      o.at = pairOf(C, place, 'at', p.at, [-P, P], [-P, P], { need: true, clamp: true });
      const a = num(C, place, 'angle', p.angle, -L.angle, L.angle); if (a !== undefined) o.angle = a;
    }
    if (id) C.points.set(id, o);
    out.push(o);
  }
  return out;
}

/** An emitter list (2.5c): behaviour generators of family fx, each with its own id. */
function emittersOf(C, where, raw) {
  const xs = list(C, where, raw, L.emitters, { what: 'emitters' }) ?? [];
  const out = [];
  xs.forEach((e, i) => {
    const place = `Emitter ${typeof e?.id === 'string' ? q(e.id) : i + 1}`;
    if (!isObj(e)) { C.err(`${place}: must be { id, gen, v, ...arguments }; got ${say(e)}`); return; }
    if (e.id === undefined) { C.err(`${place}: needs an id, which clip keys name to start and stop it`); return; }
    if (typeof e.id === 'string' && C.emitters.has(e.id)) { C.err(`${place}: the id ${q(e.id)} is used twice; each emitter needs its own id`); return; }
    C.cost.written++;
    const g = genCall(C, place, e, { role: 'emitter' });
    if (!g) return;
    if (g.on !== undefined) onRef(C, place, g.on, {});
    if (C.shapeIds.has(g.id)) { C.err(`${place}: the id ${q(g.id)} is used twice; each emitter needs its own id`); return; }
    const { entry } = lookupGenerator(C, g.gen, g.v);
    C.emitters.set(g.id, { entry, key: `${g.gen}@${g.v}`, worst: C.emitterPrice?.worst ?? {}, cost: C.emitterPrice?.cost ?? 0, when: g.when, clip: g.clip });
    C.emitterPrice = undefined;
    C.shapeIds.set(g.id, { kind: 'emitter' });
    out.push(g);
  });
  return out;
}

/**
 * The stamp pixels of the emitters (3.4 rule 2, Contract 15 rule 6; build item B12b), worked out once with no key read:
 * each emitter's bound (engine/gen/index.js STAMP_BOUNDS) at the values it sets (bindings at their largest) and amount
 * 1, in this sprite's frame, since keys may lower its size arguments but never raise them (checkKey) and an amount is
 * held to 0..1 when it draws. An emitter whose generator has no bound is refused, so is one over a frame's cap, and so
 * are emitters that can draw together and are over it in all, the body's own stamps added (B12c): every emitter counts as on in every frame, apart from
 * those its `when` (a control's settings: the values the `when`s list and one more none lists; for a slider whose `when`s
 * hold thresholds, each number they name and the slider's min and max, a point between each two, read with whenValueHolds) or its
 * `clip` keep apart. Conditions it does not read count as holding, so the sum is never less than a frame can hold; the work is at
 * most 4,096 sums of at most 16 emitters (L.emitters), whatever the clips and keys.
 */
function boundEmitters(C) {
  const ems = [];
  for (const [id, e] of C.emitters ?? []) {
    if (!e.entry) continue;
    const bound = stampBoundOf(C, e);
    if (!bound && !boundsKnown(C, e)) continue;   // a test's or a tool's own registry with no table of bounds
    if (!bound) { C.err(`Emitter ${q(id)}: ${e.key} has no stamp bound (engine/gen/index.js STAMP_BOUNDS), so this site cannot tell how many stamp pixels it paints; it cannot be an emitter`); continue; }
    let p;
    try { p = bound(Object.freeze({ ...e.worst }), [C.W, C.H]); } catch { p = NaN; }
    if (!fin(p) || p < 0) { C.err(`Emitter ${q(id)}: the stamp pixels of ${e.key} could not be worked out; it cannot be drawn`); continue; }
    if (p > L.stampPixels) { C.err(`Emitter ${q(id)}: ${e.key} can paint up to ${grand(Math.round(p))} stamp pixels in this ${C.W} x ${C.H} frame at its largest, over the budget of ${grand(L.stampPixels)} stamp pixels a frame may hold: make it smaller`); continue; }
    if (p > 0) ems.push({ id, pixels: p, when: e.when, clip: Array.isArray(e.clip) ? e.clip : null });
  }
  if (!ems.length || C.errors.length) return;
  // the clips the emitters name, and null for any other clip (where only those with no `clip` draw)
  const clipNames = [...new Set(ems.flatMap((e) => e.clip ?? [])), null];
  // the control settings that decide which emitters' whens hold: each key the whens name, its listed values and one more
  const alts = (w) => (Array.isArray(w) ? w : isObj(w) ? [w] : []).filter(isObj);
  const domains = new Map();
  const cuts = new Map();   // a key with a threshold (B15b): every number its whens name, plain or a bound
  for (const e of ems) for (const alt of alts(e.when)) for (const [k, vs] of Object.entries(alt)) {
    if (SCENE_KEYS.has(k) || !Array.isArray(vs)) continue;
    const d = domains.get(k) ?? domains.set(k, new Set()).get(k);
    for (const v of vs) if (isObj(v)) { const c = cuts.get(k) ?? cuts.set(k, new Set()).get(k); for (const b of Object.values(v)) if (fin(b)) c.add(b); } else d.add(v);
  }
  // a slider whose whens hold thresholds is tried at each number they name, between each two and past each end (in its
  // range), so every stretch where the whens hold the same way is tried once and thresholds are read as they are drawn
  for (const [k, c] of cuts) {
    const d = domains.get(k), def = C.table?.get(k);
    const lo = fin(def?.min) ? def.min : -Infinity, hi = fin(def?.max) ? def.max : Infinity;
    // the slider's own ends count as named (review B15b round 3): the stretch past a strict bound is then tried at its
    // end, and a point between each two named numbers; one step past each end only where the slider has no end
    const inRange = [...c, ...[...d].filter(fin)].filter((t) => t >= lo && t <= hi);
    const pts = [...new Set([...inRange, ...[lo, hi].filter(fin)])].sort((a, b) => a - b);
    const tries = new Set(pts);
    pts.forEach((p, i) => { if (i + 1 < pts.length) tries.add((p + pts[i + 1]) / 2); });
    if (pts.length && !fin(hi)) tries.add(pts[pts.length - 1] + 1);
    if (pts.length && !fin(lo)) tries.add(pts[0] - 1);
    for (const t of tries) if (t >= lo && t <= hi) d.add(t);
  }
  const OTHER = Symbol('other');
  let settings = [{}];
  for (const [k, d] of domains) {
    if (settings.length * (d.size + 1) * clipNames.length > 4096) { settings = [null]; break; }
    settings = settings.flatMap((set) => [...d, OTHER].map((v) => ({ ...set, [k]: v })));
  }
  const holds = (w, set) => {
    if (w === undefined || set === null) return true;
    const list = alts(w);
    // each entry read by the one rule (engine/data-rules.js whenValueHolds), so a threshold holds where it is drawn
    return !list.length || list.some((alt) => Object.entries(alt).every(([k, vs]) => !Array.isArray(vs) || !Object.hasOwn(set, k) || vs.some((v) => whenValueHolds(v, set[k]))));
  };
  let worst = 0, where = null;
  for (const set of settings) {
    const on = ems.filter((e) => holds(e.when, set));
    for (const c of clipNames) {
      let sum = 0;
      for (const e of on) if (!e.clip || (c !== null && e.clip.includes(c))) sum += e.pixels;
      if (sum <= worst) continue;
      worst = sum;
      const which = set ? Object.entries(set).filter(([, v]) => v !== OTHER).map(([k, v]) => `${k} ${say(v)}`) : [];
      where = [c === null ? null : `in clip ${q(c)}`, which.length ? `with ${which.join(', ')}` : null].filter(Boolean).join(' ');
    }
  }
  // the stamps the body writes itself (its draw list's, variants included: C.cost.stampPixels) share the frame's cap with
  // the emitters' (build item B12c); over the cap on their own they are refused below, so they are not counted twice
  const own = fin(C.cost?.stampPixels) && C.cost.stampPixels <= L.stampPixels ? C.cost.stampPixels : 0;
  if (worst + own > L.stampPixels) C.err(`The emitters ${own ? 'and the body\'s stamps ' : ''}can paint up to ${grand(Math.round(worst + own))} stamp pixels in one frame (${[where, own ? `${grand(own)} of them the body's own stamps` : null, 'those that can draw together; amounts are not read'].filter(Boolean).join(', ')}); a frame may hold ${grand(L.stampPixels)}: make them smaller, or keep them apart with when or clip`);
}

/** Whether an emitter's generator must have a stamp bound: the site's own generators must, and so must one from a registry that brings a STAMP_BOUNDS table. */
function boundsKnown(C, e) {
  if (isObj(C.reg?.STAMP_BOUNDS)) return true;
  return !!e.entry && e.entry === SITE_GENERATORS.generator(e.entry.id, e.entry.v);
}

/** The keyable arguments of an emitter's generator its price reads (engine/gen/index.js SIZE_KEYS): the registry's own, or the site's for the site's entry; every keyable argument when it has none. */
function sizeKeysOf(C, e) {
  const own = C.reg?.SIZE_KEYS?.[e.key];
  if (Array.isArray(own)) return own;
  const site = SITE_GENERATORS.SIZE_KEYS?.[e.key];
  if (Array.isArray(site) && e.entry && e.entry === SITE_GENERATORS.generator(e.entry.id, e.entry.v)) return site;
  return Array.isArray(e.entry?.keyable) ? e.entry.keyable : [];
}

/** Whether a keyed value v is not above w, the value an emitter sets: numbers (and points, each coordinate) compared; anything else must be equal. */
function notAbove(v, w) {
  if (fin(v) && fin(w)) return v <= w;
  if (Array.isArray(v) && Array.isArray(w) && v.length === w.length) return v.every((x, i) => notAbove(x, w[i]));
  return v === w || JSON.stringify(v) === JSON.stringify(w);
}

/** The stamp-pixel bound of an emitter's generator (engine/gen/index.js STAMP_BOUNDS): the registry's own, or the site's when the registry holds the site's entry; null when none. */
function stampBoundOf(C, e) {
  const own = C.reg?.STAMP_BOUNDS?.[e.key];
  if (typeof own === 'function') return own;
  const site = SITE_GENERATORS.STAMP_BOUNDS?.[e.key];
  return typeof site === 'function' && e.entry === SITE_GENERATORS.generator(e.entry.id, e.entry.v) ? site : null;
}

const PICTURES_FIELDS = ['nodes', 'draw', 'per', 'motion', 'emitters', 'fit', 'pictures'];

/** body.pictures (2.5d): a node tree, a draw list on its nodes, per-clip lists, motion, emitters, an icon fit and icon sets. */
function picturesBody(C, b) {
  const where = 'Body: pictures';
  if (!isObj(b)) { C.err(`${where}: must be an object with ${listOf(PICTURES_FIELDS)}; got ${say(b)}`); return undefined; }
  knownOnly(C, where, b, PICTURES_FIELDS);
  const out = {};
  C.nodes = new Map();
  if (b.nodes !== undefined) out.nodes = nodeTree(C, where, b.nodes);
  if (b.draw !== undefined) out.draw = drawList(C, `${where} draw`, b.draw, 'Draw');
  if (b.emitters !== undefined) out.emitters = emittersOf(C, `${where} emitters`, b.emitters);
  if (b.pictures !== undefined) {
    const names = mapNames(C, `${where} pictures`, b.pictures, L.pictures, 'name: { label, draw, angle }');
    if (names) {
      out.pictures = {};
      for (const n of names) {
        const place = `Picture ${q(n)}`;
        if (!checkClipName(C, place, n)) continue;
        const p = b.pictures[n];
        if (!isObj(p)) { C.err(`${place}: must be { label, draw, angle }; got ${say(p)}`); continue; }
        knownOnly(C, place, p, ['label', 'draw', 'angle']);
        const o = {};
        const lab = text(C, place, 'label', p.label, L.nameChars); if (lab !== undefined) o.label = lab;
        o.draw = drawList(C, `${place} draw`, p.draw ?? [], place);
        if (p.angle !== undefined) { const a = num(C, place, 'angle', p.angle, -L.angle, L.angle); if (a !== undefined) o.angle = a; }
        out.pictures[n] = o;
        C.layoutClips.push(n);
      }
    }
  }
  if (b.per !== undefined) {
    const names = mapNames(C, `${where} per`, b.per, L.clips, 'clip: { draw, show, hide }');
    if (names) {
      out.per = {};
      for (const c of names) {
        const place = `Per clip ${q(c)}`;
        C.clipRefs.push([`${where} per`, c]);
        const p = b.per[c];
        if (!isObj(p)) { C.err(`${place}: must be { draw, show, hide }; got ${say(p)}`); continue; }
        knownOnly(C, place, p, ['draw', 'show', 'hide']);
        const o = {};
        if (p.draw !== undefined) o.draw = drawList(C, `${place} draw`, p.draw, place);
        for (const f of ['show', 'hide']) if (p[f] !== undefined) { const ids = shapeRefs(C, place, f, p[f]); if (ids) o[f] = ids; }
        out.per[c] = o;
      }
    }
  }
  if (b.motion !== undefined) {
    const xs = list(C, `${where} motion`, b.motion, L.motion, { what: 'motions' }) ?? [];
    out.motion = [];
    xs.forEach((m, i) => {
      const place = `Motion ${i + 1}`;
      C.cost.written++;
      const g = genCall(C, place, m, { role: 'motion' });
      if (!g) return;
      if (g.node !== undefined) onRef(C, place, g.node, {});
      out.motion.push(g);
    });
  }
  if (b.fit !== undefined) { C.cost.written++; const g = genCall(C, `${where} fit`, b.fit, { role: 'fit' }); if (g) out.fit = g; }
  return out;
}

/** A node tree for pictures and emitters: [{ id, parent, at, turn?, scale? }], at most 64, parents first. */
function nodeTree(C, where, raw) {
  const xs = list(C, `${where} nodes`, raw, L.nodes, { what: 'nodes' }) ?? [];
  const tree = [], out = [];
  const P = Math.max(C.W, C.H);
  xs.forEach((n, i) => {
    const place = `Node ${typeof n?.id === 'string' ? q(n.id) : i + 1}`;
    if (!isObj(n)) { C.err(`${place}: must be { id, parent, at, turn, scale }; got ${say(n)}`); return; }
    knownOnly(C, place, n, ['id', 'parent', 'at', 'turn', 'scale', 'label']);
    const id = idOf(C, place, n.id);
    if (id && C.nodes.has(id)) { C.err(`${place}: is listed twice; each node needs its own id`); return; }
    let parent = null;
    if (n.parent !== undefined && n.parent !== null) { if (typeof n.parent !== 'string') C.err(`${place}: parent must be the id of another node, or null; got ${say(n.parent)}`); else parent = n.parent; }
    const o = { id, parent, at: pairOf(C, place, 'at', n.at, [-2 * P, 2 * P], [-2 * P, 2 * P], { need: true }) };
    if (n.turn !== undefined) { const t = numOrBind(C, place, 'turn', n.turn, -L.angle, L.angle); if (t) o.turn = t.value; }
    if (n.scale !== undefined) { const s = numOrBind(C, place, 'scale', n.scale, L.scale[0], L.scale[1]); if (s) o.scale = s.value; }
    const lab = text(C, place, 'label', n.label, L.nameChars); if (lab !== undefined) o.label = lab;
    if (id) { C.nodes.set(id, { kind: 'node', parent }); tree.push({ o, place }); }
    out.push(o);
  });
  C.cost.nodes += out.length;
  checkTree(C, tree, new Set(), 'node');
  return out;
}

function drawList(C, where, raw, label, ctx = {}) {
  const xs = list(C, where, raw, L.primitives, { what: 'primitives' }) ?? [];
  const out = [];
  xs.forEach((s, i) => { const o = drawItem(C, `${label} ${i + 1}`, s, ctx); if (o) out.push(o); });
  return out;
}

/** A list of shape ids (show, hide, a part's shapes); checked once every shape is known (C.shapeRefs). */
function shapeRefs(C, place, field, v) {
  const xs = list(C, place, v, L.primitives, { what: field });
  if (!xs) return undefined;
  const out = [];
  for (const x of xs) {
    if (typeof x !== 'string') { C.err(`${place}: ${say(x)} in ${field} is not a shape id`); continue; }
    C.shapeRefs.push([place, field, x]);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

/** body.emitters (2.5c): { emitters: [...], nodes?, draw? }. */
function emittersBody(C, list0, b) {
  const where = 'Body: emitters';
  const out = {};
  C.nodes = new Map();
  if (b.nodes !== undefined) out.nodes = nodeTree(C, where, b.nodes);
  out.emitters = emittersOf(C, where, list0);
  if (b.draw !== undefined) out.draw = drawList(C, `${where} draw`, b.draw, 'Draw');
  if (!out.emitters.length && Array.isArray(list0) && !list0.length) C.err(`${where}: give at least one emitter`);
  return out;
}

/** body.panel (2.5b): a skin piece, a ui piece generator, states (the clips), extra draw. */
function panelBody(C, b) {
  const where = 'Body: panel';
  if (!isObj(b)) { C.err(`${where}: must be { skin, piece, states, draw }; got ${say(b)}`); return undefined; }
  knownOnly(C, where, b, ['skin', 'piece', 'states', 'draw']);
  const out = {};
  if (b.skin !== undefined) {
    if (!isObj(b.skin)) C.err(`${where}: skin must be { "use": "skin:<name>", "v": 1, "paint": {...} }; got ${say(b.skin)}`);
    else { knownOnly(C, `${where} skin`, b.skin, ['use', 'v', 'paint']); const u = pieceUse(C, `${where} skin`, b.skin, { kind: 'skin' }); if (u) out.skin = u; }
  }
  if (b.piece === undefined) C.err(`${where}: piece is missing; name the interface piece it is, like { "gen": "ui.button", "v": 1, ... }`);
  else { C.cost.written++; const g = genCall(C, `${where} piece`, b.piece, { role: 'piece' }); if (g) out.piece = g; }
  const LOOK = ['lift', 'lip', 'desaturate'];
  if (Array.isArray(b.states)) {
    const xs = list(C, `${where} states`, b.states, L.states, { min: 1, what: 'states' }) ?? [];
    out.states = [];
    for (const s of xs) { if (checkClipName(C, `${where} states`, s) && !out.states.includes(s)) out.states.push(s); else if (out.states.includes(s)) C.err(`${where}: the state ${q(s)} is listed twice`); }
  } else if (isObj(b.states)) {
    const names = mapNames(C, `${where} states`, b.states, L.states, 'state: { lift, lip, desaturate }') ?? [];
    out.states = {};
    for (const s of names) {
      if (!checkClipName(C, `${where} states`, s)) continue;
      const v = b.states[s], place = `State ${q(s)}`;
      if (!isObj(v)) { C.err(`${place}: must be an object of ${listOf(LOOK)}; got ${say(v)}`); continue; }
      knownOnly(C, place, v, LOOK);
      const o = {};
      if (v.lift !== undefined) { const x = num(C, place, 'lift', v.lift, -4, 4, { clamp: false, whole: true }); if (x !== undefined) o.lift = x; }
      if (v.lip !== undefined) { const x = num(C, place, 'lip', v.lip, 0, 4, { clamp: false, whole: true }); if (x !== undefined) o.lip = x; }
      if (v.desaturate !== undefined) { const x = num(C, place, 'desaturate', v.desaturate, 0, 1, { clamp: false }); if (x !== undefined) o.desaturate = x; }
      out.states[s] = o;
    }
    if (!names.length) C.err(`${where}: states is empty; give at least "normal"`);
  } else C.err(`${where}: states must be a list of state names (the clips), like ["normal", "hover", "pressed", "disabled"]; got ${say(b.states)}`);
  C.layoutClips.push(...(Array.isArray(out.states) ? out.states : Object.keys(out.states ?? {})));
  C.closedClips = true;
  if (b.draw !== undefined) out.draw = drawList(C, `${where} draw`, b.draw, 'Draw');
  return out;
}

/** body.layers (2.4): named layers (the clips), each with a scroll speed and a draw list of generators and primitives. */
function layersBody(C, raw) {
  const where = 'Body: layers';
  const xs = list(C, where, raw, L.layers, { min: 1, what: 'layers' }) ?? [];
  const out = [];
  const items = new Set();
  xs.forEach((l, i) => {
    const place = `Layer ${typeof l?.name === 'string' ? q(l.name) : i + 1}`;
    if (!isObj(l)) { C.err(`${place}: must be { name, scroll, wraps, draw }; got ${say(l)}`); return; }
    knownOnly(C, place, l, ['name', 'scroll', 'wraps', 'draw', 'label']);
    if (!checkClipName(C, place, l.name)) return;
    if (C.layoutClips.includes(l.name)) { C.err(`${place}: the layer ${q(l.name)} is listed twice; each layer needs its own name`); return; }
    const o = { name: l.name };
    const lab = text(C, place, 'label', l.label, L.nameChars); if (lab !== undefined) o.label = lab;
    o.scroll = num(C, place, 'scroll', l.scroll ?? 1, 0, 2) ?? 1;
    o.wraps = bool(C, place, 'wraps', l.wraps) ?? true;
    o.draw = [];
    const ds = list(C, `${place} draw`, l.draw, L.primitives, { what: 'items', min: 1 }) ?? [];
    ds.forEach((s, k) => {
      const d = drawItem(C, `${place}, item ${k + 1}`, s, { items });
      if (!d) return;
      if (d.id) items.add(d.id);
      o.draw.push(d);
    });
    C.layoutClips.push(l.name);
    out.push(o);
  });
  C.closedClips = true;
  return out;
}

const TILES_FIELDS = ['tile', 'profiles', 'groups', 'material', 'extra', 'decalOrder'];   // decalOrder: migration batch M5
const GROUP_FIELDS = ['name', 'kind', 'use', 'pieces', 'fills', 'material', 'decals', 'label', 'frames', 'fps', 'thickness', 'under', 'pictures', 'outline'];   // label ... outline: build item B15

/** body.tiles (2.3): a tile size, named profiles, groups with piece sets and a material as data (or a material piece), decals, extra tiles. */
function tilesBody(C, b) {
  const where = 'Body: tiles';
  if (!isObj(b)) { C.err(`${where}: must be { tile, profiles, groups, material, extra }; got ${say(b)}`); return undefined; }
  knownOnly(C, where, b, TILES_FIELDS);
  const out = {};
  if (b.tile !== 16 && b.tile !== 32) C.err(`${where}: tile must be 16 or 32 (pixels a side); got ${say(b.tile)}`);
  else out.tile = b.tile;
  if (b.decalOrder !== undefined) {   // migration batch M5: where the decals go in the clip list (engine/gen/tiles-clips.js)
    if (!TILE_DECAL_ORDERS.includes(b.decalOrder)) C.err(`${where}: decalOrder must be ${listOf(TILE_DECAL_ORDERS)} ("group": each group's decals after its pieces; "last": after the extra tiles); got ${say(b.decalOrder)}`);
    else out.decalOrder = b.decalOrder;
  }
  if (b.tile === 16) C.err(`${where}: 16 px tiles are not drawn yet: engine/tiles.js draws 32 px tiles (make the tileset 32 px)`);   // build item B15: the layout's own reason
  const T = out.tile ?? 32;
  C.profiles = new Map();
  if (b.profiles !== undefined) {
    const names = mapNames(C, `${where} profiles`, b.profiles, L.profiles, 'name: [numbers]');
    if (names) {
      out.profiles = {};
      for (const n of names) {
        if (!idOf(C, `${where} profiles`, n, { what: 'profile name' })) continue;
        const v = b.profiles[n];
        if (!Array.isArray(v) || !v.length || v.length > L.profileLength || v.some((x) => !fin(x) || Math.abs(x) > 64)) { C.err(`${where}: the profile ${q(n)} must be a list of 1 to ${L.profileLength} numbers from -64 to 64; got ${Array.isArray(v) ? `${v.length} entries` : say(v)}`); continue; }
        out.profiles[n] = [...v];
        C.profiles.set(n, v.length);
      }
    }
  }
  if (b.material !== undefined) out.material = materialOf(C, `${where} material`, b.material, T);
  const gs = list(C, `${where} groups`, b.groups, L.tileGroups, { min: 1, what: 'groups', need: true }) ?? [];
  out.groups = [];
  const names = new Set();
  gs.forEach((g, i) => {
    const place = `Group ${typeof g?.name === 'string' ? q(g.name) : i + 1}`;
    if (!isObj(g)) { C.err(`${place}: must be { name, kind, pieces, fills, material, decals }; got ${say(g)}`); return; }
    knownOnly(C, place, g, GROUP_FIELDS);
    const o = {};
    const name = idOf(C, place, g.name, { pattern: SPRITE_ID_PATTERN, what: 'group name' });
    if (name && names.has(name)) { C.err(`${place}: the group ${q(name)} is listed twice`); return; }
    if (name) { o.name = name; names.add(name); }
    if (!TILE_GROUP_KINDS.includes(g.kind)) C.err(`${place}: kind must be one of ${listOf(TILE_GROUP_KINDS)}; got ${say(g.kind)}`); else o.kind = g.kind;
    if (g.use !== undefined) { const u = idOf(C, place, g.use, { pattern: SPRITE_ID_PATTERN, what: 'use' }); if (u) o.use = u; }
    if (g.pieces !== undefined) {
      const xs = list(C, place, g.pieces, TILE_PIECES.length, { min: 1, what: 'piece sets' });
      if (xs) { const bad = xs.filter((p) => !TILE_PIECES.includes(p)); if (bad.length) C.err(`${place}: ${bad.map(q).join(', ')} ${bad.length === 1 ? 'is not a piece set' : 'are not piece sets'}; use ${listOf(TILE_PIECES)}`); else o.pieces = [...new Set(xs)]; }
    }
    const f = num(C, place, 'fills', g.fills ?? 1, 1, L.fillVersions, { clamp: false, whole: true }); if (f !== undefined) o.fills = f;
    if (g.material !== undefined) o.material = materialOf(C, `${place} material`, g.material, T);
    else if (b.material === undefined && !isObj(g.pictures)) C.err(`${place}: has no material; give the group a material, or the tileset one for every group (a group drawn by hand gives pictures instead)`);
    if (g.decals !== undefined) {
      const ds = list(C, place, g.decals, L.decals, { what: 'decals' }) ?? [];
      o.decals = [];
      const dn = new Set();
      ds.forEach((d, k) => {
        const dp = `${place}, decal ${typeof d?.name === 'string' ? q(d.name) : k + 1}`;
        if (!isObj(d)) { C.err(`${dp}: must be { name, place, label, draw, outline }; got ${say(d)}`); return; }
        knownOnly(C, dp, d, ['name', 'place', 'label', 'draw', 'outline', 'frames']);
        const x = {};
        const dname = idOf(C, dp, d.name, { pattern: /^[a-z0-9]{1,8}$/, what: 'decal name (letters or digits: its clip is <group>-deco-<name>)' });
        const fr = num(C, dp, 'frames', d.frames, 1, 64, { clamp: false, whole: true }); if (fr !== undefined) x.frames = fr;
        if (dname && dn.has(dname)) { C.err(`${dp}: is listed twice`); return; }
        if (dname) { x.name = dname; dn.add(dname); }
        if (d.place !== undefined && !DECAL_PLACES.includes(d.place)) C.err(`${dp}: place must be one of ${listOf(DECAL_PLACES)}; got ${say(d.place)}`); else x.place = d.place ?? 'on';
        const lab = text(C, dp, 'label', d.label, L.nameChars); if (lab !== undefined) x.label = lab;
        x.draw = drawList(C, `${dp} draw`, d.draw ?? [], dp);
        const ol = bool(C, dp, 'outline', d.outline); if (ol !== undefined) x.outline = ol;
        o.decals.push(x);
      });
    }
    tileGroupMore(C, place, g, o, T);
    out.groups.push(o);
  });
  C.tileGroups = names;
  if (b.extra !== undefined) {
    const xs = list(C, `${where} extra`, b.extra, L.extraTiles, { what: 'extra tiles' }) ?? [];
    out.extra = [];
    xs.forEach((e, k) => {
      const place = `Extra tile ${typeof e?.name === 'string' ? q(e.name) : k + 1}`;
      if (!isObj(e)) { C.err(`${place}: must be { name, label, draw }; got ${say(e)}`); return; }
      knownOnly(C, place, e, ['name', 'label', 'draw']);
      if (!checkClipName(C, place, e.name)) return;
      const x = { name: e.name };
      const lab = text(C, place, 'label', e.label, L.nameChars); if (lab !== undefined) x.label = lab;
      x.draw = drawList(C, `${place} draw`, e.draw ?? [], place);
      C.tileExtras.add(e.name);
      out.extra.push(x);
    });
  }
  for (const g of out.groups) tileFillCount(C, `Group ${q(g.name ?? '?')}`, g, out.material);   // build item B15 review: N fills, N versions
  C.layoutClips = tileClipNames(out);   // build item B15: tile.clips names the clips (engine/gen/tiles-clips.js), as engine/resolve.js does
  C.closedClips = true;
  return out;
}

/** A tile material: { use: "material:<name>", v, paint } (a shared piece) or data: { fill, edges } (2.3). */
function materialOf(C, place, m, T) {
  if (!isObj(m)) { C.err(`${place}: must be a material { fill, edges } or a material piece { "use": "material:<name>", "v": 1 }; got ${say(m)}`); return undefined; }
  if (Object.hasOwn(m, 'use')) { knownOnly(C, place, m, ['use', 'v', 'paint', 'args']); return pieceUse(C, place, m, { kind: 'material' }); }
  knownOnly(C, place, m, ['fill', 'edges', 'ink', 'round', 'soft', 'behind', 'face', 'liquid', 'outside']);
  const out = {};
  tileMaterialMore(C, place, m, out, T);
  if (m.fill !== undefined) {
    const f = m.fill, fp = `${place} fill`;
    if (!isObj(f)) C.err(`${fp}: must be { base, versions }; got ${say(f)}`);
    else {
      knownOnly(C, fp, f, ['base', 'versions']);
      out.fill = {};
      if (f.base !== undefined) { const p = paintRef(C, `${fp}, base`, f.base); if (p !== undefined) out.fill.base = p; }
      else C.err(`${fp}: base is missing; name the colour the middle is painted`);
      if (f.versions !== undefined) {
        const vs = list(C, fp, f.versions, L.fillVersions, { what: 'fill versions' }) ?? [];
        out.fill.versions = vs.map((v, i) => drawList(C, `${fp}, version ${i + 1}`, v, `${fp}, version ${i + 1}:`));
      }
    }
  }
  if (m.edges !== undefined) {
    const names = mapNames(C, `${place} edges`, m.edges, 4, 'edge: { depth, wrap, tuck, inset, ragged, bands }');
    if (names) {
      out.edges = {};
      for (const side of names) {
        const ep = `${place}, ${side} edge`;
        if (!TILE_EDGES.includes(side)) { C.err(`${place}: ${q(side)} is not an edge; use ${listOf(TILE_EDGES)}`); continue; }
        const e = m.edges[side];
        if (!isObj(e)) { C.err(`${ep}: must be { depth, wrap, tuck, inset, ragged, bands }; got ${say(e)}`); continue; }
        knownOnly(C, ep, e, ['depth', 'wrap', 'tuck', 'inset', 'ragged', 'bands']);
        const o = {};
        if (e.depth !== undefined) { const d = numOrBind(C, ep, 'depth', e.depth, 0, T); if (d) o.depth = d.value; }
        if (e.wrap !== undefined) { const w = numOrBind(C, ep, 'wrap', e.wrap, 0, T); if (w) o.wrap = w.value; }
        if (fin(e.tuck)) { const tk = num(C, ep, 'tuck', e.tuck, 0, T, { clamp: false, whole: true }); if (tk !== undefined) o.tuck = tk; } else { const tk = bool(C, ep, 'tuck', e.tuck); if (tk !== undefined) o.tuck = tk; }
        for (const f of ['inset', 'ragged']) {
          if (e[f] === undefined) continue;
          const x = e[f];
          if (!isObj(x)) { C.err(`${ep}: ${f} must be { profile, amount }; got ${say(x)}`); continue; }
          knownOnly(C, `${ep}, ${f}`, x, ['profile', 'amount']);
          const pr = profileOrPick(C, `${ep}, ${f}`, 'profile', x.profile);
          const am = numOrBind(C, `${ep}, ${f}`, 'amount', x.amount ?? 1, 0, T);
          if (pr !== undefined && am) o[f] = { profile: pr, amount: am.value };
        }
        if (e.bands !== undefined) {
          const bs = list(C, ep, e.bands, L.bandRules, { what: 'band rules' }) ?? [];
          o.bands = [];
          bs.forEach((r, i) => {
            const rp = `${ep}, band rule ${i + 1}`;
            if (!isObj(r)) { C.err(`${rp}: must be { rows, where, paint }; got ${say(r)}`); return; }
            knownOnly(C, rp, r, ['rows', 'where', 'paint', 'when']);   // when: build item B15 review 2
            const x = {};
            if (r.rows === 'last' || r.rows === 'last-1') x.rows = r.rows;
            else if (isObj(r.rows) && Object.hasOwn(r.rows, 'profile')) {   // { profile }: rows 1 to the profile's value at each column (a run hanging from the edge)
              knownOnly(C, `${rp}, rows`, r.rows, ['profile']);
              const pr = profileRef(C, `${rp}, rows`, 'profile', r.rows.profile);
              if (pr === undefined) return;
              x.rows = { profile: pr };
            }
            else if (Array.isArray(r.rows) && r.rows.length === 2 && r.rows.every((n) => Number.isInteger(n) && n >= 1 && n <= 99) && r.rows[0] <= r.rows[1]) x.rows = [...r.rows];
            else { C.err(`${rp}: rows must be [from, to] (whole numbers 1 to 99 counted from the edge, from no more than to), "last", "last-1" or { profile } (rows 1 to the profile's value at each column); got ${say(r.rows)}`); return; }
            if (r.where !== undefined) {
              const w = r.where;
              if (!isObj(w)) C.err(`${rp}: where must be { profile, in: [values] }; got ${say(w)}`);
              else {
                knownOnly(C, `${rp}, where`, w, ['profile', 'in']);
                const pr = typeof w.profile === 'string' ? profileRef(C, `${rp}, where`, 'profile', w.profile) : (C.err(`${rp}: where names a profile of the tileset; got ${say(w.profile)}`), undefined);
                const ins = list(C, `${rp}, where`, w.in, 16, { min: 1, what: 'values' });
                if (ins && ins.some((n) => !fin(n))) C.err(`${rp}: where.in lists numbers; got ${say(w.in)}`);
                else if (pr !== undefined && ins) x.where = { profile: pr, in: [...ins] };
              }
            }
            const p = paintRef(C, `${rp}, paint`, r.paint);
            if (p !== undefined) x.paint = p;
            if (r.when !== undefined) { const w = checkWhen(C, rp, r.when); if (w === undefined) return; x.when = w; }
            o.bands.push(x);
          });
        }
        out.edges[side] = o;
      }
    }
  }
  return out;
}

// ---- build item B15: what a tile group and a tile material may say besides the fields above ------------------------
// (engine/gen/tiles.js reads them; docs/data-sprites.md 2.3 lists the first fields, these follow the code tilesets)

/** A group's label (the word before each piece), frames and fps (an animated tileset), a thin platform's thickness and underside, pictures drawn by hand for its pieces, and whether those are outlined. */
function tileGroupMore(C, place, g, o, T) {
  const lab = text(C, place, 'label', g.label, L.nameChars); if (lab !== undefined) o.label = lab;
  const fr = num(C, place, 'frames', g.frames, 1, 64, { clamp: false, whole: true }); if (fr !== undefined) o.frames = fr;
  const fps = num(C, place, 'fps', g.fps, 1, 60, { clamp: false }); if (fps !== undefined) o.fps = fps;
  const th = num(C, place, 'thickness', g.thickness, 4, T, { clamp: false, whole: true }); if (th !== undefined) o.thickness = th;
  if (g.under !== undefined) { const u = materialOf(C, `${place} under`, { edges: { bottom: g.under } }, T)?.edges?.bottom; if (u) o.under = u; }
  if (g.pictures !== undefined) {
    const names = mapNames(C, `${place} pictures`, g.pictures, 32, 'piece: [primitives]');
    if (names) {
      o.pictures = {};
      for (const n of names) {
        if (!/^[a-z][a-z0-9-]{0,15}$/.test(n)) { C.err(`${place} pictures: ${q(n)} is not a piece name (cap, mid, foot, thin-l, top ...)`); continue; }
        o.pictures[n] = drawList(C, `${place} picture ${q(n)}`, g.pictures[n], `${place} picture ${q(n)}:`);
      }
    }
  }
  const ol = bool(C, place, 'outline', g.outline); if (ol !== undefined) o.outline = ol;
}

/** A material's ink ("none" for no line), corner round, soft ground, fill versions behind edge pieces, a top-down wall's face and a liquid's surface. */
function tileMaterialMore(C, place, m, out, T) {
  if (m.ink !== undefined) { if (m.ink === 'none') out.ink = 'none'; else { const p = paintRef(C, `${place}, ink`, m.ink); if (p !== undefined) out.ink = p; } }
  if (m.round !== undefined) { const r = numOrBind(C, place, 'round', m.round, 0, 14); if (r) out.round = r.value; }
  for (const f of ['soft', 'behind']) { const b = bool(C, place, f, m[f]); if (b !== undefined) out[f] = b; }
  if (m.face !== undefined) {
    const fp = `${place} face`;
    if (!isObj(m.face)) C.err(`${fp}: must be { draw, top, base, shadow }; got ${say(m.face)}`);
    else {
      knownOnly(C, fp, m.face, ['draw', 'top', 'base', 'shadow']);
      out.face = { draw: drawList(C, `${fp} draw`, m.face.draw ?? [], `${fp}:`) };
      for (const f of ['top', 'base', 'shadow']) {
        if (m.face[f] === undefined) continue;
        if (f === 'shadow' && m.face[f] === 'none') { out.face[f] = 'none'; continue; }
        const p = paintRef(C, `${fp}, ${f}`, m.face[f]); if (p !== undefined) out.face[f] = p;
      }
    }
  }
  if (m.liquid !== undefined) {
    const lp = `${place} liquid`;
    if (!isObj(m.liquid)) C.err(`${lp}: must be { level, rise, surface }; got ${say(m.liquid)}`);
    else {
      knownOnly(C, lp, m.liquid, ['level', 'rise', 'surface']);
      out.liquid = {};
      const lv = numOrBind(C, lp, 'level', m.liquid.level ?? 6, 0, T - 1); if (lv) out.liquid.level = lv.value;
      if (m.liquid.rise !== undefined) {
        const r = m.liquid.rise;
        if (!isObj(r)) C.err(`${lp}: rise must be { profile, amount, travel }; got ${say(r)}`);
        else {
          knownOnly(C, `${lp}, rise`, r, ['profile', 'amount', 'travel']);
          const pr = profileRef(C, `${lp}, rise`, 'profile', r.profile);
          const am = numOrBind(C, `${lp}, rise`, 'amount', r.amount ?? 1, 0, T);
          const tr = num(C, `${lp}, rise`, 'travel', r.travel ?? 0, -4, 4, { clamp: false, whole: true });
          if (pr !== undefined && am && tr !== undefined) out.liquid.rise = { profile: pr, amount: am.value, travel: tr };
        }
      }
      if (m.liquid.surface !== undefined) { const s = materialOf(C, `${lp} surface`, { edges: { top: { bands: m.liquid.surface } } }, T)?.edges?.top?.bands; if (s) out.liquid.surface = s; }
    }
  }
  if (m.outside !== undefined) tileOutside(C, place, m.outside, out, T);
}

/** A material's `outside`: rules for the pixels beyond its outline ({ x, y, out, paint, when }: tile columns and rows [from, to], px beyond the line on soft ground [from, to]; first match wins, no match leaves them see-through). */
function tileOutside(C, place, raw, out, T) {
  const rs = list(C, `${place} outside`, raw, L.bandRules, { what: 'outside rules' }) ?? [];
  out.outside = [];
  rs.forEach((r, i) => {
    const rp = `${place}, outside rule ${i + 1}`;
    if (!isObj(r)) { C.err(`${rp}: must be { x, y, out, paint, when }; got ${say(r)}`); return; }
    knownOnly(C, rp, r, ['x', 'y', 'out', 'paint', 'when']);
    const x = {};
    for (const [f, lo, hi] of [['x', 0, T - 1], ['y', 0, T - 1], ['out', 1, T]]) {
      const v = r[f];
      if (v === undefined) continue;
      if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isInteger) || v[0] < lo || v[1] > hi || v[0] > v[1]) { C.err(`${rp}: ${f} must be [from, to], whole numbers from ${lo} to ${hi} (from no more than to); got ${say(v)}`); return; }
      x[f] = [...v];
    }
    if (r.when !== undefined) { const w = checkWhen(C, rp, r.when); if (w === undefined) return; x.when = w; }
    const p = paintRef(C, `${rp}, paint`, r.paint);
    if (p === undefined) return;
    x.paint = p;
    out.outside.push(x);
  });
}

/** Fills against fill versions: a group asking for N fills draws N different middles, so its material (its own, or the tileset's, written in place) gives N versions; more is a warning. A material piece is held to it where it is drawn (engine/gen/tiles.js). */
function tileFillCount(C, place, g, shared) {
  if (!groupDrawsMiddles(g)) {   // build item B15 review 2: platform, slope, stack and a block of thin or slope pieces only draw no middles
    if ((g.fills ?? 1) > 1) C.err(`${place}: fills ${g.fills} asks for ${g.fills} different middles, but a ${g.kind ?? '?'} group${g.kind === 'block' ? ` of ${listOf(g.pieces ?? [])} pieces` : ''} draws no middle tiles; leave fills out (it is for blocks of block, narrow or lanes pieces, floors and liquids)`);
    return;
  }
  const m = g.material ?? shared;
  if (!isObj(m)) return;
  if (Object.hasOwn(m, 'use')) {
    // a material piece: its summary says how many fill versions it has (engine/pieces.js pieceSummary; build item B15b)
    const r = typeof m.use === 'string' && Number.isInteger(m.v) ? parsePieceUse(m.use) : null;
    const e = r ? lookupPiece(C, r, m.v).entry : null;
    const n = g.fills ?? 1, v = e && Number.isInteger(e.fills) ? e.fills : null;
    if (v !== null && n > 1 && v < n) C.err(`${place}: fills ${n} asks for ${n} different middles, but its material ${m.use} has ${v ? `${v} fill version${v === 1 ? '' : 's'}` : 'no fill versions'}; ask for ${Math.max(1, v)} at most, or use a material with ${n}`);
    return;
  }
  const n = g.fills ?? 1, v = Array.isArray(m.fill?.versions) ? m.fill.versions.length : 0;
  const has = v ? `${v} fill version${v === 1 ? '' : 's'}` : 'no fill versions';
  if (n > 1 && v < n) C.err(`${place}: fills ${n} asks for ${n} different middles, but its material has ${has}; give fill.versions ${n} draw lists (the first may be [])`);
  else if (v > n && g.material) C.warn(`${place}: its material has ${has}; fills ${n} draws only the first ${n === 1 ? 'one' : n}`);
}

const MATERIAL_CHECKS = new WeakMap();   // a loaded piece (frozen, shared) -> its check

// A piece's args as the controls its body's bindings and `when`s may name, read as engine/resolve.js argTable reads
// them (a number type a range over lo..hi, its type's own range else 0..1; a word a choice of its options; a flag on/off).
const ARG_NUMBER_TYPES = new Set(['px', 'share', 'count', 'angle', 'seed']);
const ARG_TYPE_RANGE = { share: [0, 1], angle: [-720, 720], seed: [0, 9999] };
function pieceArgTable(C, args) {
  if (!isObj(args)) return;
  for (const [name, t] of Object.entries(args).slice(0, 16)) {
    if (!isObj(t) || !ID_PATTERN.test(name) || RESERVED.has(name)) continue;
    if (ARG_NUMBER_TYPES.has(t.type)) { const [lo, hi] = ARG_TYPE_RANGE[t.type] ?? [0, 1]; C.table.set(name, { kind: 'range', min: fin(t.lo) ? t.lo : lo, max: fin(t.hi) ? t.hi : hi, scales: false }); }
    else if (t.type === 'word') { const values = (Array.isArray(t.options) ? t.options : Array.isArray(t.values) ? t.values : []).filter((x) => typeof x === 'string'); C.table.set(name, { kind: 'choice', values }); }
    else if (t.type === 'flag') C.table.set(name, { kind: 'toggle' });
  }
}

/**
 * The body check of a material piece (pieces/material-<name>.v<v>.json; docs/data-sprites.md 3.3): the rules a tileset's
 * own material is held to (catalog/sprite-schema.js materialOf), with its paints naming the piece's own slots (a face's
 * top with a tone, as only those are renamed by a use) and its profile names its own `profiles` (body.profiles), so a
 * shared material draws the same in every tileset. Pieces of other kinds pass. It is the `check` hook engine/pieces.js
 * validatePiece takes; engine/resolve.js runs it wherever a tileset uses one. Returns { errors, warnings }.
 */
export function checkMaterialPiece(piece, opts = {}) {
  if (!isObj(piece) || typeof piece.id !== 'string' || !piece.id.startsWith('material:')) return { errors: [], warnings: [] };
  if (MATERIAL_CHECKS.has(piece)) return MATERIAL_CHECKS.get(piece);
  const C = context(opts);
  C.cost = { written: 0, expanded: 0, budget: L.expanded, stampPixels: 0, generators: 0, nodes: 0, pieces: 0, frames: 0 };
  const where = `The material ${piece.id}`;
  try {
    setup(C);
    C.version = 2; C.W = 32; C.H = 32;
    for (const s of Array.isArray(piece.slots) ? piece.slots : []) if (isObj(s) && typeof s.id === 'string') C.slots.set(s.id, { material: s.material, detail: false, derived: false, control: false });
    pieceArgTable(C, piece.args);   // build item B15 review 2: inside a piece's body a binding or a `when` names the piece's args
    const b = isObj(piece.body) ? piece.body : {};
    const { profiles, ...m } = isObj(b.material) ? { ...b.material, profiles: b.profiles } : b;
    C.profiles = new Map();
    if (profiles !== undefined) {
      const names = mapNames(C, `${where} profiles`, profiles, L.profiles, 'name: [numbers]') ?? [];
      for (const n of names) {
        if (!idOf(C, `${where} profiles`, n, { what: 'profile name' })) continue;
        const v = profiles[n];
        if (!Array.isArray(v) || !v.length || v.length > L.profileLength || v.some((x) => !fin(x) || Math.abs(x) > 64)) { C.err(`${where}: the profile ${q(n)} must be a list of 1 to ${L.profileLength} numbers from -64 to 64; got ${Array.isArray(v) ? `${v.length} entries` : say(v)}`); continue; }
        C.profiles.set(n, v.length);
      }
    }
    if (Object.hasOwn(m, 'use')) C.err(`${where}: a material piece is a material itself { fill, edges, ... }; it cannot use another piece`);
    else materialOf(C, where, m, 32);
    const top = isObj(m.face) ? m.face.top : undefined;
    if (typeof top === 'string' && C.slots.has(top)) C.err(`${where} face: top names ${q(top)} without a tone; in a material piece write it with one ("${top}.base", "${top}.light") so a use can colour it`);
  } catch (e) {
    C.err(`${where}: could not be checked: ${String(e?.message ?? e).slice(0, 120)}`);
  }
  const res = finish(C);
  MATERIAL_CHECKS.set(piece, res);
  return res;
}

// ---- the sprite: palette, controls, parts, clips ------------------------------------------------------------------

const SPRITE_FIELDS = ['format', 'version', 'id', 'name', 'blurb', 'meta', 'size', 'pivot', 'grounded', 'preview', 'styles', 'stylesWhy', 'palette', 'colours', 'controls', 'parts', 'versions', 'body', 'clips', 'points', 'slice', 'textArea', 'materials', 'made', 'rev', 'was'];
const SLOT_FIELDS = ['id', 'label', 'default', 'material', 'swatches', 'detail', 'derive'];

/** The palette: slots { id, label, default, material, swatches?, detail?, derive? }, at most 12 (2.1). Registers each in C.slots. */
function paletteOf(C, raw, where) {
  const xs = list(C, where, raw, L.palette, { min: 1, what: 'colour slots' }) ?? [];
  const out = [];
  const pending = [];
  xs.forEach((c, i) => {
    const place = `Colour ${typeof c?.id === 'string' ? q(c.id) : i + 1}`;
    if (!isObj(c)) { C.err(`${place}: must be an object with ${listOf(SLOT_FIELDS)}`); return; }
    knownOnly(C, place, c, SLOT_FIELDS);
    const id = idOf(C, place, c.id);
    if (id && C.slots.has(id)) { C.err(`${place}: is listed twice; each colour needs its own id`); return; }
    const o = { id };
    const derived = c.derive !== undefined;
    const det = bool(C, place, 'detail', c.detail);
    if (det !== undefined) o.detail = det;
    if (derived) {
      for (const f of ['label', 'default', 'swatches']) if (c[f] !== undefined) C.warn(`${place}: is worked out from other colours (derive), so it has no control; its ${f} was dropped`);
    } else {
      const lab = text(C, place, 'label', c.label, L.nameChars, { need: !det && C.version === 2 && !C.rigAlias });
      if (lab !== undefined) o.label = lab;
      o.default = hex(C, place, 'default', c.default, { need: true });
    }
    if (c.material !== undefined) { if (!MATERIAL_IDS.includes(c.material)) C.err(`${place}: material ${q(c.material)} is not a material; use one of ${listOf(MATERIAL_IDS)}`); else o.material = c.material; }
    else if (!derived && !det && !C.rigAlias) C.err(`${place}: material is missing; say what it is made of (one of ${listOf(MATERIAL_IDS)}), so a look keeps it what it is (Contract 7)`);
    if (c.swatches !== undefined && !derived) {
      const sw = list(C, place, c.swatches, L.swatches, { min: 1, what: 'swatches' });
      if (sw) {
        const each = sw.map((x, k) => {
          if (typeof x === 'string') return hex(C, place, `swatch ${k + 1}`, x, { need: true });
          if (isObj(x)) {
            knownOnly(C, `${place}, swatch ${k + 1}`, x, ['palette', 'family', 'lead']);
            try { paletteSwatches(x.palette, x.family, x.lead === undefined ? {} : { lead: x.lead }); } catch (e) { C.err(`${place}: swatch ${k + 1}: ${String(e?.message ?? e).replace(/^palettes: /, '').slice(0, 160)}`); return undefined; }
            return { palette: x.palette, family: x.family, ...(x.lead !== undefined ? { lead: x.lead } : {}) };
          }
          C.err(`${place}: swatch ${k + 1} must be "#rrggbb" or { palette, family, lead }; got ${say(x)}`);
          return undefined;
        });
        if (each.every((x) => x !== undefined)) o.swatches = each;
      }
    }
    if (id) C.slots.set(id, { material: o.material, detail: !!o.detail, derived, control: !derived && !o.detail });
    if (derived) pending.push({ o, place, rule: c.derive });
    out.push(o);
  });
  C.pendingDerive = pending;
  return out;
}

/** Derived slots (checked once the controls are known, since a rule may read them): a colour rule over the other slots, no loops; a derived slot takes its source's material unless it says one. */
function derivesOf(C) {
  const pending = C.pendingDerive ?? [];
  const deps = new Map();
  for (const { o, place, rule } of pending) {
    const before = new Set(C.painted);
    C.painted = new Set();
    C.inDerive = true;   // B15b: DERIVE_PAINTS may be named here
    const x = isObj(rule) ? colourRule(C, `${place}: derive`, rule, 0) : (C.err(`${place}: derive must be a colour rule { "rule": "tone", "of": ..., ... }; got ${say(rule)}`), undefined);
    C.inDerive = false;
    deps.set(o.id, [...C.painted]);
    for (const s of C.painted) before.add(s);
    C.painted = before;
    if (x !== undefined) o.derive = x;
    if (o.material === undefined) { const src = deps.get(o.id).map((s) => C.slots.get(s)?.material).find(Boolean); if (src) C.slots.get(o.id).material = src; }
  }
  const done = new Set();
  const walk = (k, trail) => {
    if (trail.includes(k)) { C.err(`Colours: derive makes a loop: ${[...trail.slice(trail.indexOf(k)), k].map(q).join(' comes from ')}`); return false; }
    if (done.has(k)) return true;
    for (const d of deps.get(k) ?? []) if (deps.has(d) && !walk(d, [...trail, k])) return false;
    done.add(k);
    return true;
  };
  for (const k of deps.keys()) if (!walk(k, [])) break;
}

const SLIDER_FIELDS = ['key', 'kind', 'label', 'lo', 'hi', 'min', 'max', 'step', 'default', 'scales', 'group', 'when', 'look'];
const CHOICE_FIELDS = ['key', 'kind', 'label', 'options', 'default', 'was', 'group', 'when', 'look'];
const TOGGLE_FIELDS = ['key', 'kind', 'label', 'default', 'group', 'when', 'look'];
const COLOUR_CONTROL_FIELDS = ['key', 'kind', 'label', 'swatches', 'material', 'group', 'when'];

/** The controls (2.5): range (v1 "slider"), choice, toggle, colour and the standard speed, at most 48 in all. Fills C.table; when is checked later. */
function controlsOf(C, raw) {
  const xs = list(C, 'Controls', raw, L.controls, { what: 'controls' }) ?? [];
  const out = [];
  let speed = false;
  const styled = new Set();
  xs.forEach((c, i) => {
    const place = `Control ${typeof c?.key === 'string' ? q(c.key) : i + 1}`;
    if (!isObj(c)) { C.err(`${place}: must be an object with key, kind, label, ...`); return; }
    if (c.standard !== undefined) {
      knownOnly(C, place, c, ['key', 'standard', 'label']);
      if (c.standard !== 'speed') { C.err(`${place}: standard ${q(c.standard)} is not known; the only standard control is "speed"`); return; }
      if (c.key !== 'speed') { C.err(`${place}: the standard speed control has the key "speed"`); return; }
      if (speed) { C.err(`${place}: there is already a speed control`); return; }
      speed = true;
      const o = { key: 'speed', standard: 'speed' };
      const lab = text(C, place, 'label', c.label, L.nameChars); if (lab !== undefined) o.label = lab;
      out.push(o);
      return;
    }
    if (c.sets !== undefined) { C.err(`${place}: sets is for library bodies (the figure of a code rig), which version 2 does not have: bind the control to what it changes ({ "from": ${q(c.key)}, "map": ... }) instead`); return; }
    const kind = c.kind ?? 'range';
    if (!CONTROL_KINDS.includes(kind)) { C.err(`${place}: kind ${q(c.kind)} is not known; use ${listOf(CONTROL_KINDS.filter((k) => k !== 'slider'))}`); return; }
    if (kind === 'colour') {
      knownOnly(C, place, c, COLOUR_CONTROL_FIELDS);
      const slot = typeof c.key === 'string' ? C.slots.get(c.key) : undefined;
      if (!slot || !slot.control) { C.err(`${place}: a colour control names one of the sprite's colours that has a control (${someOf([...C.slots].filter(([, s]) => s.control).map(([k]) => k))}); got ${say(c.key)}`); return; }
      if (styled.has(c.key)) { C.err(`${place}: the colour ${q(c.key)} has a colour control twice; one is enough`); return; }
      styled.add(c.key);
      const o = { key: c.key, kind: 'colour' };
      const lab = text(C, place, 'label', c.label, L.nameChars); if (lab !== undefined) o.label = lab;
      if (c.swatches !== undefined) { const sw = list(C, place, c.swatches, L.swatches, { min: 1, what: 'swatches' }); if (sw) { const each = sw.map((x, k) => hex(C, place, `swatch ${k + 1}`, x, { need: true })); if (each.every(Boolean)) o.swatches = each; } }
      if (c.material !== undefined) { if (!MATERIAL_IDS.includes(c.material)) C.err(`${place}: material ${q(c.material)} is not a material; use one of ${listOf(MATERIAL_IDS)}`); else o.material = c.material; }
      extras(C, place, c, o);
      out.push(o);
      return;
    }
    const key = idOf(C, place, c.key, { what: 'key' });
    if (key && SCENE_KEYS.has(key)) { C.err(`${place}: ${q(key)} cannot be a control's key: a when uses it for ${key === 'clip' ? 'clips' : 'directions'}; choose another`); return; }
    if (kind === 'choice') {
      knownOnly(C, place, c, CHOICE_FIELDS);
      const o = { key, kind: 'choice', label: text(C, place, 'label', c.label, L.nameChars, { need: true }) };
      const os = list(C, place, c.options, L.options, { min: 2, what: 'options' });
      const values = [];
      if (os) {
        o.options = [];
        for (const x of os) {
          const value = isObj(x) ? x.value : x;
          if (typeof value !== 'string' || !value.trim() || value.length > L.idChars || BAD_CHARS.test(value)) { C.err(`${place}: an option must be a word of at most ${L.idChars} characters, or { value, label }; got ${say(x)}`); continue; }
          if (values.includes(value)) { C.err(`${place}: the option ${q(value)} is listed twice`); continue; }
          values.push(value);
          if (isObj(x)) { knownOnly(C, `${place}, option ${q(value)}`, x, ['value', 'label']); const lab = text(C, `${place}, option ${q(value)}`, 'label', x.label, L.nameChars, { need: true }); if (lab !== undefined) o.options.push({ value, label: lab }); }
          else o.options.push(value);
        }
        if (c.default === undefined) o.default = values[0];
        else if (!values.includes(c.default)) C.err(`${place}: default ${say(c.default)} is not one of its options (${someOf(values.map(q))})`);
        else o.default = c.default;
      }
      if (c.was !== undefined) {
        if (!isObj(c.was) || Object.keys(c.was).length > L.options) C.err(`${place}: was must be an object of old value: option, at most ${L.options}; got ${say(c.was)}`);
        else {
          o.was = {};
          for (const [old, now] of Object.entries(c.was)) {
            if (old.length > L.idChars || BAD_CHARS.test(old)) { C.err(`${place}: was: the old value ${q(old)} must be a word of at most ${L.idChars} characters`); continue; }
            if (!values.includes(now)) { C.err(`${place}: was maps ${q(old)} to ${say(now)}, which is not one of its options`); continue; }
            o.was[old] = now;
          }
        }
      }
      extras(C, place, c, o);
      if (key) C.table.set(key, { kind: 'choice', values, was: o.was });
      out.push(o);
      return;
    }
    if (kind === 'toggle') {
      knownOnly(C, place, c, TOGGLE_FIELDS);
      const o = { key, kind: 'toggle', label: text(C, place, 'label', c.label, L.nameChars, { need: true }) };
      const d = bool(C, place, 'default', c.default);
      o.default = d ?? false;
      extras(C, place, c, o);
      if (key) C.table.set(key, { kind: 'toggle' });
      out.push(o);
      return;
    }
    // range (version 1's slider): with `scales` and no `by`, min and max are the scale factors themselves (version 1)
    knownOnly(C, place, c, SLIDER_FIELDS);
    const o = { key, label: text(C, place, 'label', c.label, L.nameChars, { need: true }) };
    if (c.kind !== undefined) o.kind = c.kind;
    for (const f of ['lo', 'hi']) { const t = text(C, place, f, c[f], L.wordChars); if (t !== undefined) o[f] = t; }
    const s = c.scales;
    const v1Scales = s !== undefined && isObj(s) && s.by === undefined;
    if (v1Scales) { o.min = num(C, place, 'min', c.min, L.scale[0], L.scale[1], { need: true }); o.max = num(C, place, 'max', c.max, L.scale[0], L.scale[1], { need: true }); }
    else { o.min = num(C, place, 'min', c.min ?? 0, -10000, 10000); o.max = num(C, place, 'max', c.max ?? 1, -10000, 10000); }
    if (c.step !== undefined) {
      const span = o.max !== undefined && o.min !== undefined ? o.max - o.min : Infinity;
      if (!fin(c.step) || c.step <= 0 || c.step > span) C.err(`${place}: step must be a number above 0 and at most the slider's span (${say(span)}); got ${say(c.step)}`); else o.step = c.step;
    }
    if (o.min !== undefined && o.max !== undefined) {
      if (o.min >= o.max) C.err(`${place}: min (${o.min}) must be less than max (${o.max})`);
      else o.default = num(C, place, 'default', c.default ?? (v1Scales ? Math.min(o.max, Math.max(o.min, 1)) : (o.min + o.max) / 2), o.min, o.max);
    }
    if (s !== undefined) {
      const how = 'scales must be { bones: [ids] } or { shapes: [ids] } (version 2 may add by: [smallest, biggest])';
      if (!isObj(s)) C.err(`${place}: ${how}; got ${say(s)}`);
      else {
        knownOnly(C, `${place}, scales`, s, ['bones', 'shapes', 'by']);
        const which = ['bones', 'shapes'].filter((k) => s[k] !== undefined);
        if (which.length !== 1) C.err(`${place}: ${how}`);
        else {
          const xs2 = list(C, place, s[which[0]], which[0] === 'bones' ? L.nodes : L.primitives, { min: 1, what: which[0] });
          if (xs2) { o.scales = { [which[0]]: [...new Set(xs2)] }; C.scaleRefs.push([place, which[0], o.scales[which[0]]]); }
          if (s.by !== undefined) { const by = pairOf(C, place, 'scales.by', s.by, L.scale, L.scale, { bind: false }); if (by && o.scales) o.scales.by = by; }
        }
      }
    }
    extras(C, place, c, o);
    if (key) C.table.set(key, { kind: 'range', min: o.min ?? 0, max: o.max ?? 1, scales: !!o.scales });
    out.push(o);
  });
  return { controls: out, speed };
}

function extras(C, place, c, o) {
  const g = text(C, place, 'group', c.group, L.wordChars); if (g !== undefined) o.group = g;
  if (c.when !== undefined) o.when = c.when;
  if (c.look !== undefined) {
    // Contract 7 rule 3: a slider may say "keep" (a look never moves it); a choice or on/off "vary" (a look may change it) or "keep"
    const slider = c.kind === undefined || c.kind === 'range' || c.kind === 'slider';
    const ok = slider ? c.look === 'keep' : c.look === 'vary' || c.look === 'keep';
    if (!ok) C.err(`${place}: look must be ${c.kind === 'choice' || c.kind === 'toggle' ? '"vary" (a look may change it) or "keep"' : '"keep" (a look never moves it)'}; got ${say(c.look)}`);
    else o.look = c.look;
  }
}

/** Refuses controls that need themselves through their `when` and the parts they belong to. */
function checkLoops(C, controls, parts) {
  const deps = new Map();
  const add = (k, d) => { if (!deps.has(k)) deps.set(k, []); if (!deps.get(k).includes(d)) deps.get(k).push(d); };
  for (const c of controls) for (const alt of [].concat(c.when ?? [])) for (const k of Object.keys(alt)) add(c.key, k);
  for (const p of Object.values(parts)) if (Array.isArray(p.params)) for (const k of p.params.slice(1)) add(k, p.params[0]);
  const done = new Set();
  const walk = (k, trail) => {
    if (trail.includes(k)) { C.err(`Controls: when makes a loop: ${[...trail.slice(trail.indexOf(k)), k].map(q).join(' needs ')}`); return false; }
    if (done.has(k)) return true;
    for (const d of deps.get(k) ?? []) if (!walk(d, [...trail, k])) return false;
    done.add(k);
    return true;
  };
  for (const k of deps.keys()) if (!walk(k, [])) return;
}

/** Parts (Contract 3; 2.6): { label, params: [selector, ...], none, socket, shapes } or version 1's { label, shapes, default } (an on/off keyed by its name). */
function partsOf(C, raw) {
  const out = {};
  if (raw === undefined) return out;
  const names = mapNames(C, 'Parts', raw, L.parts, 'name: { label, params, none, socket, shapes }');
  if (!names) return out;
  const owned = new Map(), owner = new Map();
  for (const name of names) {
    const place = `Part ${q(name)}`;
    if (!idOf(C, place, name, { what: 'part name' })) continue;
    const p = raw[name];
    if (!isObj(p)) { C.err(`${place}: must be an object with label, params, none, socket, shapes`); continue; }
    const contract = p.params !== undefined;
    knownOnly(C, place, p, contract ? ['label', 'params', 'none', 'socket', 'shapes'] : ['label', 'shapes', 'default', 'socket']);
    const o = { label: text(C, place, 'label', p.label, L.nameChars, { need: true }) };
    if (contract) {
      const xs = list(C, place, p.params, L.controls, { min: 1, what: 'params' });
      if (xs) {
        const params = [];
        for (const k of xs) {
          if (typeof k !== 'string' || !C.table.has(k) || C.table.get(k).kind === 'colour') { C.err(`${place}: ${say(k)} in params is not one of the sprite's controls`); continue; }
          if (owned.has(k)) { C.err(`${place}: the control ${q(k)} is in two parts (${q(owned.get(k))} and ${q(name)}); a control belongs to one part`); continue; }
          if (!params.includes(k)) params.push(k);
        }
        for (const k of params) owned.set(k, name);
        o.params = params;
        const sel = C.table.get(params[0]);
        if (!sel || (sel.kind !== 'choice' && sel.kind !== 'toggle')) C.err(`${place}: its first control ${q(params[0])} must be a choice or an on/off: it picks which ${name}, or none`);
        else {
          C.used.add(params[0]);
          if (p.none !== undefined) {
            const nones = Array.isArray(p.none) ? p.none : [p.none];
            const bad = nones.filter((v) => !fits(sel, v));
            if (!nones.length) C.err(`${place}: none is an empty list; name the options that take the part off, or leave none out`);
            else if (bad.length) C.err(`${place}: none ${bad.map(say).join(', ')} is not ${sel.kind === 'toggle' ? 'true or false' : `an option of ${q(params[0])}`}`);
            else o.none = Array.isArray(p.none) ? [...p.none] : p.none;
          }
        }
      }
    } else {
      const d = bool(C, place, 'default', p.default);
      o.default = d ?? true;
      C.used.add(name);
    }
    if (p.socket !== undefined) {
      if (typeof p.socket !== 'string' || (!SOCKET_NAMES.includes(p.socket) && !C.points.has(p.socket))) C.err(`${place}: socket ${say(p.socket)} is not an attach point; use ${listOf(SOCKET_NAMES)} or a point of the sprite`);
      else o.socket = p.socket;
    }
    const own = p.shapes !== undefined ? shapeRefs(C, place, 'shapes', p.shapes) ?? [] : [];
    for (const s of own) {
      if (owner.has(s) && owner.get(s) !== name) C.err(`Shape ${q(s)}: is in two parts (${q(owner.get(s))} and ${q(name)}); a shape belongs to one part`);
      else owner.set(s, name);
    }
    if (p.shapes !== undefined || !contract) o.shapes = own;
    out[name] = o;
  }
  // a shape that names its part (version 1's way) belongs to it
  for (const [, part, id] of C.partRefs) {
    if (!id || !Object.hasOwn(out, part) || !Array.isArray(out[part].shapes) || out[part].shapes.includes(id)) continue;
    if (owner.has(id) && owner.get(id) !== part) { C.err(`Shape ${q(id)}: is in two parts (${q(owner.get(id))} and ${q(part)}); a shape belongs to one part`); continue; }
    owner.set(id, part);
    out[part].shapes.push(id);
  }
  C.partNames = new Set(Object.keys(out));
  return out;
}

const CLIP_FIELDS = ['label', 'frames', 'fps', 'loop', 'keys', 'frameEdits', 'sounds', 'from', 'noText', 'travel'];   // noText: migration batch M9 (an interface clip with no room for words, engine/ui.js); travel: build item F5 (motion sliders)
const EDIT_FIELDS = ['nudge', 'show', 'hide', 'flash', 'swap'];
const SOUND_FIELDS = ['sound', 'frame', 'preset', 'volume', 'when'];

function checkClipName(C, place, name) {
  if (typeof name !== 'string') { C.err(`${place}: a clip name is text; got ${say(name)}`); return false; }
  if (RESERVED.has(name)) { C.err(`${place}: ${q(name)} cannot be a clip name: it is a word every object already has`); return false; }
  const m = DIR_CLIP_RE.exec(name);
  if (m) {
    if (C.view !== 'top-down') { C.err(`${place}: ${q(name)}: a clip name ending _down, _up or _side is a direction clip, for a top-down body; this body is seen from ${q(C.view ?? 'side')}`); return false; }
    if (!CLIP_NAME.test(m[1]) || name.length > L.idChars) { C.err(`${place}: clip name ${q(name)} must be an action and _down, _up or _side, at most ${L.idChars} characters`); return false; }
    return true;
  }
  if (!CLIP_NAME.test(name)) { C.err(`${place}: clip name ${q(name)} must be a lowercase letter, then letters, digits and dashes, at most ${L.idChars} characters`); return false; }
  return true;
}

/** One key pose (docs/studio.md 2.2; 2.5c emit keys; 2.5d node keys). Fields by body: see KEY_FIELDS. */
const KEY_FIELDS = {
  rig: ['t', 'ease', 'root', 'bones', 'ik', 'stretch', 'show', 'hide', 'swap'],
  pictures: ['t', 'ease', 'root', 'nodes', 'show', 'hide', 'swap', 'emit'],
  emitters: ['t', 'ease', 'root', 'nodes', 'show', 'hide', 'swap', 'emit'],
  other: ['t', 'ease', 'show', 'hide', 'swap'],
};

function checkKey(C, place, k) {
  if (!isObj(k)) { C.err(`${place}: must be an object with t and what the key changes`); return null; }
  knownOnly(C, place, k, KEY_FIELDS[C.bodyKind] ?? KEY_FIELDS.other);
  const o = { t: num(C, place, 't', k.t, 0, 1, { need: true }) };
  if (k.ease !== undefined) { if (!EASES.includes(k.ease)) C.err(`${place}: ease must be one of ${listOf(EASES)}; got ${say(k.ease)}`); else o.ease = k.ease; }
  const allowed = KEY_FIELDS[C.bodyKind] ?? KEY_FIELDS.other;
  const W = C.W, H = C.H;
  if (k.root !== undefined && allowed.includes('root')) { const r = pairOf(C, place, 'root', k.root, [-W, W], [-H, H], { clamp: true, bind: false }); if (r) o.root = r; }
  const map = (field, check) => {
    const v = k[field];
    if (v === undefined || !allowed.includes(field)) return;
    if (!isObj(v)) { C.err(`${place}: ${field} must be an object of id: value; got ${say(v)}`); return; }
    const m = {};
    for (const [id, x] of Object.entries(v)) { const c = check(id, x); if (c !== undefined) m[id] = c; }
    o[field] = m;
  };
  map('bones', (id, x) => {
    if (!C.nodes?.has(id) && !(C.loose && ID_PATTERN.test(id))) { C.err(`${place}: ${q(id)} in bones is not a bone or node of the body`); return undefined; }
    if (C.chainOf?.has(id)) C.warn(`${place}: bone ${q(id)} is placed by IK ${q(C.chainOf.get(id))}; its angle here is overruled whenever that IK target is set`);
    return num(C, place, `bones ${q(id)}`, x, -L.angle, L.angle, { need: true });
  });
  map('ik', (id, x) => {
    if (!C.ik?.has(id) && !(C.loose && ID_PATTERN.test(id))) { C.err(`${place}: ${q(id)} in ik is not an IK chain of the body`); return undefined; }
    return pairOf(C, place, `ik ${q(id)}`, x, [-W, W], [-H, H], { need: true, clamp: true, bind: false });
  });
  map('stretch', (id, x) => {
    if (!C.nodes?.has(id) && !(C.loose && ID_PATTERN.test(id))) { C.err(`${place}: ${q(id)} in stretch is not a bone of the body`); return undefined; }
    return num(C, place, `stretch ${q(id)}`, x, L.stretch[0], L.stretch[1], { need: true });
  });
  map('nodes', (id, x) => {
    if (!C.nodes?.has(id)) { C.err(`${place}: ${q(id)} in nodes is not a node of the body`); return undefined; }
    if (!isObj(x)) { C.err(`${place}: nodes ${q(id)} must be { turn, move, scale }; got ${say(x)}`); return undefined; }
    knownOnly(C, `${place}, node ${q(id)}`, x, ['turn', 'move', 'scale']);
    const n = {};
    if (x.turn !== undefined) { const t = num(C, place, `nodes ${q(id)} turn`, x.turn, -L.angle, L.angle); if (t !== undefined) n.turn = t; }
    if (x.move !== undefined) { const m = pairOf(C, place, `nodes ${q(id)} move`, x.move, [-W, W], [-H, H], { clamp: true, bind: false }); if (m) n.move = m; }
    if (x.scale !== undefined) { const s = num(C, place, `nodes ${q(id)} scale`, x.scale, L.scale[0], L.scale[1]); if (s !== undefined) n.scale = s; }
    return n;
  });
  map('swap', (id, x) => swapOne(C, place, id, x));
  map('emit', (id, x) => {
    const e = C.emitters.get(id);
    if (!e) { C.err(`${place}: emit: ${q(id)} is not an emitter of the body${C.emitters.size ? ` (${someOf([...C.emitters.keys()])})` : ''}`); return undefined; }
    if (!isObj(x)) { C.err(`${place}: emit ${q(id)} must be { amount, at, ... }; got ${say(x)}`); return undefined; }
    const n = {};
    const keyable = Array.isArray(e.entry?.keyable) ? e.entry.keyable : [];
    for (const [f, val] of Object.entries(x)) {
      if (f === 'amount') { if (!fin(val) || val < 0 || val > 1) C.err(`${place}: emit ${q(id)} amount must be a number from 0 to 1; got ${say(val)}`); else n.amount = val; continue; }
      if (f === 'at') { const p = pairOf(C, place, `emit ${q(id)} at`, val, [-2 * W, 2 * W], [-2 * H, 2 * H], { bind: false }); if (p) n.at = p; continue; }
      if (!keyable.includes(f)) { C.err(`${place}: emit ${q(id)}: ${q(f)} cannot be keyed; ${e.key} lets keys change ${keyable.length ? listOf(['amount', 'at', ...keyable]) : 'only amount and at'}`); continue; }
      const info = typeInfo(e.entry.args?.[f]);
      const t = targetOf(info);
      if (!t) { C.err(`${place}: emit ${q(id)}: ${q(f)} cannot be keyed`); continue; }
      const v = targetValue(C, place, `emit ${q(id)} ${f}`, val, t);
      if (v === undefined) continue;
      // a size argument (engine/gen/index.js SIZE_KEYS) may be keyed down from what the emitter sets, never up: the
      // emitter is priced once at what it sets, so no key can raise its cost or its stamps (3.4 rule 2; B12b)
      const sized = sizeKeysOf(C, e);
      if (sized.includes(f) && !notAbove(v, e.worst?.[f])) { C.err(`${place}: emit ${q(id)}: a key sets ${f} to ${say(v)}, above the ${say(e.worst?.[f])} the emitter sets; ${e.key} is priced at what the emitter sets, so keys may lower ${listOf(sized)} but never raise ${sized.length === 1 ? 'it' : 'them'}: set ${f} at its largest on the emitter and key it down`); continue; }
      n[f] = v;
    }
    return n;
  });
  for (const f of ['show', 'hide']) if (k[f] !== undefined) { const ids = shapeRefs(C, place, f, k[f]); if (ids) o[f] = ids; }
  if (o.show && o.hide) for (const id of o.show) if (o.hide.includes(id)) C.err(`${place}: shape ${q(id)} is in both show and hide`);
  return o;
}

// ---- travel: motion sliders (build item F5; docs/data-sprites.md 2.2 "Motion sliders"; rigs/keypose.js travelKeys) ----

/** The key fields whose numbers a clip's travel may scale, by body: what each body's keys move (never t, ease, show, hide, swap or emit). */
export const TRAVEL_TRACKS = Object.freeze({ rig: Object.freeze(['root', 'bones', 'ik', 'stretch']), pictures: Object.freeze(['root', 'nodes']), emitters: Object.freeze(['root', 'nodes']) });
const TRAVEL_FIELDS = ['tracks', 'by', 'about', 'side'];
const TRACK_SEG = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,39}$/;
const AXIS = new Set(['0', '1']);

/** One track path of a travel entry: a numeric key field of the body, then (optionally) its id and axis, as the keys write them. True when it names one. */
function travelTrack(C, place, s, allowed) {
  const segs = typeof s === 'string' && s.length <= 160 ? s.split('.') : null;
  const words = `name a number the keys move: ${listOf(allowed)}, optionally with an id and an axis under it (as "root.1", "bones.<bone>", "ik.<chain>.0", "nodes.<node>.turn")`;
  if (!segs || segs.length > TRAVEL_LIMITS.segments || segs.some((x) => !TRACK_SEG.test(x) || RESERVED.has(x)) || !allowed.includes(segs[0])) { C.err(`${place}: ${q(typeof s === 'string' ? s : say(s))} is not a track travel can scale; ${words}`); return false; }
  const [field, id, a, b] = segs;
  const deeper = (n) => { if (segs.length > n) { C.err(`${place}: ${q(s)}: ${segs.slice(0, n).join('.')} goes no deeper; ${words}`); return true; } return false; };
  if (field === 'root') {
    if (id !== undefined && !AXIS.has(id)) { C.err(`${place}: ${q(s)}: root takes 0 (across) or 1 (down)`); return false; }
    return !deeper(2);
  }
  if (field === 'bones' || field === 'stretch') {
    if (id !== undefined && !C.nodes?.has(id) && !(C.loose && ID_PATTERN.test(id))) { C.err(`${place}: ${q(s)}: ${q(id)} is not a bone or node of the body`); return false; }
    return !deeper(2);
  }
  if (field === 'ik') {
    const baseIk = Array.isArray(C.base?.entry?.ik) ? C.base.entry.ik.filter((x) => typeof x === 'string') : null;   // F5 review fix: a summary that lists the base's chains has them checked
    if (id !== undefined && baseIk && !C.ik?.has(id) && !baseIk.includes(id)) { C.err(`${place}: ${q(s)}: ${q(id)} is not an IK chain of the body or its base (${someOf([...(C.ik?.keys?.() ?? []), ...baseIk])})`); return false; }
    if (id !== undefined && !C.ik?.has(id) && !((C.loose || C.base) && ID_PATTERN.test(id))) { C.err(`${place}: ${q(s)}: ${q(id)} is not an IK chain of the body`); return false; }   // a summary without chains (pieceSummary gives none yet): any id on a base; engine/resolve.js warns of a path no key moves
    if (a !== undefined && !AXIS.has(a)) { C.err(`${place}: ${q(s)}: an IK target takes 0 (across) or 1 (down)`); return false; }
    return !deeper(3);
  }
  // nodes (pictures, emitters): nodes.<node>.turn | move[.0|.1] | scale
  if (id !== undefined && !C.nodes?.has(id)) { C.err(`${place}: ${q(s)}: ${q(id)} is not a node of the body`); return false; }
  if (a !== undefined && !['turn', 'move', 'scale'].includes(a)) { C.err(`${place}: ${q(s)}: a node's keys move by turn, move or scale`); return false; }
  if (a === 'move') { if (b !== undefined && !AXIS.has(b)) { C.err(`${place}: ${q(s)}: move takes 0 (across) or 1 (down)`); return false; } return true; }
  return !deeper(3);
}

/**
 * A clip's travel (build item F5): [{ tracks: [paths], by: number | binding, about?: first | mid | least | most | number, side?: below | above }],
 * at most TRAVEL_LIMITS.entries. `by` is checked as any binding to a number from 0 to TRAVEL_LIMITS.most (so the control it
 * binds is in use). Returns the cleaned list, or undefined after an error.
 */
function travelOf(C, place, raw) {
  const allowed = TRAVEL_TRACKS[C.bodyKind];
  if (!allowed) { C.err(`${place}: travel scales how far a clip's keys move; a ${C.bodyKind ?? 'bodiless'} body has no keys that move (rig, pictures and emitters bodies do)`); return undefined; }
  const xs = list(C, place, raw, TRAVEL_LIMITS.entries, { what: 'travel entries' });
  if (!xs) return undefined;
  const out = [];
  let ok = true;
  xs.forEach((e, i) => {
    const p = `${place}, travel ${i + 1}`;
    if (!isObj(e)) { C.err(`${p}: must be { tracks, by, about? }; got ${say(e)}`); ok = false; return; }
    knownOnly(C, p, e, TRAVEL_FIELDS);
    const ts = list(C, p, e.tracks, TRAVEL_LIMITS.tracks, { min: 1, what: 'tracks', need: true });
    const tracks = [];
    let good = !!ts;
    for (const s of ts ?? []) {
      if (!travelTrack(C, p, s, allowed)) { good = false; continue; }
      if (tracks.includes(s)) C.warn(`${p}: ${q(s)} is listed twice; kept once`); else tracks.push(s);
    }
    const by = numOrBind(C, p, 'by', e.by, 0, TRAVEL_LIMITS.most, { need: true });
    let about;
    if (e.about !== undefined) {
      if (TRAVEL_ABOUT.includes(e.about) || (fin(e.about) && Math.abs(e.about) <= L.angle)) about = e.about;
      else { C.err(`${p}: about must be first, mid, least, most or a number from -${L.angle} to ${L.angle} (the value the tracks are scaled from); got ${say(e.about)}`); good = false; }
    }
    if (e.side !== undefined && !TRAVEL_SIDES.includes(e.side)) { C.err(`${p}: side must be below or above (only the values on that side of the pivot move; leave it out for both); got ${say(e.side)}`); good = false; }
    if (!good || !by) { ok = false; return; }
    out.push({ tracks, by: by.value, ...(about !== undefined ? { about } : {}), ...(e.side !== undefined ? { side: e.side } : {}) });
  });
  return ok ? out : undefined;
}

/** One stamp swap: a stamp of the body and one of its variants (null: back to its own rows). */
function swapOne(C, place, id, x) {
  const variants = C.stamps.get(id);
  if (!variants) { C.err(`${place}: ${q(id)} in swap is not a stamp of the body`); return undefined; }
  if (x === null) return null;
  if (typeof x !== 'string' || !variants.has(x)) { C.err(`${place}: ${q(x)} is not a variant of stamp ${q(id)}${variants.size ? ` (${listOf([...variants])})` : ' (it has none)'}`); return undefined; }
  return x;
}

/**
 * A clip's `from` that picks the base's clip by a setting (2.2; build item B4x): a binding to a choice or on/off, as
 * any binding is checked, whose every value is a clip of the base ({ from, pick: { option: clip } }, or { from } when
 * every option of the choice is a clip's name). Sets o.from to the cleaned binding. A sprite's sheet has one number of
 * frames a clip, so the clips it can pick must have the same number, or the clip gives its own `frames`. Returns what
 * the clip inherits for the checks that follow ({ frames }), {} when it cannot tell or after an error.
 */
function pickedFrom(C, place, b, o, ownFrames = false) {
  const names = C.baseClips ? [...C.baseClips.keys()] : null;
  const r = binding(C, place, 'from', b, names ? { kind: 'word', options: names } : { kind: 'any' });
  if (!r) return {};
  o.from = r.value;
  const d = C.table.get(r.value.from);
  const picks = isObj(r.value.pick) ? Object.values(r.value.pick) : d?.kind === 'choice' ? d.values : [];
  if (!names) { if (!picks.every((n) => typeof n === 'string' && CLIP_NAME.test(n))) C.err(`${place}: from picks ${say(picks)}; each value is the name of a clip of the base`); return {}; }
  const frames = picks.map((n) => C.baseClips.get(n)?.frames).filter(fin);
  if (!ownFrames && new Set(frames).size > 1) C.err(`${place}: from can pick clips of different lengths (${someOf([...new Set(picks)].map((n) => `${n} ${C.baseClips.get(n)?.frames}`))} frames); a sheet has one length a clip: pick clips of one length, or give the clip its own frames`);
  return frames.length === picks.length && frames.length ? { frames: Math.min(...frames) } : {};
}

function checkClip(C, name, c, written) {
  const place = `Clip ${q(name)}`;
  if (!isObj(c)) { C.err(`${place}: must be an object with ${listOf(CLIP_FIELDS)}; got ${say(c)}`); return null; }
  knownOnly(C, place, c, CLIP_FIELDS);
  const m = C.view === 'top-down' ? DIR_CLIP_RE.exec(name) : null;
  const action = m ? m[1] : name, dir = m ? m[2] : null;
  const std = C.bodyKind === 'rig' && Object.hasOwn(STANDARD_CLIPS, action) ? STANDARD_CLIPS[action] : null;
  const o = { label: text(C, place, 'label', c.label, L.nameChars) ?? (dir ? `${cap(action)} (${dir})` : cap(name)) };
  // from: a base's clip it inherits
  let inherited = null;
  if (c.from !== undefined) {
    if (!C.base) C.warn(`${place}: from names a clip of a base piece; this body extends none, so it was dropped`);
    else if (isBindingLike(c.from)) inherited = pickedFrom(C, place, c.from, o, c.frames !== undefined);   // B4x: the base clip picked by a setting
    else if (typeof c.from !== 'string' || (C.baseClips && !C.baseClips.has(c.from))) C.err(`${place}: from ${q(c.from)} is not a clip of ${C.base.id}${C.baseClips ? ` (${someOf([...C.baseClips.keys()])})` : ''}`);
    else { o.from = c.from; inherited = C.baseClips?.get(c.from) ?? {}; }
  } else if (C.takenClips?.has(name)) inherited = C.baseClips?.get(C.takenClips.get(name)) ?? {};   // B4x: a clip extends.clips takes
  let frames;
  if (c.frames === undefined && (inherited || written)) frames = fin(inherited?.frames) ? inherited.frames : undefined;
  else if (!Number.isInteger(c.frames) || c.frames < 1 || c.frames > L.framesPerClip) {
    // F5 review fix: a clip of a base's name written without from replaces the base's clip; say how to keep it instead
    const keep = c.frames === undefined && C.base && !inherited && C.baseClips?.has(name) ? `; this clip replaces ${C.base.id}'s clip ${q(name)}: to keep that clip and change it (a travel, sounds), add "from": ${q(name)}` : '';
    C.err(`${place}: frames must be a whole number from 1 to ${L.framesPerClip}; got ${say(c.frames)}${keep}`); frames = 1;
  }
  else frames = c.frames;
  if (c.frames !== undefined && frames !== undefined) o.frames = frames;
  if (c.fps !== undefined || (!inherited && !written)) o.fps = num(C, place, 'fps', c.fps ?? std?.fps ?? 10, 1, L.fps);
  if (c.loop !== undefined && typeof c.loop !== 'boolean') C.err(`${place}: loop must be true or false; got ${say(c.loop)}`);
  if (typeof c.loop === 'boolean') o.loop = c.loop; else if (!inherited && !written) o.loop = std?.loop ?? true;
  if (c.noText !== undefined && typeof c.noText !== 'boolean') C.err(`${place}: noText must be true or false; got ${say(c.noText)}`);   // migration batch M9: a clip of an interface piece where no text goes (Contract 8, engine/ui.js contrastFaults)
  else if (c.noText === true) o.noText = true;
  const n = frames ?? L.framesPerClip;
  // keys
  const ks = list(C, place, c.keys, L.keysPerClip, { what: 'keys' }) ?? [];
  let keys = ks.map((k, i) => checkKey(C, `${place}, key ${i + 1}`, k)).filter(Boolean);
  const sorted = [...keys].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  if (sorted.some((k, i) => k !== keys[i])) { C.warn(`${place}: keys were not in order of t; put in order`); keys = sorted; }
  for (let i = 1; i < keys.length; i++) if (keys[i].t !== undefined && keys[i - 1].t !== undefined && Math.abs(keys[i].t - keys[i - 1].t) < 1e-6) C.err(`${place}: two keys are at the same point (t ${keys[i].t}); merge them or move one`);
  if (c.keys !== undefined || (!inherited && !written)) o.keys = keys;
  // travel: how far the keys move, by a setting (build item F5)
  if (c.travel !== undefined) { const tv = travelOf(C, place, c.travel); if (tv) o.travel = tv; }
  // frame edits
  if (c.frameEdits !== undefined) {
    if (!isObj(c.frameEdits)) C.err(`${place}: frameEdits must be an object of frame number: changes; got ${say(c.frameEdits)}`);
    else {
      o.frameEdits = {};
      for (const [f, e] of Object.entries(c.frameEdits)) {
        if (!/^(0|[1-9]\d?)$/.test(f) || +f >= n) { C.warn(`${place}: frame ${f} is not a frame of this clip${frames ? ` (it has ${frames})` : ''}; its changes were dropped`); continue; }
        const ep = `${place}, frame ${f}`;
        if (!isObj(e)) { C.err(`${ep}: must be an object with ${listOf(EDIT_FIELDS)}`); continue; }
        knownOnly(C, ep, e, EDIT_FIELDS);
        const x = {};
        if (e.nudge !== undefined) { const nd = pairOf(C, ep, 'nudge', e.nudge, [-C.W, C.W], [-C.H, C.H], { whole: true, clamp: true, bind: false }); if (nd) x.nudge = nd; }
        for (const fld of ['show', 'hide']) if (e[fld] !== undefined) { const ids = shapeRefs(C, ep, fld, e[fld]); if (ids) x[fld] = ids; }
        if (e.swap !== undefined) {
          if (!isObj(e.swap)) C.err(`${ep}: swap must be an object of stamp: variant; got ${say(e.swap)}`);
          else { x.swap = {}; for (const [id, v] of Object.entries(e.swap)) { const s = swapOne(C, ep, id, v); if (s !== undefined) x.swap[id] = s; } }
        }
        const fl = bool(C, ep, 'flash', e.flash); if (fl !== undefined) x.flash = fl;
        o.frameEdits[f] = x;
      }
    }
  }
  // sounds
  if (c.sounds !== undefined) {
    const ss = list(C, place, c.sounds, L.soundsPerClip, { what: 'sounds' }) ?? [];
    const known = C.soundIds;
    o.sounds = [];
    ss.forEach((s, i) => {
      const sp = `${place}, sound ${i + 1}`;
      if (!isObj(s)) { C.err(`${sp}: must be an object with ${listOf(SOUND_FIELDS)}`); return; }
      knownOnly(C, sp, s, SOUND_FIELDS);
      const id = idOf(C, sp, s.sound, { pattern: SPRITE_ID_PATTERN, what: 'sound' });
      if (id && known && !known.has(id)) { C.err(`${sp}: there is no sound ${q(id)} in the library`); return; }
      if (!Number.isInteger(s.frame)) { C.err(`${sp}: frame must be a whole number; got ${say(s.frame)}`); return; }
      if (s.frame < 0 || s.frame >= n) { C.warn(`${place}: frame ${s.frame} is not a frame of this clip; its sound was dropped`); return; }
      const x = { sound: id, frame: s.frame };
      const pr = text(C, sp, 'preset', s.preset, L.nameChars); if (pr !== undefined) x.preset = pr;
      const vol = num(C, sp, 'volume', s.volume, 0, 1); if (vol !== undefined) x.volume = vol;
      if (s.when !== undefined) { const w = checkWhen(C, sp, s.when); if (w === undefined) return; x.when = w; }
      o.sounds.push(x);
    });
  }
  // advice from style guide 4, for bodies that act
  if (C.bodyKind === 'rig') {
    if (Object.hasOwn(CLIP_SYNONYMS, action)) { const s = CLIP_SYNONYMS[action]; C.warn(`${place}: the style guide calls this clip "${s}"; name it ${dir ? `${s}_${dir}` : s} and keep the label ${q(o.label)}`); }
    if (std && frames !== undefined && !inherited) {
      if (frames !== std.frames) C.warn(`${place}: the style guide's ${action} has ${std.frames} frames; this one has ${frames}`);
      if (o.loop !== undefined && o.loop !== std.loop) C.warn(`${place}: the style guide's ${action} ${std.loop ? 'loops' : 'plays once (no loop)'}`);
    }
    if ((action === 'hurt' || action === 'die') && !inherited && !o.frameEdits?.['0']?.flash) C.warn(`${place}: the style guide starts ${action} on a white flash; turn on the white flash on frame 0`);
  }
  return { clip: o, frames: frames ?? 0 };
}

/** Whether the base gives the sprite any clip: it extends one, and takes its clips (no extends.clips) or some of them (B4x). */
const baseGives = (C) => !!C.base && !(C.takenClips && C.takenClips.size === 0);

function clipsOf(C, raw) {
  const written = C.layoutClips;           // null: the layout names its clips (tiles)
  const known = written === null ? null : new Set(written);
  if (C.baseClips) for (const k of C.baseClips.keys()) known?.add(k);
  if (raw === undefined) {
    if (written !== null && !written.length && !baseGives(C)) C.err('Clips: give at least one clip (idle is the usual first)');
    return {};
  }
  const names = mapNames(C, 'Clips', raw, L.clips, 'name: clip');
  if (!names) return {};
  if (!names.length && written !== null && !written.length && !baseGives(C)) C.err('Clips: give at least one clip (idle is the usual first)');
  const out = {};
  let total = 0;
  for (const name of names) {
    if (!checkClipName(C, `Clip ${q(name)}`, name)) continue;
    const m = DIR_CLIP_RE.exec(name);
    if (m && names.includes(`${m[1]}-${m[2]}`)) C.err(`Clip ${q(name)}: there is also a clip ${q(`${m[1]}-${m[2]}`)}; a name may be written only one way`);
    const isWritten = written === null ? true : written.includes(name);
    if (C.closedClips && !isWritten) { const are = C.bodyKind === 'panel' ? 'states' : C.bodyKind === 'tiles' ? 'tiles' : 'layers'; C.err(`Clip ${q(name)}: ${q(name)} is not one of the ${are} (${someOf(written)}); this body's clips are its ${are}${C.bodyKind === 'tiles' ? ' (named <group>-<piece> by its groups, decals and extra tiles)' : ''}`); continue; }
    if (written === null && C.tileGroups && ![...C.tileGroups].some((g) => name.startsWith(`${g}-`)) && !C.tileExtras.has(name)) C.warn(`Clip ${q(name)}: does not start with a group's name (${someOf([...C.tileGroups])}); the tiles are named <group>-<piece>`);
    const r = checkClip(C, name, raw[name], isWritten && written !== null ? true : written === null);
    if (r) { out[name] = r.clip; total += r.frames; }
  }
  if (total > L.frames) C.err(`Clips: have ${total} frames in all; the most is ${L.frames}`);
  C.cost.frames = total;
  if (C.view === 'top-down' && C.bodyKind === 'rig') {
    const all = new Set([...names, ...((C.takenClips ?? C.baseClips)?.keys() ?? [])]);
    const missing = ['walk_down', 'walk_up', 'walk_side'].filter((n) => !all.has(n));
    if (missing.length) C.warn(`Clips: a top-down sprite walks in three directions (Contract 2); add ${missing.join(', ')}`);
  }
  return out;
}

/** Ready-made versions (Contract 1): [{ name, params }], each name once, each setting one the control takes (or an old value its `was` maps). */
function versionsOf(C, raw) {
  const xs = list(C, 'Versions', raw, L.versions, { what: 'versions' });
  if (!xs) return undefined;
  const names = new Set(), out = [];
  xs.forEach((v, i) => {
    const place = `Version ${typeof v?.name === 'string' ? q(v.name) : i + 1}`;
    if (!isObj(v)) { C.err(`${place}: must be { name, params }`); return; }
    knownOnly(C, place, v, ['name', 'params']);
    const name = text(C, place, 'name', v.name, L.nameChars, { need: true });
    if (name === undefined) return;
    if (names.has(name.toLowerCase())) { C.err(`${place}: the name ${q(name)} is used twice`); return; }
    names.add(name.toLowerCase());
    const p = v.params ?? {};
    if (!isObj(p)) { C.err(`${place}: params must be an object of control: value; got ${say(p)}`); return; }
    const params = {};
    for (const [k, x] of Object.entries(p)) {
      const d = C.table.get(k);
      if (!d) { C.err(`${place}: sets ${q(k)}, which is not one of the sprite's controls`); continue; }
      const old = d.kind === 'choice' && typeof x === 'string' && d.was && Object.hasOwn(d.was, x);
      if (!old && !fits(d, x)) { C.err(`${place}: sets ${q(k)} to ${say(x)}, which it can never be; it takes ${shown(d)}`); continue; }
      params[k] = d.kind === 'colour' ? x.toLowerCase() : x;
    }
    out.push({ name, params });
  });
  return out;
}

function checkMeta(C, m, viewOfBody) {
  const gap = C.opts.strict ? C.err : C.warn;
  if (m === undefined) { gap('Look & name: there is no meta yet (what it is, seen from, themes, game types, words to find it, licence)'); return undefined; }
  if (!isObj(m)) { C.err(`meta: must be an object with ${listOf(META_FIELDS)}; got ${say(m)}`); return undefined; }
  knownOnly(C, 'meta', m, META_FIELDS);
  const out = {};
  for (const k of ['type', 'role', 'view', 'license']) {
    const v = m[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || v.length > L.idChars) { C.err(`meta: ${k} must be a short word; got ${say(v)}`); continue; }
    if (BAD_CHARS.test(v)) { C.err(`meta: ${k} has control or invisible characters; remove them`); continue; }
    if (k === 'view' && v === 'top-down' && viewOfBody && viewOfBody !== 'top-down') { C.err(`meta: view "top-down" needs a top-down body (rig view "top-down"); this body is seen from ${q(viewOfBody)}`); continue; }
    if (!META_VALUES[k].includes(v)) { C.err(`meta: ${k} ${q(v)} is not one of ${k === 'role' ? 'the sprite roles (catalog/schema.js SPRITE_ROLES)' : listOf(META_VALUES[k])}`); continue; }
    out[k] = v;
  }
  for (const k of ['themes', 'gameTypes', 'words']) {
    if (m[k] === undefined) continue;
    const xs = list(C, 'meta', m[k], L.metaList, { what: k });
    if (!xs) continue;
    const max = k === 'words' ? L.wordChars : L.idChars;
    const good = [];
    for (const x of xs) {
      if (typeof x !== 'string' || x.length > max || BAD_CHARS.test(x)) { C.err(`meta: ${k} must be words of at most ${max} characters, with no control or invisible characters; got ${say(x)}`); continue; }
      if (k !== 'words' && !META_VALUES[k].includes(x)) { C.err(`meta: ${k} ${q(x)} is not one of ${listOf(META_VALUES[k])}`); continue; }
      good.push(x);
    }
    out[k] = good;
  }
  const v = validateMeta(out, 'sprite');
  for (const e of v.errors) gap(`Look & name: ${e}`);
  return out;
}

/** slice / textArea: one object for every clip, or { clip: object } per clip (Contract 8). */
function perClip(C, field, raw, one) {
  const single = isObj(raw) && Object.keys(raw).some((k) => one.fields.includes(k));
  if (single) return one.check(`${field}`, raw);
  const names = mapNames(C, field, raw, L.clips, `clip: { ${listOf(one.fields)} }`);
  if (!names) return undefined;
  const out = {};
  for (const c of names) { C.clipRefs.push([field, c]); const x = one.check(`${field} for ${q(c)}`, raw[c]); if (x) out[c] = x; }
  return out;
}

// ---- the whole definition -----------------------------------------------------------------------------------------

/**
 * Checks a sprite definition of any version and kind, and returns { ok, errors, warnings, value, version, cost, uses,
 * clips }. Version 1 (a studio sprite or rig, docs/studio.md 2) goes to catalog/studio-schema.js validateStudio
 * unchanged; version 2 (docs/data-sprites.md 2) is checked here. cost: { written, expanded, budget, stampPixels,
 * generators, nodes, pieces, frames } (the estimate of section 3.4); uses: every generator, colour rule and piece named,
 * as "id@v", sorted (the quality cache key of section 4.2); clips: the clip names the sprite will have, or null when its
 * layout names them (tiles). Never throws.
 * Arguments: input (an object or JSON text); opts { generators (the registry, see the header; default the site's),
 * pieces (the piece list, see the header), strict (gaps in meta are errors: a library file), soundIds (the sound ids
 * that exist), catalogIds (ids already in the library), styleIds (the art styles; default engine/styles.js styleIds()) }.
 */
export function validateSprite(input, opts = {}) {
  const C = context(opts);
  const done = (value, version = null) => {
    const { errors, warnings } = finish(C);
    const ok = errors.length === 0;
    return { ok, errors, warnings, value: ok ? value ?? null : null, version, cost: { ...C.cost }, uses: [...(C.uses ?? [])].sort(), clips: C.clipList ?? null };
  };
  C.cost = { written: 0, expanded: 0, budget: L.expanded, stampPixels: 0, generators: 0, nodes: 0, pieces: 0, frames: 0 };
  try {
    const d = prepare(C, input);
    if (C.fails) return done(null);
    if (!isObj(d)) { C.err(`The definition: must be an object { "format": "loadout-sprite", "version": 2, ... }; got ${say(d)}`); return done(null); }
    if (d.format !== 'loadout-sprite' && d.format !== 'loadout-rig') { C.err(`The definition: format must be "loadout-sprite" (a sprite) or "loadout-rig" (a rig); got ${say(d.format)}`); return done(null); }
    const newest = SPRITE_FORMATS[d.format];
    if (d.version === undefined) { C.err(`The definition: version is missing; this Loadout reads versions 1 and ${newest}`); return done(null); }
    if (!Number.isInteger(d.version) || d.version < 1) { C.err(`The definition: version must be a whole number; got ${say(d.version)}`); return done(null); }
    if (d.version > newest) { C.err(`The definition: was made by a newer Loadout (version ${d.version}); this one reads versions 1 and ${newest}`); return done(null); }
    if (d.version === 1) return versionOne(C, typeof input === 'string' ? input : d, opts);
    C.version = 2;
    const value = d.format === 'loadout-rig' ? checkRigFile(C, d) : checkSpriteV2(C, d);
    return done(value, 2);
  } catch (e) {
    C.err(`The definition could not be checked: ${String(e?.message ?? e).slice(0, 120)}`);
    return done(null);
  }
}

/** Version 1: catalog/studio-schema.js, unchanged; the cost is the shapes it holds (each one primitive). */
function versionOne(C, input, opts) {
  const r = validateStudio(input, opts);
  const v = r.value;
  const rig = v?.format === 'loadout-rig' ? v : v?.body?.rig;
  const shapes = rig?.shapes?.length ?? 0;
  const frames = v?.clips ? Object.values(v.clips).reduce((n, c) => n + (c.frames ?? 0), 0) : 0;
  return {
    ok: r.ok, errors: r.errors, warnings: r.warnings, value: r.value, version: 1,
    cost: { written: shapes, expanded: shapes, budget: L.expanded, stampPixels: 0, generators: 0, nodes: rig?.bones?.length ?? 0, pieces: 0, frames },
    uses: [], clips: v?.clips ? Object.keys(v.clips) : null,
  };
}

function setup(C) {
  C.reg = registryOf(C.opts);
  if (C.opts.generators !== undefined && !C.reg) C.err('The generator list given is not one: it needs generator(id, v)');
  const pr = C.opts.pieces;
  C.pieceReg = isObj(pr) && typeof pr.piece === 'function' ? pr : null;
  if (pr !== undefined && !C.pieceReg) C.err('The piece list given is not one: it needs piece(id, v)');
  C.soundIds = (() => { const s = C.opts.soundIds; if (!s) return null; try { return s instanceof Set ? s : new Set(Array.from(s)); } catch { return null; } })();
  C.styleIds = (() => { try { const s = C.opts.styleIds ?? styleIds(); return Array.isArray(s) ? s : [...s]; } catch { return ['pixel']; } })();
  Object.assign(C, {
    slots: new Map(), table: new Map(), used: new Set(), painted: new Set(), uses: new Set(), anyPiece: false,
    shapeIds: new Map(), stamps: new Map(), emitters: new Map(), groups: new Set(), points: new Map(), baseShapes: new Set(),
    clipRefs: [], shapeRefs: [], partRefs: [], groupRefs: [], scaleRefs: [], layoutClips: [], closedClips: false,
    nodes: null, loose: false, base: null, baseClips: null, takenClips: null, profiles: null, tileGroups: null, tileExtras: new Set(), view: null,
  });
}

/** A standalone rig, `loadout-rig` version 2 (a rig with no sprite around it: no controls, so nothing may be bound). */
function checkRigFile(C, d) {
  setup(C);
  const where = 'The rig';
  if (!Array.isArray(d.size) || d.size.length !== 2 || !d.size.every((n) => Number.isInteger(n) && n >= 1) || d.size[0] > L.frameWidth || d.size[1] > L.frameHeight) { C.err(`${where}: size must be [width, height] in whole pixels, at most ${L.frameWidth} by ${L.frameHeight}; got ${say(d.size)}`); return null; }
  [C.W, C.H] = d.size;
  idOf(C, where, d.id, { pattern: SPRITE_ID_PATTERN });
  text(C, where, 'name', d.name, L.nameChars, { need: true });
  C.rigAlias = true;
  if (d.colours !== undefined) paletteOf(C, d.colours, `${where} colours`);
  C.bodyKind = 'rig';
  const rig = rigBody(C, d, { metaView: null, rigColours: d.colours });
  finalChecks(C);
  return rig ? { ...rig, format: 'loadout-rig', version: 2 } : null;
}

function checkSpriteV2(C, d) {
  setup(C);
  const where = 'The sprite';
  knownOnly(C, where, d, SPRITE_FIELDS);
  const out = { format: 'loadout-sprite', version: 2 };
  out.id = idOf(C, where, d.id, { pattern: SPRITE_ID_PATTERN });
  const taken = (() => { try { return C.opts.catalogIds ? new Set(Array.from(C.opts.catalogIds)) : null; } catch { return null; } })();
  if (out.id && taken?.has(out.id)) C.err(`${where}: the id ${q(out.id)} is already used by a sprite in the library; choose another`);
  out.name = text(C, where, 'name', d.name, L.nameChars, { need: true });
  out.blurb = text(C, where, 'blurb', d.blurb, L.blurbChars, { empty: true }) ?? '';

  // the body's kind
  const b = d.body;
  let kind = null;
  if (!isObj(b)) C.err(`Body: must be an object with one of ${listOf(BODY_KINDS)}; got ${say(b)}`);
  else if (b.library !== undefined) C.err('Body: library bodies (a code rig with a data layer) are not in version 2: every sprite is data now; redraw it on a base piece ({ "rig": { "extends": { "use": "base:person-side", "v": 1 } } })');
  else {
    const given = BODY_KINDS.filter((k) => b[k] !== undefined);
    if (given.length === 0) C.err(`Body: give one of ${listOf(BODY_KINDS)}`);
    else if (given.length > 1) C.err(`Body: give only one of ${listOf(BODY_KINDS)}; got ${listOf(given)}`);
    else kind = given[0];
    if (kind) knownOnly(C, 'Body', b, kind === 'emitters' ? ['emitters', 'nodes', 'draw'] : [kind]);
  }
  C.bodyKind = kind;

  // size: the sprite's, else the rig's, else the tile
  let size = d.size ?? (kind === 'rig' && isObj(b.rig) ? b.rig.size : undefined) ?? (kind === 'tiles' && isObj(b.tiles) && (b.tiles.tile === 16 || b.tiles.tile === 32) ? [b.tiles.tile, b.tiles.tile] : undefined);
  if (!Array.isArray(size) || size.length !== 2 || !size.every(fin)) { C.err(`size must be [width, height] in whole pixels, at most ${L.frameWidth} by ${L.frameHeight}; got ${say(size)}`); size = null; }
  else if (!size.every(Number.isInteger)) { C.err(`size must be whole pixels; got ${say(size)}`); size = null; }
  else if (size[0] < 1 || size[1] < 1 || size[0] > L.frameWidth || size[1] > L.frameHeight) { C.err(`size ${say(size)} must be from 1 by 1 to ${L.frameWidth} by ${L.frameHeight}`); size = null; }
  if (size && kind === 'rig' && isObj(b.rig) && Array.isArray(b.rig.size) && (b.rig.size[0] !== size[0] || b.rig.size[1] !== size[1])) C.err(`size ${say(size)} and the rig's size ${say(b.rig.size)} differ; give one size`);
  if (size && kind === 'tiles' && isObj(b.tiles) && (b.tiles.tile === 16 || b.tiles.tile === 32) && (size[0] !== b.tiles.tile || size[1] !== b.tiles.tile)) C.err(`size ${say(size)}: a tileset's frame is its tile, ${b.tiles.tile} by ${b.tiles.tile}`);
  [C.W, C.H] = size ?? [64, 64];
  out.size = size ?? undefined;
  const metaView = isObj(d.meta) && typeof d.meta.view === 'string' ? d.meta.view : null;
  C.view = kind === 'rig' && isObj(b.rig) && typeof b.rig.view === 'string' ? b.rig.view : metaView;

  // palette (or its aliases: v1's colours as a list, or the rig's colours)
  let paletteRaw = d.palette, where0 = 'Palette';
  const rigColours = kind === 'rig' && isObj(b.rig) ? b.rig.colours : undefined;
  if (d.palette !== undefined && Array.isArray(d.colours)) C.err('Palette: give the colours once, as palette (colours is version 1\'s name for it)');
  else if (d.palette === undefined && Array.isArray(d.colours)) { paletteRaw = d.colours; where0 = 'Colours'; }
  if (paletteRaw !== undefined && rigColours !== undefined) C.err('Palette: the rig has colours too; give the colours once, as the sprite\'s palette');
  else if (paletteRaw === undefined && rigColours !== undefined) { paletteRaw = rigColours; where0 = 'Body: rig colours'; C.rigAlias = true; }
  const palette = paletteOf(C, paletteRaw, where0);
  if (where0 === 'Palette') out.palette = palette;
  else if (where0 === 'Colours') out.colours = palette;
  // version 1's colour defaults { slot: "#rrggbb" }
  if (isObj(d.colours)) {
    out.colours = {};
    for (const [k, v] of Object.entries(d.colours)) {
      if (!C.slots.has(k)) { C.err(`Colour ${q(k)}: is not a colour slot (${someOf([...C.slots.keys()])})`); continue; }
      const h = hex(C, `Colour ${q(k)}`, 'value', v, { need: true }); if (h) out.colours[k] = h;
    }
  }
  for (const [id, s] of C.slots) if (s.control) C.table.set(id, { kind: 'colour' });

  // controls; version 1's on/off parts are controls too
  const { controls, speed } = controlsOf(C, d.controls);
  out.controls = controls;
  derivesOf(C);
  if (isObj(d.parts)) for (const [name, p] of Object.entries(d.parts)) if (isObj(p) && p.params === undefined && ID_PATTERN.test(name) && !RESERVED.has(name) && !C.table.has(name)) C.table.set(name, { kind: 'toggle' });
  const owners = new Map();
  const claim = (key, by) => { if (!key) return; if (owners.has(key)) C.err(`The key ${q(key)} is used twice (by ${owners.get(key)} and ${by}); every colour and control needs its own key`); else owners.set(key, by); };
  for (const [id] of C.slots) claim(id, `colour ${q(id)}`);
  for (const c of controls) if (c.kind !== 'colour') claim(c.key, `control ${q(c.key)}`);
  if (isObj(d.parts)) for (const [name, p] of Object.entries(d.parts)) if (isObj(p) && p.params === undefined) claim(name, `part ${q(name)}`);
  const count = [...C.slots.values()].filter((s) => s.control).length + controls.filter((c) => c.kind !== 'colour').length + (isObj(d.parts) ? Object.values(d.parts).filter((p) => isObj(p) && p.params === undefined).length : 0);
  if (count > L.controls) C.err(`The sprite has ${count} controls in all (colours, sliders, choices, on/offs, parts, speed); the most is ${L.controls}`);

  // the body
  if (kind && size) {
    const body = b[kind];
    let v;
    if (kind === 'rig') v = rigBody(C, body, { metaView, rigColours: rigColours !== undefined && where0 === 'Body: rig colours' ? palette : undefined });
    else if (kind === 'pictures') v = picturesBody(C, body);
    else if (kind === 'emitters') v = emittersBody(C, body, b);
    else if (kind === 'panel') v = panelBody(C, body);
    else if (kind === 'layers') v = layersBody(C, body);
    else if (kind === 'tiles') v = tilesBody(C, body);
    if (v !== undefined) out.body = kind === 'emitters' ? v : { [kind]: v };
  }
  if (out.body && kind === 'rig' && out.body.rig.colours === undefined) delete out.body.rig.colours;

  // top-level attach points
  if (d.points !== undefined) out.points = pointsOf(C, 'Points', d.points);

  // meta
  out.meta = checkMeta(C, d.meta, kind === 'rig' ? C.view : null);
  if (out.meta === undefined) delete out.meta;

  // pivot, grounded, preview later
  out.grounded = d.grounded === undefined ? true : bool(C, where, 'grounded', d.grounded);
  if (size) {
    if (d.pivot === undefined) out.pivot = defaultPivot(size, out.grounded !== false);
    else { const p = pairOf(C, 'pivot', 'pivot', d.pivot, [0, size[0]], [0, size[1]], { whole: true, clamp: false, bind: false }); if (p) out.pivot = p; }
  }

  // parts, when on controls, loops, versions
  out.parts = partsOf(C, d.parts);
  for (const c of controls) {
    if (c.when === undefined) continue;
    const w = checkWhen(C, `Control ${q(c.key)}`, c.when, { self: c.key });
    if (w === undefined) delete c.when; else c.when = w;
  }
  checkLoops(C, controls, out.parts);
  if (d.versions !== undefined) { const v = versionsOf(C, d.versions); if (v) out.versions = v; }

  // clips and preview
  const clips = clipsOf(C, d.clips);
  out.clips = clips;
  const allClips = C.layoutClips === null ? null : [...new Set([...C.layoutClips, ...(C.takenClips ? C.takenClips.keys() : C.baseClips ? C.baseClips.keys() : []), ...Object.keys(clips)])];   // B4x: the clips extends.clips takes, else every clip of the base
  C.clipList = allClips;
  if (allClips && C.loose && C.base && !C.baseClips && !C.takenClips) C.clipList = null;
  const knownClips = C.clipList ? new Set(C.clipList) : null;
  if (!speed && kind && Object.values(clips).some((c) => (c.frames ?? 0) > 1) && kind !== 'panel' && kind !== 'layers' && kind !== 'tiles') C.warn('Controls: there is no speed control; add { "key": "speed", "standard": "speed" } so people can set how fast it moves');
  if (d.preview === undefined) { const first = C.clipList?.[0] ?? Object.keys(clips)[0]; if (first !== undefined) out.preview = first; }
  else if (typeof d.preview !== 'string' || (knownClips && !knownClips.has(d.preview)) || !CLIP_NAME.test(d.preview.replace(/_(down|up|side)$/, ''))) C.err(`preview: ${q(d.preview)} is not one of the clips${knownClips ? ` (${someOf([...knownClips])})` : ''}`);
  else out.preview = d.preview;

  // slice and text area (Contract 8), as data
  const W = C.W, H = C.H;
  if (d.slice !== undefined) {
    const s = perClip(C, 'slice', d.slice, { fields: ['left', 'top', 'right', 'bottom'], check: (place, v) => {
      if (!isObj(v)) { C.err(`${place}: must be { left, top, right, bottom }; got ${say(v)}`); return undefined; }
      knownOnly(C, place, v, ['left', 'top', 'right', 'bottom']);
      const o = {};
      for (const f of ['left', 'top', 'right', 'bottom']) { const x = num(C, place, f, v[f], 0, f === 'left' || f === 'right' ? W : H, { need: true, clamp: false, whole: true }); if (x !== undefined) o[f] = x; }
      if (Object.keys(o).length === 4 && (o.left + o.right >= W || o.top + o.bottom >= H)) { C.err(`${place}: the slice leaves no middle in a ${W} by ${H} frame (left + right and top + bottom must be less than it)`); return undefined; }
      return o;
    } });
    if (s) out.slice = s;
  }
  if (d.textArea !== undefined) {
    const t = perClip(C, 'textArea', d.textArea, { fields: ['x', 'y', 'w', 'h', 'colour'], check: (place, v) => {
      if (!isObj(v)) { C.err(`${place}: must be { x, y, w, h, colour }; got ${say(v)}`); return undefined; }
      knownOnly(C, place, v, ['x', 'y', 'w', 'h', 'colour']);
      const o = {};
      for (const [f, hi] of [['x', W], ['y', H], ['w', W], ['h', H]]) { const x = num(C, place, f, v[f], f === 'w' || f === 'h' ? 1 : 0, hi, { need: true, clamp: false, whole: true }); if (x !== undefined) o[f] = x; }
      if (o.x !== undefined && o.w !== undefined && o.y !== undefined && o.h !== undefined && (o.x + o.w > W || o.y + o.h > H)) { C.err(`${place}: the text area reaches outside the ${W} by ${H} frame`); return undefined; }
      if (v.colour !== undefined) { const c = paintRef(C, `${place}, colour`, v.colour); if (c !== undefined) o.colour = c; }
      return o;
    } });
    if (t) out.textArea = t;
  }

  // materials, styles, made, rev, renamed controls
  if (d.materials !== undefined) {
    if (!isObj(d.materials)) C.err(`materials: must be { "rest": "<material>" }; got ${say(d.materials)}`);
    else { knownOnly(C, 'materials', d.materials, ['rest']); if (d.materials.rest !== undefined) { if (!MATERIAL_IDS.includes(d.materials.rest)) C.err(`materials: rest ${q(d.materials.rest)} is not a material; use one of ${listOf(MATERIAL_IDS)}`); else out.materials = { rest: d.materials.rest }; } }
  }
  if (d.styles !== undefined) {
    const xs = list(C, 'styles', d.styles, 8, { min: 1, what: 'styles' });
    if (xs) {
      const seen = [];
      for (const s of xs) {
        if (typeof s !== 'string' || !C.styleIds.includes(s)) { C.err(`styles: ${q(s)} is not an art style of the site (${listOf(C.styleIds)})`); continue; }
        if (seen.includes(s)) { C.err(`styles: ${q(s)} is listed twice`); continue; }
        seen.push(s);
      }
      out.styles = seen;
    }
  }
  if (d.stylesWhy !== undefined) {
    if (d.styles === undefined) C.warn('stylesWhy: says why the sprite lists its styles; it lists none, so it was dropped');
    else { const w = text(C, 'stylesWhy', 'stylesWhy', d.stylesWhy, L.blurbChars); if (w !== undefined) out.stylesWhy = w; }
  }
  if (d.made === undefined) out.made = { in: 'studio', from: 'new' };
  else if (!isObj(d.made)) C.err(`made: must be { in: "studio" | "library", from, by }; got ${say(d.made)}`);
  else {
    knownOnly(C, 'made', d.made, ['in', 'from', 'by']);
    const madeIn = typeof d.made.in === 'string' && Object.hasOwn(MADE_IN, d.made.in) ? d.made.in : null;
    if (!madeIn) C.err(`made: in must be "studio" (made in the studio) or "library" (a library sprite); got ${say(d.made.in)}`);
    else if (typeof d.made.from !== 'string' || !MADE_IN[madeIn].test(d.made.from)) C.err(madeIn === 'studio' ? `made: from must be "new", "template:<id>" or "library:<id>" for a sprite made in the studio; got ${say(d.made.from)}` : `made: from must be "new" or "code:<id>" for a library sprite; got ${say(d.made.from)}`);
    out.made = { in: madeIn ?? 'studio', from: d.made.from };
    const by = text(C, 'made', 'by', d.made.by, L.nameChars); if (by !== undefined) out.made.by = by;
  }
  if (d.rev !== undefined) { if (typeof d.rev !== 'string' || !REV_RE.test(d.rev)) C.err(`rev: the build writes a short hash of lowercase letters and digits (at most 40); got ${say(d.rev)}`); else out.rev = d.rev; }
  if (d.was !== undefined) {
    if (!isObj(d.was)) C.err(`was: must be { "controls": { "oldKey": "newKey" } }; got ${say(d.was)}`);
    else {
      knownOnly(C, 'was', d.was, ['controls']);
      const names = d.was.controls === undefined ? [] : mapNames(C, 'was controls', d.was.controls, L.controls, 'old key: new key') ?? [];
      const m = {};
      for (const old of names) {
        const now = d.was.controls[old];
        if (!ID_PATTERN.test(old) || RESERVED.has(old)) { C.err(`was: the old key ${q(old)} is not a key`); continue; }
        if (C.table.has(old)) { C.err(`was: ${q(old)} is still a key of the sprite; only a key that was renamed goes in was`); continue; }
        if (typeof now !== 'string' || !C.table.has(now)) { C.err(`was: ${q(old)} is renamed to ${say(now)}, which is not one of the sprite's controls`); continue; }
        m[old] = now;
      }
      if (d.was.controls !== undefined) out.was = { controls: m };
    }
  }

  finalChecks(C, controls);
  return out;
}

/** Checks that need the whole definition: references, unused controls and colours, the caps on what was counted. */
function finalChecks(C, controls = []) {
  // clips named by when, per, motion, slice, text area
  if (C.clipList) {
    const known = new Set(C.clipList);
    for (const [place, name] of C.clipRefs) if (!known.has(name)) C.err(`${place}: ${q(name)} is not a clip of the sprite (${someOf(C.clipList)})`);
  }
  // shapes named by parts, show and hide
  for (const [place, field, id] of C.shapeRefs) if (!C.shapeIds.has(id) && !C.baseShapes.has(id) && !(C.loose && C.base)) C.err(`${place}: ${q(id)} in ${field} is not a shape of the body`);
  // parts named on shapes
  for (const [place, part] of C.partRefs) if (!C.partNames?.has(part)) C.err(`${place}: its part ${q(part)} is not one of the sprite's parts${C.partNames?.size ? ` (${someOf([...C.partNames])})` : ''}; add the part or remove it from the shape`);
  // groups named by outline and cut
  for (const [place, g] of C.groupRefs) if (!C.groups.has(g)) C.warn(`${place}: no shape is in the group ${q(g)}, so this does nothing`);
  // what `scales` names
  for (const [place, what, ids] of C.scaleRefs) for (const id of ids) {
    if (what === 'bones' ? !(C.nodes?.has(id) || C.loose) : !(C.shapeIds.has(id) || C.baseShapes.has(id) || C.loose)) C.err(`${place}: ${q(id)} in scales is not a ${what === 'bones' ? 'bone' : 'shape'} of the body`);
  }
  // every control does something
  for (const c of controls) {
    if (c.standard || c.kind === 'colour' || !c.key) continue;
    const d = C.table.get(c.key);
    if (d?.scales || C.used.has(c.key)) continue;
    C.err(`Control ${q(c.key)}: nothing uses it, so it would do nothing; bind a number to it ({ "from": ${q(c.key)}, ... }), name it in a when, make it a part's choice, or remove it`);
  }
  for (const [id, s] of C.slots) {
    if (C.painted.has(id)) continue;
    if (s.control && !C.anyPiece) C.err(`Colour ${q(id)}: nothing paints it, so its control would do nothing; paint a shape with it or remove it`);
    else if (!C.anyPiece) C.warn(`Colour ${q(id)}: nothing paints it`);
  }
  boundEmitters(C);
  // the caps on what was counted (docs/data-sprites.md 2.7)
  const k = C.cost;
  if (k.written > L.primitives) C.err(`The sprite has ${grand(k.written)} primitives and generator calls written; the most is ${L.primitives}`);
  if (k.generators > L.generatorCalls) C.err(`The sprite has ${k.generators} generator calls; the most is ${L.generatorCalls} generator calls`);
  if (k.pieces > L.pieces) C.err(`The sprite uses pieces ${k.pieces} times; the most is ${L.pieces}`);
  if (k.stampPixels > L.stampPixels) C.err(`The sprite's stamps hold ${grand(k.stampPixels)} pixels in all; the most is ${grand(L.stampPixels)}`);
  if (k.nodes > L.nodes) C.err(`The sprite has ${k.nodes} bones and nodes; the most is ${L.nodes}`);
  if (k.expanded > L.expanded) C.err(`The sprite costs about ${grand(Math.round(k.expanded))} primitives a frame after its generators run; the budget is ${grand(L.expanded)} (use smaller counts)`);
}
