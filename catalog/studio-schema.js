// Studio definitions: the formats and their validator (docs/studio.md, sections 2 and 6; docs/architecture.md, Contract 14).
// A studio sprite is one JSON object (`loadout-sprite`) whose body is either a bone rig (`loadout-rig`, all data) or a
// library body (a code rig with a data layer; the first is the side-view person of rigs/humanoid-figure.js). Nothing in a
// definition is ever run: framework code draws it. So this file is the wall: every definition from the studio, from
// storage, from a link or from a file goes through validateStudio() before anything is drawn.
//
// What the wall guarantees (each is tested in tests/unit/studio-schema-*.test.mjs):
//   - plain data only: no functions, getters, class instances, symbols, loops of objects, undefined in lists;
//   - at most 64 KB of JSON and 20 levels of nesting; text over that is refused before it is parsed;
//   - the keys __proto__, constructor and prototype are dropped wherever they appear, and no id may be a name that
//     every object already has (constructor, toString, ...), so ids are safe to use as keys;
//   - unknown fields dropped (with a warning), numbers finite and clamped to each field's range (with a warning),
//     every count capped, every reference resolved, no loops of bones;
//   - text is returned as given (trimmed), never escaped or interpreted: the page shows it with textContent only.
//     Control and invisible characters are refused.
//
// The wall alone (plain data, the caps, no getter ever run) is exported as plainStudioData() for code that reads a
// definition before it checks it (the bag, links, window.loadout).
//
// TOP-DOWN BODIES (docs/studio.md 2.1; section 9, Q4: in version 1; Contract 2: one clip per direction). Moved here
// from engine/data-sprite.js (studio item S4b), which now passes every definition straight to this file:
//   - ONE rig with `view: "top-down"` and an optional `directions` object: an overlay per direction, any of "down",
//     "up", "side", each { bones: { id: { angle, at (roots only), length, from (children only) } }, shapes: { id: { z,
//     far, hidden, shade, light, and the shape's own geometry: width | from, to, r, offset | at, r | points | at,
//     size } } }. An overlay re-poses and re-proportions the SAME bones and shapes for that view; a direction without
//     one draws the rig as written. Each direction as overlaid also gets the rig's checks (only what the rig as
//     written does not already say is reported, as "rig facing <direction>").
//   - Clips are named `<action>_<down|up|side>` (walk_down, idle_side, ...), at most 40 characters, each with key
//     poses in that direction's rig; a clip with no direction (hurt, die) faces down; side faces right (games mirror
//     it). The style guide's advice applies to the action. Direction names, `directions` and meta view "top-down" need
//     a top-down body.
//
// Every function returns { ok, errors, warnings, value } and never throws. errors block drawing and the bag; warnings are
// advice (or say what was cleaned). value is the cleaned copy (plain JSON) when ok, else null.
// Pure JavaScript with no page, worker or Node in it: the site, the build and the tests all import this file.

import { validateMeta, META_FIELDS, SPRITE_TYPES, SPRITE_ROLES, VIEWS, LICENSES, THEMES, GAME_TYPES } from './schema.js';
import { MATERIAL_IDS } from '../engine/materials.js';
import { POSES, HAIR_STYLES, ITEMS, PIVOT as HUMANOID_PIVOT } from '../rigs/humanoid.js';
import { groundOf } from '../rigs/bones.js';
import { STANCES, MOVES, HELD, HEADGEAR, PACKS } from '../rigs/humanoid-figure.js';
import { POSE_FIELDS, CAPE_KINDS, HERO_HEADGEAR } from '../rigs/humanoid-studio.js';

// ---- the tables ---------------------------------------------------------------------------------------------------

/** The caps on a studio definition (docs/studio.md, section 6); clips, frames and controls equal LIMITS of app/api-source.js. */
export const STUDIO_LIMITS = Object.freeze({
  jsonBytes: 64 * 1024,    // the whole definition as JSON text, UTF-8
  nesting: 20,             // levels of lists and objects inside each other (a real definition uses 8)
  nodes: 40_000,           // values in all; 64 KB of JSON cannot hold more
  idChars: 40,
  nameChars: 60,           // names and labels
  blurbChars: 300,
  wordChars: 30,           // one search word, and the words at the ends of a slider
  metaList: 30,            // entries in one list of meta
  colours: 8,
  bones: 48,
  boneDepth: 16,
  shapes: 160,
  polyPoints: 24,
  ik: 8,
  points: 16,
  controls: 48,            // every control in all: colour slots, sliders, parts, speed
  parts: 16,
  clips: 32,
  framesPerClip: 64,
  frames: 256,             // frames in all clips together
  keysPerClip: 64,
  soundsPerClip: 16,
  frameWidth: 128,
  frameHeight: 96,
  angle: 720,              // degrees either way: two whole turns, for a spin
  radius: 32,              // pixels
  limbWidth: 16,           // whole pixels
  z: 100,
  fps: 30,
  scale: Object.freeze([0.25, 4]),     // what a slider may scale a bone or shape by
  stretch: Object.freeze([0.5, 1.5]),  // what a key may stretch a bone by
  libraryPx: 64,           // a library pose's distances (lift, foot targets), pixels either way
});
const L = STUDIO_LIMITS;

/** The frame sizes a studio sprite may have: the style guide's (section 1, "Frame sizes"), none over 128 by 96. */
export const FRAME_SIZES = Object.freeze([
  [16, 16], [32, 16], [32, 32], [32, 48], [32, 64], [48, 48], [64, 16], [64, 48], [64, 64], [64, 80], [64, 96],
  [96, 32], [96, 64], [96, 96], [128, 96],
].map((s) => Object.freeze(s)));

/** The style guide's standard clips for characters and creatures (section 4): frames, frames per second, whether it loops. */
export const STANDARD_CLIPS = Object.freeze({
  idle: { frames: 8, fps: 7, loop: true },
  walk: { frames: 8, fps: 10, loop: true },
  run: { frames: 8, fps: 14, loop: true },
  hop: { frames: 8, fps: 11, loop: true },
  fly: { frames: 8, fps: 12, loop: true },
  jump: { frames: 8, fps: 11, loop: false },
  attack: { frames: 8, fps: 13, loop: false },
  shoot: { frames: 6, fps: 14, loop: false },
  cast: { frames: 8, fps: 10, loop: false },
  block: { frames: 6, fps: 10, loop: false },
  hurt: { frames: 4, fps: 9, loop: false },
  die: { frames: 8, fps: 10, loop: false },
  victory: { frames: 8, fps: 8, loop: true },
  talk: { frames: 8, fps: 7, loop: true },
  dodge: { frames: 8, fps: 14, loop: false },
});
for (const v of Object.values(STANDARD_CLIPS)) Object.freeze(v);

/** Clip names people reach for that the style guide spells another way (section 4: `attack`, never `bite`), mapped to the standard name. */
export const CLIP_SYNONYMS = Object.freeze({
  bite: 'attack', slash: 'attack', strike: 'attack', swipe: 'attack', hit: 'attack', claw: 'attack', peck: 'attack', sting: 'attack',
  death: 'die', dead: 'die', collapse: 'die', dying: 'die',
  damage: 'hurt', ouch: 'hurt', pain: 'hurt', flinch: 'hurt',
  stand: 'idle', rest: 'idle', breathe: 'idle',
  move: 'walk', step: 'walk', crawl: 'walk', sprint: 'run', leap: 'jump',
  fire: 'shoot', spell: 'cast', guard: 'block', defend: 'block', win: 'victory', cheer: 'victory', speak: 'talk', roll: 'dodge',
});

/** How the motion leaves a key toward the next (docs/studio.md 2.2); `smooth` when a key does not say. */
export const EASES = Object.freeze(['smooth', 'linear', 'in', 'out', 'hold']);

/** The kinds of shape a bone rig draws with (docs/studio.md 2.1). */
export const SHAPE_KINDS = Object.freeze(['limb', 'capsule', 'ellipse', 'poly', 'dot']);

/** Attach-point names of Contract 3, for a point that is one of them. */
export const SOCKET_NAMES = Object.freeze(['hand', 'offhand', 'head', 'back', 'feet', 'muzzle', 'tip']);

/** The views a studio body may have in version 1 (top-down since studio item S4b: docs/studio.md, Q4). */
export const STUDIO_VIEWS = Object.freeze(['side', 'front', 'top-down', 'none']);

/** The three drawn directions of a top-down body, in clip order (Contract 2; side faces right, games mirror it). */
export const TOPDOWN_DIRECTIONS = Object.freeze(['down', 'up', 'side']);

/** What a direction overlay may change on a bone, and on a shape of each kind (besides z, far, hidden, shade, light). */
export const DIRECTION_FIELDS = Object.freeze({
  bone: Object.freeze(['angle', 'at', 'length', 'from']),
  shape: Object.freeze(['z', 'far', 'hidden', 'shade', 'light']),
  kinds: Object.freeze({ limb: Object.freeze(['width']), capsule: Object.freeze(['from', 'to', 'r', 'offset']), ellipse: Object.freeze(['at', 'r']), poly: Object.freeze(['points']), dot: Object.freeze(['at', 'size']) }),
});

const DIR_CLIP_RE = /^(.+)_(down|up|side)$/;

/** Which way a clip of a top-down sprite faces, from its name: 'down', 'up' or 'side'; a name with no direction ('hurt') is 'down'. Arguments: name (a clip name). */
export function directionOf(name) {
  const m = DIR_CLIP_RE.exec(String(name));
  return m ? m[2] : 'down';
}

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
  const patch = (items, changes, allowed) => {
    if (!Array.isArray(items) || !isObj(changes)) return;
    for (const item of items) {
      const c = item && Object.hasOwn(changes, item.id) ? changes[item.id] : null;
      if (!isObj(c)) continue;
      for (const k of allowed(item)) if (Object.hasOwn(c, k)) item[k] = c[k];
    }
  };
  patch(out.bones, over.bones, () => DIRECTION_FIELDS.bone);
  patch(out.shapes, over.shapes, (s) => [...DIRECTION_FIELDS.shape, ...(DIRECTION_FIELDS.kinds[s.kind] ?? [])]);
  return out;
}

/** The library bodies a definition may name; each has a renderer in the framework. */
export const LIBRARY_BODIES = Object.freeze(['humanoid']);

/** The frame of every humanoid library body (rigs/humanoid.js SIZE). */
export const LIBRARY_SIZE = Object.freeze([64, 64]);

/** The anchor of every humanoid library body: rigs/humanoid.js PIVOT ([CX, GROUND], the style guide's [28, 58]). */
export const LIBRARY_PIVOT = Object.freeze([...HUMANOID_PIVOT]);

// The style guide's pivot x for a body that stands in a frame of each size (section 1, "Frame sizes": characters and
// creatures first, since a studio body is one of them); a size it does not list stands in the middle.
const PIVOT_X = { '16x16': 8, '32x32': 16, '32x48': 16, '32x64': 16, '48x48': 24, '64x48': 28, '64x64': 28, '64x80': 32, '96x96': 44, '128x96': 56 };

/**
 * The pivot a sprite gets when it gives none. Standing (grounded): the style guide's x for the size and, as y, the row
 * rigs/bones.js plants feet on (groundOf), so the anchor is where the feet are. Not standing: the frame centre.
 * Arguments: size ([w, h]), grounded (default true).
 */
export function defaultPivot(size, grounded = true) {
  const [w, h] = size;
  if (!grounded) return [Math.floor(w / 2), Math.floor(h / 2)];
  return [PIVOT_X[`${w}x${h}`] ?? Math.floor(w / 2), groundOf({ size: [w, h] })];
}

/** The default pivot (standing) of every frame size, keyed "WxH": what defaultPivot() gives. */
export const STUDIO_PIVOTS = Object.freeze(Object.fromEntries(FRAME_SIZES.map(([w, h]) => [`${w}x${h}`, Object.freeze(defaultPivot([w, h]))])));

/** The parts of a humanoid figure a sprite may let people switch off (rigs/humanoid-figure.js; the cape: rigs/humanoid-studio.js). */
export const LIBRARY_PARTS = Object.freeze(['held', 'headgear', 'mask', 'scarf', 'belt', 'coat', 'pack', 'cape']);

/** The fields of figure.body a library body's slider may set, each 0..1. */
export const LIBRARY_BODY_FIELDS = Object.freeze(['height', 'build', 'head']);

/**
 * What a key of a humanoid library body may hold: the fields of the pose rigs/humanoid.js pose() returns and
 * rigs/humanoid-figure.js adds, each with its kind: px (pixels), angle (degrees), share (0..1), signed (-1..1),
 * point ({ x, y } pixels), arm ({ a, e } degrees), flag (true or false, stepped).
 */
export const HUMANOID_POSE_FIELDS = Object.freeze({
  rootX: 'px', lift: 'px', crouch: 'px', lean: 'angle', headTilt: 'angle', item: 'angle', item2: 'angle',
  sway: 'signed', glow: 'share', lie: 'share', headTurn: 'angle', pull: 'share', fling: 'share', air: 'share', out: 'share', level2: 'share',
  footF: 'point', footB: 'point', armF: 'arm', armB: 'arm',
  blink: 'flag', flash: 'flag', mouth: 'flag', fire: 'flag',
});

/**
 * What a key of a humanoid library body may hold besides HUMANOID_POSE_FIELDS: the fields the figure's own moves add
 * (rigs/humanoid-figure.js throw, toss, steal; ranges, words and null from rigs/humanoid-studio.js POSE_FIELDS): far
 * (share), glint (count: a whole number 0..2), prize (flag), knife (word: 'hand' or 'air', or null). air and knife may be null.
 */
export const HUMANOID_MOVE_FIELDS = Object.freeze({ far: 'share', glint: 'count', prize: 'flag', knife: 'word' });

/** The pattern of a name inside a definition (bones, shapes, slots, parts, clips, keys of controls): a lowercase letter, then letters, digits and dashes, at most 40. */
export const ID_PATTERN = /^[a-z][a-zA-Z0-9-]{0,39}$/;

/** The pattern of a sprite's own id (its file name, sprites/<id>.js): lowercase letters, digits and dashes, at most 40. */
export const SPRITE_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** Names no id may take, because every object already has them (constructor, toString, ...) or they reach its prototype. A frozen list: the check uses its own copy. */
export const RESERVED_IDS = Object.freeze([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
const RESERVED = new Set(RESERVED_IDS);

/** The format names this file reads, and the version of each it reads. */
export const STUDIO_FORMATS = Object.freeze({ 'loadout-sprite': 1, 'loadout-rig': 1 });

// ---- small helpers ------------------------------------------------------------------------------------------------

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060\u2066-\u2069\ufeff]/;
const MADE_FROM_RE = /^(?:new|template:[a-z][a-z0-9-]{0,39}|library:[a-z][a-z0-9-]{0,39})$/;
const SHINY = new Set(['metal', 'water', 'light', 'magic']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const q = (v) => (typeof v === 'string' ? `"${v.length > 40 ? v.slice(0, 40) + '...' : v}"` : say(v));
function say(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toPrecision(6)) : String(v);
  try { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 60) + '...' : s; } catch { return 'something that is not data'; }
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const listOf = (xs) => xs.join(', ');
// a list of names in a message: the first 8 and "and N more", so a definition full of junk cannot make a huge message
const someOf = (names, n = 8) => (names.length > n ? `${names.slice(0, n).join(', ')} and ${names.length - n} more` : names.join(', '));
const round = (n) => Math.round(n * 1e6) / 1e6;

function context(opts = {}) {
  const C = { errors: [], warnings: [], opts: opts && typeof opts === 'object' ? opts : {} };
  C.err = (m) => { C.errors.push(m); };
  C.warn = (m) => { C.warnings.push(m); };
  return C;
}
const result = (C, value) => {
  const ok = C.errors.length === 0;
  return { ok, errors: C.errors, warnings: C.warnings, value: ok ? value : null };
};
const asSet = (v) => {
  if (!v) return null;
  try { return v instanceof Set ? v : new Set(Array.from(v)); } catch { return null; }
};

/** Drops the fields of o that are not in `allowed`, with one warning naming them. */
function knownOnly(C, place, o, allowed) {
  const extra = Object.keys(o).filter((k) => !allowed.includes(k));
  if (extra.length) C.warn(`${place}: dropped what this format does not know: ${someOf(extra)}`);
}

/** A number in [lo, hi]: refused when not a number, clamped (with a warning) when outside. Returns undefined when refused or absent. */
function num(C, place, field, v, lo, hi, { need = false } = {}) {
  if (v === undefined) { if (need) C.err(`${place}: ${field} is missing; give a number from ${lo} to ${hi}`); return undefined; }
  if (typeof v !== 'number' || !Number.isFinite(v)) { C.err(`${place}: ${field} must be a number from ${lo} to ${hi}; got ${say(v)}`); return undefined; }
  const c = Math.min(hi, Math.max(lo, v));
  if (c !== v) C.warn(`${place}: ${field} ${say(v)} is outside ${lo} to ${hi}; kept as ${say(c)}`);
  return c === 0 ? 0 : c;
}

/** A whole number of pixels: rounded with a warning when it is not whole. */
function whole(C, place, field, v) {
  if (v === undefined || Number.isInteger(v)) return v;
  const r = Math.round(v);
  C.warn(`${place}: ${field} is in whole pixels; ${say(v)} was rounded to ${r}`);
  return r;
}

/** A pair [a, b] of numbers, each clamped to its range. */
function pair(C, place, field, v, [alo, ahi], [blo, bhi], { need = false, wholePx = false } = {}) {
  if (v === undefined) { if (need) C.err(`${place}: ${field} is missing; give two numbers, [${field === 'r' ? 'r0, r1' : 'x, y'}]`); return undefined; }
  if (!Array.isArray(v) || v.length !== 2) { C.err(`${place}: ${field} must be two numbers in a list, like [1, 2]; got ${say(v)}`); return undefined; }
  let [a, b] = v;
  if (wholePx) { a = typeof a === 'number' ? whole(C, place, field, a) : a; b = typeof b === 'number' ? whole(C, place, field, b) : b; }
  const x = num(C, place, `${field} (first number)`, a, alo, ahi, { need: true });
  const y = num(C, place, `${field} (second number)`, b, blo, bhi, { need: true });
  return x === undefined || y === undefined ? undefined : [x, y];
}

/** Text: trimmed, 1..max characters (or empty when allowed), no control or invisible characters. Returned as given otherwise. */
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

/** An id: the pattern, not reserved. Returns it, or undefined after an error. */
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

/** A list of at most max entries; refused whole (without walking it) when longer. */
function list(C, place, v, max, { min = 0, what = 'entries', need = false } = {}) {
  if (v === undefined) { if (need || min > 0) C.err(`${place}: ${what} are missing; give a list of ${min ? `${min} to ` : 'at most '}${max}`); return need || min > 0 ? null : []; }
  if (!Array.isArray(v)) { C.err(`${place}: ${what} must be a list; got ${say(v)}`); return null; }
  if (v.length > max) { C.err(`${place}: has ${v.length} ${what}; the most is ${max}`); return null; }
  if (v.length < min) { C.err(`${place}: needs at least ${min} ${what.replace(/s$/, min === 1 ? '' : 's')}`); return null; }
  return v;
}

/** A list of ids that must each be in `known` (a Map or Set); `what` names them in errors. */
function refs(C, place, field, v, known, what, max) {
  const xs = list(C, place, v, max, { what: field });
  if (!xs) return undefined;
  const out = [];
  for (const x of xs) {
    if (typeof x !== 'string' || !known.has(x)) { C.err(`${place}: ${q(x)} in ${field} is not ${what}`); continue; }
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

// ---- reading: JSON text and plain data ----------------------------------------------------------------------------

/** Deepest nesting of lists and objects in JSON text, counted without parsing it (strings skipped). */
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

const utf8Length = (s) => {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
};
const kb = (n) => `${Math.ceil(n / 1024)} KB`;

/**
 * Reads studio JSON text safely: refuses text over 64 KB or nested over 20 deep before parsing, and drops every
 * __proto__, constructor and prototype key while parsing. Returns { ok, errors, warnings, value } (value: the parsed data).
 * Arguments: textIn (the JSON text).
 */
export function parseStudioJson(textIn) {
  const C = context();
  try {
    if (typeof textIn !== 'string') { C.err(`The definition must be JSON text; got ${typeof textIn}`); return result(C, null); }
    // characters are never more than bytes, so a long text is refused without encoding it
    const size = textIn.length > L.jsonBytes ? textIn.length : utf8Length(textIn);
    if (size > L.jsonBytes) {
      C.err(`The definition is ${kb(size)} of text; the most is 64 KB`);
      return result(C, null);
    }
    if (nestingOf(textIn, L.nesting) > L.nesting) { C.err(`The definition is nested more than ${L.nesting} levels deep (lists inside lists); a definition never needs that`); return result(C, null); }
    let removed = 0;
    let value;
    try {
      value = JSON.parse(textIn, (k, v) => { if (PROTO_KEYS.has(k)) { removed++; return undefined; } return v; });
    } catch (e) {
      C.err(`The definition is not JSON and could not be read: ${String(e?.message ?? e).slice(0, 120)}`);
      return result(C, null);
    }
    if (removed) C.warn(`Removed ${removed} key${removed === 1 ? '' : 's'} named __proto__, constructor or prototype: they could change how objects behave`);
    return result(C, value);
  } catch (e) {
    C.err(`The definition could not be read: ${String(e?.message ?? e).slice(0, 120)}`);
    return result(C, null);
  }
}

/**
 * A plain-data copy of v, taken once, reading every field through its descriptor so no getter runs (and a Proxy's get
 * trap never runs; its ownKeys, getPrototypeOf and getOwnPropertyDescriptor traps do, once, and nothing of it is kept).
 * Refuses functions, getters, class instances (named without running code), loops of objects, holes and undefined in
 * lists, nesting over 20, more than 40,000 values and more than 64 KB of text; drops prototype keys. Stops early once a
 * cap is passed. (The walk engine/data-sprite.js had for the top-down overlay, moved here with it in studio item S4b.)
 */
function plainCopy(C, v) {
  let nodes = 0, chars = 0, removed = 0, stopped = false;
  const stack = new Set();
  const fail = (path, m) => { if (!stopped) C.err(`${path || 'The definition'}: ${m}`); };
  const walk = (x, path, depth) => {
    if (stopped) return undefined;
    if (++nodes > L.nodes) { fail('', `holds more than ${L.nodes.toLocaleString('en')} values; it cannot fit in 64 KB`); stopped = true; return undefined; }
    if (typeof x === 'string') {
      chars += x.length;
      if (chars > L.jsonBytes) { fail('', 'is more than 64 KB of text; the most is 64 KB'); stopped = true; return undefined; }
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
        if (PROTO_KEYS.has(k)) { removed++; continue; }
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
  let out;
  try { out = walk(v, '', 0); } catch (e) { C.err(`The definition could not be read: ${String(e?.message ?? e).slice(0, 120)}`); return undefined; }
  if (removed) C.warn(`Removed ${removed} key${removed === 1 ? '' : 's'} named __proto__, constructor or prototype: they could change how objects behave`);
  return out;
}

/** Text or data in, plain data out (or undefined after errors), with the 64 KB cap applied either way. */
function prepare(C, input) {
  if (typeof input === 'string') {
    const p = parseStudioJson(input);
    C.errors.push(...p.errors); C.warnings.push(...p.warnings);
    if (!p.ok) return undefined;
    input = p.value;
  }
  const before = C.errors.length;
  const v = plainCopy(C, input);
  if (C.errors.length > before) return undefined;
  let json;
  try { json = JSON.stringify(v); } catch { C.err('The definition is not plain data'); return undefined; }
  if (json === undefined) { C.err('The definition is empty'); return undefined; }
  const bytes = utf8Length(json);
  if (bytes > L.jsonBytes) { C.err(`The definition is ${kb(bytes)} as JSON; the most is 64 KB`); return undefined; }
  return v;
}

/**
 * The wall of Contract 14 rule 6 alone, for code that must read a definition before checking it: JSON text (read as
 * parseStudioJson reads it) or an object in, a plain-data copy out, with every rule of plainCopy above and the 64 KB cap
 * on the copy as JSON. Nothing in the input runs. Returns { ok, errors, warnings, value } (value: the copy, or null).
 * Arguments: input (a definition, as an object or as JSON text).
 */
export function plainStudioData(input) {
  const C = context();
  try {
    const v = prepare(C, input);
    return result(C, C.errors.length ? null : v);
  } catch (e) {
    C.err(`The definition could not be read: ${String(e?.message ?? e).slice(0, 120)}`);
    return result(C, null);
  }
}

function header(C, place, d, format) {
  if (d.format !== format) {
    C.err(`${place}: format must be "${format}"${typeof d.format === 'string' ? `; got ${q(d.format)}` : ''}`);
    return false;
  }
  if (d.version === undefined) { C.err(`${place}: version is missing; this Loadout reads version ${STUDIO_FORMATS[format]}`); return false; }
  if (typeof d.version !== 'number' || !Number.isInteger(d.version) || d.version < 1) { C.err(`${place}: version must be a whole number; got ${say(d.version)}`); return false; }
  if (d.version > STUDIO_FORMATS[format]) { C.err(`${place}: was made by a newer Loadout (version ${d.version}); this one reads version ${STUDIO_FORMATS[format]}`); return false; }
  return true;
}

// ---- the rig ------------------------------------------------------------------------------------------------------

const RIG_FIELDS = ['format', 'version', 'id', 'name', 'view', 'size', 'colours', 'bones', 'shapes', 'ik', 'points', 'directions'];
const COLOUR_FIELDS = ['id', 'label', 'default', 'material', 'detail'];
const BONE_FIELDS = ['id', 'parent', 'at', 'from', 'angle', 'length', 'min', 'max', 'label'];
const SHAPE_FIELDS = ['id', 'bone', 'kind', 'paint', 'z', 'group', 'far', 'shade', 'light', 'glow', 'hidden', 'part'];
const KIND_FIELDS = { limb: ['width'], capsule: ['from', 'to', 'r', 'offset'], ellipse: ['at', 'r'], poly: ['points'], dot: ['at', 'size'] };
const IK_FIELDS = ['id', 'label', 'bones', 'bend'];
const POINT_FIELDS = ['id', 'bone', 'at', 'angle', 'ground'];

const sizeName = ([w, h]) => `${w} by ${h}`;

/** Checks a rig and returns { rig (the cleaned copy), facts (lookups for the sprite) } or null when it cannot go on. */
function checkRig(C, r, pre = '') {
  const where = pre ? `${pre}rig` : 'The rig';
  if (!isObj(r)) { C.err(`${where}: must be an object with ${listOf(RIG_FIELDS)}; got ${say(r)}`); return null; }
  if (!header(C, where, r, 'loadout-rig')) return null;
  knownOnly(C, where, r, RIG_FIELDS);
  const out = { format: 'loadout-rig', version: 1 };
  out.id = idOf(C, where, r.id, { pattern: SPRITE_ID_PATTERN });
  out.name = text(C, where, 'name', r.name, L.nameChars, { need: true });
  const errorsBefore = C.errors.length;
  if (!STUDIO_VIEWS.includes(r.view)) C.err(`${where}: view must be one of ${listOf(STUDIO_VIEWS)}; got ${say(r.view)}`);
  out.view = r.view;
  let W = L.frameWidth, H = L.frameHeight;
  if (!Array.isArray(r.size) || r.size.length !== 2) C.err(`${where}: size must be [width, height], one of the style guide's frame sizes: ${listOf(FRAME_SIZES.map(sizeName))}; got ${say(r.size)}`);
  else if (!FRAME_SIZES.some(([w, h]) => w === r.size[0] && h === r.size[1])) C.err(`${where}: ${say(r.size)} is not a frame size of the style guide; use one of ${listOf(FRAME_SIZES.map(sizeName))}`);
  else { [W, H] = r.size; out.size = [W, H]; }
  const P = Math.max(W, H);
  const at = (place, field, v, need) => pair(C, place, field, v, [-P, P], [-P, P], { need });

  // colours
  const slots = new Map();
  out.colours = [];
  const cs = list(C, `${pre}Colour slots`, r.colours, L.colours, { min: 1, what: 'colour slots' }) ?? [];
  cs.forEach((c, i) => {
    const place = `${pre}Colour slot ${typeof c?.id === 'string' ? q(c.id) : i + 1}`;
    if (!isObj(c)) { C.err(`${place}: must be an object with ${listOf(COLOUR_FIELDS)}`); return; }
    knownOnly(C, place, c, COLOUR_FIELDS);
    const id = idOf(C, place, c.id);
    if (id && slots.has(id)) { C.err(`${place}: is listed twice; each colour slot needs its own id`); return; }
    const o = { id, label: text(C, place, 'label', c.label, L.nameChars, { need: true }), default: hex(C, place, 'default', c.default, { need: true }) };
    if (c.material !== undefined) {
      if (!MATERIAL_IDS.includes(c.material)) C.err(`${place}: material ${q(c.material)} is not known; use one of ${listOf(MATERIAL_IDS)}`);
      else o.material = c.material;
    }
    const det = bool(C, place, 'detail', c.detail);
    if (det !== undefined) o.detail = det;
    if (id) slots.set(id, o);
    out.colours.push(o);
  });

  // bones
  const bones = new Map();
  out.bones = [];
  const bs = list(C, `${pre}Bones`, r.bones, L.bones, { min: 1, what: 'bones' }) ?? [];
  const raw = [];
  bs.forEach((b, i) => {
    const place = `${pre}Bone ${typeof b?.id === 'string' ? q(b.id) : i + 1}`;
    if (!isObj(b)) { C.err(`${place}: must be an object with ${listOf(BONE_FIELDS)}`); return; }
    knownOnly(C, place, b, BONE_FIELDS);
    const id = idOf(C, place, b.id);
    if (id && bones.has(id)) { C.err(`${place}: is listed twice; each bone needs its own id`); return; }
    let parent = null;
    if (b.parent !== undefined && b.parent !== null) {
      if (typeof b.parent !== 'string') C.err(`${place}: parent must be the id of another bone, or null for a root; got ${say(b.parent)}`);
      else parent = b.parent;
    }
    const o = { id, parent };
    if (parent === null) {
      o.at = pair(C, place, 'at', b.at, [-W, 2 * W], [-H, 2 * H], { need: true });
      if (b.from !== undefined) C.warn(`${place}: from is only for a bone that hangs from another; dropped`);
    } else {
      if (b.at !== undefined) C.warn(`${place}: at is only for a bone with no parent (a root); dropped`);
      const f = num(C, place, 'from', b.from, 0, 1);
      if (f !== undefined) o.from = f;
    }
    o.angle = num(C, place, 'angle', b.angle ?? 0, -L.angle, L.angle);
    o.length = num(C, place, 'length', b.length, 1, P, { need: true });   // at least 1 px: a bone has a direction, and an IK chain can be solved (engine/motion.js ik2)
    const lo = num(C, place, 'min', b.min, -L.angle, L.angle), hi = num(C, place, 'max', b.max, -L.angle, L.angle);
    if (lo !== undefined && hi !== undefined && lo > hi) C.err(`${place}: min (${lo}) is more than max (${hi}); the bend must go from min up to max`);
    if (lo !== undefined) o.min = lo;
    if (hi !== undefined) o.max = hi;
    const lab = text(C, place, 'label', b.label, L.nameChars);
    if (lab !== undefined) o.label = lab;
    if (id) { bones.set(id, o); raw.push({ o, i: raw.length, place }); }
    out.bones.push(o);
  });
  // parents: known, before their children, no loops; depth
  const index = new Map(raw.map(({ o }, i) => [o.id, i]));
  const inLoop = new Set();
  for (const { o } of raw) {
    if (inLoop.has(o.id) || o.parent === null || !bones.has(o.parent)) continue;
    const seen = [o.id];
    let p = o.parent;
    while (p !== null && bones.has(p) && !seen.includes(p) && seen.length <= raw.length) { seen.push(p); p = bones.get(p).parent; }
    if (p !== null && seen.includes(p)) {
      const loop = seen.slice(seen.indexOf(p));
      if (!loop.some((x) => inLoop.has(x))) {
        loop.forEach((x) => inLoop.add(x));
        C.err(loop.length === 1 ? `${pre}Bone ${q(p)}: hangs from itself (a loop); give it another parent or none` : `${pre}Bones ${listOf(loop.map(q))} make a loop: each hangs from the next; one of them must hang from a bone outside the loop`);
      }
    }
  }
  const depth = new Map();
  let deepReported = false;
  for (const { o, i, place } of raw) {
    if (o.parent === null) { depth.set(o.id, 1); continue; }
    if (!bones.has(o.parent)) { C.err(`${place}: its parent ${q(o.parent)} is not a bone of this body`); continue; }
    if (inLoop.has(o.id)) continue;
    if (index.get(o.parent) > i) { C.err(`${place}: its parent ${q(o.parent)} comes after it; list parents before their children`); continue; }
    const d = (depth.get(o.parent) ?? 1) + 1;
    depth.set(o.id, d);
    if (d > L.boneDepth && !deepReported) { deepReported = true; C.err(`${place}: is ${d} bones from its root; the most is ${L.boneDepth}`); }
  }

  // shapes
  const shapes = new Map();
  out.shapes = [];
  const ss = list(C, `${pre}Shapes`, r.shapes, L.shapes, { what: 'shapes' }) ?? [];
  if (Array.isArray(r.shapes) && r.shapes.length === 0) C.warn(`${where}: has no shapes, so nothing is drawn; add a shape to a bone`);
  const groups = new Map();
  ss.forEach((s, i) => {
    const place = `${pre}Shape ${typeof s?.id === 'string' ? q(s.id) : i + 1}`;
    if (!isObj(s)) { C.err(`${place}: must be an object with ${listOf(SHAPE_FIELDS)}`); return; }
    const kind = s.kind;
    const kindOk = SHAPE_KINDS.includes(kind);
    if (!kindOk) C.err(`${place}: kind must be one of ${listOf(SHAPE_KINDS)}; got ${say(kind)}`);
    knownOnly(C, place, s, [...SHAPE_FIELDS, ...(kindOk ? KIND_FIELDS[kind] : Object.values(KIND_FIELDS).flat())]);
    const id = idOf(C, place, s.id);
    if (id && shapes.has(id)) { C.err(`${place}: is listed twice; each shape needs its own id`); return; }
    const o = { id };
    if (typeof s.bone !== 'string' || !bones.has(s.bone)) C.err(`${place}: its bone ${q(s.bone)} is not a bone of this body`);
    o.bone = s.bone;
    o.kind = kind;
    if (typeof s.paint !== 'string' || !slots.has(s.paint)) C.err(`${place}: its colour ${q(s.paint)} is not a colour slot of the body (${listOf([...slots.keys()])})`);
    o.paint = s.paint;
    if (kind === 'limb') {
      if (s.width === undefined) C.err(`${place}: a limb needs a width in whole pixels (2 or more)`);
      else if (typeof s.width !== 'number' || !Number.isFinite(s.width)) C.err(`${place}: width must be a number of whole pixels; got ${say(s.width)}`);
      else if (s.width < 1) C.err(`${place}: width ${say(s.width)} is too thin to draw; a limb is at least 1 pixel (2 or more looks right)`);
      else {
        const w = num(C, place, 'width', whole(C, place, 'width', s.width), 1, L.limbWidth);
        if (w === 1) C.warn(`${place}: a limb 1 pixel thin breaks into stairs when it turns; 2 or more looks right`);
        o.width = w;
      }
    } else if (kind === 'capsule') {
      const f = num(C, place, 'from', s.from, 0, 1), t = num(C, place, 'to', s.to, 0, 1);
      if (f !== undefined) o.from = f;
      if (t !== undefined) o.to = t;
      o.r = pair(C, place, 'r', s.r, [0, L.radius], [0, L.radius], { need: true });
      thickness(C, place, o.r && Math.max(...o.r));
      const off = num(C, place, 'offset', s.offset, -P, P);
      if (off !== undefined) o.offset = off;
    } else if (kind === 'ellipse') {
      o.at = at(place, 'at', s.at, true);
      o.r = pair(C, place, 'r', s.r, [0, L.radius], [0, L.radius], { need: true });
      thickness(C, place, o.r && Math.min(...o.r));
    } else if (kind === 'poly') {
      const pts = Array.isArray(s.points) && s.points.length > L.polyPoints
        ? (C.err(`${place}: a poly has ${s.points.length} points; the most is ${L.polyPoints}`), null)
        : Array.isArray(s.points) && s.points.length < 3 ? (C.err(`${place}: a poly needs 3 to ${L.polyPoints} points`), null)
          : list(C, place, s.points, L.polyPoints, { min: 3, what: 'points', need: true });
      if (pts) o.points = pts.map((p, k) => at(place, `point ${k + 1}`, p, true));
    } else if (kind === 'dot') {
      o.at = at(place, 'at', s.at, true);
      if (s.size !== undefined && s.size !== 1 && s.size !== 2) C.err(`${place}: a dot's size is 1 or 2 pixels; got ${say(s.size)}`);
      o.size = s.size === 2 ? 2 : 1;
    }
    const z = num(C, place, 'z', s.z, -L.z, L.z);
    if (z !== undefined) o.z = z;
    if (s.group !== undefined) { const g = idOf(C, place, s.group, { what: 'group' }); if (g) o.group = g; }
    for (const f of ['far', 'glow', 'hidden']) { const b = bool(C, place, f, s[f]); if (b !== undefined) o[f] = b; }
    const sh = num(C, place, 'shade', s.shade, 0, 2), li = num(C, place, 'light', s.light, 0, 1);
    if (sh !== undefined) o.shade = sh;
    if (li !== undefined) {
      o.light = li;
      const mat = slots.get(o.paint)?.material;
      if (li > 0 && !SHINY.has(mat)) C.warn(`${place}: light ${li} is for metal, glass and wet things (style guide 2); its colour slot is ${mat ?? 'not given a material'}`);
    }
    if (s.part !== undefined) { const p = idOf(C, place, s.part, { what: 'part' }); if (p) o.part = p; }
    if (id) shapes.set(id, o);
    if (o.group && kind !== 'dot') {
      const key = `${o.group}\u0000${o.z ?? 0}`;
      if (!groups.has(key)) groups.set(key, { group: o.group, z: o.z ?? 0, paints: [] });
      const g = groups.get(key);
      if (!g.paints.includes(o.paint)) g.paints.push(o.paint);
    }
    out.shapes.push(o);
  });
  for (const g of groups.values()) if (g.paints.length > 1) C.warn(`${pre}Group ${q(g.group)} (z ${g.z}): mixes colour slots (${listOf(g.paints)}); a group is painted as one shape, in one colour`);

  // IK chains
  const ik = new Map(), chainOf = new Map();
  out.ik = [];
  const ks = list(C, `${pre}IK chains`, r.ik, L.ik, { what: 'IK chains' }) ?? [];
  ks.forEach((k, i) => {
    const place = `${pre}IK ${typeof k?.id === 'string' ? q(k.id) : i + 1}`;
    if (!isObj(k)) { C.err(`${place}: must be an object with ${listOf(IK_FIELDS)}`); return; }
    knownOnly(C, place, k, IK_FIELDS);
    const id = idOf(C, place, k.id);
    if (id && ik.has(id)) { C.err(`${place}: is listed twice; each IK chain needs its own id`); return; }
    const o = { id };
    const lab = text(C, place, 'label', k.label, L.nameChars);
    if (lab !== undefined) o.label = lab;
    if (!Array.isArray(k.bones) || k.bones.length !== 2) C.err(`${place}: bones must be two bones, [upper, lower]; got ${say(k.bones)}`);
    else {
      const [u, l] = k.bones;
      let good = true;
      for (const b of [u, l]) if (typeof b !== 'string' || !bones.has(b)) { C.err(`${place}: ${q(b)} is not a bone of this body`); good = false; }
      if (good && bones.get(l).parent !== u) { C.err(`${place}: ${q(l)} must hang from ${q(u)} (its parent) to make a two-bone chain`); good = false; }
      if (good) for (const b of [u, l]) {
        if (chainOf.has(b)) { C.err(`${place}: bone ${q(b)} is already in IK ${q(chainOf.get(b))}; a bone can be in two IK chains only by mistake: give it one`); good = false; }
        else chainOf.set(b, id);
      }
      o.bones = [u, l];
    }
    if (k.bend !== 1 && k.bend !== -1) C.err(`${place}: bend must be 1 or -1 (which way the joint bends); got ${say(k.bend)}`);
    o.bend = k.bend;
    if (id) ik.set(id, o);
    out.ik.push(o);
  });

  // attach points
  const points = new Map();
  out.points = [];
  const ps = list(C, `${pre}Attach points`, r.points, L.points, { what: 'attach points' }) ?? [];
  ps.forEach((p, i) => {
    const place = `${pre}Point ${typeof p?.id === 'string' ? q(p.id) : i + 1}`;
    if (!isObj(p)) { C.err(`${place}: must be an object with ${listOf(POINT_FIELDS)}`); return; }
    knownOnly(C, place, p, POINT_FIELDS);
    const id = idOf(C, place, p.id);
    if (id && points.has(id)) { C.err(`${place}: is listed twice; each attach point needs its own id`); return; }
    const o = { id };
    if (p.ground === true) {
      const extra = ['bone', 'at', 'angle'].filter((f) => p[f] !== undefined);
      if (extra.length) C.warn(`${place}: a ground point sits on the ground under the body; its ${listOf(extra)} dropped`);
      o.ground = true;
    } else {
      if (p.ground !== undefined && p.ground !== false) C.err(`${place}: ground must be true or false; got ${say(p.ground)}`);
      if (typeof p.bone !== 'string' || !bones.has(p.bone)) C.err(`${place}: its bone ${q(p.bone)} is not a bone of this body`);
      o.bone = p.bone;
      o.at = at(place, 'at', p.at, true);
      const a = num(C, place, 'angle', p.angle, -L.angle, L.angle);
      if (a !== undefined) o.angle = a;
    }
    if (id) points.set(id, o);
    out.points.push(o);
  });

  // a top-down body's direction overlays (its checks between fields too, once the rig as written is sound)
  if (out.view === 'top-down') {
    const dirs = checkDirections(C, where, r.directions, { W, H, bones, shapes });
    if (dirs !== undefined) {
      out.directions = dirs;
      if (C.errors.length === errorsBefore) checkOverlaid(C, where, out);
    }
  } else if (r.directions !== undefined) {
    C.warn(`${where}: directions are for a top-down body (view "top-down"); this one is seen from ${say(r.view)}, so they were dropped`);
  }

  return { rig: out, facts: { W, H, slots, bones, shapes, ik, chainOf, points, view: out.view } };
}

/**
 * Checks a top-down rig's `directions` (an overlay per direction: what changes on which bone and shape) against the
 * cleaned rig (bones and shapes by id, frame W by H): numbers clamped as the rig's own, unknown fields dropped. Returns
 * the cleaned overlays, or undefined when there are none (a warning) or they are not an object (an error).
 */
function checkDirections(C, where, raw, { W, H, bones, shapes }) {
  const at = `${where} directions`, P = Math.max(W, H);
  if (raw === undefined) { C.warn(`${at}: a top-down body has no directions, so down, up and side draw the same body; give down and up their own pose`); return undefined; }
  if (!isObj(raw)) { C.err(`${at}: must be an object of direction: { bones, shapes }; got ${say(raw)}`); return undefined; }
  const out = {};
  for (const dir of Object.keys(raw)) {
    if (!TOPDOWN_DIRECTIONS.includes(dir)) { C.err(`${at}: ${q(dir)} is not a direction; use down, up, side (a game mirrors side for left)`); continue; }
    const o = raw[dir], place0 = `${at}, ${dir}`;
    if (!isObj(o)) { C.err(`${place0}: must be an object with bones and shapes; got ${say(o)}`); continue; }
    const extra = Object.keys(o).filter((k) => k !== 'bones' && k !== 'shapes');
    if (extra.length) C.warn(`${place0}: dropped what a direction does not know: ${someOf(extra)}`);
    const d = {};
    if (o.bones !== undefined) {
      if (!isObj(o.bones)) C.err(`${place0}: bones must be an object of bone id: changes; got ${say(o.bones)}`);
      else for (const id of Object.keys(o.bones)) {
        const place = `${place0}, bone ${q(id)}`;
        const b = bones.get(id);
        if (!b) { C.err(`${place0}: ${q(id)} is not a bone of this body`); continue; }
        const v = o.bones[id];
        if (!isObj(v)) { C.err(`${place}: must be an object with ${listOf(DIRECTION_FIELDS.bone)}; got ${say(v)}`); continue; }
        const unknown = Object.keys(v).filter((k) => !DIRECTION_FIELDS.bone.includes(k));
        if (unknown.length) C.warn(`${place}: dropped what a direction does not know: ${someOf(unknown)}`);
        const x = {};
        const a = num(C, place, 'angle', v.angle, -L.angle, L.angle);
        if (a !== undefined) x.angle = a;
        const l = num(C, place, 'length', v.length, 1, P);
        if (l !== undefined) x.length = l;
        if (v.at !== undefined) {
          // a root's place, clamped per axis as the rig's own (x to [-W, 2W], y to [-H, 2H])
          if (b.parent !== null) C.warn(`${place}: at is only for a bone with no parent (a root); dropped`);
          else { const p = pair(C, place, 'at', v.at, [-W, 2 * W], [-H, 2 * H]); if (p) x.at = p; }
        }
        if (v.from !== undefined) {
          if (b.parent === null) C.warn(`${place}: from is only for a bone that hangs from another; dropped`);
          else { const f = num(C, place, 'from', v.from, 0, 1); if (f !== undefined) x.from = f; }
        }
        if (Object.keys(x).length) (d.bones ??= {})[id] = x;
      }
    }
    if (o.shapes !== undefined) {
      if (!isObj(o.shapes)) C.err(`${place0}: shapes must be an object of shape id: changes; got ${say(o.shapes)}`);
      else for (const id of Object.keys(o.shapes)) {
        const place = `${place0}, shape ${q(id)}`;
        const s = shapes.get(id);
        if (!s) { C.err(`${place0}: ${q(id)} is not a shape of this body`); continue; }
        const v = o.shapes[id];
        if (!isObj(v)) { C.err(`${place}: must be an object of what changes facing ${dir}; got ${say(v)}`); continue; }
        const allowed = [...DIRECTION_FIELDS.shape, ...(DIRECTION_FIELDS.kinds[s.kind] ?? [])];
        const unknown = Object.keys(v).filter((k) => !allowed.includes(k));
        if (unknown.length) C.warn(`${place}: dropped what a direction cannot change on a ${s.kind}: ${someOf(unknown)}`);
        const x = {};
        for (const k of Object.keys(v)) {
          if (!allowed.includes(k)) continue;
          const val = v[k];
          let c;
          if (k === 'z') c = num(C, place, k, val, -L.z, L.z);
          else if (k === 'far' || k === 'hidden') c = bool(C, place, k, val);
          else if (k === 'shade') c = num(C, place, k, val, 0, 2);
          else if (k === 'light') c = num(C, place, k, val, 0, 1);
          else if (k === 'width') c = num(C, place, k, typeof val === 'number' && Number.isFinite(val) ? whole(C, place, k, val) : val, 1, L.limbWidth);
          else if (k === 'from' || k === 'to') c = num(C, place, k, val, 0, 1);
          else if (k === 'offset') c = num(C, place, k, val, -P, P);
          else if (k === 'r') c = pair(C, place, k, val, [0, L.radius], [0, L.radius]);
          else if (k === 'at') c = pair(C, place, k, val, [-P, P], [-P, P]);
          else if (k === 'size') { if (val !== 1 && val !== 2) C.err(`${place}: a dot's size is 1 or 2 pixels; got ${say(val)}`); else c = val; }
          else if (k === 'points') {
            if (!Array.isArray(val) || val.length < 3 || val.length > L.polyPoints) C.err(`${place}: points must be 3 to ${L.polyPoints} points [u, v]; got ${say(val)}`);
            else { const pts = val.map((p, i) => pair(C, place, `point ${i + 1}`, p, [-P, P], [-P, P])); if (pts.every(Boolean)) c = pts; }
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
 * Runs the rig's checks on each direction of a top-down rig as overlaid (directionRig), so the checks between fields
 * (a limb 1 pixel thin, a shape too thin to draw) see the overlaid values too. Only what the rig as written does not
 * already say is reported, as "<where> facing <direction>: ..."; its errors are errors.
 */
function checkOverlaid(C, where, rig) {
  const asRig = (dir) => ({ ...directionRig(rig, dir), view: 'none' });
  const base = validateStudioRig(asRig(null));
  const known = new Set([...base.errors, ...base.warnings]);
  for (const dir of TOPDOWN_DIRECTIONS) {
    if (!Object.hasOwn(rig.directions, dir)) continue;
    const v = validateStudioRig(asRig(dir));
    for (const m of v.errors) if (!known.has(m)) C.err(`${where} facing ${dir}: ${m}`);
    for (const m of v.warnings) if (!known.has(m)) C.warn(`${where} facing ${dir}: ${m}`);
  }
}

function thickness(C, place, r) {
  if (r === undefined || r === null || !Number.isFinite(r)) return;
  if (r < 0.5) C.err(`${place}: is too thin to draw (under 1 pixel across); make its radius 1 or more`);
  else if (r < 1) C.warn(`${place}: is thin, under 2 pixels thick, and breaks into stairs when it turns; make its radius 1 or more`);
}

/**
 * Checks a rig as data (`loadout-rig`, docs/studio.md 2.1) and returns { ok, errors, warnings, value } (value: the cleaned copy).
 * Arguments: input (the rig, as an object or as JSON text), opts (none are used yet; accepted for symmetry).
 */
export function validateStudioRig(input, opts = {}) {
  const C = context(opts);
  try {
    const d = prepare(C, input);
    if (C.errors.length) return result(C, null);
    const r = checkRig(C, d);
    return result(C, r ? r.rig : null);
  } catch (e) {
    C.err(`The rig could not be checked: ${String(e?.message ?? e).slice(0, 120)}`);
    return result(C, null);
  }
}

// ---- the library body (a humanoid figure) --------------------------------------------------------------------------

const COLOUR = 'colour', BOOL = 'bool';
const n = (lo, hi) => ['num', lo, hi];
const oneOf = (xs) => ['enum', xs];
const HELD_KINDS = ['none', ...new Set([...Object.keys(ITEMS), ...Object.keys(HELD)])];
const FIGURE_SPEC = {
  body: { height: n(0, 1), build: n(0, 1), head: n(0, 1) },
  motion: { bounce: n(0, 1), stride: n(0, 1) },
  look: { skin: COLOUR, top: COLOUR, bottom: COLOUR, boots: COLOUR, bareArms: BOOL },
  hair: { style: oneOf(HAIR_STYLES), colour: COLOUR },
  held: { kind: oneOf(HELD_KINDS), length: n(0.25, 3), angle: n(-180, 180), swing: n(0.5, 1.3), metal: COLOUR, wood: COLOUR, hilt: COLOUR, cord: COLOUR },
  headgear: { kind: oneOf(['none', ...HEADGEAR, ...HERO_HEADGEAR]), size: n(0.25, 3), colour: COLOUR, band: COLOUR },
  mask: { colour: COLOUR, drape: n(0, 10) },
  scarf: { kind: oneOf(['none', 'short', 'long']), length: n(0.25, 3), colour: COLOUR },
  belt: { style: oneOf(['plain', 'hero']), colour: COLOUR, buckle: COLOUR },
  cape: { kind: oneOf(['none', ...CAPE_KINDS]), length: n(0.3, 1.8), colour: COLOUR },
  coat: { colour: COLOUR, belt: COLOUR, ragged: n(0, 1), length: n(0, 1.5) },
  pack: { kind: oneOf(['none', ...PACKS]), size: n(0.25, 3), colour: COLOUR, trim: COLOUR, leather: COLOUR, fletching: COLOUR, shaft: COLOUR },
  thrown: { metal: COLOUR, hilt: COLOUR },
  loot: { colour: COLOUR, tie: COLOUR, glint: COLOUR },
};
const FIGURE_FIELDS = ['stance', 'moves', ...Object.keys(FIGURE_SPEC)];
const POSE_NAMES = [...POSES, ...MOVES];

function checkFigure(C, f, pre) {
  const where = `${pre}figure`;
  if (f === undefined) return {};
  if (!isObj(f)) { C.err(`${where}: must be an object (rigs/humanoid-figure.js describes its fields); got ${say(f)}`); return null; }
  knownOnly(C, where, f, FIGURE_FIELDS);
  const out = {};
  if (f.stance !== undefined) {
    if (!Object.hasOwn(STANCES, f.stance) || typeof f.stance !== 'string') C.err(`${where}: stance ${q(f.stance)} is not known; use one of ${listOf(Object.keys(STANCES))}`);
    else out.stance = f.stance;
  }
  if (f.moves !== undefined) {
    if (!isObj(f.moves)) C.err(`${where}: moves must be an object of clip name: pose name`);
    else {
      out.moves = {};
      for (const [clip, pose] of Object.entries(f.moves)) {
        if (!idOf(C, `${where}, moves`, clip, { what: 'clip name' })) continue;
        if (!POSE_NAMES.includes(pose)) { C.err(`${where}, moves: ${q(pose)} for ${q(clip)} is not a pose of the body; use one of ${listOf(POSE_NAMES)}`); continue; }
        out.moves[clip] = pose;
      }
    }
  }
  for (const [part, spec] of Object.entries(FIGURE_SPEC)) {
    const v = f[part];
    if (v === undefined) continue;
    const place = `${where}, ${part}`;
    if (!isObj(v)) { C.err(`${place}: must be an object with ${listOf(Object.keys(spec))}; got ${say(v)}`); continue; }
    knownOnly(C, place, v, Object.keys(spec));
    const o = {};
    for (const [k, t] of Object.entries(spec)) {
      if (v[k] === undefined) continue;
      let x;
      if (t === COLOUR) x = hex(C, place, k, v[k]);
      else if (t === BOOL) x = bool(C, place, k, v[k]);
      else if (t[0] === 'num') x = num(C, place, k, v[k], t[1], t[2]);
      else if (!t[1].includes(v[k])) C.err(`${place}: ${k} ${q(v[k])} is not known; use one of ${listOf(t[1])}`);
      else x = v[k];
      if (x !== undefined) o[k] = x;
    }
    out[part] = o;
  }
  return out;
}

// ---- the sprite ---------------------------------------------------------------------------------------------------

const SPRITE_FIELDS = ['format', 'version', 'id', 'name', 'blurb', 'meta', 'body', 'size', 'pivot', 'grounded', 'colours', 'controls', 'parts', 'clips', 'preview', 'made'];
const CONTROL_FIELDS = ['key', 'label', 'lo', 'hi', 'min', 'max', 'default', 'scales', 'sets'];
const CLIP_FIELDS = ['label', 'frames', 'fps', 'loop', 'keys', 'frameEdits', 'sounds', 'from'];
const RIG_KEY_FIELDS = ['t', 'ease', 'root', 'bones', 'ik', 'stretch', 'show', 'hide'];
const LIB_KEY_FIELDS = ['t', 'ease', ...Object.keys(HUMANOID_POSE_FIELDS), ...Object.keys(HUMANOID_MOVE_FIELDS)];
const EDIT_FIELDS = ['nudge', 'show', 'hide', 'flash'];
const SOUND_FIELDS = ['sound', 'frame', 'preset', 'volume'];

const META_VALUES = { type: SPRITE_TYPES, role: SPRITE_ROLES, view: VIEWS, license: LICENSES, themes: THEMES, gameTypes: GAME_TYPES };

function checkMeta(C, m, viewOfBody) {
  const strict = !!C.opts.strict;
  const gap = strict ? C.err : C.warn;
  if (m === undefined) { gap('Look & name: there is no meta yet (what it is, seen from, themes, game types, words to find it, licence)'); return undefined; }
  if (!isObj(m)) { C.err(`meta: must be an object with ${listOf(META_FIELDS)}; got ${say(m)}`); return undefined; }
  knownOnly(C, 'meta', m, META_FIELDS);
  // A value that is given must be right in every mode (these drive catalogue rows, filters, lookups and links); only a
  // missing value or too few words is a gap. So validateMeta below only ever sees good values, and reports only gaps.
  const out = {};
  for (const k of ['type', 'role', 'view', 'license']) {
    const v = m[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || v.length > L.idChars) { C.err(`meta: ${k} must be a short word; got ${say(v)}`); continue; }
    if (BAD_CHARS.test(v)) { C.err(`meta: ${k} has control or invisible characters; remove them`); continue; }
    if (k === 'view' && v === 'top-down' && viewOfBody && viewOfBody !== 'top-down') { C.err(`meta: view "top-down" needs a top-down body (rig view "top-down"); this body is seen from ${q(viewOfBody)}`); continue; }
    const allowed = META_VALUES[k];
    if (!allowed.includes(v)) { C.err(`meta: ${k} ${q(v)} is not one of ${k === 'role' ? 'the sprite roles (catalog/schema.js SPRITE_ROLES)' : listOf(allowed)}`); continue; }
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
  if (out.view !== undefined && viewOfBody && out.view !== viewOfBody) C.warn(`meta: view ${q(out.view)} is not the body's view ${q(viewOfBody)}`);
  const v = validateMeta(out, 'sprite');
  for (const e of v.errors) gap(`Look & name: ${e}`);
  return out;
}

function checkControls(C, d, facts, lib) {
  const out = [];
  const xs = list(C, 'Controls', d.controls, L.controls, { what: 'controls' }) ?? [];
  let speed = false;
  xs.forEach((c, i) => {
    const place = `Control ${typeof c?.key === 'string' ? q(c.key) : i + 1}`;
    if (!isObj(c)) { C.err(`${place}: must be an object with ${listOf(CONTROL_FIELDS)}`); return; }
    if (c.standard !== undefined) {
      knownOnly(C, place, c, ['key', 'standard', 'label']);
      if (c.standard !== 'speed') { C.err(`${place}: standard ${q(c.standard)} is not known; the only standard control is "speed"`); return; }
      if (c.key !== 'speed') { C.err(`${place}: the standard speed control has the key "speed"`); return; }
      if (speed) { C.err(`${place}: there is already a speed control`); return; }
      speed = true;
      const o = { key: 'speed', standard: 'speed' };
      const lab = text(C, place, 'label', c.label, L.nameChars);
      if (lab !== undefined) o.label = lab;
      out.push(o);
      return;
    }
    knownOnly(C, place, c, CONTROL_FIELDS);
    const o = { key: idOf(C, place, c.key, { what: 'key' }), label: text(C, place, 'label', c.label, L.nameChars, { need: true }) };
    for (const f of ['lo', 'hi']) { const t = text(C, place, f, c[f], L.wordChars); if (t !== undefined) o[f] = t; }
    const [lo, hi] = lib ? [0, 1] : L.scale;
    o.min = num(C, place, 'min', c.min, lo, hi, { need: true });
    o.max = num(C, place, 'max', c.max, lo, hi, { need: true });
    if (o.min !== undefined && o.max !== undefined) {
      if (o.min >= o.max) C.err(`${place}: min (${o.min}) must be less than max (${o.max})`);
      else o.default = num(C, place, 'default', c.default ?? Math.min(o.max, Math.max(o.min, lib ? 0.5 : 1)), o.min, o.max);
    }
    if (lib) {
      if (c.scales !== undefined) C.err(`${place}: a library body's slider sets a field of the body (sets: ${listOf(LIBRARY_BODY_FIELDS)}), not scales`);
      if (!LIBRARY_BODY_FIELDS.includes(c.sets)) C.err(`${place}: sets ${q(c.sets)} is not a field of the body; use one of ${listOf(LIBRARY_BODY_FIELDS)}`);
      else o.sets = c.sets;
    } else {
      if (c.sets !== undefined) C.warn(`${place}: sets is for library bodies; dropped`);
      const s = c.scales;
      const how = 'needs scales: { bones: [bone ids] } or { shapes: [shape ids] }';
      if (!isObj(s) || Object.keys(s).length !== 1 || !['bones', 'shapes'].includes(Object.keys(s)[0])) C.err(`${place}: ${how}; got ${say(s)}`);
      else {
        const [what] = Object.keys(s);
        const known = what === 'bones' ? facts.bones : facts.shapes;
        const ids = refs(C, place, what, s[what], known, `a ${what === 'bones' ? 'bone' : 'shape'} of the body`, what === 'bones' ? L.bones : L.shapes);
        if (ids && !ids.length) C.err(`${place}: ${how}; the list is empty`);
        else if (ids) o.scales = { [what]: ids };
      }
    }
    out.push(o);
  });
  return { controls: out, speed };
}

function checkParts(C, d, facts, lib) {
  const out = {};
  if (d.parts === undefined) return out;
  if (!isObj(d.parts)) { C.err(`Parts: must be an object of name: { label, ${lib ? '' : 'shapes, '}default }; got ${say(d.parts)}`); return out; }
  const names = Object.keys(d.parts);
  if (names.length > L.parts) { C.err(`Parts: has ${names.length} parts; the most is ${L.parts}`); return out; }
  const owner = new Map();
  for (const name of names) {
    const place = `Part ${q(name)}`;
    if (!idOf(C, place, name, { what: 'part name' })) continue;
    if (lib && !LIBRARY_PARTS.includes(name)) { C.err(`${place}: is not a part of the library body; use one of ${listOf(LIBRARY_PARTS)}`); continue; }
    const p = d.parts[name];
    if (!isObj(p)) { C.err(`${place}: must be an object with label${lib ? '' : ', shapes'} and default`); continue; }
    knownOnly(C, place, p, lib ? ['label', 'default'] : ['label', 'shapes', 'default']);
    const o = { label: text(C, place, 'label', p.label, L.nameChars, { need: true }) };
    if (!lib) {
      const own = refs(C, place, 'shapes', p.shapes ?? [], facts.shapes, 'a shape of the body', L.shapes) ?? [];
      for (const s of facts.shapes.values()) if (s.part === name && !own.includes(s.id)) own.push(s.id);
      for (const s of own) {
        if (owner.has(s) && owner.get(s) !== name) C.err(`Shape ${q(s)}: is in two parts (${q(owner.get(s))} and ${q(name)}); a shape belongs to one part`);
        else owner.set(s, name);
      }
      o.shapes = own;
    }
    o.default = bool(C, place, 'default', p.default) ?? true;
    out[name] = o;
  }
  if (!lib) for (const s of facts.shapes.values()) if (s.part && !Object.hasOwn(out, s.part) && !RESERVED.has(s.part)) C.err(`Shape ${q(s.id)}: its part ${q(s.part)} is not one of the sprite's parts; add the part or remove it from the shape`);
  return out;
}

function checkKey(C, place, k, facts, lib, frame) {
  if (!isObj(k)) { C.err(`${place}: must be an object with t and what the key changes`); return null; }
  knownOnly(C, place, k, lib ? LIB_KEY_FIELDS : RIG_KEY_FIELDS);
  const o = { t: num(C, place, 't', k.t, 0, 1, { need: true }) };
  if (k.ease !== undefined) {
    if (!EASES.includes(k.ease)) C.err(`${place}: ease must be one of ${listOf(EASES)}; got ${say(k.ease)}`);
    else o.ease = k.ease;
  }
  if (lib) {
    for (const [f, kind] of Object.entries({ ...HUMANOID_POSE_FIELDS, ...HUMANOID_MOVE_FIELDS })) {
      const v = k[f];
      if (v === undefined) continue;
      if (v === null && POSE_FIELDS[f]?.none) { o[f] = null; continue; }
      if (kind === 'flag') { const b = bool(C, place, f, v); if (b !== undefined) o[f] = b; continue; }
      if (kind === 'word') {
        if (!POSE_FIELDS[f].values.includes(v)) C.err(`${place}: ${f} must be one of ${listOf(POSE_FIELDS[f].values)}${POSE_FIELDS[f].none ? ' or null' : ''}; got ${say(v)}`);
        else o[f] = v;
        continue;
      }
      if (kind === 'count') { const x = num(C, place, f, typeof v === 'number' && Number.isFinite(v) ? whole(C, place, f, v) : v, POSE_FIELDS[f].min, POSE_FIELDS[f].max); if (x !== undefined) o[f] = x; continue; }
      if (kind === 'point' || kind === 'arm') {
        const [a, b] = kind === 'point' ? ['x', 'y'] : ['a', 'e'];
        const lim = kind === 'point' ? L.libraryPx : L.angle;
        // a foot may also say `up`: its knee bends up (a leg lying on the ground, rigs/humanoid.js die)
        const extra = kind === 'point' && isObj(v) && v.up !== undefined ? 1 : 0;
        if (!isObj(v) || Object.keys(v).length !== 2 + extra || v[a] === undefined || v[b] === undefined) { C.err(`${place}: ${f} must be { ${a}, ${b} }${kind === 'point' ? ' (and up: true or false)' : ''}; got ${say(v)}`); continue; }
        const x = num(C, place, `${f}.${a}`, v[a], -lim, lim, { need: true }), y = num(C, place, `${f}.${b}`, v[b], -lim, lim, { need: true });
        const up = extra ? bool(C, place, `${f}.up`, v.up) : undefined;
        if (x !== undefined && y !== undefined && (!extra || up !== undefined)) o[f] = extra ? { [a]: x, [b]: y, up } : { [a]: x, [b]: y };
        continue;
      }
      const [lo, hi] = kind === 'px' ? [-L.libraryPx, L.libraryPx] : kind === 'angle' ? [-L.angle, L.angle] : kind === 'signed' ? [-1, 1] : [0, 1];
      const x = num(C, place, f, v, lo, hi);
      if (x !== undefined) o[f] = x;
    }
    return o;
  }
  const { W, H } = facts;
  if (k.root !== undefined) { const r = pair(C, place, 'root', k.root, [-W, W], [-H, H]); if (r) o.root = r; }
  const map = (field, known, what, [lo, hi], each) => {
    const v = k[field];
    if (v === undefined) return;
    if (!isObj(v)) { C.err(`${place}: ${field} must be an object of id: value; got ${say(v)}`); return; }
    const m = {};
    for (const [id, x] of Object.entries(v)) {
      if (!known.has(id)) { C.err(`${place}: ${q(id)} in ${field} is not ${what}`); continue; }
      const c = each ? each(id, x) : num(C, place, `${field} ${q(id)}`, x, lo, hi, { need: true });
      if (c !== undefined) m[id] = c;
    }
    o[field] = m;
  };
  map('bones', facts.bones, 'a bone of the body', [-L.angle, L.angle]);
  if (o.bones) for (const id of Object.keys(o.bones)) if (facts.chainOf.has(id)) C.warn(`${place}: bone ${q(id)} is placed by IK ${q(facts.chainOf.get(id))}; its angle here is overruled whenever that IK target is set`);
  map('ik', facts.ik, 'an IK chain of the body', [0, 0], (id, x) => pair(C, place, `ik ${q(id)}`, x, [-W, W], [-H, H], { need: true }));
  map('stretch', facts.bones, 'a bone of the body', L.stretch);
  showHide(C, place, k, o, facts);
  return o;
}

function showHide(C, place, k, o, facts) {
  for (const f of ['show', 'hide']) {
    if (k[f] === undefined) continue;
    const ids = refs(C, place, f, k[f], facts.shapes, 'a shape of the body', L.shapes);
    if (ids) o[f] = ids;
  }
  if (o.show && o.hide) for (const id of o.show) if (o.hide.includes(id)) C.err(`${place}: shape ${q(id)} is in both show and hide`);
}

function checkClip(C, name, c, facts, lib) {
  const place = `Clip ${q(name)}`;
  if (!isObj(c)) { C.err(`${place}: must be an object with ${listOf(CLIP_FIELDS)}; got ${say(c)}`); return null; }
  knownOnly(C, place, c, lib ? CLIP_FIELDS : CLIP_FIELDS.filter((f) => f !== 'from'));
  // a top-down body's direction clip (walk_down): the style guide's advice is for its action, its label says both
  const m = facts.view === 'top-down' ? DIR_CLIP_RE.exec(name) : null;
  const action = m ? m[1] : name, dir = m ? m[2] : null;
  const std = Object.hasOwn(STANDARD_CLIPS, action) ? STANDARD_CLIPS[action] : null;
  const o = { label: text(C, place, 'label', c.label, L.nameChars) ?? (dir ? `${cap(action)} (${dir})` : cap(name)) };
  let frames = 1;
  if (typeof c.frames !== 'number' || !Number.isFinite(c.frames)) C.err(`${place}: frames must be a whole number from 1 to ${L.framesPerClip}; got ${say(c.frames)}`);
  else if (!Number.isInteger(c.frames)) C.err(`${place}: frames must be a whole number; got ${say(c.frames)}`);
  else if (c.frames < 1 || c.frames > L.framesPerClip) C.err(`${place}: has ${c.frames} frames; a clip has 1 to ${L.framesPerClip}`);
  else frames = c.frames;
  o.frames = frames;
  o.fps = num(C, place, 'fps', c.fps ?? std?.fps ?? 10, 1, L.fps);
  if (c.loop !== undefined && typeof c.loop !== 'boolean') C.err(`${place}: loop must be true or false; got ${say(c.loop)}`);
  o.loop = typeof c.loop === 'boolean' ? c.loop : std?.loop ?? true;

  // keys
  const ks = list(C, place, c.keys, L.keysPerClip, { what: 'keys' }) ?? [];
  let keys = ks.map((k, i) => checkKey(C, `${place}, key ${i + 1}`, k, facts, lib)).filter(Boolean);
  const sorted = [...keys].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  if (sorted.some((k, i) => k !== keys[i])) { C.warn(`${place}: keys were not in order of t; put in order`); keys = sorted; }
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].t !== undefined && keys[i - 1].t !== undefined && Math.abs(keys[i].t - keys[i - 1].t) < 1e-6) C.err(`${place}: two keys are at the same point (t ${keys[i].t}); merge them or move one`);
  }
  o.keys = keys;

  // frame edits
  if (c.frameEdits !== undefined) {
    if (!isObj(c.frameEdits)) C.err(`${place}: frameEdits must be an object of frame number: changes; got ${say(c.frameEdits)}`);
    else {
      o.frameEdits = {};
      for (const [f, e] of Object.entries(c.frameEdits)) {
        if (!/^(0|[1-9]\d?)$/.test(f) || +f >= frames) { C.warn(`${place}: frame ${f} is not a frame of this clip (it has ${frames}); its changes were dropped`); continue; }
        const ep = `${place}, frame ${f}`;
        if (!isObj(e)) { C.err(`${ep}: must be an object with ${listOf(EDIT_FIELDS)}`); continue; }
        knownOnly(C, ep, e, EDIT_FIELDS);
        const x = {};
        if (e.nudge !== undefined) { const nd = pair(C, ep, 'nudge', e.nudge, [-facts.W, facts.W], [-facts.H, facts.H], { wholePx: true }); if (nd) x.nudge = nd; }
        if (lib && (e.show !== undefined || e.hide !== undefined)) C.err(`${ep}: show and hide are for bone rigs; a library body shows its parts with its pose flags`);
        else showHide(C, ep, e, x, facts);
        const fl = bool(C, ep, 'flash', e.flash);
        if (fl !== undefined) x.flash = fl;
        o.frameEdits[f] = x;
      }
    }
  }

  // sounds
  if (c.sounds !== undefined) {
    const ss = list(C, place, c.sounds, L.soundsPerClip, { what: 'sounds' }) ?? [];
    const known = asSet(C.opts.soundIds);
    o.sounds = [];
    ss.forEach((s, i) => {
      const sp = `${place}, sound ${i + 1}`;
      if (!isObj(s)) { C.err(`${sp}: must be an object with ${listOf(SOUND_FIELDS)}`); return; }
      knownOnly(C, sp, s, SOUND_FIELDS);
      const id = idOf(C, sp, s.sound, { pattern: SPRITE_ID_PATTERN, what: 'sound' });
      if (id && known && !known.has(id)) { C.err(`${sp}: there is no sound ${q(id)} in the library`); return; }
      if (typeof s.frame !== 'number' || !Number.isInteger(s.frame)) { C.err(`${sp}: frame must be a whole number; got ${say(s.frame)}`); return; }
      if (s.frame < 0 || s.frame >= frames) { C.warn(`${place}: frame ${s.frame} is not a frame of this clip (it has ${frames}); its sound was dropped`); return; }
      const x = { sound: id, frame: s.frame };
      const pr = text(C, sp, 'preset', s.preset, L.nameChars);
      if (pr !== undefined) x.preset = pr;
      const vol = num(C, sp, 'volume', s.volume, 0, 1);
      if (vol !== undefined) x.volume = vol;
      o.sounds.push(x);
    });
  }

  if (c.from !== undefined) {
    if (!lib) C.warn(`${place}: from is for library bodies (the pose the keys were made from); dropped`);
    else if (!POSE_NAMES.includes(c.from)) C.err(`${place}: from ${q(c.from)} is not a pose of the library body; use one of ${listOf(POSE_NAMES)}`);
    else o.from = c.from;
  }

  // advice from style guide 4
  if (Object.hasOwn(CLIP_SYNONYMS, action)) { const s = CLIP_SYNONYMS[action]; C.warn(`${place}: the style guide calls this clip "${s}"; name it ${dir ? `${s}_${dir}` : s} and keep the label ${q(o.label)}`); }
  if (std) {
    if (frames !== std.frames) C.warn(`${place}: the style guide's ${action} has ${std.frames} frames; this one has ${frames}`);
    if (o.loop !== std.loop) C.warn(`${place}: the style guide's ${action} ${std.loop ? 'loops' : 'plays once (no loop)'}`);
  }
  if ((action === 'hurt' || action === 'die') && !(o.frameEdits?.['0']?.flash || (lib && keys.some((k) => k.t === 0 && k.flash)))) {
    C.warn(`${place}: the style guide starts ${action} on a white flash; turn on the white flash on frame 0`);
  }
  return o;
}

function checkClips(C, d, facts, lib) {
  if (!isObj(d.clips)) { C.err(`Clips: give at least one clip, as an object of name: clip; got ${say(d.clips)}`); return null; }
  const names = Object.keys(d.clips);
  if (!names.length) { C.err('Clips: give at least one clip (idle is the usual first)'); return null; }
  if (names.length > L.clips) { C.err(`Clips: has ${names.length} clips; the most is ${L.clips}`); return null; }
  const out = {};
  let total = 0;
  for (const name of names) {
    const m = DIR_CLIP_RE.exec(name);
    if (m) {
      // <action>_<down|up|side>: a direction clip, only for a top-down body
      if (facts.view !== 'top-down') { C.err(`Clip ${q(name)}: a name ending _down, _up or _side is a direction clip, for a top-down body; this body is seen from ${q(facts.view)}`); continue; }
      if (!ID_PATTERN.test(m[1]) || name.length > L.idChars) { C.err(`Clip ${q(name)}: clip name ${q(name)} must be an action (a lowercase letter, then letters, digits and dashes) and _down, _up or _side, at most ${L.idChars} characters`); continue; }
      const other = `${m[1]}-${m[2]}`;
      if (names.includes(other)) C.err(`Clip ${q(name)}: there is also a clip ${q(other)}; a name may be written only one way (use ${q(name)})`);
    } else if (!idOf(C, `Clip ${q(name)}`, name, { what: 'clip name' })) continue;
    const c = checkClip(C, name, d.clips[name], facts, lib);
    if (c) { out[name] = c; total += c.frames; }
  }
  if (total > L.frames) C.err(`Clips: have ${total} frames in all; the most is ${L.frames}`);
  if (facts.view === 'top-down') {
    const missing = ['walk_down', 'walk_up', 'walk_side'].filter((n) => !names.includes(n));
    if (missing.length) C.warn(`Clips: a top-down sprite walks in three directions (Contract 2); add ${missing.join(', ')}`);
  }
  return out;
}

/**
 * Checks a studio sprite (`loadout-sprite`, docs/studio.md 2.3) and returns { ok, errors, warnings, value } (value: the cleaned copy, with size, pivot, grounded, colours, preview and made filled in).
 * Arguments: input (the definition, as an object or as JSON text), opts { strict (gaps in meta, such as a missing licence or too few words, are errors, not advice: only for a file added to the library, route 1; the studio, the bag and export do not pass it (Contract 14 rule 7). A meta value that is given but wrong is an error either way), soundIds (the sound ids that exist; when given, every sound must be one), catalogIds (ids already in the library; the id may not be one) }.
 */
export function validateStudioSprite(input, opts = {}) {
  const C = context(opts);
  try {
    const d = prepare(C, input);
    if (C.errors.length) return result(C, null);
    return result(C, checkSprite(C, d));
  } catch (e) {
    C.err(`The definition could not be checked: ${String(e?.message ?? e).slice(0, 120)}`);
    return result(C, null);
  }
}

function checkSprite(C, d) {
  const where = 'The sprite';
  if (!isObj(d)) { C.err(`${where}: must be an object with ${listOf(SPRITE_FIELDS)}; got ${say(d)}`); return null; }
  if (!header(C, where, d, 'loadout-sprite')) return null;
  knownOnly(C, where, d, SPRITE_FIELDS);
  const out = { format: 'loadout-sprite', version: 1 };
  out.id = idOf(C, where, d.id, { pattern: SPRITE_ID_PATTERN });
  const taken = asSet(C.opts.catalogIds);
  if (out.id && taken?.has(out.id)) C.err(`${where}: the id ${q(out.id)} is already used by a sprite in the library; choose another`);
  out.name = text(C, where, 'name', d.name, L.nameChars, { need: true });
  out.blurb = text(C, where, 'blurb', d.blurb, L.blurbChars, { empty: true }) ?? '';

  // body
  let facts = null, lib = false;
  const b = d.body;
  if (!isObj(b)) C.err(`Body: must be { rig: {...} } or { library: "humanoid", figure: {...} }; got ${say(b)}`);
  else if (b.rig !== undefined && b.library !== undefined) C.err('Body: give either rig or library, not both');
  else if (b.rig === undefined && b.library === undefined) C.err('Body: give either rig (a bone rig) or library (a body from the library)');
  else if (b.rig !== undefined) {
    knownOnly(C, 'Body', b, ['rig']);
    const r = checkRig(C, b.rig, 'Body: ');
    if (r) { out.body = { rig: r.rig }; facts = r.facts; }
  } else {
    lib = true;
    knownOnly(C, 'Body', b, ['library', 'figure']);
    if (!LIBRARY_BODIES.includes(b.library)) C.err(`Body: library ${q(b.library)} is not a library body; the library bodies are ${listOf(LIBRARY_BODIES)}`);
    else {
      const fig = checkFigure(C, b.figure, 'Body: ');
      if (fig) out.body = { library: b.library, figure: fig };
      const none = new Map();
      facts = { W: LIBRARY_SIZE[0], H: LIBRARY_SIZE[1], slots: none, bones: none, shapes: none, ik: none, chainOf: none, points: none, view: 'side' };
    }
  }
  out.meta = checkMeta(C, d.meta, facts?.view);
  if (out.meta === undefined) delete out.meta;
  if (!facts) return null;
  const { W, H } = facts;

  // size, pivot, grounded
  out.size = [W, H];
  if (d.size !== undefined && !(Array.isArray(d.size) && d.size[0] === W && d.size[1] === H)) C.warn(`size comes from the body (${sizeName([W, H])}); the given size ${say(d.size)} was dropped`);
  out.grounded = d.grounded === undefined ? true : bool(C, where, 'grounded', d.grounded);
  if (d.pivot === undefined) out.pivot = lib ? [...LIBRARY_PIVOT] : defaultPivot([W, H], out.grounded !== false);
  else {
    const p = pair(C, 'pivot', 'pivot', d.pivot, [0, W], [0, H], { wholePx: true });
    if (p) out.pivot = p;
  }

  // colours
  out.colours = {};
  if (d.colours !== undefined && !isObj(d.colours)) C.err(`Colours: must be an object of slot: "#rrggbb"; got ${say(d.colours)}`);
  else {
    const given = d.colours ?? {};
    const keys = Object.keys(given);
    if (lib && keys.length > L.colours) C.err(`Colours: has ${keys.length}; the most is ${L.colours}`);
    else for (const k of keys) {
      if (!lib && !facts.slots.has(k)) { C.err(`Colour ${q(k)}: is not a colour slot of the body (${listOf([...facts.slots.keys()])})`); continue; }
      if (lib && !idOf(C, 'Colours', k, { what: 'colour name' })) continue;
      const h = hex(C, `Colour ${q(k)}`, 'value', given[k], { need: true });
      if (h) out.colours[k] = h;
    }
    if (!lib) for (const [id, s] of facts.slots) if (!Object.hasOwn(out.colours, id) && s.default) out.colours[id] = s.default;
  }

  // controls and parts, and every key once
  const { controls, speed } = checkControls(C, d, facts, lib);
  out.controls = controls;
  out.parts = checkParts(C, d, facts, lib);
  const owners = new Map();
  const claim = (key, by) => {
    if (!key) return;
    if (owners.has(key)) C.err(`The key ${q(key)} is used twice (by ${owners.get(key)} and ${by}); every control needs its own key`);
    else owners.set(key, by);
  };
  if (lib) for (const k of Object.keys(out.colours)) claim(k, `colour ${q(k)}`);
  else for (const [id, s] of facts.slots) if (!s.detail) claim(id, `colour slot ${q(id)}`);
  for (const c of controls) claim(c.key, `control ${q(c.key)}`);
  for (const p of Object.keys(out.parts)) claim(p, `part ${q(p)}`);
  if (owners.size > L.controls) C.err(`The sprite has ${owners.size} controls in all (colours, sliders, parts, speed); the most is ${L.controls}`);

  // clips, preview, made
  const clips = checkClips(C, d, facts, lib);
  if (clips) {
    out.clips = clips;
    if (!speed && Object.values(clips).some((c) => c.frames > 1)) C.warn('Controls: there is no speed control; add { "key": "speed", "standard": "speed" } so people can set how fast it moves');
    const names = Object.keys(clips);
    if (d.preview === undefined) out.preview = names[0];
    else if (typeof d.preview !== 'string' || !Object.hasOwn(clips, d.preview)) C.err(`preview: ${q(d.preview)} is not one of the clips (${listOf(names)})`);
    else out.preview = d.preview;
  }
  if (d.made === undefined) out.made = { in: 'studio', from: 'new' };
  else if (!isObj(d.made)) C.err(`made: must be { in: "studio", from, by }; got ${say(d.made)}`);
  else {
    knownOnly(C, 'made', d.made, ['in', 'from', 'by']);
    if (d.made.in !== 'studio') C.err(`made: in must be "studio"; got ${say(d.made.in)}`);
    if (typeof d.made.from !== 'string' || !MADE_FROM_RE.test(d.made.from)) C.err(`made: from must be "new", "template:<id>" or "library:<id>"; got ${say(d.made.from)}`);
    out.made = { in: 'studio', from: d.made.from };
    const by = text(C, 'made', 'by', d.made.by, L.nameChars);
    if (by !== undefined) out.made.by = by;
  }
  return out;
}

/**
 * Checks any studio definition, picking the check by its format ("loadout-sprite" or "loadout-rig"), and returns { ok, errors, warnings, value }.
 * Arguments: input (an object or JSON text), opts (as validateStudioSprite takes them).
 */
export function validateStudio(input, opts = {}) {
  const C = context(opts);
  try {
    const d = prepare(C, input);
    if (C.errors.length) return result(C, null);
    if (isObj(d) && d.format === 'loadout-rig') { const r = checkRig(C, d); return result(C, r ? r.rig : null); }
    if (isObj(d) && d.format === 'loadout-sprite') return result(C, checkSprite(C, d));
    C.err(`The definition: format must be "loadout-sprite" (a sprite) or "loadout-rig" (a rig); got ${isObj(d) ? say(d.format) : say(d)}`);
    return result(C, null);
  } catch (e) {
    C.err(`The definition could not be checked: ${String(e?.message ?? e).slice(0, 120)}`);
    return result(C, null);
  }
}
