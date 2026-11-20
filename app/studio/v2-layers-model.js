// The layer editor's model (build item B19c; docs/data-sprites.md 2.4 and section 6): pure changes to a background's
// `body.layers` for the studio's layer editor (app/studio/v2-layers.js), and the arithmetic of its scrolling preview.
//   - the layers as rows, back to front (name, label, scroll speed, wraps, how many things each draws);
//   - a layer's speed (0 to 2, hundredths), wrap and label; renamed (its clip in `clips` and `preview` follow), moved
//     further back or nearer, added (a starter ridge, at most SPRITE_LIMITS.layers), copied (its things get ids of
//     their own, and a thing standing on a copied outline stands on the copy) and removed (never the last);
//   - where a layer is drawn for a camera position, the copies that fill the view, and where its wrap seam falls;
//   - the controls worth trying on a background: those its colour rules read (time of day, a starfield's style) and
//     its colour controls;
//   - the validator's messages about a layer itself.
// Every change gives a new definition (app/studio/v2-model.js setAt), or null when it cannot be made. Nothing here
// draws, validates or touches a page: it runs in the browser and in the tests.
import { SPRITE_LIMITS } from '../../catalog/sprite-schema.js';
import { getAt, setAt, uniqueId, paintRefs } from './v2-model.js';

/** The most layers a background may have (catalog/sprite-schema.js SPRITE_LIMITS.layers). */
export const LAYER_MOST = SPRITE_LIMITS.layers;

/** The range of a layer's scroll speed, as the validator takes it: 0 (fixed to the screen) to 2 (twice the camera). */
export const SCROLL_RANGE = Object.freeze([0, 2]);

/** The names a new layer is given first, before layer-2, layer-3 ... */
const NAMES = ['far', 'mid', 'near', 'front', 'back', 'sky', 'ground', 'top'];
const CLIP_RE = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const LAYERS = ['body', 'layers'];
const listOf = (def) => (Array.isArray(getAt(def, LAYERS)) ? getAt(def, LAYERS) : []);
const at = (def, i) => (Number.isInteger(i) && i >= 0 && i < listOf(def).length && isObj(listOf(def)[i]) ? listOf(def)[i] : null);

/** The layers as rows, back to front: [{ index, name, label, scroll, wraps, count, path }] (scroll left out is 1, wraps left out is true, as the validator reads them). Arguments: def. */
export function layersOf(def) {
  if (!isObj(def?.body) || !Array.isArray(def.body.layers)) return [];
  return def.body.layers.map((l, index) => {
    const o = isObj(l) ? l : {};
    return {
      index, name: typeof o.name === 'string' ? o.name : String(index + 1), label: typeof o.label === 'string' ? o.label : null,
      scroll: fin(o.scroll) ? o.scroll : 1, wraps: o.wraps !== false, count: Array.isArray(o.draw) ? o.draw.length : 0, path: [...LAYERS, index],
    };
  });
}

/** A scroll speed in everyday words: "Still", "Far: slides slowly", "Middle", "Moves with the camera", "In front: faster than the camera". Arguments: scroll. */
export function scrollWords(s) {
  if (!fin(s) || s <= 0) return 'Still: fixed to the screen';
  if (s < 0.3) return 'Far: slides slowly';
  if (s < 0.85) return 'Middle distance';
  if (s <= 1.05) return 'Moves with the camera';
  return 'In front: faster than the camera';
}

/** The definition with layer i's scroll speed set (clamped to SCROLL_RANGE, rounded to hundredths), or null. Arguments: def, i, scroll. */
export function setScroll(def, i, v) {
  if (!at(def, i) || !fin(v)) return null;
  const s = Math.round(Math.min(SCROLL_RANGE[1], Math.max(SCROLL_RANGE[0], v)) * 100) / 100;
  return setAt(def, [...LAYERS, i, 'scroll'], s);
}

/** The definition with layer i wrapping or not (wrapping is the default, so on removes the field), or null. Arguments: def, i, on. */
export function setWraps(def, i, on) {
  if (!at(def, i)) return null;
  return setAt(def, [...LAYERS, i, 'wraps'], on ? undefined : false);
}

/** The definition with layer i's label (trimmed, at most 60 characters; empty removes it), or null. Arguments: def, i, text. */
export function setLabel(def, i, text) {
  if (!at(def, i)) return null;
  const t = String(text ?? '').trim().slice(0, 60);
  return setAt(def, [...LAYERS, i, 'label'], t || undefined);
}

/** Is it a name a layer can take (a clip name none of the other layers has)? Arguments: def, name, except (the index of the layer being renamed). */
export function freeName(def, name, except = -1) {
  if (typeof name !== 'string' || !CLIP_RE.test(name) || PROTO.has(name)) return false;
  return !listOf(def).some((l, j) => j !== except && isObj(l) && l.name === name);
}

/** The definition with layer i renamed, its clip in `clips` and `preview` following; the same definition for the same name; null for a name that is not a clip name or is taken. Arguments: def, i, name. */
export function renameLayer(def, i, name) {
  const l = at(def, i);
  if (!l) return null;
  if (l.name === name) return def;
  if (!freeName(def, name, i)) return null;
  let out = setAt(def, [...LAYERS, i, 'name'], name);
  if (isObj(out.clips) && Object.hasOwn(out.clips, l.name) && !Object.hasOwn(out.clips, name)) {
    out = setAt(out, ['clips'], Object.fromEntries(Object.entries(out.clips).map(([k, v]) => [k === l.name ? name : k, v])));
  }
  if (out.preview === l.name) out = setAt(out, ['preview'], name);
  return out;
}

/** The definition with layer `from` moved to position `to` (0 is the back), or null when either is not a layer. Arguments: def, from, to. */
export function moveLayer(def, from, to) {
  const n = listOf(def).length;
  if (!at(def, from) || !Number.isInteger(to) || to < 0 || to >= n || to === from) return null;
  const next = [...listOf(def)];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return setAt(def, LAYERS, next);
}

/** A name for a new layer: the first of far, mid, near, front ... not taken, then layer-2, layer-3 ... */
function newName(def, base) {
  const taken = listOf(def).filter(isObj).map((l) => l.name);
  if (base) return uniqueId(base, taken);
  return NAMES.find((n) => !taken.includes(n)) ?? uniqueId('layer', taken);
}

/** Every item id used in the layers' draw lists (ids are shared across a background's layers). */
const itemIdsOf = (def) => listOf(def).flatMap((l) => (isObj(l) && Array.isArray(l.draw) ? l.draw.filter((x) => isObj(x) && typeof x.id === 'string').map((x) => x.id) : []));

/**
 * The definition with a new layer at position `at` (default the front), named `name` or the first free of far, mid,
 * near ...; its speed between its neighbours' (in front of all: 0.3 more than the front one; behind all: half the back
 * one's), drawing a starter ridge of the palette's first colour along the bottom, so it passes the check and draws; null
 * when it already has LAYER_MOST layers or the name is taken. Arguments: def, { at, name }.
 */
export function addLayer(def, { at: pos, name } = {}) {
  const list = listOf(def);
  if (list.length >= LAYER_MOST) return null;
  const n = name ?? newName(def);
  if (!freeName(def, n)) return null;
  const i = Number.isInteger(pos) ? Math.max(0, Math.min(list.length, pos)) : list.length;
  const sp = (k) => (isObj(list[k]) && fin(list[k].scroll) ? list[k].scroll : 1);
  const scroll = !list.length ? 0.5 : i >= list.length ? Math.min(SCROLL_RANGE[1], sp(list.length - 1) + 0.3) : i === 0 ? sp(0) / 2 : (sp(i - 1) + sp(i)) / 2;
  const H = Array.isArray(def.size) && fin(def.size[1]) ? def.size[1] : 180;
  const paint = paintRefs(def)[0] ?? 'ink';
  const layer = { name: n, scroll: Math.round(scroll * 100) / 100, draw: [
    { gen: 'ridge', v: 1, id: uniqueId('ground', itemIdsOf(def)), base: H - 6, height: Math.max(4, Math.round(H / 10)), seed: list.length + 1, peaks: 5, paint },
  ] };
  const next = [...list];
  next.splice(i, 0, layer);
  return setAt(def, LAYERS, next);
}

/** The definition with a copy of layer i put in front of it (a new name; its things new ids, and `on` names inside it following them), or null at LAYER_MOST layers. Arguments: def, i. */
export function copyLayer(def, i) {
  const l = at(def, i);
  if (!l || listOf(def).length >= LAYER_MOST) return null;
  const c = clone(l);
  c.name = newName(def, CLIP_RE.test(l.name) ? l.name : 'layer');
  delete c.label;
  const taken = itemIdsOf(def);
  const renamed = new Map();
  for (const it of Array.isArray(c.draw) ? c.draw : []) {
    if (!isObj(it) || typeof it.id !== 'string') continue;
    const id = uniqueId(it.id, taken);
    taken.push(id);
    renamed.set(it.id, id);
    it.id = id;
  }
  for (const it of Array.isArray(c.draw) ? c.draw : []) if (isObj(it) && typeof it.on === 'string' && renamed.has(it.on)) it.on = renamed.get(it.on);
  const next = [...listOf(def)];
  next.splice(i + 1, 0, c);
  return setAt(def, LAYERS, next);
}

/** The definition without layer i, its clip in `clips` gone and `preview` moved to the first layer left; null for the last layer. Arguments: def, i. */
export function removeLayer(def, i) {
  const l = at(def, i);
  if (!l || listOf(def).length <= 1) return null;
  let out = setAt(def, [...LAYERS, i], undefined);
  if (isObj(out.clips) && Object.hasOwn(out.clips, l.name)) out = setAt(out, ['clips', l.name], undefined);
  if (out.preview === l.name) out = setAt(out, ['preview'], listOf(out).find(isObj)?.name);
  return out;
}

const mod = (a, n) => ((a % n) + n) % n;

/** Where a layer's first copy starts on the screen for a camera position (pixels moved by the camera): a whole number in (-width, 0]. Arguments: camera, scroll, width (the layer's). */
export function layerOffset(camera, scroll, width) {
  if (!fin(camera) || !fin(scroll) || !(width > 0)) return 0;
  return -mod(Math.round(camera * scroll), width) || 0;
}

/** The x of each copy of a layer drawn to fill a view `view` pixels wide, its first at `offset`. Arguments: offset, width, view. */
export function copiesFor(offset, width, view) {
  const out = [];
  if (!(width > 0)) return out;
  for (let x = offset; x < view; x += width) if (x + width > 0) out.push(x);
  return out;
}

/** The x in the view of each wrap seam of a layer (where one copy ends and the next starts, an edge included). Arguments: offset, width, view. */
export const seamsIn = (offset, width, view) => copiesFor(offset, width, view).filter((x) => x >= 0 && x < view);

/** The camera position that puts a layer's seam in the middle of a view `view` wide, or null for a still layer. Arguments: scroll, width, view. */
export function cameraForSeam(scroll, width, view) {
  if (!fin(scroll) || scroll <= 0 || !(width > 0)) return null;
  const want = mod(width - Math.round(view / 2), width);
  return want / scroll;
}

/** The control keys a definition's colour rules read (a `{ rule }` paint whose fields bind `{ from: key }`), in the order the controls list them. Arguments: def. */
export function colourRuleKeys(def) {
  const read = new Set();
  const inRule = (v, depth) => {
    if (depth > 40 || v === null || typeof v !== 'object') return;
    if (!Array.isArray(v) && typeof v.from === 'string' && !PROTO.has(v.from)) read.add(v.from);
    for (const x of Array.isArray(v) ? v : Object.values(v)) inRule(x, depth + 1);
  };
  const walk = (v, depth) => {
    if (depth > 40 || v === null || typeof v !== 'object') return;
    if (!Array.isArray(v) && typeof v.rule === 'string') { inRule(v, depth); return; }
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
  };
  walk(def?.body, 0);
  walk(def?.palette, 0);
  const keys = (Array.isArray(def?.controls) ? def.controls : []).filter((c) => isObj(c) && typeof c.key === 'string').map((c) => c.key);
  return keys.filter((k) => read.has(k));
}

/**
 * The controls tried live beside the layers, by key: { time (the time of day: the keys colour rules read, and a control
 * keyed `time`), colours (the colour controls), other (the rest, the standard speed left out) }. Arguments: def.
 */
export function liveControlKeys(def) {
  const ctl = (Array.isArray(def?.controls) ? def.controls : []).filter((c) => isObj(c) && typeof c.key === 'string' && !PROTO.has(c.key));
  const colours = ctl.filter((c) => c.kind === 'colour').map((c) => c.key);
  const read = new Set(colourRuleKeys(def));
  const time = ctl.filter((c) => !colours.includes(c.key) && (read.has(c.key) || c.key === 'time')).map((c) => c.key);
  const other = ctl.filter((c) => !colours.includes(c.key) && !time.includes(c.key) && c.standard !== 'speed').map((c) => c.key);
  return { time, colours, other };
}

/** The layer index a path key ('body.layers.2.draw.0') is in, or null. Arguments: key. */
export function layerOfPath(key) {
  const m = typeof key === 'string' ? /^body\.layers\.(\d+)(?:\.|$)/.exec(key) : null;
  return m ? Number(m[1]) : null;
}

/** The picked layer's index: the one asked for by name (pick), else the clip in hand, else the picked item's layer, else the first. Arguments: def, { pick, clip, sel }. */
export function pickedLayer(def, { pick, clip, sel } = {}) {
  const names = layersOf(def).map((r) => r.name);
  if (typeof pick === 'string' && names.includes(pick)) return names.indexOf(pick);
  if (typeof clip === 'string' && names.includes(clip)) return names.indexOf(clip);
  const s = layerOfPath(sel);
  if (s !== null && s < names.length) return s;
  return 0;
}

/** The validator's messages about a layer itself ('Layer "far": ...'), not about the things it draws ('Layer "far", item 2: ...'). Arguments: messages, name. */
export function layerErrors(messages, name) {
  const head = `Layer "${name}"`;
  return (Array.isArray(messages) ? messages : []).filter((m) => typeof m === 'string' && m.startsWith(head) && !m.startsWith(`${head},`));
}
