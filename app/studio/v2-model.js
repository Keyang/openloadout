// The studio's version 2 model (build item B17; docs/data-sprites.md sections 2 and 6; Contract 15): pure changes to a
// `loadout-sprite` version 2 definition, for the studio page (app/studio/v2-editor.js) and anyone driving it.
//   - which body a definition has (rig, tiles, layers, panel, emitters, pictures), and the lists of shapes, stamps and
//     generator calls each body draws (a picture's draw, motion and emitters; a rig's shapes; a layer's draw ...);
//   - reading and changing any field by its path, never in place (every change gives a new definition, so the undo
//     stack holds plain snapshots), and never through an object's own machinery (__proto__, constructor, prototype);
//   - new shapes on a node or bone, moving one by whole pixels, palette slots, controls and clips added as data;
//   - a library sprite opened as a copy (DQ5: the library changes only through its file and review, Contract 15 rule 7);
//   - the file for the library, sprites/<id>.json, written as the library's own files are (one-space JSON);
//   - the validator's messages matched to the row they are about, to be shown beside it.
// Nothing here draws or validates (app/studio/v2-check.js does). No page, no Node: runs in the browser and the tests.

/** The six bodies a version 2 sprite may have, in the order docs/data-sprites.md 2.1 lists them. */
export const BODY_KINDS = Object.freeze(['rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures']);

/** Each body in everyday words, as the studio names it. */
export const BODY_LABELS = Object.freeze({ rig: 'Character (bones)', tiles: 'Tileset', layers: 'Background', panel: 'Interface piece', emitters: 'Effect', pictures: 'Prop, pickup or icon' });

/** The shapes the studio adds by hand (docs/data-sprites.md 2.7), each with its everyday name. */
export const SHAPE_WORDS = Object.freeze({ ellipse: 'Round', rect: 'Box', line: 'Line', ring: 'Ring', dot: 'Dot', poly: 'Pointed', stamp: 'Pixels (a stamp)', outline: 'Outline (ink round what is drawn so far)' });

/** The kinds of shape the studio adds by hand. */
export const SHAPE_KINDS = Object.freeze(Object.keys(SHAPE_WORDS));

const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
const ITEM_ID = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const CLIP_RE = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const TONES = ['light', 'dark', 'deep', 'far'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const words = (id) => cap(String(id).replace(/[-_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());

/** Is it a version 2 definition? Arguments: def. */
export const isV2 = (def) => isObj(def) && def.version === 2;

/** The body a definition has ('rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures'), or null (a version 1 library body, or none). Arguments: def. */
export function bodyKind(def) {
  if (!isObj(def) || !isObj(def.body)) return null;
  return BODY_KINDS.find((k) => Object.hasOwn(def.body, k)) ?? null;
}

/** Refuses a path step that reaches an object's machinery. */
function step(k) {
  if (typeof k === 'string' && PROTO.has(k)) throw new Error(`"${k}" is not a field the studio changes`);
  return k;
}

/** The value at a path (a list of field names and list positions), or undefined; own fields only. Arguments: obj, path. */
export function getAt(obj, path) {
  let v = obj;
  for (const k of path) {
    if (v === null || typeof v !== 'object' || PROTO.has(k) || !Object.hasOwn(v, k)) return undefined;
    v = v[k];
  }
  return v;
}

/** A copy of obj with the value at path changed (undefined removes it: a field is deleted, a list item taken out). Throws for a path through something that is not there. Arguments: obj, path, value. */
export function setAt(obj, path, value) {
  path.forEach(step);
  const out = clone(obj);
  if (!path.length) return clone(value);
  let v = out;
  for (const k of path.slice(0, -1)) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, k)) throw new Error(`there is nothing at ${path.join('.')}`);
    v = v[k];
  }
  const last = path.at(-1);
  if (v === null || typeof v !== 'object') throw new Error(`there is nothing at ${path.join('.')}`);
  if (value === undefined) { if (Array.isArray(v)) v.splice(Number(last), 1); else delete v[last]; }
  else v[last] = clone(value);
  return out;
}

/** A copy of obj with `value` put into the list at listPath before position `index` (the end when index is past it). Arguments: obj, listPath, index, value. */
export function insertAt(obj, listPath, index, value) {
  const list = getAt(obj, listPath);
  if (!Array.isArray(list)) throw new Error(`${listPath.join('.')} is not a list`);
  const next = [...list];
  next.splice(Math.max(0, Math.min(next.length, index)), 0, value);
  return setAt(obj, listPath, next);
}

/** A copy of obj without the value at path. Arguments: obj, path. */
export const removeAt = (obj, path) => setAt(obj, path, undefined);

/** A copy of obj with the list at listPath's item `from` moved to position `to`. Arguments: obj, listPath, from, to. */
export function moveAt(obj, listPath, from, to) {
  const list = getAt(obj, listPath);
  if (!Array.isArray(list) || from < 0 || from >= list.length) return clone(obj);
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, x);
  return setAt(obj, listPath, next);
}

/** What kind of value the field tree shows: 'number', 'text', 'flag', 'list', 'object' or 'null'. Arguments: value. */
export function fieldKind(value) {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'flag';
  if (Array.isArray(value)) return 'list';
  if (isObj(value)) return 'object';
  return 'null';
}

/**
 * The lists of shapes, stamps and generator calls a definition's body draws, each { path, label, place, word } (place:
 * 'draw' for shapes and drawing generators, 'motion', 'emitter', 'shapes' for a rig's shapes on bones; word: how the
 * validator names the list's items in its messages, 'Draw 3', 'Shape "id"', 'Layer "far", item 2'). Tiles have none here:
 * their groups, edges and decals are changed in the field tree (the tile painter is build item B19). Arguments: def.
 */
export function itemListsOf(def) {
  const k = bodyKind(def);
  const b = k ? def.body : null;
  const out = [];
  const add = (path, label, place, word) => { if (Array.isArray(getAt(def, path))) out.push({ path, label, place, word }); };
  if (k === 'pictures') {
    add(['body', 'pictures', 'draw'], 'What is drawn', 'draw', 'Draw');
    add(['body', 'pictures', 'motion'], 'How it moves', 'motion', 'Motion');
    add(['body', 'pictures', 'emitters'], 'Bursts and sparks', 'emitter', 'Emitter');
  } else if (k === 'rig') {
    add(['body', 'rig', 'shapes'], 'Shapes on the bones', 'shapes', 'Shape');
  } else if (k === 'emitters') {
    add(['body', 'emitters'], 'Emitters', 'emitter', 'Emitter');
    add(['body', 'draw'], 'What is drawn under them', 'draw', 'Draw');
  } else if (k === 'layers') {
    (Array.isArray(b.layers) ? b.layers : []).forEach((l, i) => {
      const name = isObj(l) && typeof l.name === 'string' ? l.name : String(i + 1);
      add(['body', 'layers', i, 'draw'], `Layer "${name}"`, 'draw', `Layer "${name}", item`);
    });
  } else if (k === 'panel') {
    add(['body', 'panel', 'draw'], 'Drawn on top', 'draw', 'Draw');
  }
  return out;
}

/** The nodes (and bones) things can sit on: a picture's or an effect's nodes, a rig's bones and nodes. Arguments: def. */
export function nodesOf(def) {
  const b = isObj(def?.body) ? def.body : {};
  const ids = (list) => (Array.isArray(list) ? list.filter((n) => isObj(n) && typeof n.id === 'string').map((n) => n.id) : []);
  if (isObj(b.rig)) return [...ids(b.rig.bones), ...ids(b.rig.nodes)];
  if (isObj(b.pictures)) return ids(b.pictures.nodes);
  return ids(b.nodes);
}

/** The palette's slot ids (a version 2 `palette`, else a version 1 rig's or sprite's `colours`). Arguments: def. */
export function slotsOf(def) {
  const list = Array.isArray(def?.palette) ? def.palette : Array.isArray(def?.colours) ? def.colours : Array.isArray(def?.body?.rig?.colours) ? def.body.rig.colours : [];
  return list.filter((s) => isObj(s) && typeof s.id === 'string').map((s) => s.id);
}

/** Every paint ref a definition offers: each slot and its tones, then ink and clear. Arguments: def. */
export function paintRefs(def) {
  const out = [];
  for (const id of slotsOf(def)) out.push(id, ...TONES.map((t) => `${id}.${t}`));
  out.push('ink', 'clear');
  return out;
}

/** A paint ref in everyday words: "Gold, lighter", "Ink". Arguments: paint ref (text), def (for slot labels). */
export function paintWords(ref, def) {
  if (typeof ref !== 'string') return 'Worked out by a rule';
  if (ref === 'ink') return 'Ink (outline)';
  if (ref === 'clear') return 'See-through';
  const [id, tone] = ref.split('.');
  const list = Array.isArray(def?.palette) ? def.palette : [];
  const slot = list.find((s) => isObj(s) && s.id === id);
  const name = slot?.label ?? words(id);
  return tone ? `${name}, ${{ light: 'lighter', dark: 'darker', deep: 'darkest', far: 'far side', base: 'plain' }[tone] ?? tone}` : name;
}

const KIND_WORDS = { limb: 'Limb', capsule: 'Long', ellipse: 'Round', poly: 'Pointed', dot: 'Dot', rect: 'Box', line: 'Line', arc: 'Arc', ring: 'Ring', stamp: 'Pixels', dither: 'Dither', bands: 'Bands', text: 'Text', use: 'Piece', outline: 'Outline', tint: 'Tint', cut: 'Cut' };

/** One item of a draw list in everyday words: 'Round "face" on coin', 'Pixels "mark" on coin', 'glint@1 on coin', 'Outline'. Arguments: item. */
export function itemLabel(item) {
  if (!isObj(item)) return 'Something that is not a shape';
  const where = typeof item.on === 'string' ? ` on ${item.on}` : typeof item.bone === 'string' ? ` on ${item.bone}` : typeof item.node === 'string' ? ` on ${item.node}` : '';
  const id = typeof item.id === 'string' ? ` "${item.id}"` : '';
  if (typeof item.gen === 'string') return `${item.gen}@${item.v ?? '?'}${id}${where}`;
  if (item.kind === 'use') return `Piece ${item.use}@${item.v ?? '?'}${id}${where}`;
  return `${KIND_WORDS[item.kind] ?? words(item.kind ?? 'shape')}${id}${where}`;
}

/** An id like `base` that none of `taken` has: base, base-2, base-3 ... Arguments: base (an id), taken (ids in use). */
export function uniqueId(base, taken = []) {
  const used = new Set(taken);
  const b = String(base).replace(/[^a-zA-Z0-9-]/g, '').replace(/^[^a-z]+/, '').slice(0, 34) || 'shape';
  if (!used.has(b)) return b;
  for (let n = 2; ; n++) if (!used.has(`${b}-${n}`)) return `${b}-${n}`;
}

/** Every id the items of a definition's draw lists use (to give a new one an id of its own). Arguments: def. */
export function itemIds(def) {
  const out = [];
  for (const l of itemListsOf(def)) for (const it of getAt(def, l.path)) if (isObj(it) && typeof it.id === 'string') out.push(it.id);
  return out;
}

/**
 * A new shape of a kind (SHAPE_KINDS) on a node (`on`) or, in a rig, a bone (`bone`), painted `paint`, with an id none
 * of `taken` has (an outline has no place and no id). Arguments: kind, { on, bone, paint, taken }.
 */
export function newShape(kind, { on, bone, paint = 'ink', taken = [] } = {}) {
  if (kind === 'outline') return { kind: 'outline', paint: 'ink' };
  const where = bone ? { bone } : on ? { on } : {};
  const id = uniqueId(kind === 'stamp' ? 'pixels' : kind, taken);
  const base = { id, kind, ...where };
  switch (kind) {
    case 'ellipse': return { ...base, at: [0, 0], r: [4, 4], paint };
    case 'rect': return { ...base, at: [-2, -2], size: [4, 4], paint };
    case 'line': return { ...base, from: [-3, 0], to: [3, 0], paint };
    case 'ring': return { ...base, at: [0, 0], r: 4, thick: 1, paint };
    case 'dot': return { ...base, at: [0, 0], size: 1, paint };
    case 'poly': return { ...base, points: [[0, -4], [3, 2], [-3, 2]], paint };
    case 'stamp': return { ...base, at: [-2, -2], rows: ['aaaa', 'aaaa', 'aaaa', 'aaaa'], key: { a: paint } };
    default: return { ...base, at: [0, 0], paint };
  }
}

/** A point of whole numbers moved by dx, dy; null when a coordinate is bound to a control. */
const movePoint = (p, dx, dy) => (Array.isArray(p) && p.length === 2 && fin(p[0]) && fin(p[1]) ? [p[0] + dx, p[1] + dy] : null);

/** The item moved by dx, dy pixels (its at, from and to, or every point of a poly), or null when it has no place it can be moved by (an operation, a point bound to a control). Arguments: item, dx, dy. */
export function moveItem(item, dx, dy) {
  if (!isObj(item)) return null;
  const out = clone(item);
  let moved = false;
  for (const k of ['at', 'from', 'to']) {
    if (!Object.hasOwn(out, k) || !Array.isArray(out[k])) continue;
    const p = movePoint(out[k], dx, dy);
    if (!p) return null;
    out[k] = p;
    moved = true;
  }
  if (!moved && Array.isArray(out.points) && out.kind === 'poly') {
    const pts = out.points.map((p) => movePoint(p, dx, dy));
    if (pts.some((p) => !p)) return null;
    out.points = pts;
    moved = true;
  }
  return moved ? out : null;
}

/**
 * A library sprite as a studio draft (DQ5: a copy; Contract 15 rule 7). A new id (<id>-copy, -copy-2 ... none of
 * `taken` has) and "(copy)" in its name unless keepId (a new version of the library file, to download and send for
 * review); made { in: 'studio', from: 'library:<id>' }; every other field as the library file has it.
 * Arguments: def (the library's definition), { taken (ids in use: drafts and the library), keepId }.
 */
export function copyOfLibrary(def, { taken = [], keepId = false } = {}) {
  const out = clone(def);
  const from = ID_RE.test(def.id) ? def.id : 'sprite';
  if (!keepId) {
    const used = new Set(taken);
    const base = `${from.slice(0, 33).replace(/-+$/, '')}-copy`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    out.id = id;
    const name = typeof def.name === 'string' ? def.name : words(from);
    out.name = `${name.slice(0, 53).trimEnd()} (copy)`;
  }
  out.made = { in: 'studio', from: `library:${from}` };
  return out;
}

/** The file for the library: { name: '<id>.json', type, text } in the library's own layout (one-space JSON, a newline at the end). Arguments: def (a checked definition). */
export function fileOf(def) {
  return { name: `${def.id}.json`, type: 'application/json', text: `${JSON.stringify(def, null, 1)}\n` };
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The validator's messages about one row: those that start with its word and its number in its list ("Draw 3"), or
 * with its word and its id ('Colour "gold"', 'Clip "spin"'). Arguments: messages, { word, index (0-based), id }.
 */
export function errorsFor(messages, { word, index, id } = {}) {
  const res = [];
  if (Number.isInteger(index)) res.push(new RegExp(`^${esc(word)} ${index + 1}(?![0-9])`));
  if (typeof id === 'string' && id) res.push(new RegExp(`^${esc(word)}(?: [0-9]+)? "${esc(id)}"`));
  return (Array.isArray(messages) ? messages : []).filter((m) => typeof m === 'string' && res.some((r) => r.test(m)));
}

const SWATCH_START = ['#d9534f', '#3f86e0', '#3fbf6b', '#f2c230', '#a45ee0', '#e8853a', '#5a4a3a', '#c9ced9'];

/** The definition with a new palette slot (id from its label, a starting colour, material paint). Arguments: def, { label, colour, material }. */
export function addPaletteSlot(def, { label = 'Colour', colour, material = 'paint' } = {}) {
  const list = Array.isArray(def.palette) ? def.palette : [];
  const id = uniqueId(String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'colour', slotsOf(def));
  const hex = /^#[0-9a-fA-F]{6}$/.test(colour ?? '') ? colour.toLowerCase() : SWATCH_START[list.length % SWATCH_START.length];
  return setAt(def, ['palette'], [...list, { id, label: String(label).slice(0, 60), default: hex, material }]);
}

/** The definition with a new control: a slider (range 0 to 1, default 0.5), a choice (two options to rename) or an on/off (toggle). It does nothing until something names it. Arguments: def, kind, { label }. */
export function addControl(def, kind, { label = 'Setting' } = {}) {
  const list = Array.isArray(def.controls) ? def.controls : [];
  const taken = list.filter(isObj).map((c) => c.key);
  const key = uniqueId(String(label).replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toLowerCase()) || 'setting', taken).replace(/-/g, '');
  const L = String(label).slice(0, 60);
  const c = kind === 'choice' ? { key, kind: 'choice', label: L, options: ['one', 'two'], default: 'one' }
    : kind === 'toggle' ? { key, kind: 'toggle', label: L, default: true }
      : { key, kind: 'range', label: L, lo: 'Less', hi: 'More', default: 0.5 };
  return setAt(def, ['controls'], [...list, c]);
}

/** The definition with a new clip (frames, fps, loop), or null for a name that is not a clip name or is taken. Arguments: def, name, { frames, fps, loop, label }. */
export function addClip(def, name, { frames = 8, fps = 10, loop = true, label } = {}) {
  if (typeof name !== 'string' || !CLIP_RE.test(name) || PROTO.has(name)) return null;
  const clips = isObj(def.clips) ? def.clips : {};
  if (Object.hasOwn(clips, name)) return null;
  return setAt(def, ['clips'], { ...clips, [name]: { label: label ?? words(name), frames, fps, loop } });
}

/** An id fit for an item in a draw list (ITEM_ID). Arguments: text. */
export const isItemId = (v) => typeof v === 'string' && ITEM_ID.test(v) && !PROTO.has(v);

/**
 * Every stamp in a definition's body that is not an item of one of its draw lists (a tileset's decals and fill, a
 * generator's `place`, a layer's nested calls ...): [{ path, label }], at most `most`, so each can be painted.
 * Arguments: def, most (default 32).
 */
export function nestedStamps(def, most = 32) {
  const lists = new Set(itemListsOf(def).map((l) => l.path.join('.')));
  const out = [];
  const walk = (v, path, depth) => {
    if (out.length >= most || depth > 24 || v === null || typeof v !== 'object') return;
    if (!Array.isArray(v) && v.kind === 'stamp' && Array.isArray(v.rows)) {
      if (!lists.has(path.slice(0, -1).join('.'))) out.push({ path, label: `${itemLabel(v)} in ${path.slice(1, -1).filter((k) => typeof k === 'string').join(' › ')}` });
      return;
    }
    for (const [k, x] of Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v)) walk(x, [...path, k], depth + 1);
  };
  if (isObj(def?.body)) walk(def.body, ['body'], 0);
  return out;
}
