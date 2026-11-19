// What the studio page does to a definition (docs/studio.md sections 2 and 5; item S9). Every change is a pure function
// from a `loadout-sprite` definition to a new one (the input is never changed); the page validates the result before it
// keeps it (engine/data-sprite.js validateDataSprite), so a change that would break the definition never lands. The
// geometry (where a joint is, what a drag means) comes from the framework: rigs/bones.js solveRig, rigs/keypose.js and
// engine/data-sprite.js framePose. Nothing here touches the page: it runs the same in the browser and in Node.
//
// Angles are degrees in the rig convention (0 = down, 90 = picture-right, 180 = up); a child's is relative to its
// parent; a bone's min / max are measured from its rest angle (rigs/bones.js). A key holds only what it changes.
// The words returned (labels, notes, errors) are shown to people, so they are everyday words.
import { solveRig, groundOf } from '../../rigs/bones.js';
import { framePhase, frameOfPhase, snapKeys, clipPose } from '../../rigs/keypose.js';
import { framePose, drawOptions, directionRig, directionOf, TOPDOWN_DIRECTIONS } from '../../engine/data-sprite.js';
import { STANDARD_CLIPS, CLIP_SYNONYMS, FRAME_SIZES, STUDIO_LIMITS, SOCKET_NAMES, RESERVED_IDS } from '../../catalog/studio-schema.js';
import { studioTemplate, studioTemplates } from '../../rigs/studio-templates.js';
import { hero, figureFor, POSE_FIELDS } from '../../rigs/humanoid-studio.js';
import { slugOf } from './drafts.js';
import { libraryHandles, dragLibrary, nudgeLibraryHandle } from './library-body.js';

const RAD = Math.PI / 180;
const cp = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const half = (v) => Math.round(v * 2) / 2;
const wrap180 = (d) => { let x = ((d + 180) % 360 + 360) % 360 - 180; if (x === -180) x = 180; return x; };
const ID = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const RESERVED = new Set(RESERVED_IDS);

/** Words for an id people never typed: "tail1" -> "Tail 1", "eyeShut" -> "Eye shut". */
export function humanize(id) {
  const s = String(id ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

// ---- starting bodies ----------------------------------------------------------------------------------------------

/** The bodies a new draft can start from: every studio template (side view, then top-down) and the Hero from the library: [{ id, kind ('template' | 'library'), label, blurb, view, size, clips }]. */
export function startingBodies() {
  const t = studioTemplates().map((x) => ({ ...x, kind: 'template' }));
  const h = hero();
  return [...t, { id: 'hero', kind: 'library', label: 'Hero', blurb: 'The library\'s Hero, every animation ready to change.', view: 'side', size: [...h.size], clips: Object.keys(h.clips) }];
}

/** A new definition from a starting body's id ('hero' or a template id), named `name`, or null for an unknown id. Arguments: id, name, catalogIds (ids already in the library; the new id avoids them). */
export function startFrom(id, name, catalogIds = []) {
  let d;
  if (id === 'hero') d = hero();
  else d = studioTemplate(id);
  if (!d) return null;
  d.made = { in: 'studio', from: id === 'hero' ? 'library:knight' : `template:${id}` };
  return setName(d, name || d.name, catalogIds);
}

/** True for a definition whose body is a bone rig (false for a library body such as the Hero). */
export const isRig = (def) => isObj(def?.body?.rig);

/** True for a bone rig drawn in three directions (Contract 2: clips per direction). */
export const isTopDown = (def) => def?.body?.rig?.view === 'top-down';

/** The rig a clip is drawn with: a top-down rig's overlay for the clip's direction, else the rig itself. Arguments: def, clip (a clip name, or a direction: 'down', 'up', 'side'). */
export function rigFor(def, clip) {
  const rig = def.body.rig;
  if (rig.view !== 'top-down' || !clip) return rig;
  const dir = TOPDOWN_DIRECTIONS.includes(clip) ? clip : directionOf(clip);
  return directionRig(rig, dir);
}

// ---- bones --------------------------------------------------------------------------------------------------------

/** The bones as a tree in drawing order (parents first): [{ id, parent, depth, label }]. */
export function boneTree(def) {
  if (!isRig(def)) return [];
  const depth = new Map();
  return def.body.rig.bones.map((b) => {
    const d = b.parent == null ? 0 : (depth.get(b.parent) ?? 0) + 1;
    depth.set(b.id, d);
    return { id: b.id, parent: b.parent ?? null, depth: d, label: b.label || humanize(b.id) };
  });
}

/** A bone's everyday name. */
export function boneLabel(def, id) {
  const b = def?.body?.rig?.bones?.find((x) => x.id === id);
  return b ? b.label || humanize(b.id) : humanize(id);
}

/** Where an overlay of a top-down rig sets a bone field, or null (then the rig's own value is the one to change). */
function overlayOf(def, facing, kind, id, field) {
  if (!isTopDown(def) || !facing || facing === 'side') return null;
  const o = def.body.rig.directions?.[facing]?.[kind]?.[id];
  return isObj(o) && o[field] !== undefined ? o : null;
}

/**
 * Change fields of a bone (label, length, angle, min, max, at, from); numbers are kept in range. On a top-down rig seen
 * from `facing` ('down' or 'up'), a field that direction sets itself is changed there.
 * Arguments: def, id (the bone), fields, facing (optional).
 */
export function setBone(def, id, fields, facing) {
  const d = cp(def);
  const b = d.body.rig.bones.find((x) => x.id === id);
  if (!b) return d;
  const [W, H] = d.body.rig.size;
  const most = Math.max(W, H);
  for (const [k, v] of Object.entries(fields ?? {})) {
    let val = v;
    if (k === 'label') { val = String(v ?? '').trim().slice(0, 60); if (!val) { delete b.label; continue; } }
    else if (k === 'length') val = clamp(half(Number(v) || 1), 1, most);
    else if (k === 'angle') val = clamp(r1(Number(v) || 0), -720, 720);
    else if (k === 'min') val = clamp(Math.round(Number(v) || 0), -180, 0);
    else if (k === 'max') val = clamp(Math.round(Number(v) || 0), 0, 180);
    else if (k === 'from') val = clamp(Number(v) || 0, 0, 1);
    else if (k === 'at') val = [clamp(Math.round(v[0]), -W, 2 * W), clamp(Math.round(v[1]), -H, 2 * H)];
    else continue;
    const o = k === 'label' ? null : overlayOf(d, facing, 'bones', id, k);
    (o ?? b)[k] = val;
  }
  return d;
}

/** A name for something new that none of `taken` has: base, base2, base3 ... */
function freshId(base, taken) {
  const used = new Set(taken);
  const b = (ID.test(base) ? base : 'part').slice(0, 36);
  if (!used.has(b)) return b;
  for (let n = 2; ; n++) if (!used.has(`${b}${n}`)) return `${b}${n}`;
}

/** Add a bone at the end of another, pointing on the way it points: { def, id }, or { def, error } at the limit. Arguments: def, parent (a bone id). */
export function addBone(def, parent) {
  const d = cp(def);
  const rig = d.body.rig;
  if (rig.bones.length >= STUDIO_LIMITS.bones) return { def: d, error: `A body can have at most ${STUDIO_LIMITS.bones} bones.` };
  const p = rig.bones.find((b) => b.id === parent) ?? rig.bones[0];
  const id = freshId('bone', rig.bones.map((b) => b.id));
  const n = rig.bones.filter((b) => /^bone\d*$/.test(b.id)).length + 1;
  // after its parent's last descendant, so parents stay before children
  let at = rig.bones.indexOf(p) + 1;
  const under = new Set([p.id]);
  while (at < rig.bones.length && under.has(rig.bones[at].parent)) { under.add(rig.bones[at].id); at++; }
  rig.bones.splice(at, 0, { id, parent: p.id, angle: 0, length: Math.max(2, Math.min(6, Math.round(p.length / 2))), label: `New bone ${n}` });
  return { def: d, id };
}

/** Every bone under a bone, and the bone: a Set of ids. */
function subtree(rig, id) {
  const out = new Set([id]);
  for (const b of rig.bones) if (b.parent != null && out.has(b.parent)) out.add(b.id);
  return out;
}

/** Take shapes, bones, chains out of every place that names them (keys, frame edits, parts, sliders, overlays). */
function forget(d, { bones = new Set(), shapes = new Set(), chains = new Set() }) {
  const rig = d.body.rig;
  for (const c of Object.values(d.clips ?? {})) {
    for (const k of c.keys ?? []) {
      for (const f of ['bones', 'stretch']) if (isObj(k[f])) { for (const id of bones) delete k[f][id]; if (!Object.keys(k[f]).length) delete k[f]; }
      if (isObj(k.ik)) { for (const id of chains) delete k.ik[id]; if (!Object.keys(k.ik).length) delete k.ik; }
      for (const f of ['show', 'hide']) if (Array.isArray(k[f])) { k[f] = k[f].filter((s) => !shapes.has(s)); if (!k[f].length) delete k[f]; }
    }
    if (isObj(c.frameEdits)) {
      for (const [f, e] of Object.entries(c.frameEdits)) {
        for (const x of ['show', 'hide']) if (Array.isArray(e[x])) { e[x] = e[x].filter((s) => !shapes.has(s)); if (!e[x].length) delete e[x]; }
        if (!Object.keys(e).length) delete c.frameEdits[f];
      }
      if (!Object.keys(c.frameEdits).length) delete c.frameEdits;
    }
  }
  for (const [name, p] of Object.entries(d.parts ?? {})) {
    if (!Array.isArray(p.shapes)) continue;
    p.shapes = p.shapes.filter((s) => !shapes.has(s));
    if (!p.shapes.length) delete d.parts[name];
  }
  d.controls = (d.controls ?? []).filter((c) => {
    if (!isObj(c.scales)) return true;
    const [[what, ids]] = Object.entries(c.scales);
    const left = ids.filter((id) => !(what === 'bones' ? bones : shapes).has(id));
    c.scales = { [what]: left };
    return left.length > 0;
  });
  for (const o of Object.values(rig.directions ?? {})) {
    for (const id of bones) if (isObj(o.bones)) delete o.bones[id];
    for (const id of shapes) if (isObj(o.shapes)) delete o.shapes[id];
  }
}

/** Remove a bone with every bone under it, the shapes on them, their chains and attach points, and every key of them: { def, removed: { bones, shapes } } or { def, error } for the last body bone. */
export function removeBone(def, id) {
  const d = cp(def);
  const rig = d.body.rig;
  const b = rig.bones.find((x) => x.id === id);
  if (!b) return { def: d, removed: { bones: 0, shapes: 0 } };
  const roots = rig.bones.filter((x) => x.parent == null);
  if (b.parent == null && roots.length <= 1) return { def: d, error: 'This is the bone the whole body hangs from, so it cannot be removed.' };
  const gone = subtree(rig, id);
  const shapes = new Set(rig.shapes.filter((s) => gone.has(s.bone)).map((s) => s.id));
  const chains = new Set(rig.ik.filter((c) => c.bones.some((x) => gone.has(x))).map((c) => c.id));
  rig.bones = rig.bones.filter((x) => !gone.has(x.id));
  rig.shapes = rig.shapes.filter((s) => !shapes.has(s.id));
  rig.ik = rig.ik.filter((c) => !chains.has(c.id));
  rig.points = rig.points.filter((p) => p.ground || !gone.has(p.bone));
  forget(d, { bones: gone, shapes, chains });
  return { def: d, removed: { bones: gone.size, shapes: shapes.size } };
}

// ---- shapes -------------------------------------------------------------------------------------------------------

/** The shapes a person adds, in their words: Round (an ellipse), Long (a capsule along the bone), Pointed (a wedge), Dot (an eye). */
export const SHAPE_CHOICES = Object.freeze([
  { id: 'round', label: 'Round' }, { id: 'long', label: 'Long' }, { id: 'pointed', label: 'Pointed' }, { id: 'dot', label: 'Dot' },
].map(Object.freeze));
const KIND_WORD = { limb: 'Limb', capsule: 'Long', ellipse: 'Round', poly: 'Pointed', dot: 'Dot' };

/** A shape in words: "Long, Fur". */
export function shapeLabel(shape, def) {
  const slot = def?.body?.rig?.colours?.find((c) => c.id === shape.paint);
  return `${KIND_WORD[shape.kind] ?? 'Shape'}, ${slot?.label ?? humanize(shape.paint)}`;
}

/** Add a shape on a bone: { def, id } (or { def, error } at the limit). Arguments: def, bone (id), kind (round, long, pointed or dot). */
export function addShape(def, bone, kind) {
  const d = cp(def);
  const rig = d.body.rig;
  if (rig.shapes.length >= STUDIO_LIMITS.shapes) return { def: d, error: `A body can have at most ${STUDIO_LIMITS.shapes} shapes.` };
  const b = rig.bones.find((x) => x.id === bone);
  if (!b) return { def: d, error: 'Pick a bone first.' };
  const L = Math.max(1, b.length);
  const near = rig.shapes.filter((s) => s.bone === bone || s.bone === b.parent);
  const body = rig.colours.find((c) => !c.detail) ?? rig.colours[0];
  const detail = rig.colours.find((c) => c.detail) ?? body;
  const paint = kind === 'dot' ? detail.id : (near.find((s) => s.kind !== 'dot')?.paint ?? body.id);
  const z = clamp(Math.max(0, ...near.map((s) => s.z ?? 0)) + 1, -100, 100);
  const id = freshId(`${bone}${kind[0].toUpperCase()}${kind.slice(1)}`.slice(0, 36), rig.shapes.map((s) => s.id));
  const shape = { id, bone, paint, z };
  if (kind === 'round') Object.assign(shape, { kind: 'ellipse', at: [half(L / 2), 0], r: [Math.max(2, half(L / 2)), 2] });
  else if (kind === 'long') Object.assign(shape, { kind: 'capsule', from: 0, to: 1, r: [2, 1.5] });
  else if (kind === 'pointed') Object.assign(shape, { kind: 'poly', points: [[0, -2], [L, 0], [0, 2]] });
  else if (kind === 'dot') Object.assign(shape, { kind: 'dot', at: [L, 0], size: 1, z: Math.max(z, 20) });
  else return { def: d, error: 'That is not a shape the studio makes.' };
  rig.shapes.push(shape);
  return { def: d, id };
}

/** Change fields of a shape: paint (a colour slot), z (front/back, -100..100), far (the darker side), hidden, glow. */
export function setShape(def, id, fields) {
  const d = cp(def);
  const s = d.body.rig.shapes.find((x) => x.id === id);
  if (!s) return d;
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (k === 'paint' && d.body.rig.colours.some((c) => c.id === v)) s.paint = v;
    else if (k === 'z') s.z = clamp(Math.round(Number(v) || 0), -100, 100);
    else if (['far', 'hidden', 'glow'].includes(k)) { if (v) s[k] = true; else delete s[k]; }
  }
  return d;
}

/** Make a shape bigger (step 1) or smaller (step -1): limb width, radii, a wedge's points, a dot's size. */
export function resizeShape(def, id, step) {
  const d = cp(def);
  const s = d.body.rig.shapes.find((x) => x.id === id);
  if (!s) return d;
  const k = step > 0 ? 1 : -1;
  if (s.kind === 'limb') s.width = clamp((s.width ?? 1) + k, 1, STUDIO_LIMITS.limbWidth);
  else if (s.kind === 'capsule' || s.kind === 'ellipse') s.r = s.r.map((r) => clamp(half(r + k * 0.5), 0.5, STUDIO_LIMITS.radius));
  else if (s.kind === 'poly') { const f = k > 0 ? 1.2 : 1 / 1.2; s.points = s.points.map(([u, v]) => [half(u * f), half(v * f)]); }
  else if (s.kind === 'dot') s.size = k > 0 ? 2 : 1;
  return d;
}

/** Remove a shape and every mention of it. */
export function removeShape(def, id) {
  const d = cp(def);
  d.body.rig.shapes = d.body.rig.shapes.filter((s) => s.id !== id);
  forget(d, { shapes: new Set([id]) });
  return d;
}

/** Attach points not used yet, from Contract 3's names. */
export const freePoints = (def) => SOCKET_NAMES.filter((n) => !def.body.rig.points.some((p) => p.id === n));

/** Add an attach point at the tip of a bone ('feet' stands on the ground): { def, id } or { def, error }. Arguments: def, name (one of Contract 3's), bone. */
export function addPoint(def, name, bone) {
  const d = cp(def);
  const rig = d.body.rig;
  if (rig.points.length >= STUDIO_LIMITS.points) return { def: d, error: `A body can have at most ${STUDIO_LIMITS.points} attach points.` };
  if (!SOCKET_NAMES.includes(name) || rig.points.some((p) => p.id === name)) return { def: d, error: 'That attach point is there already.' };
  const b = rig.bones.find((x) => x.id === bone) ?? rig.bones[0];
  rig.points.push(name === 'feet' ? { id: 'feet', ground: true } : { id: name, bone: b.id, at: [b.length, 0] });
  return { def: d, id: name };
}

/** Remove an attach point. */
export function removePoint(def, id) {
  const d = cp(def);
  d.body.rig.points = d.body.rig.points.filter((p) => p.id !== id);
  return d;
}

// ---- keys ---------------------------------------------------------------------------------------------------------

// a clip is one of the definition's own: never a name every object has (constructor, __proto__, toString ...)
const clipOf = (def, clip) => (isObj(def?.clips) && typeof clip === 'string' && Object.hasOwn(def.clips, clip) && isObj(def.clips[clip]) ? def.clips[clip] : null);

/** Is `name` one of the definition's own animations (never a name every object already has)? */
export const hasClip = (def, name) => clipOf(def, name) !== null;
const keyTol = (c) => Math.min(0.002, 0.25 / Math.max(1, c.loop === false ? c.frames - 1 : c.frames));

/** The index of the key that sits on a frame of a clip, or -1. A key between frames (a library body's light keys) is on none. */
export function keyIndexAt(def, clip, frame) {
  const c = clipOf(def, clip);
  if (!c) return -1;
  const t = framePhase(c, frame);
  return (c.keys ?? []).findIndex((k) => Math.abs(k.t - t) <= keyTol(c));
}

/** The frames of a clip that have a key: a Set of frame numbers. */
export function keyFrames(def, clip) {
  const c = clipOf(def, clip);
  const out = new Set();
  if (!c) return out;
  for (let f = 0; f < c.frames; f++) if (keyIndexAt(def, clip, f) >= 0) out.add(f);
  return out;
}

/** The pose of a frame from its keys only (no frame edits): what a new key there starts as. */
export function keyedPose(def, clip, frame) {
  const c = clipOf(def, clip);
  return c ? clipPose({ frames: c.frames, loop: c.loop !== false, keys: c.keys ?? [] }, frame) : {};
}

/** The key on a frame, made (holding nothing yet) when there is none; returns [copy of def, the key]. */
function keyOn(def, clip, frame) {
  const d = cp(def);
  const c = clipOf(d, clip);
  if (!c) return [d, null];
  c.keys = c.keys ?? [];
  let i = keyIndexAt(d, clip, frame);
  if (i < 0) {
    if (c.keys.length >= STUDIO_LIMITS.keysPerClip) return [d, null];
    const k = { t: framePhase(c, frame) };
    c.keys.push(k);
    c.keys.sort((a, b) => a.t - b.t);
    i = c.keys.indexOf(k);
  }
  return [d, c.keys[i]];
}

/** Set one value of the key on a frame (made when there is none). Arguments: def, clip, frame, path (['bones', 'tail1'], ['ik', 'footF'], ['root'], ['footF'] ...), value. */
export function setKeyValue(def, clip, frame, path, value) {
  if (!clipOf(def, clip)) return cp(def);
  const [d, k] = keyOn(def, clip, frame);
  if (!k) return d;
  let o = k;
  for (const p of path.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p]; }
  o[path.at(-1)] = value;
  return d;
}

/** Add a key on a frame holding the pose as it is there (every number the clip's keys set). */
export function addKey(def, clip, frame) {
  if (!clipOf(def, clip) || keyIndexAt(def, clip, frame) >= 0) return cp(def);
  const pose = keyedPose(def, clip, frame);
  const [d, k] = keyOn(def, clip, frame);
  if (!k) return d;
  for (const [f, v] of Object.entries(pose)) if (!['show', 'hide', 't', 'ease', 'nudge', 'flash'].includes(f) && v !== undefined) k[f] = cp(v);
  return d;
}

/** Remove the key on a frame. */
export function deleteKey(def, clip, frame) {
  const d = cp(def);
  const i = keyIndexAt(d, clip, frame);
  if (i >= 0) d.clips[clip].keys.splice(i, 1);
  return d;
}

/** How the motion leaves the key on a frame: smooth, linear, in, out or hold. */
export function setKeyEase(def, clip, frame, ease) {
  const d = cp(def);
  const i = keyIndexAt(d, clip, frame);
  if (i < 0) return d;
  const k = d.clips[clip].keys[i];
  if (!ease || ease === 'smooth') delete k.ease; else k.ease = ease;
  return d;
}

/** A copy of the key on a frame without its time, or null. */
export function copyKey(def, clip, frame) {
  const i = keyIndexAt(def, clip, frame);
  if (i < 0) return null;
  const { t, ...rest } = cp(def.clips[clip].keys[i]);
  return rest;
}

/** Put a copied key on a frame (replacing the key there). */
export function pasteKey(def, clip, frame, data) {
  if (!isObj(data) || !clipOf(def, clip)) return cp(def);
  const d = deleteKey(def, clip, frame);
  const c = d.clips[clip];
  c.keys = c.keys ?? [];
  if (c.keys.length >= STUDIO_LIMITS.keysPerClip) return d;
  c.keys.push({ ...cp(data), t: framePhase(c, frame) });
  c.keys.sort((a, b) => a.t - b.t);
  return d;
}

/** What the key on a frame changes, in everyday names: ['Whole body', 'Tail', 'Near forefoot', ...] ([] when there is no key). */
export function keyChanges(def, clip, frame) {
  const i = keyIndexAt(def, clip, frame);
  if (i < 0) return [];
  const k = def.clips[clip].keys[i];
  const out = [];
  if (!isRig(def)) {
    for (const f of Object.keys(k)) if (LIBRARY_LABELS[f]) out.push(LIBRARY_LABELS[f]);
    return [...new Set(out)];
  }
  const rig = def.body.rig;
  if (k.root) out.push('Whole body');
  for (const c of rig.ik) if (isObj(k.ik) && k.ik[c.id]) out.push(c.label || humanize(c.id));
  for (const id of Object.keys(k.bones ?? {})) out.push(boneLabel(def, id));
  for (const id of Object.keys(k.stretch ?? {})) out.push(`${boneLabel(def, id)} (stretched)`);
  for (const id of [...(k.show ?? []), ...(k.hide ?? [])]) out.push(humanize(id));
  return [...new Set(out)];
}

// ---- handles: what can be dragged on the picture, and the same as rows ------------------------------------------

/** The scale and pose a frame is solved with. */
function solved(def, ctx) {
  const facing = ctx.mode === 'body' ? (ctx.facing || 'side') : ctx.clip;
  const rig = rigFor(def, isTopDown(def) ? facing : null);
  const pose = ctx.mode === 'body' ? {} : framePose(def, ctx.clip, ctx.frame ?? 0);
  const opt = { scale: drawOptions(def, {}).scale };
  return { rig, pose, opt, J: solveRig(rig, pose, opt) };
}

/**
 * The handles of a frame, in frame pixels and in the order Tab moves through them: [{ id, kind, label, at: [x, y], from?: [x, y] }].
 * Body: the body's start ('root') and every bone's tip ('bone:<id>'). Move: the whole body ('root'), each two-bone
 * chain's end ('ik:<id>', a foot or a hand) and the tip of every other bone. Frames: the anchor ('pivot'). A library body has none.
 * Arguments: def, ctx { mode ('body' | 'move' | 'frames'), clip, frame, facing (top-down Body only) }.
 */
export function handles(def, ctx) {
  if (ctx.mode === 'frames') return isRig(def) ? [{ id: 'pivot', kind: 'pivot', label: 'Anchor', at: [...def.pivot] }] : [];
  // a library body (the Hero): hips, hands, feet, head, upper body and the held thing on Move (app/studio/library-body.js, item S10)
  if (!isRig(def)) return ctx.mode === 'move' ? libraryHandles(def, ctx.clip, ctx.frame ?? 0) : [];
  if (ctx.mode !== 'body' && !clipOf(def, ctx.clip)) return [];
  const { rig, J } = solved(def, ctx);
  const out = [];
  const root = rig.bones.find((b) => b.parent == null);
  if (root && J.bones[root.id]) out.push({ id: 'root', kind: 'root', label: ctx.mode === 'body' ? 'Where the body starts' : 'Whole body', at: J.bones[root.id].start });
  const inChain = new Set();
  if (ctx.mode !== 'body') {
    for (const c of rig.ik) {
      const B = J.bones[c.bones[1]];
      if (!B) continue;
      c.bones.forEach((b) => inChain.add(b));
      out.push({ id: `ik:${c.id}`, kind: 'ik', label: c.label || humanize(c.id), at: B.end, from: J.bones[c.bones[0]]?.start });
    }
  }
  for (const b of rig.bones) {
    const B = J.bones[b.id];
    if (!B || inChain.has(b.id)) continue;
    out.push({ id: `bone:${b.id}`, kind: 'bone', label: b.label || humanize(b.id), at: B.end, from: B.start });
  }
  return out;
}

/** The solved bones of a frame for drawing them over the picture: { J, rig }. Arguments: def, ctx (as handles). */
export function skeleton(def, ctx) {
  if (!isRig(def)) return null;
  if (ctx.mode !== 'body' && !clipOf(def, ctx.clip)) return null;
  const { J, rig } = solved(def, ctx);
  return { J, rig };
}

/**
 * Drag a handle to a point (frame pixels): returns the new definition. Body: a bone's tip sets its length and rest
 * angle, the body's start moves it. Move: a bone's tip turns it on that frame's key (stopping at its joint limits), a
 * chain's end becomes its target, the whole body moves by whole pixels. Frames: the anchor moves.
 * Arguments: def, ctx (as handles), id (a handle id), point ([x, y]).
 */
export function dragHandle(def, ctx, id, point) {
  const [px, py] = point;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return cp(def);
  if (id === 'pivot') return setPivot(def, [px, py]);
  if (id.startsWith('lib:')) return ctx.mode === 'move' ? dragLibrary(def, ctx.clip, ctx.frame ?? 0, id, point) : cp(def);
  if (!isRig(def)) return cp(def);
  const { rig, pose, opt, J } = solved(def, ctx);
  const root = rig.bones.find((b) => b.parent == null);
  if (id === 'root') {
    if (!root) return cp(def);
    const S = J.bones[root.id].start;
    if (ctx.mode === 'body') return setBone(def, root.id, { at: [root.at[0] + (px - S[0]), root.at[1] + (py - S[1])] }, ctx.facing);
    const was = Array.isArray(pose.root) ? pose.root : [0, 0];
    const [W, H] = def.size;
    const next = [clamp(Math.round(was[0] + px - S[0]), -W, W), clamp(Math.round(was[1] + py - S[1]), -H, H)];
    return setKeyValue(def, ctx.clip, ctx.frame, ['root'], next);
  }
  if (id.startsWith('ik:')) {
    const cid = id.slice(3);
    const c = rig.ik.find((x) => x.id === cid);
    if (!c || ctx.mode === 'body') return cp(def);
    const J0 = solveRig(rig, { ...pose, ik: { ...(pose.ik ?? {}), [cid]: [0, 0] } }, opt);
    const e0 = J0.bones[c.bones[1]].end;
    const [W, H] = def.size;
    return setKeyValue(def, ctx.clip, ctx.frame, ['ik', cid], [clamp(Math.round(px - e0[0]), -W, W), clamp(Math.round(py - e0[1]), -H, H)]);
  }
  if (id.startsWith('bone:')) {
    const bid = id.slice(5);
    const b = rig.bones.find((x) => x.id === bid);
    const B = J.bones[bid];
    if (!b || !B) return cp(def);
    const vx = px - B.start[0], vy = py - B.start[1];
    const dist = Math.hypot(vx, vy);
    if (dist < 0.5) return cp(def);
    const parentAngle = b.parent == null ? 0 : J.bones[b.parent]?.angle ?? 0;
    const rel = (Math.atan2(vx, vy) - parentAngle) / RAD;
    if (ctx.mode === 'body') {
      const cur = Number(overlayOf(def, ctx.facing, 'bones', bid, 'angle')?.angle ?? b.angle) || 0;
      return setBone(def, bid, { angle: cur + wrap180(rel - cur), length: dist / (B.k || 1) }, ctx.facing);
    }
    return poseBone(def, ctx, b, B.deg, B.deg + wrap180(rel - B.deg));
  }
  return cp(def);
}

/** Put a bone's angle in the frame's key, kept within its joint limits (measured from its rest angle). */
function poseBone(def, ctx, b, cur, next) {
  const rest = Number(b.angle) || 0;
  let v = Math.round(next);
  if (Number.isFinite(b.min)) v = Math.max(v, rest + b.min);
  if (Number.isFinite(b.max)) v = Math.min(v, rest + b.max);
  return setKeyValue(def, ctx.clip, ctx.frame, ['bones', b.id], clamp(v, -720, 720));
}

/** Move a handle by whole pixels (the arrow keys, the arrow buttons): dragHandle to where it is plus [dx, dy]. */
export function nudgeHandle(def, ctx, id, dx, dy) {
  if (typeof id === 'string' && id.startsWith('lib:')) return ctx.mode === 'move' ? nudgeLibraryHandle(def, ctx.clip, ctx.frame ?? 0, id, dx, dy) : cp(def);
  const h = handles(def, ctx).find((x) => x.id === id);
  if (!h) return cp(def);
  if (id === 'pivot') return setPivot(def, [def.pivot[0] + dx, def.pivot[1] + dy]);
  if (h.kind === 'bone' && h.from) {
    // a tip moved by a pixel or two along the circle it turns on would hardly turn a long bone, so a sideways nudge
    // turns it by the angle that pixel makes at the tip, never less than 2 degrees
    const len = Math.hypot(h.at[0] - h.from[0], h.at[1] - h.from[1]) || 1;
    const p = [h.at[0] + dx, h.at[1] + dy];
    const moved = dragHandle(def, ctx, id, p);
    if (JSON.stringify(moved) !== JSON.stringify(def)) return moved;
    const turn = Math.max(2, Math.round(Math.hypot(dx, dy) / len / RAD));
    return turnBone(def, ctx, id.slice(5), Math.sign(dx || -dy) * turn);
  }
  return dragHandle(def, ctx, id, [h.at[0] + dx, h.at[1] + dy]);
}

/** Turn a bone by some degrees: its rest angle in Body, its angle on the frame's key in Move (within its limits). */
export function turnBone(def, ctx, boneId, deg) {
  if (!isRig(def)) return cp(def);
  const { rig, J } = solved(def, ctx);
  const b = rig.bones.find((x) => x.id === boneId);
  if (!b || !J.bones[boneId]) return cp(def);
  if (ctx.mode === 'body') {
    const cur = Number(overlayOf(def, ctx.facing, 'bones', boneId, 'angle')?.angle ?? b.angle) || 0;
    return setBone(def, boneId, { angle: cur + deg }, ctx.facing);
  }
  const chain = rig.ik.find((c) => c.bones.includes(boneId));
  if (chain && isObj(framePose(def, ctx.clip, ctx.frame).ik) && framePose(def, ctx.clip, ctx.frame).ik[chain.id]) return cp(def);
  return poseBone(def, ctx, b, J.bones[boneId].deg, J.bones[boneId].deg + deg);
}

// ---- the Hero and other library bodies: a key's fields as rows with arrows ----------------------------------------

const LIBRARY_LABELS = {
  rootX: 'Whole body', lift: 'Lift', crouch: 'Crouch', lean: 'Lean', headTilt: 'Head tilt', item: 'What the hand holds', item2: 'What the other hand holds',
  footF: 'Near foot', footB: 'Far foot', armF: 'Near arm', armB: 'Far arm', headTurn: 'Head turn', sway: 'Sway',
};
const LIBRARY_ROWS = ['rootX', 'lift', 'crouch', 'lean', 'headTilt', 'footF', 'footB', 'armF', 'armB', 'item'];

/** The pose fields of a library body's frame as rows: [{ id, label, kind ('px' | 'angle' | 'point' | 'arm'), value, keyed }]. */
export function libraryRows(def, clip, frame) {
  if (isRig(def) || !clipOf(def, clip)) return [];
  const pose = keyedPose(def, clip, frame);
  const i = keyIndexAt(def, clip, frame);
  const k = i >= 0 ? def.clips[clip].keys[i] : {};
  return LIBRARY_ROWS.filter((f) => pose[f] !== undefined && pose[f] !== null).map((f) => ({ id: f, label: LIBRARY_LABELS[f], kind: POSE_FIELDS[f].kind, value: pose[f], keyed: k[f] !== undefined }));
}

/**
 * Nudge one pose field of a library body on a frame's key: a point (a foot) moves by [dx, dy] pixels, an arm turns at
 * the shoulder by dx * 5 degrees and bends at the elbow by dy * 5, an angle turns by dx * 5 degrees, a distance by dx px.
 * Arguments: def, clip, frame, field, dx, dy.
 */
export function nudgeLibrary(def, clip, frame, field, dx, dy) {
  const spec = POSE_FIELDS[field];
  if (!spec || isRig(def) || !clipOf(def, clip)) return cp(def);
  const v = keyedPose(def, clip, frame)[field];
  let next;
  if (spec.kind === 'point') next = { ...(isObj(v) ? v : { x: 0, y: 0 }), x: clamp((v?.x ?? 0) + dx, -64, 64), y: clamp((v?.y ?? 0) + dy, -64, 64) };
  else if (spec.kind === 'arm') next = { a: clamp((v?.a ?? 0) + dx * 5, -720, 720), e: clamp((v?.e ?? 0) + dy * 5, -720, 720) };
  else if (spec.kind === 'angle') next = clamp((Number(v) || 0) + dx * 5, -720, 720);
  else if (spec.kind === 'px') next = clamp((Number(v) || 0) + dx, -64, 64);
  else return cp(def);
  return setKeyValue(def, clip, frame, [field], next);
}

// ---- clips --------------------------------------------------------------------------------------------------------

const CLIP_WORDS = { idle: 'Idle', walk: 'Walk', run: 'Run', hop: 'Hop', fly: 'Fly', jump: 'Jump', attack: 'Attack', shoot: 'Shoot', cast: 'Cast a spell', block: 'Block', hurt: 'Hurt', die: 'Die', victory: 'Cheer', talk: 'Talk', dodge: 'Dodge' };
const NO_DIRECTION = new Set(['hurt', 'die']);

/** The action of a clip name: 'walk_down' -> 'walk'. */
const actionOf = (name) => String(name).split('_')[0];

/** The standard animations a definition does not have yet: [{ name, label }]. */
export function newClipChoices(def) {
  const have = new Set(Object.keys(def.clips ?? {}).map(actionOf));
  return Object.keys(STANDARD_CLIPS).filter((n) => !have.has(n)).map((n) => ({ name: n, label: CLIP_WORDS[n] ?? humanize(n) }));
}

/**
 * A new animation from what a person typed: { name, label } or null. A word the style guide spells another way becomes
 * its standard name with the person's word as the label ("Bite" -> attack, label Bite); any other single word is its
 * own name ("Wave" -> wave). Null for several words, odd characters, or an animation it already has.
 */
export function clipFromWords(def, words) {
  const w = String(words ?? '').trim();
  if (!/^[A-Za-z]{2,20}$/.test(w)) return null;
  const low = w.toLowerCase();
  const name = Object.hasOwn(CLIP_SYNONYMS, low) ? CLIP_SYNONYMS[low] : low;
  if (RESERVED.has(name)) return null;
  const have = new Set(Object.keys(def.clips ?? {}).map(actionOf));
  if (have.has(name)) return null;
  return { name, label: w[0].toUpperCase() + w.slice(1).toLowerCase() };
}

/** Why what a person typed cannot be a new animation, in everyday words (null when it can: clipFromWords gives it). */
export function whyNotClip(def, words) {
  const w = String(words ?? '').trim();
  if (!w) return 'Type a name for the new animation.';
  if (!/^[A-Za-z]{2,20}$/.test(w)) return 'Use one word for a new animation, letters only.';
  const low = w.toLowerCase();
  const name = Object.hasOwn(CLIP_SYNONYMS, low) ? CLIP_SYNONYMS[low] : low;
  if (RESERVED.has(name)) return `"${w}" is a word the site keeps for itself. Pick another word.`;
  if (new Set(Object.keys(def.clips ?? {}).map(actionOf)).has(name)) return `This sprite already has ${CLIP_WORDS[name] ?? humanize(name)}. Pick another word.`;
  return null;
}

/** The clip a new animation's keys are copied from: the matching idle (a top-down direction's own), else none. */
function copySource(def, name) {
  const dir = name.includes('_') ? name.split('_')[1] : null;
  const from = dir ? `idle_${dir}` : 'idle';
  return clipOf(def, from) ? from : clipOf(def, 'idle_down') ? 'idle_down' : null;
}

/**
 * Add an animation: its frames, speed and looping from the style guide for its action, its keys copied from Idle (and
 * put on its frames). A top-down body gets one per direction (name_down, name_up, name_side), except hurt and die.
 * Returns { def, names } or { def, error }. Arguments: def, name, { label, copyFrom }.
 */
export function addClip(def, name, { label, copyFrom } = {}) {
  const d = cp(def);
  if (typeof name === 'string' && (RESERVED.has(name) || RESERVED.has(name.toLowerCase()))) return { def: d, error: `"${name}" is a word the site keeps for itself. Pick another word.` };
  if (typeof name !== 'string' || !ID.test(name) || name.includes('_')) return { def: d, error: 'An animation\'s name is one word.' };
  const names = isTopDown(d) && !NO_DIRECTION.has(name) ? TOPDOWN_DIRECTIONS.map((x) => `${name}_${x}`) : [name];
  const std = STANDARD_CLIPS[name] ?? { frames: 8, fps: 10, loop: true };
  const clips = Object.keys(d.clips ?? {});
  if (clips.length + names.length > STUDIO_LIMITS.clips) return { def: d, error: `A sprite can have at most ${STUDIO_LIMITS.clips} animations.` };
  const total = Object.values(d.clips).reduce((s, c) => s + c.frames, 0);
  if (total + std.frames * names.length > STUDIO_LIMITS.frames) return { def: d, error: `A sprite can have at most ${STUDIO_LIMITS.frames} frames in all its animations together.` };
  const base = (label || CLIP_WORDS[name] || humanize(name)).slice(0, 50);
  for (const n of names) {
    if (Object.hasOwn(d.clips, n)) continue;
    const src = clipOf(d, copyFrom) ? copyFrom : copySource(d, n);
    const shape = { frames: std.frames, loop: std.loop };
    const keys = src ? snapKeys(cp(d.clips[src].keys ?? []), shape).keys : [];
    const dir = n.includes('_') ? n.split('_')[1] : null;
    d.clips[n] = { label: dir ? `${base} (${dir})` : base, frames: std.frames, fps: std.fps, loop: std.loop, keys };
    // a library body's copy is made from the same pose as its source, so a change to the body moves it too (item S10)
    if (src && !isRig(d) && typeof d.clips[src].from === 'string') d.clips[n].from = d.clips[src].from;
  }
  return { def: d, names };
}

/** Remove an animation (not the last one); the preview moves to the first that is left. */
export function removeClip(def, name) {
  const d = cp(def);
  if (!clipOf(d, name) || Object.keys(d.clips).length <= 1) return d;
  delete d.clips[name];
  if (d.preview === name || !d.clips[d.preview]) d.preview = Object.keys(d.clips)[0];
  return d;
}

/** Rename an animation in words (its label). */
export function setClipLabel(def, name, label) {
  const d = cp(def);
  const l = String(label ?? '').trim().slice(0, 60);
  if (clipOf(d, name) && l) d.clips[name].label = l;
  return d;
}

// ---- frames -------------------------------------------------------------------------------------------------------

/** Frame edits and sounds past the last frame go. */
function trimClip(c) {
  if (isObj(c.frameEdits)) {
    for (const f of Object.keys(c.frameEdits)) if (Number(f) >= c.frames) delete c.frameEdits[f];
    if (!Object.keys(c.frameEdits).length) delete c.frameEdits;
  }
  if (Array.isArray(c.sounds)) { c.sounds = c.sounds.filter((s) => s.frame < c.frames); if (!c.sounds.length) delete c.sounds; }
}

/**
 * Change a clip's frame count (journey c): keys keep their place in the motion and snap to frames; keys that land on one
 * frame become one. Returns { def, merged: [{ frame, keys }] } (or { def, merged: [], error } past the limits).
 * Arguments: def, clip, frames (1..64).
 */
export function setFrames(def, clip, frames) {
  const d = cp(def);
  const c = clipOf(d, clip);
  if (!c) return { def: d, merged: [] };
  let n = clamp(Math.round(Number(frames) || 1), 1, STUDIO_LIMITS.framesPerClip);
  const others = Object.entries(d.clips).reduce((s, [k, x]) => s + (k === clip ? 0 : x.frames), 0);
  let error;
  if (others + n > STUDIO_LIMITS.frames) { n = Math.max(1, STUDIO_LIMITS.frames - others); error = `All the animations together can have at most ${STUDIO_LIMITS.frames} frames.`; }
  const r = snapKeys(c.keys ?? [], { frames: n, loop: c.loop !== false });
  c.frames = n;
  c.keys = r.keys;
  trimClip(c);
  return { def: d, merged: r.merged, ...(error ? { error } : {}) };
}

/** Frames a second at the middle speed, 1..30. */
export function setFps(def, clip, fps) {
  const d = cp(def);
  if (clipOf(d, clip)) d.clips[clip].fps = clamp(Math.round(Number(fps) || 1), 1, STUDIO_LIMITS.fps);
  return d;
}

/** Loop or play once; the keys keep their place in the motion and snap to the frames: { def, merged }. */
export function setLoop(def, clip, loop) {
  const d = cp(def);
  const c = clipOf(d, clip);
  if (!c) return { def: d, merged: [] };
  c.loop = !!loop;
  const r = snapKeys(c.keys ?? [], { frames: c.frames, loop: c.loop });
  c.keys = r.keys;
  return { def: d, merged: r.merged };
}

/** Move the anchor (whole pixels, inside the frame). */
export function setPivot(def, [x, y]) {
  const d = cp(def);
  const [W, H] = d.size;
  d.pivot = [clamp(Math.round(x), 0, W - 1), clamp(Math.round(y), 0, H - 1)];
  return d;
}

/** Where the feet are: the ground under the body's start, on the ground row (the anchor "Snap to the feet" gives). */
export function feetPivot(def) {
  if (!isRig(def)) return [...def.pivot];
  const J = solveRig(rigFor(def, isTopDown(def) ? 'down' : null), {});
  const [W, H] = def.size;
  return [clamp(Math.round(J.feet[0]), 0, W - 1), clamp(J.ground, 0, H - 1)];
}

/** Whether the anchor stands on the ground (false: a flyer, anchored in the air). */
export function setGrounded(def, grounded) {
  const d = cp(def);
  d.grounded = !!grounded;
  return d;
}

/** The frame sizes a definition may have: the style guide's for a bone rig, the library's one for a library body. */
export const frameSizes = (def) => (isRig(def) ? FRAME_SIZES.map((s) => [...s]) : [[...def.size]]);

/** Change a bone rig's frame size: the body moves with the bottom middle of the frame, and stands on the new ground row. */
export function setFrameSize(def, [w, h]) {
  const d = cp(def);
  if (!isRig(d) || !FRAME_SIZES.some(([a, b]) => a === w && b === h)) return d;
  const [W, H] = d.size;
  const dx = Math.round((w - W) / 2), dy = groundOf({ size: [w, h] }) - groundOf({ size: [W, H] });
  const rig = d.body.rig;
  for (const b of rig.bones) if (b.parent == null && Array.isArray(b.at)) b.at = [b.at[0] + dx, b.at[1] + dy];
  for (const o of Object.values(rig.directions ?? {})) for (const [id, b] of Object.entries(o.bones ?? {})) {
    if (Array.isArray(b.at) && rig.bones.find((x) => x.id === id)?.parent == null) b.at = [b.at[0] + dx, b.at[1] + dy];
  }
  rig.size = [w, h];
  d.size = [w, h];
  d.pivot = [clamp(d.pivot[0] + dx, 0, w - 1), clamp(d.pivot[1] + dy, 0, h - 1)];
  return d;
}

/** Change one frame's adjustments: nudge ([dx, dy] whole px, or null to clear), flash (true / false). An empty edit goes. */
export function setFrameEdit(def, clip, frame, patch) {
  const d = cp(def);
  const c = clipOf(d, clip);
  if (!c || frame < 0 || frame >= c.frames) return d;
  const all = isObj(c.frameEdits) ? c.frameEdits : {};
  const e = isObj(all[String(frame)]) ? all[String(frame)] : {};
  if ('nudge' in patch) {
    const n = Array.isArray(patch.nudge) ? patch.nudge.map((v) => clamp(Math.round(v), -d.size[0], d.size[0])) : null;
    if (n && (n[0] || n[1])) e.nudge = n; else delete e.nudge;
  }
  if ('flash' in patch) { if (patch.flash) e.flash = true; else delete e.flash; }
  if (Object.keys(e).length) all[String(frame)] = e; else delete all[String(frame)];
  if (Object.keys(all).length) c.frameEdits = all; else delete c.frameEdits;
  return d;
}

/** Show or hide one shape on one frame (state 'show', 'hide', or null to leave it to the keys). */
export function setFrameShape(def, clip, frame, shape, state) {
  const d = cp(def);
  const c = clipOf(d, clip);
  if (!c || frame < 0 || frame >= c.frames) return d;
  const all = isObj(c.frameEdits) ? c.frameEdits : {};
  const e = isObj(all[String(frame)]) ? all[String(frame)] : {};
  for (const f of ['show', 'hide']) { e[f] = (e[f] ?? []).filter((s) => s !== shape); if (!e[f].length) delete e[f]; }
  if (state === 'show' || state === 'hide') e[state] = [...(e[state] ?? []), shape];
  if (Object.keys(e).length) all[String(frame)] = e; else delete all[String(frame)];
  if (Object.keys(all).length) c.frameEdits = all; else delete c.frameEdits;
  return d;
}

/** Shapes that can be shown or hidden frame by frame: those hidden at rest and those a key shows or hides: [{ id, label }]. */
export function switchableShapes(def) {
  if (!isRig(def)) return [];
  const named = new Set();
  for (const c of Object.values(def.clips)) for (const k of c.keys ?? []) for (const s of [...(k.show ?? []), ...(k.hide ?? [])]) named.add(s);
  return def.body.rig.shapes.filter((s) => s.hidden || named.has(s.id)).map((s) => ({ id: s.id, label: humanize(s.id) }));
}

// ---- look and name ------------------------------------------------------------------------------------------------

/** Name it (at most 60 characters); its file name follows ("Moss newt" -> moss-newt), never one the library already has. Arguments: def, name, catalogIds. */
export function setName(def, name, catalogIds = []) {
  const d = cp(def);
  const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!n) return d;
  d.name = n;
  let id = slugOf(n) || d.id;
  if (catalogIds.includes(id)) id = `${id.slice(0, 35).replace(/-+$/, '')}-mine`;
  d.id = id;
  return d;
}

/** The one sentence under the name (at most 300 characters). */
export function setBlurb(def, text) {
  const d = cp(def);
  d.blurb = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return d;
}

/** "What is it?": the answers people pick from, each a role in the library (Contract 1) and, where it decides it, a type. */
export const WHAT_IS_IT = Object.freeze([
  { id: 'player', label: 'Player', role: 'characters/player', type: 'character' },
  { id: 'enemy', label: 'Enemy', role: 'characters/enemy' },
  { id: 'boss', label: 'Boss', role: 'characters/boss' },
  { id: 'animal', label: 'Animal', role: 'characters/animal', type: 'creature' },
  { id: 'npc', label: 'Someone to meet', role: 'characters/npc', type: 'character' },
].map(Object.freeze));

/** Which answer of WHAT_IS_IT a definition has, or null. */
export const whatOf = (def) => WHAT_IS_IT.find((w) => w.role === def?.meta?.role)?.id ?? null;

/** Answer "What is it?". */
export function setWhat(def, id) {
  const d = cp(def);
  const w = WHAT_IS_IT.find((x) => x.id === id);
  if (!w) return d;
  d.meta = { ...(d.meta ?? {}), role: w.role, type: w.type ?? (['character', 'creature'].includes(d.meta?.type) ? d.meta.type : 'creature') };
  return d;
}

/** "Seen from": side, front or none for a bone rig drawn one way (a top-down body stays top-down). */
export function setView(def, view) {
  const d = cp(def);
  if (!isRig(d) || isTopDown(d) || !['side', 'front', 'none'].includes(view)) return d;
  d.body.rig.view = view;
  d.meta = { ...(d.meta ?? {}), view };
  return d;
}

/** The colours people change: [{ id, label, value }] (eyes and other details are not offered). */
export function colourSlots(def) {
  if (isRig(def)) return def.body.rig.colours.filter((c) => !c.detail).map((c) => ({ id: c.id, label: c.label || humanize(c.id), value: def.colours?.[c.id] ?? c.default }));
  return Object.entries(def.colours ?? {}).map(([id, value]) => ({ id, label: humanize(id), value }));
}

/** Set a colour slot's colour (#rrggbb); anything that is not a colour changes nothing. A library body's figure follows. */
export function setColour(def, slot, hex) {
  const d = cp(def);
  if (!HEX.test(String(hex))) return d;
  const c = String(hex).toLowerCase();
  if (isRig(d)) {
    if (!d.body.rig.colours.some((s) => s.id === slot)) return d;
  } else {
    if (!Object.hasOwn(d.colours ?? {}, slot)) return d;
    const { keys, keysFor, ...figure } = figureFor(d, { [slot]: c });
    d.body.figure = figure;
  }
  d.colours = { ...(d.colours ?? {}), [slot]: c };
  return d;
}

/** The words people type to find it: commas between them, lowercase, each once, at most 30 of 30 characters. */
export function setWords(def, text) {
  const d = cp(def);
  const words = [];
  for (const raw of String(text ?? '').split(/[,;\n]+/)) {
    const w = raw.toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30).trim();
    if (w && !words.includes(w)) words.push(w);
  }
  d.meta = { ...(d.meta ?? {}), words: words.slice(0, 30) };
  return d;
}

/** Add a slider people get that makes a bone longer or shorter: { def, key } or { def, error }. Arguments: def, { label, bone }. */
export function addSlider(def, { label, bone }) {
  const d = cp(def);
  if (!isRig(d) || !d.body.rig.bones.some((b) => b.id === bone)) return { def: d, error: 'Pick a bone for the slider to change.' };
  const count = d.controls.length + d.body.rig.colours.filter((c) => !c.detail).length + Object.keys(d.parts ?? {}).length;
  if (count >= STUDIO_LIMITS.controls) return { def: d, error: `A sprite can have at most ${STUDIO_LIMITS.controls} controls.` };
  const l = String(label ?? '').trim().slice(0, 60) || boneLabel(d, bone);
  const key = freshId(`${bone}Size`.replace(/-/g, ''), [...d.controls.map((c) => c.key), ...Object.keys(d.parts ?? {}), ...d.body.rig.colours.map((c) => c.id)]);
  d.controls.push({ key, label: l, lo: 'Short', hi: 'Long', min: 0.6, max: 1.4, default: 1, scales: { bones: [bone] } });
  return { def: d, key };
}

/** Remove a control (a slider, or Speed). */
export function removeControl(def, key) {
  const d = cp(def);
  d.controls = d.controls.filter((c) => c.key !== key);
  return d;
}

/** Add a part people can switch off, made of some shapes: { def, key } or { def, error }. Arguments: def, { label, shapes }. */
export function addPart(def, { label, shapes }) {
  const d = cp(def);
  if (!isRig(d)) return { def: d, error: 'This body\'s parts come from the library.' };
  const ids = (shapes ?? []).filter((s) => d.body.rig.shapes.some((x) => x.id === s));
  if (!ids.length) return { def: d, error: 'Pick a bone that has shapes on it first.' };
  if (Object.keys(d.parts ?? {}).length >= STUDIO_LIMITS.parts) return { def: d, error: `A sprite can have at most ${STUDIO_LIMITS.parts} parts.` };
  const l = String(label ?? '').trim().slice(0, 60) || 'Part';
  const key = freshId(slugOf(l).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()) || 'part', [...Object.keys(d.parts ?? {}), ...d.controls.map((c) => c.key), ...d.body.rig.colours.map((c) => c.id)]);
  d.parts = { ...(d.parts ?? {}), [key]: { label: l, shapes: ids, default: true } };
  return { def: d, key };
}

/** Whether a part is on when someone first opens the sprite. */
export function setPartDefault(def, key, on) {
  const d = cp(def);
  if (d.parts?.[key]) d.parts[key].default = !!on;
  return d;
}

/** Remove a part (its shapes stay, always drawn). */
export function removePart(def, key) {
  const d = cp(def);
  if (d.parts) delete d.parts[key];
  return d;
}
