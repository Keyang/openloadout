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
// LIBRARY BODIES ({ library: "<name>", figure }; docs/studio.md 2.3, "Library bodies: one module each"; studio item
// F2) are drawn only through their body's descriptor (engine/library-body.js), found by name in the registry
// (catalog/studio-schema.js LIBRARY_REGISTRY, every body engine/library-bodies.js lists; opts.bodies replaces it):
// render() calls body.draw(g, definition, { clip, frame, t, p }) and sockets() calls body.socketsAt(definition, { clip,
// t, p }). This file names no body. The side-view person (rigs/body-humanoid.js) draws through rigs/humanoid-studio.js
// drawSprite and spriteSockets, which apply the Hero's parts, figureFor (sliders, colours, parts, keysFor) and the frame
// edits. Controls: one color() per colour slot keyed by the slot id (label, material and swatches from the body's
// `slots`, by the slot's name; any other slot is cloth), one range() per slider and one choice() per choice keyed by
// its key, one toggle() per on/off part keyed by the part name (a Contract 3 part with the socket the body's
// `partSockets` gives it: the person's held -> hand, headgear and mask -> head, cape and pack -> back), and the standard
// speed. Size: the definition's (one of the body's sizes); sockets: whatever the body's socketsAt gives.
//
// VERSION 2 (docs/data-sprites.md sections 2 and 4.1, build item B6; Contract 15). dataSprite and makeDataSprite read
// `version` first: a version 2 definition takes the pipeline below, anything else the version 1 path above, unchanged.
//   1 validate   catalog/sprite-schema.js validateSprite (opts.generators: the registry, default the site's,
//                engine/gen/index.js; opts.pieces: a piece store, engine/pieces.js createPieceStore, default sitePieces(),
//                with every piece the definition names loaded; strict, soundIds, catalogIds as the validator takes them)
//   2 resolve    engine/resolve.js resolveSprite, once per settings (the last 32 kept): bindings, `when`, parts, the
//                palette, pieces drawn in, a base merged, the clips
//   3 pose       rigs/keypose.js: the clip's keys at the frame's phase, then its frame edits (nudge, flash, show, hide, swap)
//   4-7 a rig    rigs/bones.js (build item B5) does the rest: drawResolvedRig(g, resolved, pose, ctx) for render (the
//                direction's overlay, solveRig, rigList, drawList), resolvedRigPoints for sockets, resolvedRigList for
//                dataFrameList (the same rig, pose and context, so the list is what render draws); ctx.expand is engine/resolve.js expandFrame bound to the resolved sprite and the registry
//   4 lay out    any other body: its LAYOUT (below) turns the resolved body and the pose into a draw list; the built-in
//                `pictures` one lays out the node tree (each node's at, turn, scale, with the keys' `nodes` { turn, move,
//                scale } and the motions added; parents first), the root key, nudge and whole-picture motions moving everything
//   5            engine/resolve.js expandFrame: generator calls run, placed pieces drawn in, colour rules worked out
//   6            each primitive with `on` put on its node's frame (engine/draw-list.js placeOn with nodeFrame)
//   7            engine/draw-list.js drawList with the resolved palette
// What it becomes: one control per setting of engine/resolve.js settingTable (the palette's colour slots first, each a
// color() with its slot's label, material and swatches; then the controls as listed; Speed as in version 1), Contract
// 3 parts as written (an on/off part with no params is a toggle keyed by its name), clips from the resolved clips
// (fps a function of Speed when there is one; an icon set's pictures are one-frame clips), each clip's sounds with
// their control conditions kept (cueInEffect decides), sockets from the attach points (a rig's and the sprite's), slice
// and textArea when the definition has them, materials { rest }, materialTable(p) (Contract 7 read from the slots,
// engine/resolve.js materialTable), versions, `was`, `definition` (the cleaned definition, frozen) and styles ['pixel']
// (draw-list.js is the pixel renderer; other styles come with their renderer).
// Choices where the design leaves room (reported with B6):
//   - A pictures body is outlined only where its list says so (a rig gets one at the end unless its list outlines
//     everything, as rigs/bones.js does). The white flash is a tint just before the last outline, as for a rig.
//   - A generator or piece that cannot be drawn in a frame is an error (render throws), not a silent gap.
//   - A motion (pictures.motion: pickup.bob ...) is a registry entry of family "motion" whose run(args, ctx) returns
//     node moves [{ node?, move: [dx, dy], turn, scale }] (no node: the call's `node`, else the whole picture); one the
//     registry has not got is left out with a warning (the motions are build item B8's). `fit` (icon.fit) is not drawn
//     yet (B8). Emitters: see EMITTERS below.
//   - Per-clip draw lists (pictures.per) go in just before the body's first outline, so they are outlined with it; an
//     icon set's picture is drawn first, then the shared list, turned by its `angle` round the frame's centre.
//
// LAYOUTS (docs/data-sprites.md 1.2 item 1, 3.3 "layout", 4.1 step 4). Every body but a rig is laid out by a layout: a
// generator of family "layout" whose id is the body kind ("pictures", "emitters", "panel", "layers", "tiles"), found in
// the registry (opts.generators, default the site's), the newest version. So build items B8 and B12 to B15 add theirs
// with defineGenerator({ id: "<kind>", v: 1, family: "layout", about, args: {}, cost: () => 0, run }) in their own
// engine/gen/<family>.js, and this file does not change. A rig is always rigs/bones.js. A `pictures` body with no layout
// registered uses picturesLayout (exported here, so engine/gen/pictures.js may register it or replace it; call it from
// inside run, not at load, as engine/gen/index.js is imported by this file). Any other body with none is refused,
// naming its build item (NOT_BUILT_BODIES) and the file, after the definition has passed its check.
//   run(input, ctx) is called once per frame drawn. ctx is what a generator sees: { t, frame, frames, loop, size, clip,
//   direction: null } (frozen). input (frozen): kind; body (the resolved body: R.body[kind], or the whole body for
//   `emitters`); resolved (resolveSprite's result: palette, params, scales, points, clips ...); clip (the resolved
//   clip); pose (rigs/keypose.js, with the frame edits: root, nudge, nodes, emit, show, hide, swap, flash); generators
//   (the registry); warn(text); and four helpers: expand(items) -> { primitives, palette } (engine/resolve.js
//   expandFrame; throws naming the sprite, clip and frame when a generator or piece fails), place(primitives, frames?)
//   (each primitive with `on` put on its node's frame), nodeFrames(nodes, changes?) -> Map id -> frame (a node tree
//   laid out; changes: Map id -> { move, turn, scale }), visible(items, { show, hide }?) (hidden items left out unless
//   shown, stamps swapped by the pose).
//   It returns { list (primitives in frame pixels, for engine/draw-list.js), palette?, frames? (Map id -> frame, for
//   the definition's attach points), offset? ([dx, dy] the whole picture moved), points? ({ id: { x, y, angle } }:
//   sockets of its own), slice?, textArea? (Contract 8, for this frame's clip) }. The white flash of a frame edit is
//   added here, for every layout. A layout that throws or gives no list makes the frame throw. A layout that gives
//   points, slice or textArea for the first frame of any clip at the default settings (each clip's first frame is laid
//   out once when the sprite is made) gives the sprite sockets, slice and textArea; a slice or textArea the definition
//   writes wins over the layout's for its clips.
// EMITTERS (in a `pictures` body; recorded in docs/data-sprites.md 2.5c for B12). An emitter that some clip's keys give
//   an `amount` is off wherever no key gives it an amount above 0 (the coin's collect burst stays off in spin); an
//   emitter no key gives an amount always draws (a projectile's trail; the 2.5c example's sparks), its `when` and `clip`
//   deciding as for any item. Keys may move its `at` and set its keyable arguments; the amount reaches a generator
//   that has an `amount` argument.
//
// Pure: no DOM, no Node, no clock, no randomness. Runs unchanged in the browser and in Node.

import { defineSprite, range, choice, color, toggle, SKIN, CLOTH, METAL } from './sprite.js';
import { lerp } from './motion.js';
import { validateStudioSprite, parseStudioJson, libraryBody, TOPDOWN_DIRECTIONS, directionOf, directionRig } from '../catalog/studio-schema.js';
import { compileKeys, sampleKeys, framePhase, frameOfPhase } from '../rigs/keypose.js';
import { drawRig, solveRig, rigPoints, drawResolvedRig, resolvedRigList, resolvedRigPoints } from '../rigs/bones.js';
import { validateSprite, parseSpriteJson } from '../catalog/sprite-schema.js';
import { resolveSprite, expandFrame, sceneItems, materialTable, paintHex, settingTable } from './resolve.js';
import { drawList, placeOn, nodeFrame, lostPaints } from './draw-list.js';
import { pieceRegistry, sitePieces } from './pieces.js';
import { swatches as paletteSwatches } from './palettes.js';
import { MATERIAL_IDS } from './materials.js';
import * as SITE_GENERATORS from './gen/index.js';

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

/** A definition's own clip by name (never an Object.prototype member such as 'toString' or '__proto__'), else null. */
const clipOwn = (def, name) => (isObj(def?.clips) && typeof name === 'string' && Object.hasOwn(def.clips, name) && isObj(def.clips[name]) ? def.clips[name] : null);

/** The pose at phase t with frame `frame`'s edits on it. */
function poseAt(def, clipName, t, frame) {
  const c = clipOwn(def, clipName);
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
  const c = clipOwn(def, clip);
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

// A library body's colour slots are named, not described: the label, material (Contract 7) and swatches its body's
// `slots` give that name (the person's skin, hair and metal); any other slot is cloth, labelled from its name. Where an
// on/off part hangs (Contract 3) is the body's `partSockets`.

/**
 * Builds the sprite of a library body: drawn and given sockets only through its body's descriptor (draw, socketsAt).
 * Controls in this order: the colour slots that have no colour control, then the definition's controls as listed (a
 * colour control puts its slot's colour there), then one toggle per on/off part. A part with params (studio item F1) is
 * a Contract 3 part as written (params, none, socket); an on/off part hangs from its usual socket.
 */
function buildLibrary(definition, body) {
  const params = {};
  const own = new Map(definition.controls.filter((c) => c.kind === 'colour').map((c) => [c.key, c]));
  const slotColour = (slot) => {
    const hex = definition.colours[slot];
    const named = Object.hasOwn(body.slots, slot) ? body.slots[slot] : null;
    const [label, material, list] = named ? [named.label, named.material, named.swatches] : [slot.charAt(0).toUpperCase() + slot.slice(1), 'cloth', CLOTH];
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
    parts[name] = { label: part.label, params: [name], ...(Object.hasOwn(body.partSockets, name) ? { socket: body.partSockets[name] } : {}) };
  }
  return defineSprite({
    ...baseOf(definition, speed),
    params,
    parts,
    render(g, { clip, t, frame, p }) {
      body.draw(g, definition, { clip, frame, t, p });
    },
    sockets(clip, t, p) {
      return body.socketsAt(definition, { clip, t, p }) ?? {};
    },
  });
}

/** Builds the defineSprite result from a cleaned definition (validateDataSprite's value): a bone rig, or a library body (found in the registry; opts.bodies replaces it). */
function build(def, opts = {}) {
  const definition = deepFreeze(JSON.parse(JSON.stringify(def)));
  if (definition.body?.library !== undefined) {
    const body = libraryBody(definition.body.library, opts);
    if (!body) throw new Error(`studio sprite ${definition.id}: there is no library body ${JSON.stringify(definition.body.library)}`);
    return buildLibrary(definition, body);
  }
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
      const c = clipOwn(definition, clip);
      if (!c) return {};
      const r = rigOf(clip);
      return rigPoints(r, solveRig(r, poseAt(definition, clip, t, frameOfPhase(c, t)), drawOptions(definition, p)));
    };
  }
  return defineSprite(sprite);
}

// ---- version 2 (build item B6; see VERSION 2 in the header) -----------------------------------------------------

/** The bodies of version 2 with no layout in this file, each with the build item (docs/data-sprites.md section 9) that registers its layout; one is refused until its layout is in the registry. */
export const NOT_BUILT_BODIES = Object.freeze({ tiles: 'B15', layers: 'B14', panel: 'B13', emitters: 'B12' });

const V2_BODIES = ['rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures'];
const V2_KEPT = 32;                                    // resolved settings kept per sprite
const SCENE_KEYS = new Set(['clip', 'direction']);
const LOCATION = new Set(['on', 'bone', 'part', 'when']);
const V2 = new WeakMap();                              // sprite -> its frame function, for dataFrameList
const cap1 = (s) => (typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1) : s);
const pairOr0 = (v) => (Array.isArray(v) && fin(v[0]) && fin(v[1]) ? [v[0], v[1]] : [0, 0]);
const phaseOf = (c, frame) => (c.loop ? frame / c.frames : c.frames > 1 ? frame / (c.frames - 1) : 0);   // engine/sprite.js renderFrame's phase

/** The `version` of a definition (an object or JSON text) read without running anything, or null. */
function versionOf(input) {
  let d = input;
  if (typeof input === 'string') {
    if (input.length > 256 * 1024) return null;
    const p = parseSpriteJson(input);
    d = p.ok ? p.value : null;
  }
  const f = field(d, 'version');
  return f.ok ? f.v : null;
}

/** The pieces as the validator reads them (piece(id, v)), from a store or a piece list. */
function pieceListOf(p) {
  if (p && typeof p.piece === 'function') return p;
  if (p && typeof p.get === 'function' && typeof p.list === 'function') return pieceRegistry(p);
  return undefined;
}

/** The version 2 check: catalog/sprite-schema.js validateSprite with the registry and pieces of opts, messages capped. */
function validateV2(input, opts) {
  const pieces = pieceListOf(opts.pieces ?? sitePieces());
  const o = { generators: opts.generators ?? SITE_GENERATORS, ...(pieces ? { pieces } : {}) };
  for (const k of ['strict', 'soundIds', 'catalogIds', 'styleIds']) if (opts[k] !== undefined) o[k] = opts[k];
  const v = validateSprite(input, o);
  return { ok: v.ok, errors: capList(v.errors), warnings: capList(v.warnings), value: v.value };
}

/** A `when` of a control or a sound cue as engine/sprite.js takes it: controls only (clip and direction are the frame's). undefined when nothing is left to decide. */
function controlWhen(when) {
  if (when === undefined) return undefined;
  const alts = (Array.isArray(when) ? when : [when]).filter(isObj).map((a) => Object.fromEntries(Object.entries(a).filter(([k]) => !SCENE_KEYS.has(k)).map(([k, v]) => [k, [...(Array.isArray(v) ? v : [v])]])));
  if (!alts.length || alts.some((a) => !Object.keys(a).length)) return undefined;
  return Array.isArray(when) ? alts : alts[0];
}

/** group, when (controls only), look and was of a version 2 control, as engine/sprite.js takes them (copies). */
function moreV2(c) {
  if (!isObj(c)) return {};
  const w = controlWhen(c.when);
  return { ...(typeof c.group === 'string' ? { group: c.group } : {}), ...(w ? { when: w } : {}), ...(c.look !== undefined ? { look: c.look } : {}) };
}

/** A palette slot's swatches: its own (hex, or { palette, family, lead } expanded by engine/palettes.js) or the material's list as version 1 gives it; the slot's colour first, at most 8. */
function slotSwatches(slot, hex) {
  if (!Array.isArray(slot.swatches)) return swatchesFor(hex, slot.material);
  const out = [hex];
  for (const s of slot.swatches) {
    let list = [];
    if (typeof s === 'string') list = [s.toLowerCase()];
    else if (isObj(s)) { try { list = paletteSwatches(s.palette, s.family, s.lead === undefined ? {} : { lead: s.lead }); } catch { list = []; } }
    for (const c of list) if (!out.includes(c) && out.length < 8) out.push(c);
  }
  return out;
}

/** The controls of a version 2 definition as engine/sprite.js controls: colour slots first (palette order), then the rest in engine/resolve.js settingTable's order. */
function paramsV2(definition) {
  const T = settingTable(definition);
  const own = new Map((definition.controls ?? []).filter((c) => isObj(c) && typeof c.key === 'string').map((c) => [c.standard === 'speed' ? 'speed' : c.key, c]));
  const slots = new Map((definition.palette ?? []).map((s) => [s.id, s]));
  const params = {};
  let speed = false;
  const colour = (key) => {
    const s = slots.get(key), c = own.get(key), hex = T[key].default;
    const material = MATERIAL_IDS.includes(s?.material) ? s.material : undefined;
    params[key] = color(c?.label ?? s?.label ?? cap1(key), hex, s ? slotSwatches(s, hex) : swatchesFor(hex), { ...moreV2(c), ...(material ? { material } : {}) });
  };
  for (const s of definition.palette ?? []) if (T[s.id]?.kind === 'colour') colour(s.id);
  for (const [key, d] of Object.entries(T)) {
    if (params[key]) continue;
    const c = own.get(key);
    if (d.speed) { speed = true; params.speed = speedControl(c ?? {}); continue; }
    if (d.kind === 'colour') colour(key);
    else if (d.kind === 'range') params[key] = range(c?.label ?? cap1(key), d.default, { min: d.min, max: d.max, ...(d.step !== undefined ? { step: d.step } : {}), ...(c?.lo !== undefined ? { lo: c.lo } : {}), ...(c?.hi !== undefined ? { hi: c.hi } : {}), ...moreV2(c) });
    else if (d.kind === 'choice') {
      const labels = new Map((c?.options ?? []).filter(isObj).map((o) => [o.value, o.label]));
      params[key] = choice(c?.label ?? cap1(key), d.default, d.values.map((v) => (labels.has(v) ? { value: v, label: labels.get(v) } : v)), { ...moreV2(c), ...(isObj(d.was) ? { was: { ...d.was } } : {}) });
    } else if (d.kind === 'toggle') params[key] = toggle(c?.label ?? definition.parts?.[key]?.label ?? cap1(key), d.default, moreV2(c));
  }
  return { params, speed };
}

/** A version 2 definition's parts as Contract 3 parts; an on/off part with no params is its own toggle, and joins the controls whose shapes are all its own (as version 1). */
function partsV2(definition, params, shapes) {
  const parts = {};
  const owner = new Map();
  for (const [name, part] of Object.entries(definition.parts ?? {})) for (const s of part.shapes ?? []) owner.set(s, name);
  for (const [name, part] of Object.entries(definition.parts ?? {})) {
    const socket = typeof part.socket === 'string' ? { socket: part.socket } : {};
    if (Array.isArray(part.params) && part.params.length) {
      parts[name] = { label: part.label, params: [...part.params], ...(part.none !== undefined ? { none: Array.isArray(part.none) ? [...part.none] : part.none } : {}), ...socket };
      continue;
    }
    const members = [];
    for (const key of Object.keys(params)) {
      if (key === name || params[key].kind !== 'color') continue;
      const ids = shapes.filter((s) => s.paint === key).map((s) => s.id);
      if (ids.length && ids.every((id) => owner.get(id) === name)) members.push(key);
    }
    parts[name] = { label: part.label, params: [name, ...members], ...socket };
  }
  return parts;
}

/** The sound cues of each clip: the definition's own (their control conditions kept), else what the resolved clip inherited from its base. */
function soundsV2(definition, clips) {
  const out = {};
  for (const [name, c] of Object.entries(clips)) {
    const own = clipOwn(definition, name)?.sounds;
    const list = Array.isArray(own) ? own : c.sounds ?? [];
    const cues = list.filter((s) => isObj(s) && typeof s.sound === 'string' && s.frame < c.frames).map((s) => {
      const x = JSON.parse(JSON.stringify(s));
      delete x.when;
      const w = controlWhen(s.when);
      return w ? { ...x, when: w } : x;
    });
    if (cues.length) out[name] = cues;
  }
  return out;
}

/** The pose of one frame of a resolved clip: its keys at phase t (rigs/keypose.js), then frame `frame`'s edits (nudge, flash, show, hide, swap), which win. */
function poseV2(c, t, frame) {
  const pose = Array.isArray(c.keys) && c.keys.length ? sampleKeys(compiledOf(c), t, { loop: c.loop !== false }) : {};
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
    if (isObj(e.swap)) pose.swap = { ...(isObj(pose.swap) ? pose.swap : {}), ...e.swap };
  }
  return pose;
}

/** The items of a list a frame draws: hidden ones left out unless shown, the pose's hide wins over show, stamps swapped to their variant. */
function visibleItems(list, pose, extra = {}) {
  const show = new Set([...(extra.show ?? []), ...(pose.show ?? [])]);
  const hide = new Set([...(extra.hide ?? []).filter((id) => !(pose.show ?? []).includes(id)), ...(pose.hide ?? [])]);
  const swap = isObj(pose.swap) ? pose.swap : {};
  const out = [];
  for (const s of list) {
    if (!isObj(s)) continue;
    if (typeof s.id === 'string' && hide.has(s.id)) continue;
    if (s.hidden === true && !(typeof s.id === 'string' && show.has(s.id))) continue;
    let x = s;
    if (s.hidden !== undefined) { x = { ...x }; delete x.hidden; }
    if (s.kind === 'stamp' && typeof s.id === 'string' && Object.hasOwn(swap, s.id)) {
      x = { ...x };
      if (typeof swap[s.id] === 'string') x.variant = swap[s.id]; else delete x.variant;
    }
    out.push(x);
  }
  return out;
}

/** A primitive with what places it (on, bone), its part and any condition taken off, for engine/draw-list.js. */
function bare(p) {
  const x = {};
  for (const k of Object.keys(p)) if (!LOCATION.has(k)) x[k] = p[k];
  return x;
}

/** Puts every primitive on its node's frame (frames: Map id -> frame); one on a node the frame does not have is left out with a warning. */
function placeAll(prims, frames, warn) {
  const out = [];
  for (const p of prims) {
    const on = typeof p.on === 'string' ? p.on : typeof p.bone === 'string' ? p.bone : null;
    if (on === null) { out.push(bare(p)); continue; }
    const F = frames.get(on);
    if (!F) { warn(`"${String(p.id ?? p.kind)}" is on "${on}", which this frame has not got; it is left out`); continue; }
    out.push(placeOn(bare(p), F));
  }
  return out;
}

/** The white flash of a frame edit: a tint just before the last outline (so the outline stays ink), else at the end. */
function withFlash(list, flash) {
  if (!flash) return list;
  const at = list.map((p) => p.kind).lastIndexOf('outline');
  const tint = { kind: 'tint', paint: '#ffffff' };
  return at < 0 ? [...list, tint] : [...list.slice(0, at), tint, ...list.slice(at)];
}

/** engine/resolve.js expandFrame for a frame; throws an Error naming the problem when it fails. */
function expanded(R, list, ctx, gen, warn) {
  if (!list.length) return { primitives: [], palette: R.palette };
  const x = expandFrame(R, list, ctx, { generators: gen });
  if (!x.ok) throw new Error(`sprite ${R.id}, clip ${ctx.clip} frame ${ctx.frame}: ${x.errors.slice(0, 6).join('; ')}`);
  if (x.lost?.length) throw new Error(`sprite ${R.id}, clip ${ctx.clip} frame ${ctx.frame}: ${lostText(x.lost)}`);
  for (const w of x.warnings) warn(w);
  return x;
}

/** Why a frame is refused: the colours engine/resolve.js could not work out ([{ rule } | { slot }], its `lost` flags, never told by colour). */
function lostText(lost) {
  const one = (x) => (x.rule ? `the colour rule "${String(x.rule).slice(0, 40)}"` : `colour "${String(x.slot).slice(0, 40)}"`);
  const names = [...new Set(lost.slice(0, 4).map(one))].join(', ');
  return `${names} cannot be worked out (a framework colour rule inside a rule on a shape outside a layers body, a slot it names that is missing, or a colour derived from one); it would be drawn magenta, so the frame is refused`;
}

// -- the rig body: rigs/bones.js draws it (build item B5's entry points drawResolvedRig, resolvedRigPoints, resolvedRigList) --

const num0 = (v, d) => (fin(v) ? v : d);

/** Bones (or picture nodes) with every parent before its children; nodes of `nodes` get length 0. */
function bonesOf(rig) {
  const all = [...(rig.bones ?? []), ...(rig.nodes ?? []).map((n) => ({ ...n, length: 0 }))];
  const ids = new Set(all.map((b) => b.id)), placed = new Set(), out = [];
  for (let pass = 0; pass <= all.length && out.length < all.length; pass++) {
    for (const b of all) {
      if (placed.has(b.id)) continue;
      const parent = b.parent ?? null;
      if (parent === null || !ids.has(parent) || placed.has(parent)) { out.push(b); placed.add(b.id); }
    }
  }
  return out;
}

/** What rigs/bones.js drawResolvedRig and resolvedRigPoints take besides the pose: the frame's scene, what a generator sees, and the expand hook (engine/resolve.js expandFrame bound to the resolved sprite). */
const rigCtx = (R, c, clip, t, frame, gen) => ({
  clip, t, frame, frames: c.frames, loop: c.loop !== false,
  expand: (list, ctx) => { const x = expandFrame(R, list, ctx, { generators: gen }); return x.ok && x.lost?.length ? { ...x, ok: false, errors: [lostText(x.lost)] } : x; },
});

/** Draws one frame of a rig body onto g through rigs/bones.js drawResolvedRig; throws when a generator or piece could not be drawn. */
function drawRigFrame(g, R, c, clip, t, frame, gen) {
  const out = drawResolvedRig(g, R, poseV2(c, t, frame), rigCtx(R, c, clip, t, frame, gen));
  if (out.errors.length) throw new Error(`sprite ${R.id}, clip ${clip} frame ${frame}: ${out.errors.slice(0, 6).join('; ')}`);
  return out;
}

/**
 * One frame of a rig body as a draw list: rigs/bones.js resolvedRigList, the same rig (direction overlay, the sprite's
 * size and points, a version 2 sprite's rig drawn as version 2), pose and context drawResolvedRig draws (build item B56).
 */
function rigFrame(R, c, clip, t, frame, gen, warn) {
  const r = resolvedRigList(R, poseV2(c, t, frame), rigCtx(R, c, clip, t, frame, gen));
  if (r.error) throw new Error(`sprite ${R.id}, clip ${clip} frame ${frame}: ${r.error}`);
  if (r.errors.length) throw new Error(`sprite ${R.id}, clip ${clip} frame ${frame}: ${r.errors.slice(0, 6).join('; ')}`);
  const lost = lostPaints(r.list, R.palette);
  if (lost.length) throw new Error(`sprite ${R.id}, clip ${clip} frame ${frame}: ${lostText(lost)}`);
  for (const s of r.skipped) warn(`"${s.id ?? s.kind}" was left out: ${s.why}`);
  return { list: r.list, palette: r.palette };
}

// -- the pictures body: a node tree, its draw list, per-clip lists, motions, emitters, icon sets ------------------

/** Runs one motion (see the header): the registry's entry of family "motion", its arguments checked, run bare; returns its node moves. */
function runMotion(gen, call, ctx, warn) {
  const entry = typeof gen?.generator === 'function' ? gen.generator(call.gen, call.v) : null;
  if (!entry || entry.family !== 'motion' || typeof entry.run !== 'function') { warn(`the motion ${call.gen}@${call.v} is not in the generator registry, so it is left out (the motions come with build item B8)`); return []; }
  const node = typeof call.node === 'string' ? call.node : null;
  const args = {};
  for (const [name, type] of Object.entries(entry.args ?? {})) {
    if (Object.hasOwn(call, name)) args[name] = call[name];
    else if (isObj(type) && type.default !== undefined) args[name] = type.default;
  }
  if (typeof gen.checkCall === 'function') {
    const plain = { gen: call.gen, v: call.v, ...args };
    const r = gen.checkCall(plain);
    if (!r.ok) { warn(`the motion ${call.gen}@${call.v}: ${r.errors.slice(0, 3).join('; ')}`); return []; }
  }
  let out;
  try { out = entry.run(deepFreeze(JSON.parse(JSON.stringify(args))), ctx); } catch (e) { warn(`the motion ${call.gen}@${call.v} failed: ${String(e?.message ?? e).slice(0, 120)}`); return []; }
  if (!Array.isArray(out)) return [];
  return out.slice(0, 16).filter(isObj).map((m) => ({
    node: typeof m.node === 'string' ? m.node : node, move: pairOr0(m.move), turn: num0(m.turn, 0), scale: fin(m.scale) && m.scale > 0 ? m.scale : 1,
  }));
}

/** World frames of a node tree: { id -> engine/draw-list.js nodeFrame }. Each node's own at, turn and scale, plus what keys and motions add (changes: id -> { move, turn, scale }). */
function nodeFrames(nodes, changes) {
  const world = new Map(), frames = new Map();
  for (const n of bonesOf({ nodes: [], bones: nodes ?? [] })) {
    const ch = changes.get(n.id) ?? { move: [0, 0], turn: 0, scale: 1 };
    const at = pairOr0(n.at);
    const local = { at: [at[0] + ch.move[0], at[1] + ch.move[1]], turn: num0(n.turn, 0) + ch.turn, scale: num0(n.scale, 1) * ch.scale, mirror: false };
    const P = n.parent ? world.get(n.parent) : null;
    let w = local;
    if (P) {
      const F = frames.get(n.parent);
      w = { at: [F.at[0] + local.at[0] * F.u[0] + local.at[1] * F.v[0], F.at[1] + local.at[0] * F.u[1] + local.at[1] * F.v[1]], turn: P.turn + (P.mirror ? -local.turn : local.turn), scale: P.scale * local.scale, mirror: P.mirror !== local.mirror };
    }
    world.set(n.id, w);
    frames.set(n.id, nodeFrame(w));
  }
  return frames;
}

/** Moves a list by [dx, dy] (and turns it by `turn` degrees round `about`); primitives are new objects. */
function moveList(list, dx, dy, turn = 0, about = [0, 0]) {
  if (!dx && !dy && !turn) return list;
  const there = nodeFrame({ at: [about[0] + dx, about[1] + dy], turn }), back = nodeFrame({ at: [-about[0], -about[1]] });
  return list.map((p) => (turn ? placeOn(placeOn(p, back), there) : placeOn(p, nodeFrame({ at: [dx, dy] }))));
}

/** The draw list with per-clip items put in just before its first outline (at the end when it has none). */
function withPer(draw, per) {
  if (!per.length) return draw;
  const at = draw.findIndex((p) => isObj(p) && p.kind === 'outline');
  return at < 0 ? [...draw, ...per] : [...draw.slice(0, at), ...per, ...draw.slice(at)];
}

/** The ids of emitters that some clip's keys give an `amount`: each is off wherever no key gives it an amount above 0 (see EMITTERS in the header). */
function amountKeyed(R) {
  const ids = new Set();
  for (const c of Object.values(isObj(R.clips) ? R.clips : {})) {
    for (const k of Array.isArray(c?.keys) ? c.keys : []) {
      if (!isObj(k?.emit)) continue;
      for (const [id, e] of Object.entries(k.emit)) if (isObj(e) && e.amount !== undefined) ids.add(id);
    }
  }
  return ids;
}

/**
 * The built-in layout of a `pictures` body (docs/data-sprites.md 2.5d), used while the registry holds no layout
 * "pictures" (build item B8 registers one from engine/gen/pictures.js, which may call this). A layout function as LAYOUTS
 * in the header describes: (input, ctx) -> { list, palette, frames, offset }.
 */
export function picturesLayout(input, ctx) {
  const { resolved: R, pose, warn, generators: gen } = input;
  const P = isObj(input.body) ? input.body : {};
  const { clip } = ctx;
  // motions and keys move nodes; moves with no node move the whole picture
  const changes = new Map();
  const change = (id) => { if (!changes.has(id)) changes.set(id, { move: [0, 0], turn: 0, scale: 1 }); return changes.get(id); };
  for (const [id, k] of Object.entries(isObj(pose.nodes) ? pose.nodes : {})) {
    if (!isObj(k)) continue;
    const ch = change(id), m = pairOr0(k.move);
    ch.move = [ch.move[0] + m[0], ch.move[1] + m[1]];
    ch.turn += num0(k.turn, 0);
    ch.scale *= fin(k.scale) && k.scale > 0 ? k.scale : 1;
  }
  const root = pairOr0(pose.root), nudge = pairOr0(pose.nudge).map(Math.round);
  let dx = root[0] + nudge[0], dy = root[1] + nudge[1];
  for (const call of sceneItems(P.motion ?? [], { clip, direction: null })) {
    for (const m of runMotion(gen, call, ctx, warn)) {
      if (m.node === null) { dx += m.move[0]; dy += m.move[1]; continue; }
      const ch = change(m.node);
      ch.move = [ch.move[0] + m.move[0], ch.move[1] + m.move[1]];
      ch.turn += m.turn;
      ch.scale *= m.scale;
    }
  }
  if (P.fit !== undefined) warn('the icon fit (icon.fit) is not drawn yet: it comes with build item B8');
  const frames = input.nodeFrames(P.nodes, changes);
  const own = (o, k) => (isObj(o) && Object.hasOwn(o, k) && isObj(o[k]) ? o[k] : null);
  const per = own(P.per, clip) ?? {};
  const draw = (items) => input.place(input.expand(items).primitives, frames);
  let palette = R.palette;
  const groups = [];
  const picture = own(P.pictures, clip);
  if (picture) groups.push(moveList(draw(input.visible(picture.draw ?? [], per)), 0, 0, num0(picture.angle, 0), [R.size[0] / 2, R.size[1] / 2]));
  const body = withPer(Array.isArray(P.draw) ? P.draw : [], Array.isArray(per.draw) ? per.draw : []);
  const x = input.expand(input.visible(body, per));
  palette = x.palette;
  groups.push(input.place(x.primitives, frames));
  // emitters (EMITTERS in the header): one that some clip's keys give an amount draws only while it is above 0 here;
  // one no key gives an amount always draws (its `when` and `clip` still decide)
  const keyed = amountKeyed(R);
  const emits = [];
  for (const e of Array.isArray(P.emitters) ? P.emitters : []) {
    const k = own(pose.emit, e.id);
    if (keyed.has(e.id) && !(k && fin(k.amount) && k.amount > 0)) continue;
    const call = { ...e };
    const entry = typeof gen?.generator === 'function' ? gen.generator(e.gen, e.v) : null;
    for (const [f, v] of Object.entries(k ?? {})) {
      if (f === 'amount') { if (entry?.args && Object.hasOwn(entry.args, 'amount')) call.amount = Math.min(1, v); continue; }
      call[f] = Array.isArray(v) ? [...v] : v;
    }
    emits.push(call);
  }
  if (emits.length) {
    const y = input.expand(emits);
    palette = { ...palette, ...y.palette };
    groups.push(input.place(y.primitives, frames));
  }
  return { list: moveList(groups.flat(), dx, dy), palette, frames, offset: [dx, dy] };
}

/** The attach points of a pictures body for one frame: { id: { x, y, angle } } in frame px, angle in radians (rig convention), each on its node's frame. */
function pictureSockets(R, out) {
  const sockets = {};
  for (const p of Array.isArray(R.points) ? R.points : []) {
    if (!isObj(p) || typeof p.id !== 'string') continue;
    if (p.ground) { sockets[p.id] = { x: R.pivot[0] + out.offset[0], y: R.pivot[1] + out.offset[1], angle: 0 }; continue; }
    const F = typeof p.on === 'string' ? out.frames.get(p.on) : nodeFrame({});
    if (!F) continue;
    const [u, v] = pairOr0(p.at), a = num0(p.angle, 0) * Math.PI / 180;
    const sx = Math.sin(a), cy = Math.cos(a);
    sockets[p.id] = {
      x: F.at[0] + u * F.u[0] + v * F.v[0] + out.offset[0], y: F.at[1] + u * F.u[1] + v * F.v[1] + out.offset[1],
      angle: Math.atan2(sx * F.u[0] + cy * F.v[0], sx * F.u[1] + cy * F.v[1]),
    };
  }
  return sockets;
}

// -- layouts: how a body other than a rig becomes a frame's draw list (LAYOUTS in the header) ----------------------

/** The file each not-yet-built body's layout is registered from (docs/data-sprites.md section 9, the Owns column). */
const LAYOUT_FILES = Object.freeze({ tiles: 'engine/gen/tiles.js', layers: 'engine/gen/backdrop.js', panel: 'engine/gen/ui.js', emitters: 'engine/gen/fx.js' });

/** An error that already names the sprite, clip and frame (passed on unwrapped). */
class FrameError extends Error {}

/** The newest registry entry of family "layout" whose id is the body kind, or null. */
function registeredLayout(gen, kind) {
  let list = [];
  try { list = typeof gen?.generators === 'function' ? gen.generators() : []; } catch { list = []; }
  let best = null;
  for (const e of Array.isArray(list) ? list : []) {
    if (isObj(e) && e.family === 'layout' && e.id === kind && fin(e.v) && typeof e.run === 'function' && (!best || e.v > best.v)) best = e;
  }
  return best;
}

/** How a body kind is laid out: { kind, source: 'bones' | 'registry' | 'built-in', key, run }, or null when nothing lays it out yet. */
function layoutFor(kind, gen) {
  if (kind === 'rig') return { kind, source: 'bones', key: 'rig' };
  const e = registeredLayout(gen, kind);
  if (e) return { kind, source: 'registry', key: `${kind}@${e.v}`, run: (input, ctx) => e.run(input, ctx) };
  if (kind === 'pictures') return { kind, source: 'built-in', key: 'pictures', run: picturesLayout };
  return null;
}

/** The message for a body no layout draws yet: its build item and the file its layout is registered from. */
function notBuilt(id, kind) {
  if (!Object.hasOwn(NOT_BUILT_BODIES, kind)) return `sprite ${id}: its body is not one this Loadout draws (${V2_BODIES.join(', ')})`;
  return `sprite ${id}: a ${kind} body is not built yet; build item ${NOT_BUILT_BODIES[kind]} (docs/data-sprites.md section 9) draws it, by registering its layout in ${LAYOUT_FILES[kind]}: a generator of family "layout" with id "${kind}"`;
}

/** One frame of a body laid out by L (not a rig): the layout run with its input (LAYOUTS in the header), its result checked, the frame edits' flash added. Throws naming the sprite, clip and frame. */
function layoutFrame(L, R, c, clip, t, frame, gen, warn) {
  const where = `sprite ${R.id}, clip ${clip} frame ${frame}`;
  const pose = poseV2(c, t, frame);
  const size = Object.freeze([...R.size]);
  const ctx = Object.freeze({ t, frame, frames: c.frames, loop: c.loop !== false, size, clip, direction: null });
  const expand = (items) => {
    try { return expanded(R, Array.isArray(items) ? items : [], { ...ctx, size: [...size] }, gen, warn); } catch (e) { throw new FrameError(String(e?.message ?? e)); }
  };
  const input = Object.freeze({
    kind: L.kind, body: L.kind === 'emitters' ? R.body : R.body[L.kind], resolved: R, clip: c, pose, generators: gen, warn, expand,
    place: (prims, frames) => placeAll(Array.isArray(prims) ? prims : [], frames instanceof Map ? frames : new Map(), warn),
    nodeFrames: (nodes, changes) => nodeFrames(Array.isArray(nodes) ? nodes : [], changes instanceof Map ? changes : new Map()),
    visible: (items, extra) => visibleItems(Array.isArray(items) ? items : [], pose, isObj(extra) ? extra : {}),
  });
  let out;
  try { out = L.run(input, ctx); } catch (e) {
    if (e instanceof FrameError) throw e;
    throw new FrameError(`${where}: the ${L.kind} layout failed: ${String(e?.message ?? e).slice(0, 300)}`);
  }
  if (!isObj(out) || !Array.isArray(out.list)) throw new FrameError(`${where}: the ${L.kind} layout gave no draw list`);
  const lost = lostPaints(out.list, isObj(out.palette) ? out.palette : R.palette);
  if (lost.length) throw new FrameError(`${where}: ${lostText(lost)}`);
  return {
    list: withFlash(out.list, pose.flash), palette: isObj(out.palette) ? out.palette : R.palette,
    frames: out.frames instanceof Map ? out.frames : new Map(), offset: pairOr0(out.offset),
    points: isObj(out.points) ? out.points : null,
    slice: isObj(out.slice) ? out.slice : undefined,
    textArea: isObj(out.textArea) || Array.isArray(out.textArea) ? out.textArea : undefined,
  };
}

const copyOf = (v) => JSON.parse(JSON.stringify(v));
const copyOrUndef = (v) => (isObj(v) ? copyOf(v) : undefined);
const SLICE_ONE = ['left', 'top', 'right', 'bottom', 'rect', 'opening', 'tile'];

/** A written slice or textArea (one for every clip, or { clip: one }) for one clip: a copy, or undefined. */
function writtenFor(raw, clip, isOne) {
  if (!isObj(raw)) return undefined;
  if (isOne(raw)) return copyOf(raw);
  return Object.hasOwn(raw, clip) && isObj(raw[clip]) ? copyOf(raw[clip]) : undefined;
}

/** A text area as engine/sprite.js and engine/sheet-info.js read it: { x, y, w, h, text (the colour worked out), edge? }. */
function areaOut(a, R) {
  if (!isObj(a) || !fin(a.x)) return null;
  const hex = a.colour !== undefined ? paintHex(a.colour, R.palette, R.params) : null;
  return { x: a.x, y: a.y, w: a.w, h: a.h, ...(hex ? { text: hex } : {}), ...(isObj(a.edge) ? { edge: { ...a.edge } } : {}) };
}

/** Builds the sprite of a version 2 definition (validateV2's value). Throws for a body nothing lays out yet, naming its build item. */
function buildV2(value, opts = {}) {
  const definition = deepFreeze(JSON.parse(JSON.stringify(value)));
  const id = definition.id;
  const kind = V2_BODIES.find((b) => Object.hasOwn(definition.body ?? {}, b));
  const gen = opts.generators ?? SITE_GENERATORS;
  const L = kind ? layoutFor(kind, gen) : null;
  if (!L) throw new Error(notBuilt(id, kind));
  const ropts = { validated: true, pieces: opts.pieces ?? sitePieces(), generators: gen };
  const first = resolveSprite(definition, {}, ropts);
  if (!first.ok) throw new Error(`sprite ${id}: ${first.errors.slice(0, 12).join('; ')}`);
  const { params, speed } = paramsV2(definition);
  const keys = Object.keys(params);
  const kept = new Map();
  const at = (p) => {
    const key = JSON.stringify(keys.map((k) => (isObj(p) && Object.hasOwn(p, k) && p[k] !== undefined ? p[k] : null)));
    let r = kept.get(key);
    if (!r) {
      r = resolveSprite(definition, isObj(p) ? p : {}, ropts);
      if (!r.ok) throw new Error(`sprite ${id}: ${r.errors.slice(0, 12).join('; ')}`);
      if (kept.size >= V2_KEPT) kept.delete(kept.keys().next().value);
      kept.set(key, r);
    }
    return r;
  };
  // clips: the resolved ones; an icon set's pictures are one-frame clips of their own
  const icons = kind === 'pictures' && isObj(first.body.pictures?.pictures) ? first.body.pictures.pictures : {};
  const clipInfo = (R, name) => {
    if (typeof name !== 'string') return null;
    if (isObj(R.clips) && Object.hasOwn(R.clips, name)) return R.clips[name];
    return Object.hasOwn(icons, name) ? { frames: 1, fps: 1, fpsBase: 1, loop: true, keys: [], frameEdits: {}, sounds: [], label: icons[name].label ?? cap1(name) } : null;
  };
  const names = [...Object.keys(icons), ...Object.keys(first.clips).filter((n) => !Object.hasOwn(icons, n))];
  const clips = {};
  for (const name of names) {
    const c = clipInfo(first, name), fps = c.fpsBase ?? c.fps;
    clips[name] = { frames: c.frames, loop: c.loop, label: c.label, fps: speed ? (p) => fps * lerp(0.65, 1.45, fin(p?.speed) ? p.speed : 0.5) : fps };
    // a tile's block kind and a decal's place, as engine/tiles.js blockClips and decoClips leave them (build item B15)
    for (const f of ['block', 'place']) if (typeof c[f] === 'string') clips[name][f] = c[f];
    // a clip that never carries the game's text (engine/ui.js, CONTRAST; engine/sheet-info.js writes it no text area)
    if (c.noText === true) clips[name].noText = true;
  }
  const noClip = (clip) => new Error(`sprite ${id}: no clip "${String(clip).slice(0, 40)}"`);
  const frameOf = (clip, t, frame, p) => {
    const R = at(p);
    const c = clipInfo(R, clip);
    if (!c) throw noClip(clip);
    const warnings = [];
    const warn = (w) => { if (warnings.length < MAX_MESSAGES && !warnings.includes(w)) warnings.push(w); };
    const out = kind === 'rig' ? rigFrame(R, c, clip, t, frame, gen, warn) : layoutFrame(L, R, c, clip, t, frame, gen, warn);
    return { ...out, R, warnings };
  };
  const bodyOf = (R) => (kind === 'emitters' ? R.body : R.body[kind]) ?? {};
  const shapes = kind === 'rig' ? first.body.rig.shapes ?? [] : Array.isArray(bodyOf(first).draw) ? bodyOf(first).draw : [];
  // what a registered layout gives besides the list, found by laying out each clip's first frame at the defaults once
  // (which also checks the layout runs before the sprite is handed out)
  const gives = { points: false, slice: false, textArea: false };
  if (L.source === 'registry') {
    for (const name of names.slice(0, 64)) {
      const out = frameOf(name, 0, 0, {});
      if (out.points) gives.points = true;
      if (out.slice) gives.slice = true;
      if (out.textArea) gives.textArea = true;
    }
  }
  const sprite = {
    id, name: definition.name, blurb: definition.blurb,
    ...(KIND[definition.meta?.type] ? { kind: KIND[definition.meta.type] } : {}),
    ...(definition.meta ? { meta: JSON.parse(JSON.stringify(definition.meta)) } : {}),
    size: [...definition.size], pivot: [...definition.pivot], grounded: definition.grounded !== false,
    params, parts: partsV2(definition, params, shapes), clips, sounds: soundsV2(definition, first.clips),
    preview: Object.hasOwn(clips, definition.preview) ? definition.preview : first.preview ?? names[0],
    styles: ['pixel'],
    ...(definition.versions ? { versions: definition.versions.map((v) => ({ name: v.name, params: { ...v.params } })) } : {}),
    ...(isObj(definition.was) ? { was: JSON.parse(JSON.stringify(definition.was)) } : {}),
    ...(isObj(definition.materials) && typeof definition.materials.rest === 'string' ? { materials: { rest: definition.materials.rest } } : {}),
    ...(definition.rev !== undefined ? { rev: definition.rev } : {}),
    definition,
    /** The material table of Contract 7 at these settings, read from the palette's slots (engine/resolve.js materialTable). */
    materialTable: (p) => materialTable(at(p)),
    render(g, { clip, t, frame, p }) {
      const R = at(p), c = clipInfo(R, clip);
      if (!c) throw noClip(clip);
      if (kind === 'rig') { drawRigFrame(g, R, c, clip, t, frame, gen); return; }
      const { list, palette } = layoutFrame(L, R, c, clip, t, frame, gen, () => {});
      drawList(g, list, { palette });
    },
  };
  const hasPoints = gives.points || (Array.isArray(first.points) && first.points.length > 0) || (kind === 'rig' && Array.isArray(first.body.rig.points) && first.body.rig.points.length > 0);
  if (hasPoints) {
    sprite.sockets = (clip, t, p) => {
      const R = at(p), c = clipInfo(R, clip);
      if (!c) return {};
      const frame = frameOfPhase(c, t);
      if (kind === 'rig') return resolvedRigPoints(R, poseV2(c, t, frame), rigCtx(R, c, clip, t, frame, gen));
      const out = layoutFrame(L, R, c, clip, t, frame, gen, () => {});
      return { ...pictureSockets(R, out), ...(out.points ? copyOf(out.points) : {}) };
    };
  }
  // slice and textArea (Contract 8): the definition's own, written per clip or once; else what the layout gives for
  // the clip's first frame at these settings
  const isOneSlice = (s) => SLICE_ONE.some((k) => Object.hasOwn(s, k));
  const isOneArea = (a) => fin(a.x);
  const laidOut = (clip, p) => (clipInfo(at(p), clip) ? frameOf(clip, 0, 0, p) : null);
  if (first.slice || gives.slice) {
    sprite.slice = (clip, p) => writtenFor(at(p).slice, clip, isOneSlice) ?? (gives.slice ? copyOrUndef(laidOut(clip, p)?.slice) : undefined);
  }
  if (first.textArea || gives.textArea) {
    sprite.textArea = (clip, p) => {
      const R = at(p);
      const a = writtenFor(R.textArea, clip, isOneArea) ?? (gives.textArea ? laidOut(clip, p)?.textArea : undefined);
      if (Array.isArray(a)) return a.map((x) => areaOut(x, R)).filter(Boolean);
      return areaOut(a, R) ?? [];
    };
  }
  const built = defineSprite(sprite);
  V2.set(built, (clip, frame, p) => {
    if (typeof clip !== 'string' || !Object.hasOwn(built.clips, clip)) throw noClip(clip);
    const c = built.clips[clip];
    const out = frameOf(clip, phaseOf(c, frame), frame, p);
    return { list: out.list, palette: out.palette, warnings: out.warnings };
  });
  return built;
}


/**
 * The primitive draw list one frame of a version 2 data sprite paints, in frame pixels, with its palette: { list,
 * palette, warnings } (what engine/draw-list.js drawList takes). For a second style's renderer (Contract 12), the
 * studio and tests. Throws for a sprite that is not a version 2 data sprite or a clip it has not got.
 * Arguments: sprite (from dataSprite), clip, frame, p (its settings).
 */
export function dataFrameList(sprite, clip, frame, p = {}) {
  const f = V2.get(sprite);
  if (!f) throw new Error(`sprite ${sprite?.id ?? '?'}: not a version 2 data sprite`);
  return f(clip, frame, p);
}

/** A readable name for error messages: the definition's id when it can be read safely. */
function idHint(input) {
  let d = input;
  if (typeof input === 'string') { const p = parseStudioJson(input); d = p.ok ? p.value : null; }
  const f = field(d, 'id');
  return f.ok && typeof f.v === 'string' && f.v.length <= 40 ? f.v : '?';
}

/**
 * Turns a definition (`loadout-sprite` version 1 or 2, an object or JSON text; version 2 takes the pipeline of VERSION 2
 * in the header, with opts { generators, pieces, strict, soundIds, catalogIds }) into a sprite, as defineSprite does for a sprite
 * file: validated, then drawn by framework code (a bone rig by rigs/bones.js, a library body by its body's module, engine/library-bodies.js).
 * Throws an Error naming what is wrong (the validator's errors) for a definition that does not pass. The default export of a library file.
 * Arguments: input (the definition), opts (as validateDataSprite takes them).
 */
export function dataSprite(input, opts = {}) {
  if (versionOf(input) === 2) {
    const v2 = validateV2(input, opts);
    if (!v2.ok) throw new Error(`sprite ${idHint(input)}: ${v2.errors.slice(0, 12).join('; ')}${v2.errors.length > 12 ? `; and ${v2.errors.length - 12} more` : ''}`);
    return buildV2(v2.value, opts);
  }
  const v = validateDataSprite(input, opts);
  if (!v.ok) throw new Error(`studio sprite ${idHint(input)}: ${v.errors.slice(0, 12).join('; ')}${v.errors.length > 12 ? `; and ${v.errors.length - 12} more` : ''}`);
  return build(v.value, opts);
}

/**
 * The same as dataSprite, but never throws: { ok, errors, warnings, sprite } (sprite null when not ok). For the studio,
 * the bag and window.loadout, which report problems instead of failing.
 * Arguments: input (the definition, an object or JSON text), opts (as validateDataSprite takes them).
 */
export function makeDataSprite(input, opts = {}) {
  if (versionOf(input) === 2) {
    const v2 = validateV2(input, opts);
    if (!v2.ok) return { ok: false, errors: v2.errors, warnings: v2.warnings, sprite: null };
    try {
      return { ok: true, errors: [], warnings: v2.warnings, sprite: buildV2(v2.value, opts) };
    } catch (e) {
      return { ok: false, errors: [String(e?.message ?? e)], warnings: v2.warnings, sprite: null };
    }
  }
  const v = validateDataSprite(input, opts);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, sprite: null };
  try {
    return { ok: true, errors: [], warnings: v.warnings, sprite: build(v.value, opts) };
  } catch (e) {
    return { ok: false, errors: [String(e?.message ?? e)], warnings: v.warnings, sprite: null };
  }
}
