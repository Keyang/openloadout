// Library parts in the studio, the pure model (build item B20; docs/data-sprites.md section 6; pieces/README.md).
// A rig sprite that extends a base (base:person-side, the base:person-topdown family) wears parts and held things from
// pieces/ (part:*, held:*) as `use` shapes, each shown by one option of a choice control, the choice heading a `parts`
// group. app/studio/v2-parts-pane.js draws it on the Look & name tab.
//   - Which pieces fit: pieces say which body they fit only in words, so fit comes from use: the pieces index row of a
//     part or held piece carries usedOn (engine/pieces.js pieceUsage: the bases the library's sprites wear it on, the
//     node, the z, an example). A piece fits a sprite whose base is of the same family (every base:person-topdown* is
//     one family: the library shares their parts) when a node it hangs on (or the base node that node hangs from) is one
//     of the sprite's.
//   - The parts groups as rows: each choice's options and the pieces each option shows.
//   - A piece added as one option of a choice (a new choice, made with its parts group and a "none" option, or one the
//     sprite has), its colours mapped to the sprite's palette (a slot of the same id, else a slot added with the piece's
//     colour, else, with the palette full, a slot of the same material); taken out again; another piece put in its place.
// Every result is plain data the validator takes (catalog/sprite-schema.js through app/studio/v2-check.js checkFull).
// No page, no Node: runs in the browser and the tests.
import { setAt, slotsOf, uniqueId, itemIds, nodesOf } from './v2-model.js';
import { usesOf } from '../../engine/pieces.js';
import { SPRITE_LIMITS } from '../../catalog/sprite-schema.js';
import { SOCKET_NAMES } from '../../catalog/studio-schema.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const PROTO = new Set(['__proto__', ...Object.getOwnPropertyNames(Object.prototype)]);   // names every object has: never a key
const rowsOf = (index) => (Array.isArray(index?.pieces) ? index.pieces : Array.isArray(index) ? index : []).filter(isObj);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The word a part's option is called when nothing is picked. */
export const NONE = 'none';

/** The base family: every base:person-topdown* is one (the library wears the same parts on all of them), any other base is its own. Arguments: base id. */
export const familyOf = (base) => (typeof base === 'string' && /^base:person-topdown(-|$)/.test(base) ? 'base:person-topdown*' : base ?? null);

/** The base a rig sprite extends, { use, v }, or null. Arguments: def. */
export function baseOf(def) {
  const x = isObj(def?.body?.rig) ? def.body.rig.extends : null;
  return isObj(x) && typeof x.use === 'string' ? { use: x.use, v: x.v } : null;
}

/** The base's index row (its version, else the latest), or null. */
function baseRow(index, base) {
  const rows = rowsOf(index).filter((r) => r.id === base.use);
  return rows.find((r) => r.v === base.v) ?? rows.find((r) => r.latest) ?? rows[rows.length - 1] ?? null;
}

/** The nodes and bones a part can hang on in a sprite: its base's (from the index) and its own. Arguments: index, def. */
export function rigNodes(index, def) {
  const b = baseOf(def);
  const row = b ? baseRow(index, b) : null;
  return new Set([...(Array.isArray(row?.bones) ? row.bones : []), ...nodesOf(def), ...(row ? ['ground'] : [])]);
}

/** The ids of the shapes a sprite's base draws (a sprite's shape of the same id replaces the base's: never taken by a new part). */
const baseShapes = (index, def) => { const b = baseOf(def); const row = b ? baseRow(index, b) : null; return Array.isArray(row?.shapes) ? row.shapes : []; };

/** The part and held piece ids a definition wears. Arguments: def. */
export function piecesWorn(def) {
  return new Set(usesOf(isObj(def?.body) ? def.body : {}, 'body').filter((u) => u.ref && (u.kind === 'part' || u.kind === 'held')).map((u) => u.id));
}

/**
 * The part and held pieces that fit a sprite's base: [{ use, v (the newest), versions (newest first), kind, name, about,
 * slots, args, on (the node suggested), z?, socket?, used (the sprite wears it already), sprites (how many library
 * sprites of the family wear it), example }], by name. [] for a sprite with no base. Arguments: index (generated/pieces.json), def.
 */
export function partChoices(index, def) {
  const b = baseOf(def);
  if (!b) return [];
  const fam = familyOf(b.use);
  const nodes = rigNodes(index, def);
  const worn = piecesWorn(def);
  const rows = rowsOf(index).filter((r) => (r.kind === 'part' || r.kind === 'held') && typeof r.id === 'string' && Number.isInteger(r.v));
  const versions = new Map();
  for (const r of rows) { if (!versions.has(r.id)) versions.set(r.id, []); versions.get(r.id).push(r.v); }
  const out = [];
  for (const [id, vs] of versions) {
    vs.sort((x, y) => y - x);
    const top = rows.find((r) => r.id === id && r.v === vs[0]);
    const used = rows.filter((r) => r.id === id).flatMap((r) => (Array.isArray(r.usedOn) ? r.usedOn : [])).filter((u) => isObj(u) && familyOf(u.base) === fam);
    if (!used.length) continue;
    // the sprite's own base first, then the bases most sprites wear it on; the first node the sprite has wins
    used.sort((x, y) => (Number(y.base === b.use) - Number(x.base === b.use)) || ((y.sprites ?? 0) - (x.sprites ?? 0)));
    let pick = null;
    for (const u of used) {
      for (const o of Array.isArray(u.on) ? u.on : []) {
        if (nodes.has(o.node)) { pick = { u, on: o.node }; break; }
        if (o.at && nodes.has(o.at)) { pick = { u, on: o.at }; break; }
      }
      if (pick) break;
    }
    if (!pick) continue;
    out.push({
      use: id, v: vs[0], versions: vs, kind: top.kind, name: typeof top.name === 'string' ? top.name : id.split(':')[1],
      about: typeof top.about === 'string' ? top.about : '', slots: Array.isArray(top.slots) ? top.slots.filter((s) => isObj(s) && typeof s.id === 'string') : [],
      args: isObj(top.args) ? top.args : {}, on: pick.on, ...(Number.isFinite(pick.u.z) && { z: pick.u.z }),
      ...(SOCKET_NAMES.includes(pick.u.socket) && { socket: pick.u.socket }),
      used: worn.has(id), sprites: used.reduce((n, u) => n + (u.sprites ?? 0), 0), example: pick.u.example ?? null,
    });
  }
  return out.sort((x, y) => (x.name.toLowerCase() < y.name.toLowerCase() ? -1 : x.name.toLowerCase() > y.name.toLowerCase() ? 1 : x.use < y.use ? -1 : 1));
}

/** The choices people pick looks with (kind choice): [{ key, label, options: [value] }]. Arguments: def. */
export function choiceControls(def) {
  return (Array.isArray(def?.controls) ? def.controls : []).filter((c) => isObj(c) && c.kind === 'choice' && typeof c.key === 'string')
    .map((c) => ({ key: c.key, label: typeof c.label === 'string' ? c.label : c.key, options: optionValues(c) }));
}

/** A choice's option values (an option is a word or { value, label }). */
const optionValues = (c) => (Array.isArray(c?.options) ? c.options : []).map((o) => (isObj(o) ? o.value : o)).filter((o) => typeof o === 'string');

/** The parts group a choice heads (params[0]): [name, group] or null. */
function groupOf(def, key) {
  if (!isObj(def?.parts)) return null;
  for (const [name, g] of Object.entries(def.parts)) if (isObj(g) && Array.isArray(g.params) && g.params[0] === key) return [name, g];
  return null;
}

/** Does a when (one object or alternatives) name this option of this control? */
const whenNames = (when, key, option) => (Array.isArray(when) ? when : [when]).some((w) => isObj(w) && Array.isArray(w[key]) && w[key].includes(option));

/**
 * The parts groups headed by a choice, as rows: [{ part (the group's name), label, control, none (the options that take
 * it off), options: [{ value, label, none, pieces: [{ id (the shape), use, v }] }] }], in the order of the parts; an
 * option's pieces are the group's `use` shapes whose when names it. Arguments: def.
 */
export function partRows(def) {
  const shapes = Array.isArray(def?.body?.rig?.shapes) ? def.body.rig.shapes.filter(isObj) : [];
  const controls = new Map((Array.isArray(def?.controls) ? def.controls : []).filter((c) => isObj(c) && typeof c.key === 'string').map((c) => [c.key, c]));
  const out = [];
  for (const [name, g] of Object.entries(isObj(def?.parts) ? def.parts : {})) {
    if (!isObj(g) || !Array.isArray(g.params)) continue;
    const c = controls.get(g.params[0]);
    if (!c || c.kind !== 'choice') continue;
    const nones = g.none === undefined ? [] : Array.isArray(g.none) ? g.none : [g.none];
    const own = new Set(Array.isArray(g.shapes) ? g.shapes : []);
    const options = (Array.isArray(c.options) ? c.options : []).map((o) => {
      const value = isObj(o) ? o.value : o;
      const pieces = shapes.filter((s) => s.kind === 'use' && typeof s.use === 'string' && own.has(s.id) && whenNames(s.when, c.key, value)).map((s) => ({ id: s.id, use: s.use, v: s.v }));
      return { value, label: isObj(o) && typeof o.label === 'string' ? o.label : value, none: nones.includes(value), pieces };
    }).filter((o) => typeof o.value === 'string');
    out.push({ part: name, label: typeof g.label === 'string' ? g.label : name, control: c.key, none: nones, options });
  }
  return out;
}

/** A control key from a name people typed: "Hat style" -> hatStyle, none of `taken`. Arguments: label, taken (keys in use). */
export function controlKeyFor(label, taken = []) {
  const k = String(label ?? '').replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[^a-zA-Z]+/, '').replace(/^./, (c) => c.toLowerCase()).slice(0, 32) || 'look';
  const used = new Set(taken);
  if (!used.has(k) && !PROTO.has(k)) return k;
  for (let n = 2; ; n++) if (!used.has(`${k}${n}`)) return `${k}${n}`;
}

/** The keys a new control may not take: controls, palette slots and parts. Arguments: def. */
export function takenKeys(def) {
  return [...(Array.isArray(def?.controls) ? def.controls : []).filter(isObj).map((c) => c.key), ...slotsOf(def), ...Object.keys(isObj(def?.parts) ? def.parts : {})];
}

/** The option word a piece is offered as: its name, lowercase (part:topdown-straw-hat "Straw hat" -> "straw hat"). Arguments: piece (a partChoices row, or an id). */
export function optionFor(piece) {
  const name = typeof piece === 'string' ? piece.split(':')[1]?.replace(/^topdown-/, '').replace(/-/g, ' ') : String(piece?.name ?? piece?.use ?? '').replace(/^.*:/, '');
  return String(name || 'look').toLowerCase().replace(/[^a-z0-9 -]+/g, '').trim().slice(0, SPRITE_LIMITS.idChars) || 'look';
}

/** A shape id for a piece: its name in one word (strawHat), none of `taken`. */
function shapeIdFor(piece, taken) {
  const words = String(piece.name ?? piece.use.split(':')[1]).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  return uniqueId(words.map((w, i) => (i ? cap(w) : w)).join('') || 'part', taken);
}

/**
 * The paint map of a piece for a sprite, and the palette it needs: each piece slot to the sprite's slot of the same id;
 * else to a slot added with the piece's colour, label and material; with the palette full (SPRITE_LIMITS.palette), to a
 * slot of the same material, else left to the piece's own colour. Returns { def, paint, added: [slot ids] }. Arguments: def, piece.
 */
export function paintFor(def, piece) {
  let next = def;
  const paint = {}, added = [];
  for (const s of Array.isArray(piece?.slots) ? piece.slots : []) {
    if (!isObj(s) || typeof s.id !== 'string') continue;
    const pal = Array.isArray(next.palette) ? next.palette.filter(isObj) : [];
    if (pal.some((p) => p.id === s.id)) { paint[s.id] = s.id; continue; }
    if (pal.length < SPRITE_LIMITS.palette && typeof s.default === 'string') {
      const id = uniqueId(s.id, [...slotsOf(next), ...takenKeys(next)]);
      const label = String(s.label ?? `${piece.name ?? ''} ${s.id}`).trim().slice(0, SPRITE_LIMITS.nameChars);
      next = setAt(next, ['palette'], [...(Array.isArray(next.palette) ? next.palette : []), { id, label: cap(label), default: s.default.toLowerCase(), ...(typeof s.material === 'string' && { material: s.material }) }]);
      paint[s.id] = id;
      added.push(id);
      continue;
    }
    const same = pal.find((p) => typeof s.material === 'string' && p.material === s.material);
    if (same) paint[s.id] = same.id;
  }
  return { def: next, paint, added };
}

/**
 * The definition with a piece added as one option of a choice: { def, shape (its id), control, option, part (the group),
 * added (palette slots added) }. A control that is not there yet is made (a choice of [option, "none"], "none" first
 * picked) with a parts group of its own; an existing choice gets the option (another piece for an option it has is worn
 * with the others). The shape is a `use` on `on` (the suggested node), with the usage's z, `when` the option, the args the
 * piece takes no default for, and a paint map (paintFor). It joins the group's shapes, and a slider that sizes the things on
 * that node (scales.shapes) sizes it too. Throws for what cannot be: a key that is not a choice, a node the sprite lacks,
 * no room for another part. Arguments: def, { piece (a partChoices row), v, control (key), label (a new choice's name),
 * option, on, z, index (for the base's nodes and shapes) }.
 */
export function addPartOption(def, { piece, v, control, label, option, on, z, index = null } = {}) {
  if (!isObj(piece) || typeof piece.use !== 'string') throw new Error('Pick a piece first.');
  const use = piece.use, ver = Number.isInteger(v) ? v : piece.v;
  if (!Number.isInteger(ver)) throw new Error(`Say which version of ${use} to use.`);
  if (!isObj(def?.body?.rig)) throw new Error('Only a character with bones wears parts.');
  const node = on ?? piece.on;
  if (typeof node !== 'string' || (index && !rigNodes(index, def).has(node))) throw new Error(`This sprite has nothing called ${node ?? '(no node)'} to hang ${piece.name ?? use} on.`);
  const opt = String(option ?? optionFor(piece)).trim().slice(0, SPRITE_LIMITS.idChars);
  if (!opt || /["\\<>]/.test(opt)) throw new Error('Name the look with a word or two.');
  let next = clone(def);
  const controls = Array.isArray(next.controls) ? next.controls : [];
  let key = typeof control === 'string' && control ? control : null;
  let c = key ? controls.find((x) => isObj(x) && x.key === key) : null;
  if (c && c.kind !== 'choice') throw new Error(`${c.label ?? key} is not a choice: pick a choice or make a new one.`);
  if (!c) {
    key = key && !takenKeys(next).includes(key) ? key : controlKeyFor(label ?? key ?? piece.name, takenKeys(next));
    if (opt === NONE) throw new Error(`"${NONE}" is the look with nothing on: call this look something else.`);
    c = { key, kind: 'choice', label: String(label ?? piece.name ?? key).trim().slice(0, SPRITE_LIMITS.nameChars) || key, options: [opt, NONE], default: NONE };
    next.controls = [...controls, c];
  } else if (!optionValues(c).includes(opt)) {
    if (optionValues(c).length >= SPRITE_LIMITS.options) throw new Error(`${c.label ?? key} has ${SPRITE_LIMITS.options} looks already.`);
    const os = [...c.options];
    const g = groupOf(next, key);
    const nones = g ? (Array.isArray(g[1].none) ? g[1].none : g[1].none === undefined ? [] : [g[1].none]) : [NONE];
    const last = os.length ? (isObj(os[os.length - 1]) ? os[os.length - 1].value : os[os.length - 1]) : null;
    if (last !== null && nones.includes(last)) os.splice(os.length - 1, 0, opt); else os.push(opt);
    c.options = os;
  }
  // the colours, then the shape
  const p = paintFor(next, piece);
  next = p.def;
  const taken = [...itemIds(next), ...nodesOf(next), ...baseShapes(index, next), ...Object.keys(isObj(next.parts) ? next.parts : {})];
  const id = shapeIdFor(piece, taken);
  const args = {};
  for (const [k, a] of Object.entries(isObj(piece.args) ? piece.args : {})) {
    if (!isObj(a) || a.default !== undefined) continue;   // a use leaves out what the piece has a default for
    const words = Array.isArray(a.options) ? a.options : Array.isArray(a.values) ? a.values : null;
    if (words?.length) args[k] = words[0]; else if (Number.isFinite(a.lo)) args[k] = a.lo; else if (a.type === 'flag') args[k] = false;
  }
  const zz = Number.isFinite(z) ? z : Number.isFinite(piece.z) ? piece.z : undefined;
  const shape = { id, kind: 'use', use, v: ver, on: node, ...(zz !== undefined && { z: zz }), when: { [key]: [opt] }, ...(Object.keys(args).length && { args }), ...(Object.keys(p.paint).length && { paint: p.paint }) };
  const rig = next.body.rig;
  rig.shapes = [...(Array.isArray(rig.shapes) ? rig.shapes : []), shape];
  // a slider that sizes the things worn on this node sizes the new one too (the knight's Head sizes its headgear)
  const onNode = new Set(rig.shapes.filter((s) => isObj(s) && s.on === node && s.id !== id).map((s) => s.id));
  for (const k of next.controls) if (isObj(k) && isObj(k.scales) && Array.isArray(k.scales.shapes) && k.scales.shapes.some((s) => onNode.has(s)) && !k.scales.shapes.includes(id)) k.scales = { ...k.scales, shapes: [...k.scales.shapes, id] };
  // the parts group: the one the choice heads, else a new one
  const parts = isObj(next.parts) ? next.parts : {};
  let g = groupOf(next, key);
  if (!g) {
    if (Object.keys(parts).length >= SPRITE_LIMITS.parts) throw new Error(`The sprite has ${SPRITE_LIMITS.parts} parts already.`);
    const name = uniqueId(key, [...Object.keys(parts), ...takenKeys(next).filter((k) => k !== key)]).replace(/-/g, '');
    const nones = optionValues(c).includes(NONE) ? NONE : undefined;
    g = [name, { label: c.label ?? key, params: [key], ...(nones && { none: nones }), ...(piece.socket && { socket: piece.socket }), shapes: [] }];
  }
  next.parts = { ...parts, [g[0]]: { ...g[1], shapes: [...(Array.isArray(g[1].shapes) ? g[1].shapes : []), id] } };
  return { def: next, shape: id, control: key, option: opt, part: g[0], added: p.added };
}

/** Removes an option from every `when` in a value, and what only that option showed; returns the value (or undefined: drop it). */
function dropWhen(x, key, option, gone) {
  if (Array.isArray(x)) {
    const out = [];
    for (const y of x) { const z = dropWhen(y, key, option, gone); if (z !== undefined) out.push(z); }
    return out;
  }
  if (!isObj(x)) return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === 'when') continue;
    o[k] = dropWhen(v, key, option, gone);
  }
  // a binding that picks by this control: its pick for the option goes; with the control gone, the pick of the look left
  if (o.from === key && isObj(o.pick)) {
    if (gone.control) return Object.hasOwn(o.pick, gone.rest) ? o.pick[gone.rest] : Object.values(o.pick)[0];
    if (Object.hasOwn(o.pick, option)) { o.pick = { ...o.pick }; delete o.pick[option]; }
  }
  if (x.when === undefined) return o;
  const alts = (Array.isArray(x.when) ? x.when : [x.when]).map((w) => {
    if (!isObj(w) || !Array.isArray(w[key])) return w;
    if (gone.control) {   // the control is gone: true where the look left is named (it asks nothing more), else never
      if (!w[key].includes(gone.rest)) return false;
      const r = { ...w }; delete r[key]; return Object.keys(r).length ? r : null;
    }
    const list = w[key].filter((v) => v !== option);
    return list.length ? { ...w, [key]: list } : false;   // false: this alternative is never true now
  });
  const kept = alts.filter((w) => w !== false && w !== null);
  if (alts.some((w) => w === null)) return o;   // an alternative that asks nothing more is always true
  if (!kept.length) { if (typeof x.id === 'string') gone.shapes.add(x.id); return undefined; }   // only that option showed it
  o.when = Array.isArray(x.when) ? kept : kept[0];
  return o;
}

/** Is a control used by anything but its own record and the looks: a binding (from), a when, a part's params? */
function controlUsed(def, key) {
  let hit = false;
  const walk = (x, depth) => {
    if (hit || depth > 40 || x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
    if (x.from === key) { hit = true; return; }
    for (const w of x.when === undefined ? [] : Array.isArray(x.when) ? x.when : [x.when]) if (isObj(w) && Object.hasOwn(w, key)) { hit = true; return; }
    for (const v of Object.values(x)) walk(v, depth + 1);
  };
  const { controls, versions, ...rest } = def;
  walk(rest, 0);
  for (const c of Array.isArray(controls) ? controls : []) if (isObj(c) && c.key !== key) walk(c, 0);
  if (isObj(def.parts)) for (const p of Object.values(def.parts)) if (isObj(p) && Array.isArray(p.params) && p.params.includes(key)) hit = true;
  return hit;
}

/** Takes shape ids out of every list that names shapes (parts, scales, show and hide), recursively. */
function dropShapeRefs(x, ids) {
  if (Array.isArray(x)) return x.map((y) => dropShapeRefs(y, ids));
  if (!isObj(x)) return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if ((k === 'shapes' || k === 'show' || k === 'hide') && Array.isArray(v) && v.every((s) => typeof s === 'string')) o[k] = v.filter((s) => !ids.has(s));
    else o[k] = dropShapeRefs(v, ids);
  }
  return o;
}

/**
 * The definition without one option of a choice: the option goes from the control (its default moves to "none", else
 * the first left), every `when` stops naming it, a shape (or a sound, a key ...) only that option showed goes, with its
 * id from the parts, sliders and frame edits that name it, and a look (versions) that picked it stops picking. A choice
 * left with one option goes with its parts group. Palette slots are kept. Returns { def, removed: [shape ids], control
 * (false when the control went) }. Throws when the control is not a choice or has no such option. Arguments: def, control, option.
 */
export function removePartOption(def, control, option) {
  const c = (Array.isArray(def?.controls) ? def.controls : []).find((x) => isObj(x) && x.key === control);
  if (!c || c.kind !== 'choice') throw new Error(`${control} is not a choice of this sprite.`);
  if (!optionValues(c).includes(option)) throw new Error(`${c.label ?? control} has no look called ${option}.`);
  const left = (c.options ?? []).filter((o) => (isObj(o) ? o.value : o) !== option);
  const gone = { control: left.length < 2, rest: left.map((o) => (isObj(o) ? o.value : o))[0], shapes: new Set() };
  let next = clone(def);
  next.controls = next.controls.flatMap((x) => {
    if (!isObj(x) || x.key !== control) return [x];
    if (gone.control) return [];
    const vals = left.map((o) => (isObj(o) ? o.value : o));
    const y = { ...x, options: left };
    if (y.default === option || y.default === undefined) y.default = vals.includes(NONE) ? NONE : vals[0];
    if (isObj(y.was)) { y.was = Object.fromEntries(Object.entries(y.was).filter(([, v]) => v !== option)); if (!Object.keys(y.was).length) delete y.was; }
    return [y];
  });
  const g = groupOf(next, control);
  if (g && gone.control) { const parts = { ...next.parts }; delete parts[g[0]]; next.parts = parts; }
  else if (g && g[1].none !== undefined) {
    const nones = (Array.isArray(g[1].none) ? g[1].none : [g[1].none]).filter((v) => v !== option);
    const grp = { ...g[1] };
    if (!nones.length) delete grp.none; else grp.none = Array.isArray(g[1].none) ? nones : nones[0];
    next.parts = { ...next.parts, [g[0]]: grp };
  }
  // when, picks, and what only this option showed (the control's own record is done above)
  const ctl = next.controls;
  delete next.controls;
  next = dropWhen(next, control, option, gone);
  next.controls = gone.control ? dropWhen(ctl, control, option, gone) : ctl.map((x) => (isObj(x) && x.key === control ? x : dropWhen(x, control, option, gone))).filter((x) => x !== undefined);
  if (gone.control) next.controls = next.controls.filter((x) => !(isObj(x) && x.key === control));
  // a look that picked it: the pick goes (the control's default is used)
  if (Array.isArray(next.versions)) next.versions = next.versions.map((ver) => (isObj(ver) && isObj(ver.params) && (gone.control ? Object.hasOwn(ver.params, control) : ver.params[control] === option) ? { ...ver, params: Object.fromEntries(Object.entries(ver.params).filter(([k]) => k !== control)) } : ver));
  if (gone.shapes.size) next = dropShapeRefs(next, gone.shapes);
  // the group's other controls (a size, a length) go with it when nothing else uses them now
  if (g && gone.control) {
    for (const k of g[1].params.slice(1)) {
      if (controlUsed(next, k)) continue;
      next.controls = next.controls.filter((x) => !(isObj(x) && x.key === k));
      if (Array.isArray(next.versions)) next.versions = next.versions.map((ver) => (isObj(ver) && isObj(ver.params) && Object.hasOwn(ver.params, k) ? { ...ver, params: Object.fromEntries(Object.entries(ver.params).filter(([q]) => q !== k)) } : ver));
    }
  }
  if (isObj(next.parts) && !Object.keys(next.parts).length) delete next.parts;
  return { def: next, removed: [...gone.shapes], control: !gone.control };
}

/**
 * The definition with another piece in an option's place: every `use` shape only that option shows (when names just it)
 * is the new piece now, its args kept where the new piece takes them, its paint mapped again (paintFor). Returns
 * { def, shapes: [ids changed] }; throws when no shape shows only that option. Arguments: def, control, option, { piece, v }.
 */
export function swapPartPiece(def, control, option, { piece, v } = {}) {
  if (!isObj(piece) || typeof piece.use !== 'string') throw new Error('Pick a piece first.');
  const shapes = Array.isArray(def?.body?.rig?.shapes) ? def.body.rig.shapes : [];
  const only = (s) => isObj(s) && s.kind === 'use' && isObj(s.when) && Object.keys(s.when).length === 1 && Array.isArray(s.when[control]) && s.when[control].length === 1 && s.when[control][0] === option;
  if (!shapes.some(only)) throw new Error(`No piece is worn only for ${option}.`);
  const p = paintFor(def, piece);
  const next = clone(p.def);
  const changed = [];
  const takes = new Set(Object.keys(isObj(piece.args) ? piece.args : {}));
  next.body.rig.shapes = next.body.rig.shapes.map((s) => {
    if (!only(s)) return s;
    changed.push(s.id);
    const args = isObj(s.args) ? Object.fromEntries(Object.entries(s.args).filter(([k]) => takes.has(k))) : {};
    const out = { ...s, use: piece.use, v: Number.isInteger(v) ? v : piece.v };
    delete out.args; delete out.paint;
    if (Object.keys(args).length) out.args = args;
    if (Object.keys(p.paint).length) out.paint = p.paint;
    return out;
  });
  return { def: next, shapes: changed };
}
