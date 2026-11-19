// The library body interface of the studio (studio item F2; docs/studio.md 2.3, "Library bodies: one module each";
// docs/framework-api.md, "Studio definitions: library bodies"; Contract 14 rule 1). A library body is a code rig with a
// data layer: a studio definition names it (`body: { library: "<name>", figure: {...} }`) and framework code draws it.
// Each body is ONE module, rigs/body-<name>.js, that exports a descriptor made by defineLibraryBody() below, and one
// line in engine/library-bodies.js (`export * from '../rigs/body-<name>.js';`) registers it. catalog/studio-schema.js
// checks a definition against its body's descriptor and engine/data-sprite.js draws it through the descriptor's draw and
// socketsAt; neither names a body. So three builders adding three bodies touch three new files and three lines.
//
// THE DESCRIPTOR (fields with * are required; everything is data except the four functions):
//   id*          the name body.library gives: 'humanoid', 'topdown', 'creature:hive-bug' (LIBRARY_BODY_NAME)
//   label*       the everyday name ("Side-view person")
//   view*        'side' | 'front' | 'top-down' | 'none'; a 'top-down' body may have direction clips (walk_down, ...)
//   sizes*       the frame sizes it draws at, [[w, h], ...], the first the default; each one of the style guide's
//                (catalog/studio-schema.js FRAME_SIZES; tests/unit/studio-bodies-registry.test.mjs checks), at most 128x96.
//                A definition picks one with `size`
//   pivots       { "WxH": [x, y] }: its anchor at a size; a size without one gets the schema's defaultPivot
//   figure*      the spec of body.figure, checked by the schema: { field: kind } where a kind is one of FIGURE_FIELD
//                (colour, flag, number(lo, hi), word(values), map(keyWhat, valueWhat, values)) or a block, an object of
//                such kinds one level deep ({ look: { top: colour, ... } }). Unknown fields are dropped with a warning
//   figureHelp   where its fields are described, for messages ("rigs/humanoid-figure.js describes its fields")
//   checkFigure  (figure, kit) => void: checks the spec cannot say (kit: { err(message), warn(message) }); optional
//   settings     the fields a slider or choice may `sets`: { "part.field" | "field": { kind: 'number', min, max } |
//                { kind: 'word', values } }; default: every number and word of the figure spec (settingsOfSpec)
//   aliases      { bareName: "part.field" }: older short names a control's `sets` may use (the person's height)
//   colours      the "part.field" colours body.paint may paint; default: every colour of the spec (coloursOfSpec)
//   blocks       blocks of the figure read with defaults when absent: a control may set a field of one the stored
//                figure has not (any other part it sets must be in the figure; the schema warns)
//   parts        names of the figure's parts a sprite may let people switch off (an on/off part)
//   partSockets  { part: socket }: where an on/off part hangs (Contract 3)
//   sockets      the attach points every frame has: a list, or (figure) => list (the person's muzzle needs thrown)
//   socketsNote  words added to the message about an unknown socket (" (and muzzle when the figure throws: thrown)")
//   keyFields    what a key of a clip may hold: { field: kind } with kind one of KEY_KINDS, as a word ('px') or an
//                object ({ kind: 'count', min, max }, { kind: 'word', values, none: true }; none: null is a value too).
//                px are pixels (at most the frame's size or 64 either way), angle degrees (±720), share 0..1, signed
//                -1..1, point { x, y } px, arm { a, e } degrees, flag true or false (stepped)
//   poses        the formula poses a clip's `from` may name (and bake takes)
//   slots        { slot: { label, material, swatches } }: how a colour slot of that name is offered (others: cloth)
//   draw*        (g, def, { clip, frame, t, p }) => any: draws one frame of a cleaned definition at settings p on g
//                (g is def.size); frame edits (nudge, flash) are its job: libraryFrame() and nudgeSurface() help
//   socketsAt*   (def, { clip, frame, t, p }) => { name: { x, y, angle } } | null: that frame's attach points
//   bake         (def, clip, { frames, loop, from }) => { from, keys, frameEdits? }: a formula pose as keys ("Start
//                this clip over"); null when the body has no formula poses
// A descriptor must not import catalog/studio-schema.js or engine/data-sprite.js (they import the list, which imports
// it); what it needs from the schema it is given (kit) or reads from the definition.
//
// Pure: no DOM, no Node, no clock, no randomness. Runs unchanged in the browser and in Node.
import { framePhase, frameOfPhase } from '../rigs/keypose.js';
import { paintFigure } from './data-rules.js';

/** The version of the library body interface a descriptor follows; defineLibraryBody() stamps it on the descriptor. */
export const LIBRARY_BODY_INTERFACE = 1;

/** The pattern of a library body's name (body.library): a word, or family:word ('creature:hive-bug'); lowercase, digits and dashes, at most 30 each. */
export const LIBRARY_BODY_NAME = /^[a-z][a-z0-9-]{0,29}(?::[a-z][a-z0-9-]{0,29})?$/;

/** The kinds of number or value a key of a library body's clip may hold (keyFields), as catalog/studio-schema.js checks them. */
export const KEY_KINDS = Object.freeze(['px', 'angle', 'share', 'signed', 'count', 'point', 'arm', 'flag', 'word']);

/** The kinds of field a library body's figure spec is written in: colour, flag, number(lo, hi), word(values), map(keyWhat, valueWhat, values). */
export const FIGURE_FIELD = Object.freeze({
  colour: 'colour',
  flag: 'bool',
  number: (lo, hi) => Object.freeze(['num', lo, hi]),
  word: (values) => Object.freeze(['enum', Object.freeze([...values])]),
  map: (keyWhat, valueWhat, values) => Object.freeze(['map', keyWhat, valueWhat, Object.freeze([...values])]),
});

const VIEWS = ['side', 'front', 'top-down', 'none'];
const ID = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isKind = (t) => t === 'colour' || t === 'bool' || (Array.isArray(t) && ((t[0] === 'num' && t.length === 3 && Number.isFinite(t[1]) && Number.isFinite(t[2]) && t[1] < t[2])
  || (t[0] === 'enum' && Array.isArray(t[1]) && t[1].length > 0 && t[1].every((x) => typeof x === 'string'))
  || (t[0] === 'map' && t.length === 4 && typeof t[1] === 'string' && typeof t[2] === 'string' && Array.isArray(t[3]) && t[3].every((x) => typeof x === 'string'))));
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const DEFINED = new WeakSet(), REGISTRIES = new WeakSet();

/** Each field of a figure spec with its "part.field" (or "field" at the top) path: [[path, kind]]. */
function walkSpec(spec) {
  const out = [];
  for (const [k, t] of Object.entries(spec ?? {})) {
    if (isObj(t)) for (const [f, u] of Object.entries(t)) out.push([`${k}.${f}`, u]);
    else out.push([k, t]);
  }
  return out;
}

/**
 * Returns the fields a control may set (`sets`) of a figure spec: every number field as { kind: 'number', min, max } and every word field as { kind: 'word', values }, by "part.field" (or "field" at the top), in the spec's order; frozen.
 * Arguments: spec (a figure spec written in FIGURE_FIELD kinds).
 */
export function settingsOfSpec(spec) {
  const out = [];
  for (const [path, t] of walkSpec(spec)) {
    if (!Array.isArray(t)) continue;
    if (t[0] === 'num') out.push([path, Object.freeze({ kind: 'number', min: t[1], max: t[2] })]);
    else if (t[0] === 'enum') out.push([path, Object.freeze({ kind: 'word', values: Object.freeze([...t[1]]) })]);
  }
  return Object.freeze(Object.fromEntries(out));
}

/**
 * Returns the colour fields in the blocks of a figure spec, as "part.field", in the spec's order: what body.paint may paint (engine/data-rules.js paintFigure paints fields of blocks only); frozen.
 * Arguments: spec (a figure spec written in FIGURE_FIELD kinds).
 */
export function coloursOfSpec(spec) {
  return Object.freeze(walkSpec(spec).filter(([path, t]) => t === 'colour' && path.includes('.')).map(([path]) => path));
}

/** A key field's kind as an object { kind, min?, max?, values?, none? }, or null when it is not one KEY_KINDS knows. */
function keyKind(v) {
  const o = typeof v === 'string' ? { kind: v } : isObj(v) ? { ...v } : null;
  if (!o || !KEY_KINDS.includes(o.kind)) return null;
  const out = { kind: o.kind };
  if (o.kind === 'count') { if (!Number.isInteger(o.min) || !Number.isInteger(o.max) || o.min > o.max) return null; out.min = o.min; out.max = o.max; }
  if (o.kind === 'word') { if (!Array.isArray(o.values) || !o.values.length || !o.values.every((x) => typeof x === 'string')) return null; out.values = [...o.values]; }
  if (o.none) out.none = true;
  return out;
}

/**
 * Returns a library body's descriptor, checked, with its defaults filled in and frozen (the interface is in this file's header). Throws an Error naming the field for a descriptor the schema or the drawing could not use: a mistake in framework code, found when the module loads.
 * Arguments: d (the descriptor: id, label, view, sizes, figure, draw and socketsAt, and the optional fields).
 */
export function defineLibraryBody(d) {
  const bad = (field, why) => { throw new Error(`library body ${typeof d?.id === 'string' ? d.id : '?'}: ${field} ${why}`); };
  if (!isObj(d)) throw new Error('library body: the descriptor must be an object');
  if (typeof d.id !== 'string' || !LIBRARY_BODY_NAME.test(d.id)) bad('id', 'must be a word or family:word, lowercase (LIBRARY_BODY_NAME)');
  if (typeof d.label !== 'string' || !d.label.trim() || d.label.length > 60) bad('label', 'must be an everyday name of at most 60 characters');
  if (!VIEWS.includes(d.view)) bad('view', `must be one of ${VIEWS.join(', ')}`);
  if (!Array.isArray(d.sizes) || !d.sizes.length || !d.sizes.every((s) => Array.isArray(s) && s.length === 2 && s.every(Number.isInteger) && s[0] >= 1 && s[1] >= 1 && s[0] <= 128 && s[1] <= 96)) bad('sizes', 'must list one or more frame sizes [w, h], whole pixels, at most 128 by 96');
  const sizeKeys = d.sizes.map(([w, h]) => `${w}x${h}`);
  const pivots = d.pivots ?? {};
  if (!isObj(pivots) || !Object.entries(pivots).every(([k, p]) => sizeKeys.includes(k) && Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && p[0] >= 0 && p[1] >= 0 && p[0] <= +k.split('x')[0] && p[1] <= +k.split('x')[1])) bad('pivots', 'must be { "WxH": [x, y] } for sizes the body has, whole pixels inside the frame');
  if (!isObj(d.figure) || !Object.keys(d.figure).length) bad('figure', 'must be the spec of body.figure: { field: kind } or { block: { field: kind } }');
  for (const [k, t] of Object.entries(d.figure)) {
    if (!ID.test(k)) bad('figure', `field "${k}" is not a name (a lowercase letter, then letters, digits and dashes)`);
    const ok = isObj(t) ? Object.keys(t).length > 0 && Object.entries(t).every(([f, u]) => ID.test(f) && isKind(u) && !(Array.isArray(u) && u[0] === 'map')) : isKind(t);
    if (!ok) bad('figure', `field "${k}" is not a FIGURE_FIELD kind or a block of them`);
  }
  for (const f of ['draw', 'socketsAt']) if (typeof d[f] !== 'function') bad(f, 'must be a function');
  for (const f of ['bake', 'checkFigure']) if (d[f] !== undefined && d[f] !== null && typeof d[f] !== 'function') bad(f, 'must be a function when given');
  const settings = d.settings ?? settingsOfSpec(d.figure);
  if (!isObj(settings) || !Object.values(settings).every((s) => isObj(s) && ((s.kind === 'number' && Number.isFinite(s.min) && Number.isFinite(s.max) && s.min < s.max) || (s.kind === 'word' && Array.isArray(s.values) && s.values.length)))) bad('settings', 'must be { path: { kind: "number", min, max } | { kind: "word", values } }');
  const aliases = d.aliases ?? {};
  if (!isObj(aliases) || !Object.entries(aliases).every(([k, v]) => ID.test(k) && Object.hasOwn(settings, v))) bad('aliases', 'must map short names to paths of settings');
  const colours = d.colours ?? coloursOfSpec(d.figure);
  const specColours = coloursOfSpec(d.figure);
  if (!Array.isArray(colours) || !colours.every((c) => specColours.includes(c))) bad('colours', 'must list colour fields of the figure spec');
  const names = (field, v) => { const xs = v ?? []; if (!Array.isArray(xs) || !xs.every((x) => typeof x === 'string' && ID.test(x))) bad(field, 'must be a list of names'); return [...xs]; };
  const blocks = names('blocks', d.blocks), parts = names('parts', d.parts), poses = names('poses', d.poses);
  const partSockets = d.partSockets ?? {};
  if (!isObj(partSockets) || !Object.entries(partSockets).every(([k, v]) => parts.includes(k) && typeof v === 'string')) bad('partSockets', 'must be { part: socket } for parts of the body');
  const baseSockets = typeof d.sockets === 'function' ? null : names('sockets', d.sockets);
  const socketNames = typeof d.sockets === 'function' ? (figure) => { try { const xs = d.sockets(figure); return Array.isArray(xs) ? xs.filter((x) => typeof x === 'string') : []; } catch { return []; } } : () => [...baseSockets];
  const keyFields = {};
  for (const [k, v] of Object.entries(d.keyFields ?? {})) {
    if (!ID.test(k) || k === 't' || k === 'ease') bad('keyFields', `"${k}" is not a name a key may use (t and ease are every key's)`);
    const kk = keyKind(v);
    if (!kk) bad('keyFields', `"${k}" has a kind that is not one of ${KEY_KINDS.join(', ')} (count needs whole min and max, word needs values)`);
    keyFields[k] = kk;
  }
  const slots = d.slots ?? {};
  if (!isObj(slots) || !Object.values(slots).every((s) => isObj(s) && typeof s.label === 'string' && typeof s.material === 'string' && Array.isArray(s.swatches))) bad('slots', 'must be { slot: { label, material, swatches } }');
  if (d.figureHelp !== undefined && typeof d.figureHelp !== 'string') bad('figureHelp', 'must be words');
  if (d.socketsNote !== undefined && typeof d.socketsNote !== 'string') bad('socketsNote', 'must be words');
  const body = {
    interface: LIBRARY_BODY_INTERFACE,
    id: d.id, label: d.label, view: d.view,
    sizes: d.sizes.map((s) => [...s]),
    pivots: Object.fromEntries(Object.entries(pivots).map(([k, p]) => [k, [...p]])),
    figure: d.figure,
    figureHelp: d.figureHelp ?? `${d.label}: see its module for the fields`,
    checkFigure: d.checkFigure ?? null,
    settings, aliases: { ...aliases }, colours: [...colours], blocks, parts, partSockets: { ...partSockets },
    socketNames, socketsNote: d.socketsNote ?? '',
    keyFields, poses, slots,
    draw: d.draw, socketsAt: d.socketsAt, bake: d.bake ?? null,
  };
  for (const f of ['sizes', 'pivots', 'figure', 'settings', 'aliases', 'colours', 'blocks', 'parts', 'partSockets', 'keyFields', 'poses', 'slots']) deepFreeze(body[f]);
  Object.freeze(body);
  DEFINED.add(body);
  return body;
}

/**
 * Whether a value is a library body's descriptor made by defineLibraryBody().
 * Arguments: v (anything).
 */
export function isLibraryBody(v) {
  return v !== null && typeof v === 'object' && DEFINED.has(v);
}

/**
 * Returns a registry of library bodies, { names, get(name), has(name) }, frozen: from descriptors, lists of them and module namespaces (each value that is a descriptor or a list of them; other values are passed over). Throws when two bodies have one name.
 * Arguments: ...sources (descriptors, lists, or `import * as` namespaces such as engine/library-bodies.js).
 */
export function libraryBodies(...sources) {
  const byName = new Map();
  const take = (v) => {
    if (isLibraryBody(v)) {
      if (byName.has(v.id) && byName.get(v.id) !== v) throw new Error(`library bodies: the name "${v.id}" is given twice; each body has its own name`);
      byName.set(v.id, v);
    } else if (Array.isArray(v)) v.forEach(take);
  };
  for (const s of sources) {
    if (isLibraryBody(s) || Array.isArray(s)) take(s);
    else if (s !== null && typeof s === 'object') for (const v of Object.values(s)) take(v);
  }
  const names = Object.freeze([...byName.keys()]);
  const reg = Object.freeze({
    names,
    get: (name) => (typeof name === 'string' && byName.has(name) ? byName.get(name) : null),
    has: (name) => typeof name === 'string' && byName.has(name),
  });
  REGISTRIES.add(reg);
  return reg;
}

/**
 * Whether a value is a registry made by libraryBodies() (what catalog/studio-schema.js and engine/data-sprite.js take as opts.bodies).
 * Arguments: v (anything).
 */
export function isLibraryBodies(v) {
  return v !== null && typeof v === 'object' && REGISTRIES.has(v);
}

/**
 * Returns where one frame of a library-body definition is: { clip (the cleaned clip), frame, t (its phase), nudge ([dx, dy], whole px), flash (true or false) }, or null for a clip the definition has not. frame wins over t when given. For a body's draw and socketsAt.
 * Arguments: def (a cleaned loadout-sprite), o: { clip, frame, t }.
 */
export function libraryFrame(def, o = {}) {
  const c = def?.clips?.[o.clip];
  if (!isObj(c)) return null;
  const shape = { frames: Math.max(1, Math.floor(c.frames) || 1), loop: c.loop !== false };
  const frame = Number.isInteger(o.frame) ? Math.min(shape.frames - 1, Math.max(0, o.frame)) : frameOfPhase(shape, Number.isFinite(o.t) ? o.t : 0);
  const t = Number.isInteger(o.frame) || !Number.isFinite(o.t) ? framePhase(shape, frame) : o.t;
  const e = isObj(c.frameEdits) && Object.hasOwn(c.frameEdits, String(frame)) ? c.frameEdits[String(frame)] : null;
  const nudge = Array.isArray(e?.nudge) ? [Math.round(Number(e.nudge[0]) || 0), Math.round(Number(e.nudge[1]) || 0)] : [0, 0];
  return { clip: c, frame, t, nudge, flash: !!e?.flash };
}

/**
 * Moves everything drawn on g by whole pixels; what leaves the frame is cut. Returns g. For a frame edit's nudge.
 * Arguments: g (the Surface), nudge ([dx, dy]).
 */
export function nudgeSurface(g, nudge) {
  const [dx, dy] = Array.isArray(nudge) ? nudge : [0, 0];
  if (!dx && !dy) return g;
  const was = g.data.slice();
  g.data.fill(0);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const v = was[y * g.w + x], nx = x + dx, ny = y + dy;
    if (v && nx >= 0 && ny >= 0 && nx < g.w && ny < g.h) g.data[ny * g.w + nx] = v;
  }
  return g;
}

/**
 * Returns the figure of a library-body definition at settings p, for a body that has no figureFor of its own: a copy of body.figure with each slider's or choice's value (the default when p has none; a choice's `map` applied) in the field it `sets` (short names through the body's aliases), each on/off part switched off removed, and body.paint worked out (engine/data-rules.js paintFigure). A control never adds a part the figure has not, except the body's blocks.
 * Arguments: def (a cleaned loadout-sprite), p (the settings), body (its descriptor).
 */
export function applySettings(def, p = {}, body = null) {
  const fig = JSON.parse(JSON.stringify(def?.body?.figure ?? {}));
  const settings = isObj(p) ? p : {};
  const values = { ...(def?.colours ?? {}) };
  for (const k of Object.keys(values)) if (typeof settings[k] === 'string') values[k] = settings[k];
  for (const c of def?.controls ?? []) {
    if (c.standard) continue;
    const v = Object.hasOwn(settings, c.key) ? settings[c.key] : c.kind === 'colour' ? def.colours?.[c.key] : c.default;
    values[c.key] = v;
    if (typeof c.sets !== 'string') continue;
    const path = body?.aliases?.[c.sets] ?? c.sets;
    const value = c.kind === 'choice' && isObj(c.map) && Object.hasOwn(c.map, v) ? c.map[v] : v;
    const dot = path.indexOf('.');
    if (dot < 0) { fig[path] = value; continue; }
    const part = path.slice(0, dot), field = path.slice(dot + 1);
    if (!isObj(fig[part])) { if (!body?.blocks?.includes(part)) continue; fig[part] = {}; }
    fig[part][field] = value;
  }
  for (const [k, v] of Object.entries(settings)) if (!Object.hasOwn(values, k)) values[k] = v;
  for (const [name, part] of Object.entries(def?.parts ?? {})) {
    if (Array.isArray(part.params)) continue;
    const on = Object.hasOwn(settings, name) ? settings[name] !== false : part.default !== false;
    if (!on) delete fig[name];
  }
  return def?.body?.paint ? paintFigure(fig, def.body.paint, values) : fig;
}
