// A sprite that is data (docs/studio.md, sections 2.3 and 8, item S4; docs/architecture.md, Contract 14 rule 4).
// A studio definition (`loadout-sprite`) is checked by catalog/studio-schema.js and becomes an ordinary
// defineSprite() result whose render() and sockets() are framework code: the key blender (rigs/keypose.js) poses
// the bone rig and the bone renderer (rigs/bones.js) draws it. Nothing in the definition ever runs. So renderSheet,
// describeSheet, the looks (Contract 7), the export and the quality bar (quality/sprite.js) take it like any sprite.
//
//   import { dataSprite } from '../engine/data-sprite.js';
//   export default dataSprite({ "format": "loadout-sprite", "version": 1, ... });   // a library file (studio.md 2.4)
//
// What the definition becomes (studio.md 2.3):
//   colour slots  one color() control per slot that is not a detail (label and material from the slot; swatches:
//                 the slot's colour first, then the engine's list for its material); detail slots are drawn flat
//                 in their colour and get no control
//   controls      range() sliders that scale the named bones (length) or shapes (size); { standard: "speed" } is
//                 the usual Speed slider (0..1, default 0.5) and every clip's fps becomes fps * lerp(0.65, 1.45, speed)
//   parts         a toggle() per part, as a Contract 3 part ({ params: [name, ...], none: false }). A colour slot or
//                 slider whose shapes all belong to one part is put in that part, so it hides with it
//   clips         frames, loop, label; fps (a number, or a function of Speed); each clip's sounds -> sprite.sounds
//   points        sockets(clip, t, p): the rig's attach points for that frame (Contract 3), absent when it has none
//   the rest      id, name, blurb, meta, size, pivot, grounded, preview; kind from meta.type; the cleaned `definition`
//                 (frozen plain JSON, for the bag, the studio and the library file to read back), `made` in it. The sprite
//                 itself has no `made`: sprite.made means "made on this visit and drawn in a worker" (app/made.js) to
//                 app/api-core.js render and engine/theme.js, and a data sprite is drawn here (review F1, issue 1)
//
// TOP-DOWN BONE RIGS (studio.md section 9, Q4: in version 1; Contract 2: one clip per direction). The data shape:
//   - ONE rig with `view: "top-down"` and an optional `directions` object: an overlay per direction, any of
//     "down", "up", "side", each { bones: { id: { angle, at, length, from } }, shapes: { id: { z, far, hidden, shade,
//     light, and the shape's own geometry: width | from, to, r, offset | at, r | points | at, size } } }. An overlay
//     re-poses and re-proportions the SAME bones and shapes for that view (the body points down the picture facing
//     down, its head drawn last; the eyes hidden facing up; a foreshortened body). The rig's own values are what a
//     direction without an overlay draws, so a template writes its side view as the rig and overlays down and up.
//   - Clips are named `<action>_<down|up|side>` (walk_down, walk_up, walk_side, idle_down ...), each with its own key
//     poses, which hold angles as they are in that direction's rig. A clip with no direction (hurt, die) is drawn
//     facing down, as rigs/topdown.js reads clip names. Side faces right; games mirror it.
//   - The format and its checks live in catalog/studio-schema.js (moved there from this file in studio item S4b), so
//     validateDataSprite() is validateStudioSprite() with its messages capped at MAX_MESSAGES each, and the wall of
//     Contract 14 rule 6 (plain data only, nothing run, 64 KB) is that file's, for the whole definition.
//
// LIBRARY BODIES ({ library: "humanoid", figure }: the side-view person; docs/studio.md 3, "Library bodies in
// dataSprite") are drawn only through rigs/humanoid-studio.js: render() calls drawSprite(g, definition, { clip, frame,
// t, p }) and sockets() calls spriteSockets(definition, { clip, t, p }), never rigs/humanoid-figure.js directly; only
// they apply the Hero's parts, figureFor (sliders, colours, parts, keysFor) and the frame edits. Controls: one color()
// per colour slot keyed by the slot id (label, material and swatches from LIBRARY_SLOTS, by the slot's name), one
// range() per slider keyed by its key, one toggle() per part keyed by the part name (a Contract 3 part with the socket
// it hangs from: held -> hand, headgear and mask -> head, cape and pack -> back), and the standard speed. Size 64 by
// 64; sockets hand, offhand, head, back and feet on every frame.
//
// Pure: no DOM, no Node, no clock, no randomness. Runs unchanged in the browser and in Node.

import { defineSprite, range, choice, color, toggle, SKIN, HAIR, CLOTH, METAL } from './sprite.js';
import { lerp } from './motion.js';
import { validateStudioSprite, parseStudioJson, TOPDOWN_DIRECTIONS, directionOf, directionRig } from '../catalog/studio-schema.js';
import { compileKeys, sampleKeys, framePhase, frameOfPhase } from '../rigs/keypose.js';
import { drawRig, solveRig, rigPoints } from '../rigs/bones.js';
import { drawSprite, spriteSockets } from '../rigs/humanoid-studio.js';

// The top-down helpers live with the format in catalog/studio-schema.js (since studio item S4b); passed on from here
// because the studio's templates and pages reach them through this module.
export { TOPDOWN_DIRECTIONS, DIRECTION_FIELDS, directionOf, directionRig } from '../catalog/studio-schema.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** The most errors, and the most warnings, validateDataSprite returns; past it one last message says how many more there were. */
export const MAX_MESSAGES = 50;

const capList = (list) => (list.length > MAX_MESSAGES ? [...list.slice(0, MAX_MESSAGES), `... and ${list.length - MAX_MESSAGES} more like these`] : list);

/** An own data field of o: { ok: true, v } (v undefined when absent), or { ok: false } for a getter or when o is not an object. */
function field(o, k) {
  if (o === null || typeof o !== 'object') return { ok: false };
  let d;
  try { d = Object.getOwnPropertyDescriptor(o, k); } catch { return { ok: false }; }
  if (!d) return { ok: true, v: undefined };
  return 'value' in d ? { ok: true, v: d.value } : { ok: false };
}

/**
 * Checks a studio sprite for drawing: catalog/studio-schema.js validateStudioSprite, which knows top-down bodies and
 * walls off anything that is not plain data, with its errors and warnings capped at MAX_MESSAGES each. Returns
 * { ok, errors, warnings, value } and never throws; value is the cleaned definition (plain JSON) when ok.
 * Arguments: input (the definition, an object or JSON text), opts (as validateStudioSprite takes them: strict, soundIds, catalogIds).
 */
export function validateDataSprite(input, opts = {}) {
  const v = validateStudioSprite(input, opts);
  return { ok: v.ok, errors: capList(v.errors), warnings: capList(v.warnings), value: v.value };
}

// ---- posing and drawing -----------------------------------------------------------------------------------------

const compiled = new WeakMap();
const compiledOf = (clip) => {
  let c = compiled.get(clip);
  if (!c) { c = compileKeys(clip.keys); compiled.set(clip, c); }
  return c;
};

/** The pose at phase t with frame `frame`'s edits on it. */
function poseAt(def, clipName, t, frame) {
  const c = def?.clips?.[clipName];
  if (!isObj(c)) return {};
  const loop = c.loop !== false;
  const pose = sampleKeys(compiledOf(c), t, { loop });
  const e = isObj(c.frameEdits) && Object.hasOwn(c.frameEdits, String(frame)) ? c.frameEdits[String(frame)] : null;
  if (isObj(e)) {
    if (Array.isArray(e.nudge)) pose.nudge = [e.nudge[0], e.nudge[1]];
    if (e.flash) pose.flash = true;
    const show = Array.isArray(e.show) ? e.show : [], hide = Array.isArray(e.hide) ? e.hide : [];
    if (show.length || hide.length) {
      pose.show = (pose.show ?? []).filter((id) => !hide.includes(id));
      pose.hide = (pose.hide ?? []).filter((id) => !show.includes(id));
      for (const id of show) if (!pose.show.includes(id)) pose.show.push(id);
      for (const id of hide) if (!pose.hide.includes(id)) pose.hide.push(id);
    }
  }
  return pose;
}

/**
 * The pose rigs/bones.js draws for one frame of a clip: the clip's keys blended at the frame's phase (rigs/keypose.js),
 * then the frame's edits (nudge, flash, show and hide, which win over the keys). Never throws; {} for an unknown clip.
 * Arguments: def (a cleaned loadout-sprite, as validateDataSprite or sprite.definition gives it), clip (its name), frame (0..frames-1).
 */
export function framePose(def, clip, frame) {
  const c = def?.clips?.[clip];
  if (!isObj(c)) return {};
  return poseAt(def, clip, framePhase(c, frame), frame);
}

/**
 * The drawing options of rigs/bones.js drawRig for a set of control values: { colours, partsOff, scale: { bones, shapes } }.
 * Sliders that scale the same bone or shape multiply. Arguments: def (a cleaned loadout-sprite with a bone rig), p (control values; missing ones take their defaults).
 */
export function drawOptions(def, p = {}) {
  const rig = def?.body?.rig ?? {};
  const colours = {};
  for (const s of rig.colours ?? []) {
    const given = !s.detail && typeof p[s.id] === 'string' ? p[s.id] : undefined;
    colours[s.id] = given ?? def.colours?.[s.id] ?? s.default;
  }
  const partsOff = Object.keys(def?.parts ?? {}).filter((n) => p[n] === false);
  const scale = { bones: {}, shapes: {} };
  for (const c of def?.controls ?? []) {
    if (!c.scales) continue;
    const k = fin(p[c.key]) ? Math.min(c.max, Math.max(c.min, p[c.key])) : c.default;
    for (const [what, ids] of Object.entries(c.scales)) for (const id of ids) scale[what][id] = (scale[what][id] ?? 1) * k;
  }
  return { colours, partsOff, scale };
}

// ---- building the sprite ----------------------------------------------------------------------------------------

const KIND = { character: 'Character', creature: 'Creature', effect: 'Effect', projectile: 'Effect', background: 'Effect', prop: 'Item', pickup: 'Item', icon: 'Item', ui: 'Item', tileset: 'Item' };   // as the library files set kind for each meta.type
const SWATCHES = { skin: SKIN, metal: METAL };

function swatchesFor(hex, material) {
  const out = [hex];
  for (const c of SWATCHES[material] ?? CLOTH) if (!out.includes(c) && out.length < 8) out.push(c);
  return out;
}

const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

/** The shapes a control changes: those painted with a colour slot, those it scales, those on the bones it scales and their children. */
function shapesOfControl(rig, what, ids) {
  if (what === 'paint') return rig.shapes.filter((s) => s.paint === ids[0]).map((s) => s.id);
  if (what === 'shapes') return ids;
  const under = new Set(ids);
  for (const b of rig.bones) if (b.parent !== null && under.has(b.parent)) under.add(b.id);
  return rig.shapes.filter((s) => under.has(s.bone)).map((s) => s.id);
}

/** The one part that owns every shape in the list, or null. */
function partOwning(parts, shapeIds) {
  if (!shapeIds.length) return null;
  const owner = new Map();
  for (const [name, part] of Object.entries(parts)) for (const s of part.shapes ?? []) owner.set(s, name);
  const first = owner.get(shapeIds[0]);
  return first && shapeIds.every((s) => owner.get(s) === first) ? first : null;
}

/** The speed slider of { standard: "speed" }: 0..1, default 0.5, in the Motion group. */
const speedControl = (c) => range(c.label ?? 'Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' });

/** A slider of the definition's controls as a range() control (step, group and `when` when it gives them: studio item F1). */
const sliderControl = (c) => range(c.label, c.default, { min: c.min, max: c.max, ...(c.lo !== undefined ? { lo: c.lo } : {}), ...(c.hi !== undefined ? { hi: c.hi } : {}), ...(c.step !== undefined ? { step: c.step } : {}), ...more(c) });

/** group and `when` of a control, as engine/sprite.js takes them (copies: the definition is frozen). */
const more = (c) => ({ ...(c.group !== undefined ? { group: c.group } : {}), ...(c.when !== undefined ? { when: JSON.parse(JSON.stringify(c.when)) } : {}) });

/** A choice of the definition's controls (library bodies, studio item F1) as a choice() control: options as written (a word, or { value, label }), `was` for old values. */
const choiceControl = (c) => choice(c.label, c.default, c.options.map((o) => (typeof o === 'string' ? o : { value: o.value, label: o.label })), { ...more(c), ...(c.was !== undefined ? { was: { ...c.was } } : {}) });

/** A colour slot's control, with what a colour control of the definition says about it (label, swatches, material, group, when; studio item F1) over what the slot gives. */
function colourControl(hex, fallback, own) {
  const [label, material, swatches] = fallback;
  if (!own) return color(label, hex, swatches, material ? { material } : {});
  return color(own.label ?? label, hex, own.swatches ? [...own.swatches] : swatches, { ...more(own), ...(own.material !== undefined ? { material: own.material } : {}) });
}

/**
 * What every studio sprite has, bone rig or library body: id, name, blurb, kind, meta, size, pivot, grounded, the clips
 * (fps a function of the Speed slider when there is one: fps * lerp(0.65, 1.45, speed)), each clip's sounds, preview
 * and the frozen definition (where it came from is definition.made; the sprite has no `made`, which means a worker sprite).
 */
function baseOf(definition, speed) {
  const clips = {}, sounds = {};
  for (const [name, c] of Object.entries(definition.clips)) {
    const fps = c.fps;
    clips[name] = { frames: c.frames, loop: c.loop, label: c.label, fps: speed ? (p) => fps * lerp(0.65, 1.45, fin(p?.speed) ? p.speed : 0.5) : fps };
    if (c.sounds?.length) sounds[name] = c.sounds.map((s) => ({ ...s }));
  }
  return {
    id: definition.id,
    name: definition.name,
    blurb: definition.blurb,
    ...(KIND[definition.meta?.type] ? { kind: KIND[definition.meta.type] } : {}),
    ...(definition.meta ? { meta: JSON.parse(JSON.stringify(definition.meta)) } : {}),
    size: [...definition.size],
    pivot: [...definition.pivot],
    grounded: definition.grounded !== false,
    clips,
    sounds,
    preview: definition.preview,
    ...(definition.versions ? { versions: definition.versions.map((v) => ({ name: v.name, params: { ...v.params } })) } : {}),
    definition,
  };
}

// A library body's colour slots are named, not described: the label, material (Contract 7) and swatches of the names
// the Hero uses; any other slot is cloth, labelled from its name.
const LIBRARY_SLOTS = { skin: ['Skin', 'skin', SKIN], hair: ['Hair', 'cloth', HAIR], metal: ['Metal', 'metal', METAL] };
// the attach point each part of the side-view person hangs from (rigs/humanoid.js sockets), for Contract 3
const LIBRARY_SOCKETS = { held: 'hand', headgear: 'head', mask: 'head', cape: 'back', pack: 'back' };

/**
 * Builds the sprite of a library body (the side-view person): drawn and given sockets only through rigs/humanoid-studio.js.
 * Controls in this order: the colour slots that have no colour control, then the definition's controls as listed (a
 * colour control puts its slot's colour there), then one toggle per on/off part. A part with params (studio item F1) is
 * a Contract 3 part as written (params, none, socket); an on/off part hangs from its usual socket.
 */
function buildLibrary(definition) {
  const params = {};
  const own = new Map(definition.controls.filter((c) => c.kind === 'colour').map((c) => [c.key, c]));
  const slotColour = (slot) => {
    const hex = definition.colours[slot];
    const [label, material, list] = LIBRARY_SLOTS[slot] ?? [slot.charAt(0).toUpperCase() + slot.slice(1), 'cloth', CLOTH];
    return colourControl(hex, [label, material, [hex, ...list.filter((c) => c !== hex)].slice(0, 8)], own.get(slot));
  };
  for (const slot of Object.keys(definition.colours)) if (!own.has(slot)) params[slot] = slotColour(slot);
  let speed = false;
  for (const c of definition.controls) {
    if (c.standard === 'speed') { speed = true; params.speed = speedControl(c); continue; }
    if (c.kind === 'colour') params[c.key] = slotColour(c.key);
    else if (c.kind === 'choice') params[c.key] = choiceControl(c);
    else params[c.key] = sliderControl(c);
  }
  const parts = {};
  for (const [name, part] of Object.entries(definition.parts)) {
    if (Array.isArray(part.params)) {
      parts[name] = { label: part.label, params: [...part.params], ...(part.none !== undefined ? { none: Array.isArray(part.none) ? [...part.none] : part.none } : {}), ...(part.socket ? { socket: part.socket } : {}) };
      continue;
    }
    params[name] = toggle(part.label, part.default !== false);
    parts[name] = { label: part.label, params: [name], ...(LIBRARY_SOCKETS[name] ? { socket: LIBRARY_SOCKETS[name] } : {}) };
  }
  return defineSprite({
    ...baseOf(definition, speed),
    params,
    parts,
    render(g, { clip, t, frame, p }) {
      drawSprite(g, definition, { clip, frame, t, p });
    },
    sockets(clip, t, p) {
      return spriteSockets(definition, { clip, t, p }) ?? {};
    },
  });
}

/** Builds the defineSprite result from a cleaned definition (validateDataSprite's value): a bone rig, or a library body. */
function build(def) {
  const definition = deepFreeze(JSON.parse(JSON.stringify(def)));
  if (definition.body?.library !== undefined) return buildLibrary(definition);
  const rig = definition.body.rig;
  const topDown = rig.view === 'top-down';
  const views = topDown ? Object.fromEntries(TOPDOWN_DIRECTIONS.map((d) => [d, deepFreeze(directionRig(rig, d))])) : null;
  const rigOf = (clip) => (topDown ? views[directionOf(clip)] : rig);

  // controls: colour slots, sliders, parts; a control whose shapes all belong to one part goes into that part
  const params = {};
  const partMembers = Object.fromEntries(Object.keys(definition.parts).map((n) => [n, []]));
  const join = (key, shapeIds) => { const part = partOwning(definition.parts, shapeIds); if (part) partMembers[part].push(key); };
  const own = new Map(definition.controls.filter((c) => c.kind === 'colour').map((c) => [c.key, c]));
  for (const s of rig.colours) {
    if (s.detail) continue;
    const hex = definition.colours[s.id] ?? s.default;
    params[s.id] = colourControl(hex, [s.label, s.material, swatchesFor(hex, s.material)], own.get(s.id));
    join(s.id, shapesOfControl(rig, 'paint', [s.id]));
  }
  let speed = false;
  for (const c of definition.controls) {
    if (c.standard === 'speed') { speed = true; params.speed = speedControl(c); continue; }
    if (c.kind === 'colour') continue;          // its slot's control, above
    params[c.key] = sliderControl(c);
    const [what, ids] = Object.entries(c.scales)[0];
    join(c.key, shapesOfControl(rig, what, ids));
  }
  const parts = {};
  for (const [name, part] of Object.entries(definition.parts)) {
    params[name] = toggle(part.label, part.default !== false);
    parts[name] = { label: part.label, params: [name, ...partMembers[name]] };
  }

  const hasPoints = rig.points.length > 0;
  const sprite = {
    ...baseOf(definition, speed),
    params,
    parts,
    render(g, { clip, t, frame, p }) {
      drawRig(g, rigOf(clip), poseAt(definition, clip, t, frame), drawOptions(definition, p));
    },
  };
  if (hasPoints) {
    sprite.sockets = (clip, t, p) => {
      const c = definition.clips[clip];
      if (!c) return {};
      const r = rigOf(clip);
      return rigPoints(r, solveRig(r, poseAt(definition, clip, t, frameOfPhase(c, t)), drawOptions(definition, p)));
    };
  }
  return defineSprite(sprite);
}

/** A readable name for error messages: the definition's id when it can be read safely. */
function idHint(input) {
  let d = input;
  if (typeof input === 'string') { const p = parseStudioJson(input); d = p.ok ? p.value : null; }
  const f = field(d, 'id');
  return f.ok && typeof f.v === 'string' && f.v.length <= 40 ? f.v : '?';
}

/**
 * Turns a studio definition (`loadout-sprite`, an object or JSON text) into a sprite, as defineSprite does for a sprite
 * file: validated, then drawn by framework code (a bone rig by rigs/bones.js, a library body by rigs/humanoid-studio.js).
 * Throws an Error naming what is wrong (the validator's errors) for a definition that does not pass. The default export of a library file.
 * Arguments: input (the definition), opts (as validateDataSprite takes them).
 */
export function dataSprite(input, opts = {}) {
  const v = validateDataSprite(input, opts);
  if (!v.ok) throw new Error(`studio sprite ${idHint(input)}: ${v.errors.slice(0, 12).join('; ')}${v.errors.length > 12 ? `; and ${v.errors.length - 12} more` : ''}`);
  return build(v.value);
}

/**
 * The same as dataSprite, but never throws: { ok, errors, warnings, sprite } (sprite null when not ok). For the studio,
 * the bag and window.loadout, which report problems instead of failing.
 * Arguments: input (the definition, an object or JSON text), opts (as validateDataSprite takes them).
 */
export function makeDataSprite(input, opts = {}) {
  const v = validateDataSprite(input, opts);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, sprite: null };
  try {
    return { ok: true, errors: [], warnings: v.warnings, sprite: build(v.value) };
  } catch (e) {
    return { ok: false, errors: [String(e?.message ?? e)], warnings: v.warnings, sprite: null };
  }
}
