// Pieces: shared data that many sprites use by name (docs/data-sprites.md sections 1.2 and 3.3, Contract 15 rule 5).
// A piece is a base (a whole rig with its clips), a part (hair, headgear), a held thing (a sword), an interface skin,
// a tile material, a font or a stamp. It is a JSON file in the pieces folder at the site's top, one file per version:
//
//   pieces/<kind>-<name>.v<v>.json        for example pieces/part-hair-bob.v1.json is the piece part:hair-bob, version 1
//
// and an asset names it with { "use": "<kind>:<name>", "v": <n>, ...args, "paint": { <piece slot>: <asset paint> } }
// wherever the design allows a piece (a `kind: "use"` shape, `extends`, a generator's `place`, a tile `material`,
// a panel `skin`), or as the short text "font:chunky@1" in a text's `font`. A released version never changes; a
// changed look is a new file with the next version (tools/lib/pieces-index.mjs pins released versions by hash).
//
// What a piece file holds (the envelope; the body is checked by the v2 schema through the `check` hook):
//   { "format": "loadout-piece", "version": 1, "id": "part:hair-bob", "v": 1, "name": "Bob", "about": "One sentence.",
//     "slots": [{ id, label?, default?, material? }],   its own colour slots; a use maps them with `paint`
//     "args": { <name>: { type, ... } },                 what a use may set (types as engine/gen/args.js names them)
//     "made": { by?, on?, from? },                       optional, where it came from (a code rig it was baked from)
//     "body": { ... } }                                  the kind's data: PIECE_KINDS says which field each kind needs
//
// Loading: a store (createPieceStore) reads files through a reader (fetch on the site, the disk in Node through
// tools/lib/pieces-index.mjs), checks each once, freezes it and keeps it for the visit, loads what it uses in turn,
// then hands pieces out synchronously (get), so the resolver and dataSprite never wait inside a frame.
// Pure JavaScript: runs unchanged in the browser and in Node; nothing here touches a page or the disk.
import { plainData } from '../catalog/plain-data.js';
import { MATERIAL_IDS } from './materials.js';

/** The kinds of piece: what each is, and the body field it is drawn from (null: the kind's own module checks it). */
export const PIECE_KINDS = Object.freeze({
  base: Object.freeze({ about: 'A whole bone rig with its clips that a character or creature extends', needs: 'rig' }),
  part: Object.freeze({ about: 'Something worn on a bone: hair, headgear, a cape, a pack, a belt', needs: 'draw' }),
  held: Object.freeze({ about: 'Something held in a hand: a sword, a staff, a lantern', needs: 'draw' }),
  skin: Object.freeze({ about: 'The look of a family of interface pieces (wood, candy, crystal)', needs: null }),
  material: Object.freeze({ about: 'A tile material: fill, edges and band rules shared by tilesets', needs: null }),
  font: Object.freeze({ about: 'Pixel glyphs that the text primitive draws', needs: 'glyphs' }),
  stamp: Object.freeze({ about: 'A small block of pixels (an eye, a clod, a rivet), moved and never turned', needs: 'rows' }),
});

/** The caps of a piece and of the pieces one definition may use (docs/data-sprites.md 2.7: pieces used at most 24). */
export const PIECE_LIMITS = Object.freeze({
  jsonBytes: 128 * 1024,   // one piece file, as JSON text
  name: 40,                // characters of `name`
  about: 200,              // characters of `about`
  slots: 12,               // colour slots of one piece
  args: 16,                // args one piece takes
  uses: 24,                // distinct pieces one piece names itself
  usesPerAsset: 24,        // distinct pieces one definition names
  closure: 64,             // pieces one definition loads in all, with what they use in turn
  depth: 4,                // a piece using a piece using a piece...: links in the longest chain
  version: 999,            // the highest version number
});

/** The format word and version every piece file starts with. */
export const PIECE_FORMAT = Object.freeze({ format: 'loadout-piece', version: 1 });

/** The fields a piece file may have at the top; others are dropped with a warning. */
export const PIECE_FIELDS = Object.freeze(['format', 'version', 'id', 'v', 'name', 'about', 'slots', 'args', 'made', 'body']);

/** Where a `use` stands decides the kind it must name (a field `extends` takes a base, and so on). */
export const PLACE_KINDS = Object.freeze({ extends: ['base'], font: ['font'], skin: ['skin'], material: ['material'] });

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const SLOT_ID = /^[a-z][a-zA-Z0-9-]{0,23}$/;
const ARG_NAME = /^[a-z][a-zA-Z0-9]{0,23}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const FILE = /^([a-z]+)-([a-z][a-z0-9-]{0,39})\.v([1-9][0-9]{0,2})\.json$/;
const SHORT = /^([a-z]+):([^@]*)@(.*)$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isVersion = (v) => Number.isInteger(v) && v >= 1 && v <= PIECE_LIMITS.version;
// names every object already has (toString, valueOf, constructor...): refused as piece names, slot ids and arg names,
// so no lookup by name can find one on Object.prototype instead of in the data
const INHERITED = new Set(Object.getOwnPropertyNames(Object.prototype));
const inherited = (s) => INHERITED.has(s);
const inheritedError = (s) => `"${s}" is a name every object already has; choose another`;
const utf8Bytes = (s) => new TextEncoder().encode(s).length;

/** The text key of one piece version, `kind:name@v`: what caches, indexes and pins are keyed on. Arguments: id, v. */
export function refKey(id, v) { return `${id}@${v}`; }

/** The file of one piece version, relative to the site's folder. Arguments: id (`kind:name`), v. */
export function pieceFile(id, v) {
  const i = String(id).indexOf(':');
  return `pieces/${String(id).slice(0, i)}-${String(id).slice(i + 1)}.v${v}.json`;
}

/**
 * Reads a reference to a piece. Takes { use: "kind:name", v }, the pair ("kind:name", v) or the short text
 * "kind:name@v". Returns { ok: true, ref, id, kind, name, v, file } or { ok: false, error } with plain words.
 */
export function parsePieceRef(x, v) {
  let id, ver;
  if (typeof x === 'string' && v === undefined && x.includes('@')) {
    const m = SHORT.exec(x);
    if (!m) return { ok: false, error: `"${x.slice(0, 60)}" is not a piece reference; write kind:name@version` };
    id = `${m[1]}:${m[2]}`;
    ver = /^[0-9]+$/.test(m[3]) ? Number(m[3]) : m[3];
  } else if (typeof x === 'string') { id = x; ver = v; }
  else if (isObj(x) && typeof x.use === 'string') { id = x.use; ver = x.v; }
  else return { ok: false, error: 'is not a piece reference; write { "use": "kind:name", "v": 1 }' };
  const i = id.indexOf(':');
  if (i < 0) return { ok: false, error: `"${id.slice(0, 60)}" does not say its kind; a piece is named kind:name (part:hair)` };
  const kind = id.slice(0, i), name = id.slice(i + 1);
  if (!Object.hasOwn(PIECE_KINDS, kind)) return { ok: false, error: `"${kind.slice(0, 20)}" is not a kind of piece; the kinds are ${Object.keys(PIECE_KINDS).join(', ')}` };
  if (!NAME.test(name)) return { ok: false, error: `"${name.slice(0, 60)}" is not a piece name: lowercase letters, digits and hyphens, starting with a letter, at most 40` };
  if (inherited(name)) return { ok: false, error: `${kind}:${name}: ${inheritedError(name)}` };
  if (ver === undefined) return { ok: false, error: `${id} is named without a version; write "v": 1 (a definition always names the version it was made with)` };
  if (!isVersion(ver)) return { ok: false, error: `${id}: the version must be a whole number from 1 to ${PIECE_LIMITS.version}; got ${JSON.stringify(ver)?.slice(0, 20)}` };
  return { ok: true, ref: refKey(id, ver), id, kind, name, v: ver, file: pieceFile(id, ver) };
}

/** Reads a piece file name (with or without the folder) back into its reference; { ok: false, error } when it is not one. */
export function refOfFile(file) {
  const base = String(file).split('/').pop();
  const m = FILE.exec(base);
  if (!m) return { ok: false, error: `${base} is not a piece file name; it must be <kind>-<name>.v<version>.json` };
  const r = parsePieceRef(`${m[1]}:${m[2]}`, Number(m[3]));
  return r.ok ? r : { ok: false, error: `${base}: ${r.error}` };
}

/**
 * Every piece a definition (or a piece's body) names, in the order they stand: [{ ref, id, kind, v, path, place,
 * paint, args, node }] for good ones and [{ path, place, error }] for bad ones. A `use` counts only when its text
 * holds a colon (a tile group's use: "ground" is not a piece); so does a `font` text (a text's "font:chunky@1").
 * place is the field the use stands in when that decides its kind (extends, font, skin, material, place), else null.
 * Arguments: definition (plain data, already through the wall), path (where it sits, for messages).
 */
export function usesOf(definition, path = '') {
  const out = [];
  const seen = new Set();
  const walk = (x, p, key, depth) => {
    if (depth > 24 || x === null || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) { x.forEach((y, i) => walk(y, `${p}[${i}]`, key, depth + 1)); return; }
    if (x.kind === 'use' && (typeof x.use !== 'string' || !x.use.includes(':'))) {
      // only a tile group may write a use without a colon; a `kind: "use"` shape always names a piece
      out.push({ path: p, place: null, error: typeof x.use === 'string'
        ? `a "use" shape names a piece as kind:name (part:hair, held:sword); "${x.use.slice(0, 40)}" does not say its kind`
        : 'a "use" shape names a piece as kind:name in "use" ({ "kind": "use", "use": "part:hair", "v": 1 })' });
    } else if (typeof x.use === 'string' && x.use.includes(':')) {
      const r = parsePieceRef(x);
      const place = Object.hasOwn(PLACE_KINDS, key) || key === 'place' ? key : null;
      out.push(r.ok ? { ref: r.ref, id: r.id, kind: r.kind, v: r.v, path: p, place, paint: x.paint, args: x.args, node: x } : { path: p, place, error: r.error });
    }
    for (const k of Object.keys(x)) {
      const y = x[k];
      const q = p ? `${p}.${k}` : k;
      if (k === 'font' && typeof y === 'string' && y.includes(':')) {
        const r = parsePieceRef(y);
        out.push(r.ok ? { ref: r.ref, id: r.id, kind: r.kind, v: r.v, path: q, place: 'font', paint: undefined, args: undefined, node: x } : { path: q, place: 'font', error: r.error });
      } else if (y && typeof y === 'object') walk(y, q, k, depth + 1);
    }
  };
  walk(definition, path, null, 0);
  return out;
}

/** The distinct references a checked piece names itself, in the order first named. Arguments: piece. */
export function pieceUses(piece) {
  return [...new Set(usesOf(piece && piece.body, 'body').filter((u) => u.ref).map((u) => u.ref))];
}

/** Freezes a plain-data value all the way down and returns it (a loaded piece is shared by every sprite on the page). */
export function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); for (const k of Object.keys(x)) deepFreeze(x[k]); }
  return x;
}

/**
 * Checks one piece file: the plain-data wall, the envelope (format, id, v, name, about, slots, args, made, body and
 * the field its kind needs, the pieces it names) and then, if the envelope passed, the hook `check(piece)` for the
 * body's own rules (the v2 schema supplies it; it may return { errors, warnings }, a list of errors, or nothing).
 * Returns { ok, piece (cleaned, deep-frozen; null when not ok), errors, warnings, uses: [refs] }; never throws.
 * Arguments: input (JSON text or a value), opts { file (its file name, which must match id and v), check }.
 */
export function validatePiece(input, opts = {}) {
  const errors = [], warnings = [];
  const done = (piece = null, uses = []) => ({ ok: errors.length === 0, piece: errors.length ? null : piece, errors, warnings, uses });
  let value = input;
  if (typeof input === 'string') {
    const bytes = input.length > PIECE_LIMITS.jsonBytes ? input.length : utf8Bytes(input);   // characters <= bytes: skip encoding a text already too long
    if (bytes > PIECE_LIMITS.jsonBytes) { errors.push(`The piece is ${Math.ceil(bytes / 1024)} KB of text (UTF-8); the most is ${PIECE_LIMITS.jsonBytes / 1024} KB`); return done(); }
    try { value = JSON.parse(input); } catch (e) { errors.push(`The piece is not valid JSON (${String(e.message).slice(0, 120)})`); return done(); }
  }
  const wall = plainData(value, { jsonBytes: PIECE_LIMITS.jsonBytes * 2, nesting: 20, nodes: 80_000 });
  if (wall.errors.length) { errors.push(...wall.errors.slice(0, 20)); return done(); }
  const p = wall.value;
  if (!isObj(p)) { errors.push('A piece is an object of fields ({ "format": "loadout-piece", ... })'); return done(); }
  if (utf8Bytes(JSON.stringify(p)) > PIECE_LIMITS.jsonBytes) { errors.push(`The piece is more than ${PIECE_LIMITS.jsonBytes / 1024} KB as JSON (UTF-8); the most is ${PIECE_LIMITS.jsonBytes / 1024} KB`); return done(); }
  const piece = {};
  for (const k of Object.keys(p)) {
    if (PIECE_FIELDS.includes(k)) piece[k] = p[k];
    else warnings.push(`${k}: not a field of a piece; dropped (the fields are ${PIECE_FIELDS.join(', ')})`);
  }
  if (piece.format !== PIECE_FORMAT.format) errors.push(`format: must be "${PIECE_FORMAT.format}"`);
  if (piece.version !== PIECE_FORMAT.version) errors.push(`version: must be ${PIECE_FORMAT.version} (the format's version; the piece's own version is v)`);
  let ref = null;
  if (typeof piece.id !== 'string') errors.push('id: missing; a piece is named kind:name (part:hair-bob)');
  else if (!isVersion(piece.v)) errors.push(`v: the piece's version must be a whole number from 1 to ${PIECE_LIMITS.version}`);
  else {
    const r = parsePieceRef(piece.id, piece.v);
    if (!r.ok) errors.push(`id: ${r.error}`); else ref = r;
  }
  if (ref && opts.file != null) {
    const base = String(opts.file).split('/').pop();
    const want = ref.file.split('/').pop();
    if (base !== want) errors.push(`${base}: the piece ${ref.ref} must be in the file ${want}`);
  }
  if (typeof piece.name !== 'string' || !piece.name.trim() || piece.name.length > PIECE_LIMITS.name) errors.push(`name: a short name of 1 to ${PIECE_LIMITS.name} characters`);
  if (typeof piece.about !== 'string' || !piece.about.trim() || piece.about.length > PIECE_LIMITS.about) errors.push(`about: one sentence of at most ${PIECE_LIMITS.about} characters that says what the piece is`);
  // slots
  if (piece.slots === undefined) piece.slots = [];
  if (!Array.isArray(piece.slots)) errors.push('slots: a list of colour slots [{ id, label, default, material }]');
  else {
    if (piece.slots.length > PIECE_LIMITS.slots) errors.push(`slots: ${piece.slots.length} slots; the most is ${PIECE_LIMITS.slots}`);
    const ids = new Set();
    piece.slots.slice(0, PIECE_LIMITS.slots).forEach((s, i) => {
      const at = `slots[${i}]`;
      if (!isObj(s)) { errors.push(`${at}: a slot is { id, label, default, material }`); return; }
      if (typeof s.id !== 'string' || !SLOT_ID.test(s.id)) errors.push(`${at}.id: a slot id is a word starting with a lowercase letter (skin, hair, a)`);
      else if (inherited(s.id)) errors.push(`${at}.id: ${inheritedError(s.id)}`);
      else if (ids.has(s.id)) errors.push(`${at}.id: the slot "${s.id}" is listed twice`);
      else ids.add(s.id);
      if (s.label !== undefined && (typeof s.label !== 'string' || s.label.length > 40)) errors.push(`${at}.label: a short label of at most 40 characters`);
      if (s.default !== undefined && (typeof s.default !== 'string' || !HEX.test(s.default))) errors.push(`${at}.default: a colour written #rrggbb`);
      if (s.material !== undefined && !MATERIAL_IDS.includes(s.material)) errors.push(`${at}.material: "${String(s.material).slice(0, 20)}" is not a material; the materials are ${MATERIAL_IDS.join(', ')}`);
      for (const k of Object.keys(s)) if (!['id', 'label', 'default', 'material'].includes(k)) warnings.push(`${at}.${k}: not a field of a slot; ignored`);
    });
  }
  // args
  if (piece.args === undefined) piece.args = {};
  if (!isObj(piece.args)) errors.push('args: an object { <name>: { type, ... } }');
  else {
    const names = Object.keys(piece.args);
    if (names.length > PIECE_LIMITS.args) errors.push(`args: ${names.length} args; the most is ${PIECE_LIMITS.args}`);
    for (const n of names.slice(0, PIECE_LIMITS.args)) {
      if (!ARG_NAME.test(n)) { errors.push(`args.${n.slice(0, 30)}: an arg name is one word in camelCase starting with a lowercase letter`); continue; }
      if (inherited(n)) { errors.push(`args.${n}: ${inheritedError(n)}`); continue; }
      const a = piece.args[n];
      if (!isObj(a) || typeof a.type !== 'string' || !/^[a-z]+$/.test(a.type)) errors.push(`args.${n}: needs a type (px, share, count, word, flag, paint...)`);
    }
  }
  if (piece.made !== undefined && !isObj(piece.made)) errors.push('made: an object { by, on, from }');
  // body
  if (!isObj(piece.body)) errors.push('body: missing; the piece\'s data is an object in body');
  else if (ref && PIECE_KINDS[ref.kind].needs && piece.body[PIECE_KINDS[ref.kind].needs] === undefined) errors.push(`body.${PIECE_KINDS[ref.kind].needs}: a ${ref.kind} piece needs it`);
  // the pieces it names
  let uses = [];
  if (isObj(piece.body)) {
    const found = usesOf(piece.body, 'body');
    for (const u of found) if (u.error) errors.push(`${u.path}: ${u.error}`);
    uses = [...new Set(found.filter((u) => u.ref).map((u) => u.ref))];
    if (ref && uses.includes(ref.ref)) errors.push(`body: the piece ${ref.ref} uses itself`);
    if (uses.length > PIECE_LIMITS.uses) errors.push(`body: uses ${uses.length} pieces; the most is ${PIECE_LIMITS.uses}`);
  }
  if (errors.length) return done();
  if (typeof opts.check === 'function') {
    try {
      const r = opts.check(piece);
      if (Array.isArray(r)) errors.push(...r.map(String));
      else if (isObj(r)) { if (Array.isArray(r.errors)) errors.push(...r.errors.map(String)); if (Array.isArray(r.warnings)) warnings.push(...r.warnings.map(String)); }
    } catch (e) { errors.push(`The piece's body could not be checked: ${String(e?.message ?? e).slice(0, 160)}`); }
  }
  return done(deepFreeze(piece), uses);
}

/**
 * What a check of a `use` needs to know of a checked piece, in the shape the v2 schema reads (B1's `pieces.piece`):
 * { id, v, kind, slots: [slot ids], needsPaint: [the slot ids with no default, which a use must map or bind by name],
 * args? (when it takes any), cost, and for a base bones (bones and nodes), shapes
 * and clips ({ name: { frames } }), for a font glyphs (its characters, sorted) }. cost is an estimate for the
 * definition's budget: the primitives it lists (a base's shapes, a part's draw list), 1 for a stamp, else 0.
 * Arguments: piece.
 */
export function pieceSummary(piece) {
  const b = isObj(piece.body) ? piece.body : {};
  const kind = parsePieceRef(piece.id, piece.v).kind;
  const out = { id: piece.id, v: piece.v, kind, slots: (piece.slots || []).map((s) => s.id), needsPaint: (piece.slots || []).filter((s) => s.default === undefined).map((s) => s.id) };
  if (piece.args && Object.keys(piece.args).length) out.args = piece.args;
  const ids = (l) => (Array.isArray(l) ? l.filter((x) => isObj(x) && typeof x.id === 'string').map((x) => x.id) : []);
  if (kind === 'base') {
    const rig = isObj(b.rig) ? b.rig : {};
    out.bones = [...ids(rig.bones), ...ids(rig.nodes)];
    out.shapes = ids(rig.shapes);
    const clips = isObj(b.clips) ? b.clips : (isObj(rig.clips) ? rig.clips : {});
    out.clips = Object.fromEntries(Object.keys(clips).map((k) => [k, { frames: isObj(clips[k]) && Number.isInteger(clips[k].frames) ? clips[k].frames : 1 }]));
  }
  if (kind === 'font') out.glyphs = isObj(b.glyphs) ? Object.keys(b.glyphs).sort().join('') : '';
  out.cost = kind === 'stamp' ? 1 : kind === 'base' ? ids(isObj(b.rig) ? b.rig.shapes : []).length : Array.isArray(b.draw) ? b.draw.length : 0;
  return out;
}

/**
 * One row of the pieces index for a checked piece: { ref, id, kind, v, file, name, about, slots (with labels,
 * defaults, materials), args, uses, cost, and bones, shapes, clips or glyphs as pieceSummary gives them }.
 * tools/lib/pieces-index.mjs adds bytes, hash and latest. Arguments: piece.
 */
export function indexEntry(piece) {
  const r = parsePieceRef(piece.id, piece.v);
  const { id: _i, v: _v, kind: _k, slots: _s, args: _a, needsPaint: _n, ...rest } = pieceSummary(piece);   // a row's slots carry their defaults
  return {
    ref: r.ref, id: r.id, kind: r.kind, v: r.v, file: r.file, name: piece.name, about: piece.about,
    slots: (piece.slots || []).map((s) => ({ id: s.id, ...(s.label !== undefined && { label: s.label }), ...(s.default !== undefined && { default: s.default }), ...(s.material !== undefined && { material: s.material }) })),
    args: piece.args || {},
    uses: pieceUses(piece),
    ...rest,
  };
}

/**
 * The pieces as the v2 schema reads them: { piece(id, v) -> summary or null, pieces() -> every summary }, from a
 * store (its loaded pieces, looked up when asked), the pieces index, or a list of index rows. Arguments: source.
 */
export function pieceRegistry(source) {
  const fromRow = (e) => {
    // a row whose slots are bare ids says nothing of defaults: every such slot needs paint
    const out = { id: e.id, v: e.v, kind: e.kind, slots: (e.slots || []).map((s) => (typeof s === 'string' ? s : s.id)),
      needsPaint: (e.slots || []).filter((s) => typeof s === 'string' || s.default === undefined).map((s) => (typeof s === 'string' ? s : s.id)) };
    if (e.args && Object.keys(e.args).length) out.args = e.args;
    for (const k of ['bones', 'shapes', 'clips', 'glyphs']) if (e[k] !== undefined) out[k] = e[k];
    out.cost = e.cost ?? 0;
    return out;
  };
  if (source && typeof source.get === 'function' && typeof source.list === 'function') {
    const cache = new Map();
    const of = (ref) => { const p = source.get(ref); if (!p) return null; if (!cache.has(ref)) cache.set(ref, pieceSummary(p)); return cache.get(ref); };
    return Object.freeze({ piece: (id, v) => of(refKey(id, v)), pieces: () => source.list().map(of) });
  }
  const rows = Array.isArray(source) ? source : (source && Array.isArray(source.pieces) ? source.pieces : []);
  const by = new Map(rows.filter((e) => e && typeof e.id === 'string').map((e) => [refKey(e.id, e.v), fromRow(e)]));
  return Object.freeze({ piece: (id, v) => by.get(refKey(id, v)) ?? null, pieces: () => [...by.values()] });
}

/** Index rows by ref and the versions of each id: { byRef: Map, versions: Map<id, [v ascending]> }. Arguments: index (object with pieces, or a list). */
export function indexLookup(index) {
  const rows = Array.isArray(index) ? index : (index && Array.isArray(index.pieces) ? index.pieces : []);
  const byRef = new Map(), versions = new Map();
  for (const e of rows) {
    if (!e || typeof e.ref !== 'string') continue;
    byRef.set(e.ref, e);
    if (!versions.has(e.id)) versions.set(e.id, []);
    versions.get(e.id).push(e.v);
  }
  for (const l of versions.values()) l.sort((a, b) => a - b);
  return { byRef, versions };
}

/**
 * The longest chain and any loop among pieces, from index rows (each with `uses`). Returns { closure: [refs, sorted],
 * errors }. Arguments: starts (refs), byRef (Map from indexLookup), limits (PIECE_LIMITS).
 */
export function pieceClosure(starts, byRef, limits = PIECE_LIMITS) {
  const errors = [];
  const all = new Set();
  const state = new Map();               // ref -> 1 on the current chain, 2 finished
  const depthOf = new Map();
  const visit = (ref, chain) => {
    if (state.get(ref) === 1) { errors.push(`the pieces make a loop: ${[...chain.slice(chain.indexOf(ref)), ref].join(' uses ')}`); return 0; }
    if (state.get(ref) === 2) return depthOf.get(ref);
    state.set(ref, 1); all.add(ref);
    let d = 0;
    const e = byRef.get(ref);
    for (const u of (e && e.uses) || []) d = Math.max(d, 1 + visit(u, [...chain, ref]));
    state.set(ref, 2); depthOf.set(ref, d);
    return d;
  };
  for (const s of starts) {
    const d = visit(s, []);
    if (d > limits.depth) errors.push(`${s}: pieces that use pieces go ${d} deep; the most is ${limits.depth}`);
  }
  if (all.size > limits.closure) errors.push(`the definition loads ${all.size} pieces with what they use; the most is ${limits.closure}`);
  return { closure: [...all].sort(), errors: [...new Set(errors)] };
}

/**
 * The slot ids a definition's pieces may bind to by name: the ids of its palette (a sprite), else of its own slots
 * (a piece using a piece); [] when it has neither. Arguments: definition.
 */
export function paletteIds(definition) {
  const list = isObj(definition) ? (Array.isArray(definition.palette) ? definition.palette : Array.isArray(definition.slots) ? definition.slots : []) : [];
  return list.map((s) => (typeof s === 'string' ? s : isObj(s) ? s.id : null)).filter((id) => typeof id === 'string');
}

/**
 * How a use colours each slot of its piece, the rule the check and the renderer share: the use's paint map first,
 * else the definition's palette slot with the same id, else the piece slot's default; a slot with none of these is
 * missing (an error). Returns { paint: { slot: paint ref }, defaults: { slot: '#rrggbb' }, missing: [slot ids] }.
 * Arguments: slots (the piece's slots, objects or bare ids), paint (the use's map), palette (slot ids of the definition).
 */
export function bindSlots(slots, paint, palette = []) {
  const map = isObj(paint) ? paint : {};
  const pal = new Set(palette);
  const out = { paint: {}, defaults: {}, missing: [] };
  for (const s of slots || []) {
    const id = typeof s === 'string' ? s : isObj(s) ? s.id : null;
    if (typeof id !== 'string') continue;
    if (Object.hasOwn(map, id)) out.paint[id] = map[id];
    else if (pal.has(id)) out.paint[id] = id;
    else if (isObj(s) && typeof s.default === 'string') out.defaults[id] = s.default;
    else out.missing.push(id);
  }
  return out;
}

/**
 * The synchronous check of the pieces a definition names, against the index (the v2 schema calls it): each
 * reference is well formed, exists at that version, fits the place it stands in, maps only slots the piece has and
 * sets only args it takes, and leaves no slot without a colour (bindSlots: the paint map, else the palette slot of
 * the same id, else the piece's default); the distinct pieces stay within usesPerAsset and, with what they use,
 * within closure and depth, with no loop. A newer version is a warning.
 * With no index only the form is checked. Returns { errors, warnings, refs (distinct, sorted), closure (sorted) }.
 * Arguments: definition (plain data), index (generated/pieces.json, a list of its rows, or null), limits,
 * palette (the slot ids an unmapped piece slot may bind to; from the definition's palette, or a piece's own slots,
 * when left out).
 */
export function checkPieceUses(definition, index, limits = PIECE_LIMITS, palette = null) {
  const errors = [], warnings = [];
  const found = usesOf(definition);
  for (const u of found) if (u.error) errors.push(`${u.path}: ${u.error}`);
  const good = found.filter((u) => u.ref);
  const refs = [...new Set(good.map((u) => u.ref))].sort();
  if (refs.length > limits.usesPerAsset) errors.push(`The definition names ${refs.length} different pieces; the most is ${limits.usesPerAsset}`);
  for (const u of good) {
    const want = u.place && PLACE_KINDS[u.place];
    if (want && !want.includes(u.kind)) errors.push(`${u.path}: ${u.place} takes a ${want.join(' or ')} piece; ${u.id} is a ${u.kind}`);
  }
  if (!index) {
    if (refs.length) warnings.push('The pieces this definition names were not checked against the pieces index (none was given)');
    return { errors, warnings, refs, closure: refs };
  }
  const { byRef, versions } = indexLookup(index);
  const pal = palette ?? paletteIds(definition);
  const warned = new Set();
  for (const u of good) {
    const e = byRef.get(u.ref);
    if (!e) {
      const vs = versions.get(u.id);
      errors.push(vs ? `${u.path}: ${u.id} has no version ${u.v}; its versions are ${vs.join(', ')}` : `${u.path}: there is no piece called ${u.id}`);
      continue;
    }
    const vs = versions.get(u.id);
    if (vs[vs.length - 1] > u.v && !warned.has(u.ref)) { warned.add(u.ref); warnings.push(`${u.path}: ${u.id} has a newer version ${vs[vs.length - 1]}; this definition keeps version ${u.v}`); }
    if (u.place === 'font') continue;                       // a text paints a font with its own paint
    const slots = new Map((e.slots || []).map((s) => [s.id, s]));
    if (u.paint !== undefined && !isObj(u.paint)) errors.push(`${u.path}.paint: maps the piece's slots to this sprite's paints, { <slot>: <paint> }`);
    const paint = isObj(u.paint) ? u.paint : {};
    for (const k of Object.keys(paint)) if (!slots.has(k)) errors.push(`${u.path}.paint: ${u.id} has no slot "${k}"; its slots are ${[...slots.keys()].join(', ') || 'none'}`);
    for (const id of bindSlots([...slots.values()], paint, pal).missing) errors.push(`${u.path}.paint: the slot "${id}" of ${u.id} has no colour: map it in paint, add a palette slot "${id}", or give the piece's slot a default`);
    if (u.args !== undefined && !isObj(u.args)) errors.push(`${u.path}.args: an object { <arg>: value or binding }`);
    else {
      const takes = Array.isArray(e.args) ? e.args : Object.keys(e.args || {});
      for (const k of Object.keys(u.args || {})) if (!takes.includes(k)) errors.push(`${u.path}.args: ${u.id} takes no arg "${k}"; it takes ${takes.join(', ') || 'none'}`);
    }
  }
  const known = refs.filter((r) => byRef.has(r));
  const c = pieceClosure(known, byRef, limits);
  errors.push(...c.errors);
  return { errors, warnings, refs, closure: c.closure };
}

// ---- loading ----------------------------------------------------------------------------------------------

// The site's folder, from where this module stands (engine/ is one level down). Written without a quoted relative
// path, so the import reader of the quality cache does not take the folder for a file.
const SITE = new URL('..', import.meta.url);

/**
 * A reader that fetches files from the site's folder: read(rel) -> Promise<text>. In Node the site folder is a
 * file: address that fetch cannot read; use tools/lib/pieces-index.mjs nodePieceReader there.
 * Arguments: base (the site's folder as a URL; this module's site by default), fetchFn (fetch by default).
 */
export function siteReader(base = SITE, fetchFn = globalThis.fetch) {
  const root = new URL(String(base));
  return async (rel) => {
    const url = new URL(rel, root);
    if (url.protocol === 'file:') throw new Error(`${rel}: a file on disk cannot be fetched; in Node read pieces with tools/lib/pieces-index.mjs (nodePieceReader or nodePieceStore)`);
    if (typeof fetchFn !== 'function') throw new Error(`${rel}: no fetch to read it with`);
    const r = await fetchFn(url);
    if (!r || !r.ok) throw new Error(`${rel}: could not be read (${r ? r.status : 'no answer'})`);
    return r.text();
  };
}

/**
 * A store of pieces for one page or one run. read(rel) -> Promise<text> reads a file relative to the site's
 * folder; check is the body hook of validatePiece; index is the pieces index or a function returning it (read
 * from generated/pieces.json when left out). Methods: load(ref | refs) -> Promise<piece | pieces> (with what they
 * use; rejects with the file named), loadFor(definition) -> Promise<{ ok, errors, refs }> (never rejects),
 * get(ref) / has(ref) synchronous, add(piece) by hand, list(), index(), useReader(read).
 * Only a piece whose whole closure passed (every piece it uses, in turn, read and checked; no loop; not too deep)
 * is handed out by get, has and list; a piece read for a load that was refused stays out of sight. One call of
 * load or loadFor has one cap (closure) on the pieces it reads, and stops reading when it is reached.
 * A version never changes, so a loaded piece is kept for the store's life; a failed read is not kept.
 */
export function createPieceStore({ read = null, check = null, index = null, limits = PIECE_LIMITS } = {}) {
  let reader = read;
  const checked = new Map();    // ref -> frozen piece that passed its own check (read once; not handed out by itself)
  const usesOfRef = new Map();  // ref -> [refs]
  const good = new Map();       // ref -> depth: the pieces whose whole closure passed; the only ones handed out
  const reading = new Map();    // ref -> Promise<piece> of the one file (never waits on another piece)
  let indexP = null;

  const keyOf = (x, v) => {
    const r = typeof x === 'string' && v === undefined && !x.includes('@') ? { ok: false, error: `${x} is named without a version` } : parsePieceRef(x, v);
    if (!r.ok) throw new Error(r.error);
    return r;
  };
  const accept = (r, input, file) => {
    const res = validatePiece(input, { file, check });
    if (!res.ok) throw new Error(`${file ? `${file} ` : ''}(${r ? r.ref : 'piece'}): ${res.errors.slice(0, 5).join('; ')}`);
    const k = refKey(res.piece.id, res.piece.v);
    if (r && k !== r.ref) throw new Error(`${file}: holds ${k}, not ${r.ref}`);
    if (!checked.has(k)) { checked.set(k, res.piece); usesOfRef.set(k, res.uses); }
    return checked.get(k);
  };
  const readOne = (r) => {
    if (checked.has(r.ref)) return Promise.resolve(checked.get(r.ref));
    if (!reading.has(r.ref)) {
      const p = (async () => {
        if (typeof reader !== 'function') throw new Error(`${r.file}: this store has no reader`);
        const text = await reader(r.file);
        return accept(r, text, r.file);
      })();
      reading.set(r.ref, p);
      p.catch(() => { if (reading.get(r.ref) === p) reading.delete(r.ref); });
    }
    return reading.get(r.ref);
  };
  // Judges pieces already read, on the data alone (synchronous, so nothing can hang): a piece passes when it was
  // checked, every piece it uses passes, it is on no loop and its chain is at most limits.depth deep. Passing pieces
  // join `good`. Returns the errors found (a missing piece that was never read is no error here: the read said so).
  const judge = (starts) => {
    const errors = [];
    const state = new Map();               // ref -> 'on' (on the current chain), a depth, or false
    const visit = (ref, chain) => {
      if (good.has(ref)) return good.get(ref);
      const s = state.get(ref);
      if (s === 'on') { errors.push(`the pieces make a loop: ${[...chain.slice(chain.indexOf(ref)), ref].join(' uses ')}`); return false; }
      if (s !== undefined) return s;
      if (!checked.has(ref)) { state.set(ref, false); return false; }
      state.set(ref, 'on');
      let d = 0, ok = true;
      for (const u of usesOfRef.get(ref) || []) { const x = visit(u, [...chain, ref]); if (x === false) ok = false; else d = Math.max(d, 1 + x); }
      if (ok && d > limits.depth) { errors.push(`${ref}: pieces that use pieces go ${d} deep; the most is ${limits.depth}`); ok = false; }
      state.set(ref, ok ? d : false);
      return ok ? d : false;
    };
    for (const r of starts) visit(r, []);
    for (const [ref, s] of state) if (typeof s === 'number') good.set(ref, s);
    return errors;
  };
  // Every good ref the starts reach, sorted.
  const reach = (starts) => {
    const seen = new Set();
    const go = (ref) => { if (seen.has(ref) || !good.has(ref)) return; seen.add(ref); for (const u of usesOfRef.get(ref) || []) go(u); };
    starts.forEach(go);
    return [...seen].sort();
  };
  // Reads the starts and what they use, breadth first, under one cap for the whole call, then judges them.
  // Never rejects: { errors, refs (the good pieces the starts reach) }. When the cap is reached nothing new is handed out.
  const gather = async (starts) => {
    const errors = [];
    const want = new Set();
    let queue = [];
    for (const r of starts) if (!want.has(r.ref)) { want.add(r.ref); queue.push(r); }
    let capped = false;
    while (queue.length && !capped) {
      const batch = queue;
      queue = [];
      const settled = await Promise.allSettled(batch.map(readOne));
      batch.forEach((r, i) => {
        if (settled[i].status === 'rejected') { errors.push(`${r.ref}: ${String(settled[i].reason?.message ?? settled[i].reason)}`); return; }
        for (const u of usesOfRef.get(r.ref) || []) {
          if (capped || want.has(u)) continue;
          if (want.size >= limits.closure) { capped = true; continue; }
          want.add(u); queue.push(parsePieceRef(u));
        }
      });
    }
    const refs = starts.map((r) => r.ref);
    if (capped) {
      errors.push(`more than ${limits.closure} pieces to load with what they use; the most is ${limits.closure}`);
      return { errors, refs: refs.every((r) => good.has(r)) ? reach(refs) : [] };
    }
    errors.push(...judge(refs));
    return { errors: [...new Set(errors)], refs: reach(refs) };
  };

  return {
    /** Loads one piece (a ref, { use, v } or kind:name@v) or a list, with every piece they use; resolves to the piece(s). */
    async load(x) {
      const list = Array.isArray(x) ? x : [x];
      const rs = list.map((y) => keyOf(y));
      const g = await gather(rs);
      if (g.errors.length) throw new Error(g.errors.join('; '));
      const out = rs.map((r) => checked.get(r.ref));
      return Array.isArray(x) ? out : out[0];
    },
    /** Loads every piece a definition names; { ok, errors, refs (the good pieces it reaches, sorted) }, never rejects. */
    async loadFor(definition) {
      const found = usesOf(definition);
      const errors = found.filter((u) => u.error).map((u) => `${u.path}: ${u.error}`);
      const starts = [...new Map(found.filter((u) => u.ref).map((u) => [u.ref, parsePieceRef(u.ref)])).values()];
      let refs = [];
      if (starts.length > limits.usesPerAsset) errors.push(`The definition names ${starts.length} different pieces; the most is ${limits.usesPerAsset}`);
      else { const g = await gather(starts); errors.push(...g.errors); refs = g.refs; }
      return { ok: errors.length === 0, errors, refs };
    },
    /** The loaded piece, or undefined when it is not loaded or its load was refused (synchronous). */
    get(x, v) { const r = parsePieceRef(x, v); return r.ok && good.has(r.ref) ? checked.get(r.ref) : undefined; },
    /** Is the piece loaded (with everything it uses)? */
    has(x, v) { const r = parsePieceRef(x, v); return r.ok && good.has(r.ref); },
    /**
     * Puts a piece in by hand after checking it (Node preloading, the studio, tests); throws with the errors when it
     * fails. It is handed out once every piece it uses is (at once, or after a later load of it or of them).
     */
    add(input, file) { const p = accept(null, input, file); judge([refKey(p.id, p.v)]); return p; },
    /** The refs handed out, sorted. */
    list() { return [...good.keys()].sort(); },
    /** The pieces index: the option given, else generated/pieces.json through the reader; read once. */
    index() {
      if (!indexP) {
        indexP = (async () => {
          if (typeof index === 'function') return index();
          if (index) return index;
          if (typeof reader !== 'function') throw new Error('generated/pieces.json: this store has no reader');
          return JSON.parse(await reader('generated/pieces.json'));
        })();
        indexP.catch(() => { indexP = null; });
      }
      return indexP;
    },
    /** Gives the store another reader (Node gives the site store a disk reader); loaded pieces are kept. */
    useReader(fn) { reader = fn; indexP = null; },
  };
}

let site = null;
/** The page's one store of pieces, reading from the site's folder by fetch (created on first use). */
export function sitePieces() {
  if (!site) site = createPieceStore({ read: siteReader() });
  return site;
}
