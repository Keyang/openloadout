// The studio's starting bodies (docs/studio.md section 3, "The other code rigs", and section 8, item S5; Contract 14).
// A person who makes something new in the studio picks one of these; each is a whole `loadout-sprite` definition with
// a bone rig (`loadout-rig`) and keyed clips, so the first thing they see already walks, attacks, flinches and falls.
// They are shaped after the library's own bodies so that what people make looks at home next to them:
//
//   two-legs         a side-view person, after rigs/humanoid.js (64x64, about 35 px tall, feet planted by IK)
//   four-legs        a side-view beast, after rigs/quadruped.js and sprites/wolf.json (64x48, trotting diagonal pairs)
//   crawler          a low beetle on three pairs of legs, after rigs/crawler.js (48x48, tripod gait)
//   flyer            a bat-like body and two wings, after tests/fixtures/code-sprites/bat.js (48x48, anchored in the air)
//   blob             one body and no legs, after tests/fixtures/code-sprites/slime.js (48x48, oozes and hops)
//   blank            one bone and one shape with an eye: the least there is to start from (48x48, side view)
//   topdown-person   a top-down person in three directions, after rigs/topdown.js and sprites/hero-walker.json
//   topdown-beast    a top-down four-legged beast in three directions, after rigs/creature-topdown.js
//
// The top-down bodies follow style guide 5 and Contract 2: clips idle_down, idle_up, idle_side, walk_*, attack_*,
// then hurt and die (no direction, drawn facing down). They are in the form engine/data-sprite.js (S4) draws: ONE rig
// with view "top-down" whose bones and shapes, as written, are the side view, and `directions.down` / `directions.up`
// overlays that re-pose and re-proportion the same bones and shapes (the spine towards or away from the camera, the
// hips opened out, the eyes, ears and hair moved, shown or hidden). Each direction's clips hold their angles as they
// are in that direction's rig; keys show and hide only eyes (the blink) and mouths. An edit to a shape reaches every
// direction that does not change that field, and a new clip with no keys already looks right in each direction.
//
// Everything here is data built once by small functions when the module loads; studioTemplate() hands out a fresh
// copy each time. Angles are degrees in the rig convention (0 down, 90 picture-right, 180 up); a child's angle is
// relative to its parent. Key times are the phases of whole frames (rigs/keypose.js framePhase), so every key sits on
// a frame. Walks put every foot on the ground on frames 0 and 4 (style guide 4) and sound a footstep there; idles
// keep the feet still; every die ends lying on the ground row.
// Pure data and arithmetic: no randomness, no page, no Node; runs the same in the browser and in Node.

import { STANDARD_CLIPS } from '../catalog/studio-schema.js';
import { framePhase } from './keypose.js';
import { directionRig, TOPDOWN_DIRECTIONS as DIRS } from '../engine/data-sprite.js';

// ---- small builders -----------------------------------------------------------------------------------------------

const INK = '#231b33';
const TROUSERS = '#a0805a';   // a light tan, well away from the outline and the boots, so the legs read apart at 1x
const r3 = (v) => Math.round(v * 1000) / 1000;

/** One key on a frame of a clip: { t, ...fields }. */
const keyOn = (std, f, fields) => ({ t: r3(framePhase(std, f)), ...fields });

/**
 * A clip with the style guide's frames, speed and looping for its action (the name before any _direction), its keys
 * given on frames ([frame, fields] pairs), and optional label, sounds and frame edits.
 */
function clip(name, keys, { label, sounds, frameEdits } = {}) {
  const std = STANDARD_CLIPS[name.split('_')[0]];
  const out = { label: label ?? labelOf(name), frames: std.frames, fps: std.fps, loop: std.loop, keys: keys.map(([f, fields]) => keyOn(std, f, fields)) };
  if (frameEdits) out.frameEdits = frameEdits;
  if (sounds) out.sounds = sounds;
  return out;
}
const LABELS = { idle: 'Idle', walk: 'Walk', attack: 'Attack', hurt: 'Hurt', die: 'Die', fly: 'Fly', hop: 'Hop' };
function labelOf(name) {
  const [action, dir] = name.split('_');
  return dir ? `${LABELS[action]} (${dir})` : LABELS[action];
}

/** The white flash that starts hurt and die (style guide 4), plus a nudge when given. */
const flash = (nudge) => ({ 0: nudge ? { flash: true, nudge } : { flash: true } });
const steps = (sound, volume, preset) => [0, 4].map((frame) => ({ sound, frame, ...(preset ? { preset } : {}), volume }));

/**
 * Relative bone angles from a mix of absolute and relative wishes, for one key: { abs: { id: degrees on screen },
 * rel: { id: degrees from the parent } }. Bones named in neither keep their rest angle when they are a parent.
 * Returns { id: relative degrees } for every bone named.
 */
function angles(rig, { abs = {}, rel = {} }) {
  const absOf = new Map();
  const out = {};
  for (const b of rig.bones) {
    const parentAbs = b.parent === null ? 0 : absOf.get(b.parent);
    let r = b.angle;
    if (b.id in abs) r = abs[b.id] - parentAbs;
    else if (b.id in rel) r = rel[b.id];
    // keep it the short way round from the rest angle, so blends between keys turn the near way
    if (b.id in abs) { while (r - b.angle > 180) r -= 360; while (r - b.angle < -180) r += 360; }
    if (b.id in abs || b.id in rel) out[b.id] = r3(r);
    absOf.set(b.id, parentAbs + r);
  }
  return out;
}

/** A sprite definition around a rig. */
function sprite(id, { name, blurb, meta, rig, controls = [], parts, clips, preview, pivot, grounded = true }) {
  const out = {
    format: 'loadout-sprite', version: 1, id, name, blurb, meta: { ...meta, license: 'draft' },
    body: { rig }, size: [...rig.size], pivot, grounded,
    colours: Object.fromEntries(rig.colours.map((c) => [c.id, c.default])),
    controls: [{ key: 'speed', standard: 'speed' }, ...controls],
    clips, preview, made: { in: 'studio', from: `template:${id}` },
  };
  if (parts) out.parts = parts;
  return out;
}
const rigOf = (id, name, view, size, colours, bones, shapes, ik = [], points = []) => ({ format: 'loadout-rig', version: 1, id, name, view, size, colours, bones, shapes, ik, points });

/** The blink every idle has: eyes shut on frames 6 and 7 (style guide 4). */
const blinkKeys = (open, shut) => [[0, { show: open, hide: shut }], [6, { ease: 'hold', show: shut, hide: open }]];

/** Merge key lists given as [frame, fields] pairs: fields on the same frame are joined, show and hide lists added together. */
function mergeKeys(...lists) {
  const by = new Map();
  for (const l of lists) for (const [f, fields] of l) {
    const was = by.get(f) ?? {};
    const next = { ...was, ...fields };
    for (const k of ['show', 'hide']) if (was[k] && fields[k]) next[k] = [...new Set([...was[k], ...fields[k]])];
    if (next.show && next.hide) next.hide = next.hide.filter((id) => !next.show.includes(id) || !(fields.show ?? []).includes(id));
    by.set(f, next);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]);
}

// ---- two legs: a side-view person (after rigs/humanoid.js) --------------------------------------------------------

function twoLegs() {
  const colours = [
    { id: 'skin', label: 'Skin', default: '#e8b088', material: 'skin' },
    { id: 'hair', label: 'Hair', default: '#5a3a22', material: 'cloth' },
    { id: 'shirt', label: 'Shirt', default: '#3f6fd1', material: 'cloth' },
    { id: 'trousers', label: 'Trousers', default: TROUSERS, material: 'cloth' },
    { id: 'boots', label: 'Boots', default: '#6e4428', material: 'earth' },
    { id: 'eye', label: 'Eyes', default: INK, detail: true },
  ];
  const bones = [
    { id: 'spine', parent: null, at: [28, 46], angle: 180, length: 9, label: 'Body' },
    { id: 'head', parent: 'spine', angle: 0, length: 6, min: -40, max: 40, label: 'Head' },
    { id: 'thighF', parent: 'spine', from: 0, angle: 180, length: 6, label: 'Far thigh' },
    { id: 'shinF', parent: 'thighF', angle: 0, length: 6, label: 'Far shin' },
    { id: 'armF', parent: 'spine', from: 0.85, angle: 180, length: 5, label: 'Far arm' },
    { id: 'handF', parent: 'armF', angle: 20, length: 5, label: 'Far forearm' },
    { id: 'thighN', parent: 'spine', from: 0, angle: 180, length: 6, label: 'Near thigh' },
    { id: 'shinN', parent: 'thighN', angle: 0, length: 6, label: 'Near shin' },
    { id: 'armN', parent: 'spine', from: 0.85, angle: 180, length: 5, label: 'Near arm' },
    { id: 'handN', parent: 'armN', angle: 20, length: 5, label: 'Near forearm' },
  ];
  // a bone pointing up has its left (positive v) at picture-left, the back; the face is at negative v
  const shapes = [
    { id: 'legF1', bone: 'thighF', kind: 'limb', width: 3, paint: 'trousers', z: 2, far: true },
    { id: 'legF2', bone: 'shinF', kind: 'limb', width: 3, paint: 'trousers', z: 2, far: true },
    { id: 'bootF', bone: 'shinF', kind: 'ellipse', at: [4, 1], r: [1.2, 2.2], paint: 'boots', z: 3, far: true },
    { id: 'armF1', bone: 'armF', kind: 'limb', width: 3, paint: 'shirt', z: 4, far: true },
    { id: 'armF2', bone: 'handF', kind: 'limb', width: 2, paint: 'skin', z: 4, far: true },
    { id: 'torso', bone: 'spine', kind: 'capsule', from: 0.2, to: 0.85, r: [4.5, 4.5], paint: 'shirt', z: 10 },
    { id: 'hips', bone: 'spine', kind: 'capsule', from: 0, to: 0.1, r: [3.5, 3.5], paint: 'trousers', z: 11 },
    { id: 'legN1', bone: 'thighN', kind: 'limb', width: 3, paint: 'trousers', z: 12 },
    { id: 'legN2', bone: 'shinN', kind: 'limb', width: 3, paint: 'trousers', z: 12 },
    { id: 'bootN', bone: 'shinN', kind: 'ellipse', at: [4, 1], r: [1.2, 2.2], paint: 'boots', z: 13 },
    { id: 'skull', bone: 'head', kind: 'ellipse', at: [6, 0], r: [6, 5.5], paint: 'skin', z: 20, group: 'head' },
    { id: 'nose', bone: 'head', kind: 'ellipse', at: [4.5, -5.5], r: [1, 1], paint: 'skin', z: 20, group: 'head' },
    { id: 'hairTop', bone: 'head', kind: 'ellipse', at: [9.8, 1], r: [2.8, 6], paint: 'hair', z: 21, group: 'hair' },
    { id: 'hairBack', bone: 'head', kind: 'ellipse', at: [6.5, 4], r: [4.5, 2], paint: 'hair', z: 21, group: 'hair' },
    { id: 'eye', bone: 'head', kind: 'dot', at: [5.5, -3], size: 1, paint: 'eye', z: 30 },
    { id: 'eyeShut', bone: 'head', kind: 'dot', at: [5.5, -3], size: 1, paint: 'skin', z: 30, hidden: true },
    { id: 'armN1', bone: 'armN', kind: 'limb', width: 3, paint: 'shirt', z: 40 },
    { id: 'armN2', bone: 'handN', kind: 'limb', width: 2, paint: 'skin', z: 40 },
  ];
  const ik = [
    { id: 'footF', label: 'Far foot', bones: ['thighF', 'shinF'], bend: 1 },
    { id: 'footN', label: 'Near foot', bones: ['thighN', 'shinN'], bend: 1 },
  ];
  const points = [
    { id: 'hand', bone: 'handN', at: [5, 0] },
    { id: 'offhand', bone: 'handF', at: [5, 0] },
    { id: 'head', bone: 'head', at: [12, 0] },
    { id: 'back', bone: 'spine', at: [6, 4], angle: 0 },
    { id: 'feet', ground: true },
  ];
  const rig = rigOf('two-legs', 'Two legs', 'side', [64, 64], colours, bones, shapes, ik, points);
  const stand = { footN: [2, 0], footF: [-2, 0] };
  const eyes = blinkKeys(['eye'], ['eyeShut']);
  const idle = clip('idle', mergeKeys(eyes, [
    [0, { root: [0, 0], ik: stand, bones: { head: 0, armN: 180, armF: 180, handN: 20, handF: 20 } }],
    [4, { root: [0, 1], ik: stand, bones: { head: 3, armN: 176, armF: 184, handN: 26, handF: 26 } }],
  ]));
  const walk = clip('walk', [
    [0, { root: [0, 1], ik: { footN: [5, 0], footF: [-5, 0] }, bones: { spine: 177, armN: 152, armF: 208, handN: 30, handF: 15 } }],
    [2, { root: [0, -1], ik: { footN: [0, 0], footF: [0, -3] }, bones: { spine: 178, armN: 180, armF: 180, handN: 20, handF: 20 } }],
    [4, { root: [0, 1], ik: { footN: [-5, 0], footF: [5, 0] }, bones: { spine: 177, armN: 208, armF: 152, handN: 15, handF: 30 } }],
    [6, { root: [0, -1], ik: { footN: [0, -3], footF: [0, 0] }, bones: { spine: 178, armN: 180, armF: 180, handN: 20, handF: 20 } }],
  ], { sounds: steps('footstep-gravel', 0.5, 'Boots') });
  const ready = { footN: [4, 0], footF: [-3, 0] };
  const attack = clip('attack', [
    [0, { root: [0, 0], ik: stand, bones: { spine: 180, head: 0, armN: 180, handN: 20, armF: 180, handF: 20 } }],
    [2, { ease: 'in', root: [-2, 1], ik: ready, bones: { spine: 190, head: -5, armN: 135, handN: 110, armF: 200, handF: 60 } }],
    [4, { ease: 'out', root: [2, 1], ik: ready, bones: { spine: 170, head: 5, armN: 268, handN: 0, armF: 150, handF: 40 } }],
    [5, { root: [2, 1], ik: ready, bones: { spine: 172, head: 4, armN: 258, handN: 10, armF: 155, handF: 40 } }],
    [7, { root: [0, 0], ik: stand, bones: { spine: 180, head: 0, armN: 180, handN: 20, armF: 180, handF: 20 } }],
  ], { label: 'Punch', sounds: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.6 }, { sound: 'punch', frame: 4, preset: 'Light jab', volume: 0.8 }] });
  const hurt = clip('hurt', [
    [0, { root: [-2, 1], ik: { footN: [3, 0], footF: [-1, 0] }, bones: { spine: 192, head: 15, armN: 215, handN: 40, armF: 215, handF: 40 } }],
    [3, { root: [0, 0], ik: stand, bones: { spine: 180, head: 0, armN: 180, handN: 20, armF: 180, handF: 20 } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }] });
  const die = clip('die', [
    [0, { root: [-2, 1], ik: { footN: [3, 0], footF: [-1, 0] }, bones: { spine: 192, head: 15, armN: 215, handN: 40, armF: 215, handF: 40 }, show: ['eye'], hide: ['eyeShut'] }],
    [2, { ease: 'in', root: [-3, 4], ik: { footN: [6, 0], footF: [3, 0] }, bones: { spine: 215, head: 20, armN: 250, handN: 30, armF: 240, handF: 30 } }],
    [4, { ease: 'out', root: [-2, 4], ik: { footN: [13, 0], footF: [11, 0] }, bones: { spine: 265, head: 5, armN: 300, handN: 10, armF: 280, handF: 10 }, show: ['eyeShut'], hide: ['eye'] }],
    [5, { root: [-2, 4], ik: { footN: [13, -1], footF: [11, 0] }, bones: { spine: 272, head: -3, armN: 295, handN: 10, armF: 278, handF: 10 } }],
    [7, { root: [-2, 4], ik: { footN: [13, 0], footF: [11, 0] }, bones: { spine: 270, head: 0, armN: 290, handN: 10, armF: 275, handF: 10 } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow', volume: 0.9 }, { sound: 'body-fall', frame: 4, volume: 0.8 }] });
  return sprite('two-legs', {
    name: 'Two legs', blurb: 'A person seen from the side, standing on two legs, ready to walk, punch, flinch and fall.',
    meta: { type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['platformer'], view: 'side', words: ['person', 'human', 'hero', 'character', 'walk', 'punch', 'two legs'] },
    rig, pivot: [28, 58], preview: 'walk',
    controls: [
      { key: 'headSize', label: 'Head', lo: 'Small', hi: 'Big', min: 0.85, max: 1.15, default: 1, scales: { shapes: ['skull', 'hairTop', 'hairBack'] } },
      { key: 'build', label: 'Build', lo: 'Slim', hi: 'Broad', min: 0.85, max: 1.25, default: 1, scales: { shapes: ['torso', 'hips'] } },
    ],
    clips: { idle, walk, attack, hurt, die },
  });
}

// ---- four legs: a side-view beast (after rigs/quadruped.js and tests/fixtures/code-sprites/wolf.js) -------------------------------------

function fourLegs() {
  const colours = [
    { id: 'fur', label: 'Fur', default: '#8f97a8', material: 'skin' },
    { id: 'belly', label: 'Belly', default: '#e0d6c2', material: 'skin' },
    { id: 'eye', label: 'Eyes', default: INK, detail: true },
  ];
  const bones = [
    { id: 'spine', parent: null, at: [20, 29], angle: 90, length: 18, label: 'Body' },
    { id: 'neck', parent: 'spine', angle: 50, length: 7, min: -40, max: 40, label: 'Neck' },
    { id: 'head', parent: 'neck', angle: -45, length: 8, min: -45, max: 30, label: 'Head' },
    { id: 'tail1', parent: 'spine', from: 0, angle: 140, length: 6, min: -45, max: 45, label: 'Tail' },
    { id: 'tail2', parent: 'tail1', angle: 20, length: 6, min: -60, max: 60, label: 'Tail tip' },
    { id: 'legBF1', parent: 'spine', from: 0.05, angle: -90, length: 7, label: 'Far hind leg' },
    { id: 'legBF2', parent: 'legBF1', angle: 0, length: 6.5, label: 'Far hind foot' },
    { id: 'legFF1', parent: 'spine', from: 0.95, angle: -90, length: 7, label: 'Far foreleg' },
    { id: 'legFF2', parent: 'legFF1', angle: 0, length: 6.5, label: 'Far forefoot' },
    { id: 'legBN1', parent: 'spine', from: 0.05, angle: -90, length: 7, label: 'Near hind leg' },
    { id: 'legBN2', parent: 'legBN1', angle: 0, length: 6.5, label: 'Near hind foot' },
    { id: 'legFN1', parent: 'spine', from: 0.95, angle: -90, length: 7, label: 'Near foreleg' },
    { id: 'legFN2', parent: 'legFN1', angle: 0, length: 6.5, label: 'Near forefoot' },
  ];
  // a bone pointing forward has its left (positive v) up
  const shapes = [
    { id: 'legBF1', bone: 'legBF1', kind: 'limb', width: 3, paint: 'fur', z: 2, far: true },
    { id: 'legBF2', bone: 'legBF2', kind: 'limb', width: 2, paint: 'fur', z: 2, far: true },
    { id: 'legFF1', bone: 'legFF1', kind: 'limb', width: 3, paint: 'fur', z: 2, far: true },
    { id: 'legFF2', bone: 'legFF2', kind: 'limb', width: 2, paint: 'fur', z: 2, far: true },
    { id: 'body', bone: 'spine', kind: 'capsule', from: 0, to: 0.75, r: [5, 6], paint: 'fur', z: 10, group: 'body' },
    { id: 'chest', bone: 'spine', kind: 'ellipse', at: [15, -0.5], r: [5, 6.5], paint: 'fur', z: 10, group: 'body' },
    { id: 'neck', bone: 'neck', kind: 'capsule', from: 0, to: 1, r: [4.5, 3.5], paint: 'fur', z: 10, group: 'body' },
    { id: 'skull', bone: 'head', kind: 'ellipse', at: [1.5, 0.5], r: [4, 4], paint: 'fur', z: 10, group: 'body' },
    { id: 'snout', bone: 'head', kind: 'capsule', from: 0.3, to: 1, r: [2.6, 1.6], offset: -0.5, paint: 'fur', z: 10, group: 'body' },
    { id: 'ear', bone: 'head', kind: 'poly', points: [[-2.5, 2.5], [-1.5, 8], [1.5, 3]], paint: 'fur', z: 10, group: 'body' },
    { id: 'tail', bone: 'tail1', kind: 'capsule', from: 0, to: 1, r: [2.5, 2], paint: 'fur', z: 10, group: 'body' },
    { id: 'tailTip', bone: 'tail2', kind: 'capsule', from: 0, to: 1, r: [2, 1.2], paint: 'fur', z: 10, group: 'body' },
    { id: 'belly', bone: 'spine', kind: 'capsule', from: 0.45, to: 0.95, offset: -4, r: [1.5, 2.5], paint: 'belly', z: 11 },
    { id: 'throat', bone: 'neck', kind: 'capsule', from: 0, to: 0.9, offset: -2, r: [2, 1.5], paint: 'belly', z: 11 },
    { id: 'chin', bone: 'head', kind: 'capsule', from: 0.2, to: 0.8, offset: -1.8, r: [1.2, 1], paint: 'belly', z: 11 },
    { id: 'legBN1', bone: 'legBN1', kind: 'limb', width: 3, paint: 'fur', z: 12 },
    { id: 'legBN2', bone: 'legBN2', kind: 'limb', width: 2, paint: 'fur', z: 12 },
    { id: 'legFN1', bone: 'legFN1', kind: 'limb', width: 3, paint: 'fur', z: 12 },
    { id: 'legFN2', bone: 'legFN2', kind: 'limb', width: 2, paint: 'fur', z: 12 },
    { id: 'eye', bone: 'head', kind: 'dot', at: [2, 1], size: 1, paint: 'eye', z: 30 },
    { id: 'eyeShut', bone: 'head', kind: 'dot', at: [2, 1], size: 1, paint: 'fur', z: 30, hidden: true },
    { id: 'nose', bone: 'head', kind: 'dot', at: [7.5, 0.5], size: 1, paint: 'eye', z: 30 },
    { id: 'fang', bone: 'head', kind: 'dot', at: [5.5, -2.5], size: 1, paint: 'belly', z: 31, hidden: true },
  ];
  const ik = [
    { id: 'hindF', label: 'Far hind foot', bones: ['legBF1', 'legBF2'], bend: 1 },
    { id: 'foreF', label: 'Far forefoot', bones: ['legFF1', 'legFF2'], bend: -1 },
    { id: 'hindN', label: 'Near hind foot', bones: ['legBN1', 'legBN2'], bend: 1 },
    { id: 'foreN', label: 'Near forefoot', bones: ['legFN1', 'legFN2'], bend: -1 },
  ];
  const points = [{ id: 'head', bone: 'head', at: [2, 4] }, { id: 'back', bone: 'spine', at: [9, 6], angle: 90 }, { id: 'feet', ground: true }];
  const rig = rigOf('four-legs', 'Four legs', 'side', [64, 48], colours, bones, shapes, ik, points);
  const stand = { hindF: [-1, 0], foreF: [1, 0], hindN: [1, 0], foreN: [-1, 0] };
  const rest = { neck: 50, head: -45, tail1: 140, tail2: 20 };
  const idle = clip('idle', mergeKeys(blinkKeys(['eye'], ['eyeShut']), [
    [0, { root: [0, 0], ik: stand, bones: { ...rest } }],
    [4, { root: [0, 1], ik: stand, bones: { neck: 47, head: -42, tail1: 150, tail2: 30 } }],
  ]));
  // a trot: the diagonal pairs (near fore with far hind, far fore with near hind) take turns; all four feet are down on 0 and 4
  const A = (x, y = 0) => ({ foreN: [x, y], hindF: [x, y] }), B = (x, y = 0) => ({ foreF: [x, y], hindN: [x, y] });
  const walk = clip('walk', [
    [0, { root: [0, 1], ik: { ...A(4), ...B(-4) }, bones: { ...rest, tail1: 135 } }],
    [2, { root: [0, -1], ik: { ...A(0), ...B(0, -3) }, bones: { neck: 53, head: -47, tail1: 145, tail2: 30 } }],
    [4, { root: [0, 1], ik: { ...A(-4), ...B(4) }, bones: { ...rest, tail1: 135 } }],
    [6, { root: [0, -1], ik: { ...A(0, -3), ...B(0) }, bones: { neck: 53, head: -47, tail1: 145, tail2: 30 } }],
  ], { sounds: steps('footstep-gravel', 0.45, 'Sneaking') });
  const crouch = { hindF: [-2, 0], foreF: [3, 0], hindN: [0, 0], foreN: [2, 0] };
  const attack = clip('attack', [
    [0, { root: [0, 0], ik: stand, bones: { ...rest }, hide: ['fang'] }],
    [2, { ease: 'in', root: [-2, 1], ik: crouch, bones: { neck: 70, head: -55, tail1: 150 } }],
    [3, { root: [0, 1], ik: crouch, bones: { neck: 40, head: -30 }, show: ['fang'] }],
    [4, { ease: 'out', root: [4, 2], ik: crouch, bones: { neck: 15, head: -5, tail1: 130 } }],
    [6, { root: [1, 1], ik: stand, bones: { neck: 35, head: -32, tail1: 138 }, hide: ['fang'] }],
    [7, { root: [0, 0], ik: stand, bones: { ...rest } }],
  ], { label: 'Bite', sounds: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.6 }, { sound: 'punch', frame: 4, preset: 'Light jab', volume: 0.8 }] });
  const hurt = clip('hurt', [
    [0, { root: [-2, 1], ik: stand, bones: { neck: 70, head: -20, tail1: 145 } }],
    [3, { root: [0, 0], ik: stand, bones: { ...rest } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }] });
  const down = { hindF: [9, 0], foreF: [10, 0], hindN: [7, 0], foreN: [8, 0] };
  const die = clip('die', [
    [0, { root: [-2, 1], ik: stand, bones: { neck: 70, head: -20, tail1: 145 }, show: ['eye'], hide: ['eyeShut'] }],
    [2, { ease: 'in', root: [-1, 2], ik: { hindF: [0, 0], foreF: [2, 0], hindN: [1, 0], foreN: [3, 0] }, bones: { neck: 80, head: -30, tail1: 150 } }],
    [5, { ease: 'out', root: [0, 6], ik: down, bones: { neck: -25, head: 15, tail1: 172, tail2: 5 }, show: ['eyeShut'], hide: ['eye'] }],
    [6, { root: [0, 5], ik: down, bones: { neck: -20, head: 12, tail1: 170, tail2: 8 } }],
    [7, { root: [0, 6], ik: down, bones: { neck: -25, head: 15, tail1: 172, tail2: 5 } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow', volume: 0.9 }, { sound: 'land-thud', frame: 5, preset: 'Heavy landing', volume: 0.8 }] });
  return sprite('four-legs', {
    name: 'Four legs', blurb: 'A four-legged beast seen from the side, with a neck, a tail and a trot.',
    meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side', words: ['beast', 'animal', 'wolf', 'dog', 'four legs', 'quadruped', 'bite', 'trot'] },
    rig, pivot: [28, 43], preview: 'walk',
    controls: [
      { key: 'tailLength', label: 'Tail', lo: 'Short', hi: 'Long', min: 0.6, max: 1.3, default: 1, scales: { bones: ['tail1', 'tail2'] } },
      { key: 'neckLength', label: 'Neck', lo: 'Short', hi: 'Long', min: 0.7, max: 1.3, default: 1, scales: { bones: ['neck'] } },
    ],
    clips: { idle, walk, attack, hurt, die },
  });
}

// ---- crawler: a low body on three pairs of legs (after rigs/crawler.js) ---------------------------------------------

function crawler() {
  const colours = [
    { id: 'shell', label: 'Shell', default: '#7a4fc4', material: 'paint' },
    { id: 'body', label: 'Body', default: '#6e4428', material: 'skin' },
    { id: 'eye', label: 'Eyes', default: '#f0ead8', detail: true },
  ];
  const legs = [['B', 0.15], ['M', 0.5], ['F', 0.85]];
  const bones = [
    { id: 'body', parent: null, at: [12, 35], angle: 90, length: 18, label: 'Body' },
    { id: 'head', parent: 'body', angle: 0, length: 5, min: -40, max: 40, label: 'Head' },
    { id: 'feeler1', parent: 'head', from: 0.6, angle: 35, length: 4, min: -40, max: 60, label: 'Feeler' },
    { id: 'feeler2', parent: 'feeler1', angle: -30, length: 4, min: -60, max: 60, label: 'Feeler tip' },
  ];
  for (const side of ['F', 'N']) for (const [p, from] of legs) {
    const near = side === 'N' ? 'Near' : 'Far', which = { B: 'back', M: 'middle', F: 'front' }[p];
    bones.push({ id: `leg${p}${side}1`, parent: 'body', from, angle: -90, length: 4, label: `${near} ${which} leg` });
    bones.push({ id: `leg${p}${side}2`, parent: `leg${p}${side}1`, angle: 0, length: 4.5, label: `${near} ${which} foot` });
  }
  const legShapes = (side, z, far) => legs.flatMap(([p]) => [
    { id: `leg${p}${side}1`, bone: `leg${p}${side}1`, kind: 'limb', width: 2, paint: 'body', z, ...(far ? { far: true } : {}) },
    { id: `leg${p}${side}2`, bone: `leg${p}${side}2`, kind: 'limb', width: 2, paint: 'body', z, ...(far ? { far: true } : {}) },
  ]);
  const shapes = [
    ...legShapes('F', 2, true),
    { id: 'feeler1', bone: 'feeler1', kind: 'limb', width: 2, paint: 'body', z: 4 },
    { id: 'feeler2', bone: 'feeler2', kind: 'limb', width: 2, paint: 'body', z: 4 },
    { id: 'belly', bone: 'body', kind: 'capsule', from: 0.05, to: 0.95, offset: 0, r: [4, 4], paint: 'body', z: 10, group: 'body' },
    { id: 'skull', bone: 'head', kind: 'ellipse', at: [2.5, 0], r: [3, 3], paint: 'body', z: 10, group: 'body' },
    { id: 'jaw', bone: 'head', kind: 'poly', points: [[4, -1], [7, -1.5], [6.5, -3], [4, -2.5]], paint: 'body', z: 10, group: 'body' },
    { id: 'shell', bone: 'body', kind: 'ellipse', at: [8, 3.5], r: [10.5, 6.5], paint: 'shell', z: 12, shade: 2 },
    ...legShapes('N', 11, false),
    { id: 'eye', bone: 'head', kind: 'dot', at: [3.5, 1], size: 1, paint: 'eye', z: 30 },
    { id: 'eyeShut', bone: 'head', kind: 'dot', at: [3.5, 1], size: 1, paint: 'body', z: 30, hidden: true },
  ];
  // the legs bend out at the knee: front legs forward, back legs backward, middle legs backward
  const ik = [];
  for (const side of ['F', 'N']) for (const [p] of legs) ik.push({ id: `foot${p}${side}`, label: `${side === 'N' ? 'Near' : 'Far'} ${{ B: 'back', M: 'middle', F: 'front' }[p]} foot`, bones: [`leg${p}${side}1`, `leg${p}${side}2`], bend: p === 'F' ? 1 : -1 });
  const points = [{ id: 'head', bone: 'head', at: [5, 0] }, { id: 'back', bone: 'body', at: [9, 9], angle: 90 }, { id: 'feet', ground: true }];
  const rig = rigOf('crawler', 'Crawler', 'side', [48, 48], colours, bones, shapes, ik, points);
  // where each foot stands when the body rests: front feet reach forward, back feet back
  const spread = { B: -3, M: 0, F: 3 };
  const feetAt = (fn) => Object.fromEntries(ik.map((c) => { const p = c.id[4], s = c.id[5]; return [c.id, fn(p, s)]; }));
  const stand = feetAt((p, s) => [spread[p] + (s === 'F' ? 1 : 0), 0]);
  // a tripod gait: near front, far middle and near back step together, then the other three
  const tripod = (p, s) => ((p === 'M') === (s === 'F') ? 'A' : 'B');
  const walkAt = (aX, aY, bX, bY) => feetAt((p, s) => (tripod(p, s) === 'A' ? [spread[p] + aX, aY] : [spread[p] + bX, bY]));
  const rest = { head: 0, feeler1: 35, feeler2: -30 };
  const idle = clip('idle', mergeKeys(blinkKeys(['eye'], ['eyeShut']), [
    [0, { root: [0, 0], ik: stand, bones: { ...rest } }],
    [3, { bones: { feeler1: 25, feeler2: -20 } }],
    [4, { root: [0, 1], ik: stand, bones: { head: 3 } }],
  ]));
  const walk = clip('walk', [
    [0, { root: [0, 1], ik: walkAt(2, 0, -2, 0), bones: { ...rest } }],
    [2, { root: [0, 0], ik: walkAt(0, 0, 0, -2), bones: { feeler1: 25, feeler2: -20 } }],
    [4, { root: [0, 1], ik: walkAt(-2, 0, 2, 0), bones: { ...rest } }],
    [6, { root: [0, 0], ik: walkAt(0, -2, 0, 0), bones: { feeler1: 25, feeler2: -20 } }],
  ], { sounds: steps('footstep-gravel', 0.3, 'Sneaking') });
  const attack = clip('attack', [
    [0, { root: [0, 0], ik: stand, bones: { ...rest } }],
    [2, { ease: 'in', root: [-2, -1], ik: stand, bones: { body: 85, head: 25, feeler1: 30, feeler2: -10 } }],
    [4, { ease: 'out', root: [2, 1], ik: stand, bones: { body: 93, head: -20, feeler1: 70, feeler2: -50 } }],
    [5, { root: [2, 1], ik: stand, bones: { body: 93, head: -15 } }],
    [7, { root: [0, 0], ik: stand, bones: { body: 90, ...rest } }],
  ], { label: 'Bite', sounds: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.6 }, { sound: 'punch', frame: 4, preset: 'Light jab', volume: 0.7 }] });
  const hurt = clip('hurt', [
    [0, { root: [-2, -1], ik: stand, bones: { body: 84, head: 20, feeler1: 25 } }],
    [3, { root: [0, 0], ik: stand, bones: { body: 90, ...rest } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }] });
  // it rolls onto its back, legs in the air
  const die = clip('die', [
    [0, { root: [-2, -4], bones: { body: 84, head: 20 }, show: ['eye'], hide: ['eyeShut'] }],
    [2, { ease: 'in', root: [4, -4], bones: { body: 150, head: 20, feeler1: 80 } }],
    [4, { ease: 'out', root: [21, -3], bones: { body: 270, head: -10, feeler1: 95, feeler2: 40 }, show: ['eyeShut'], hide: ['eye'] }],
    [5, { root: [21, -3], bones: { body: 268 } }],
    [7, { root: [21, -3], bones: { body: 270 } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'enemy-squish', frame: 0, preset: 'Crunch', volume: 1 }] });
  return sprite('crawler', {
    name: 'Crawler', blurb: 'A low beetle on three pairs of legs, with a shell, feelers and a snapping jaw.',
    meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side', words: ['bug', 'beetle', 'insect', 'crawler', 'shell', 'legs', 'crawl', 'bite'] },
    rig, pivot: [24, 42], preview: 'walk',
    controls: [
      { key: 'feelers', label: 'Feelers', lo: 'Short', hi: 'Long', min: 0.5, max: 1.3, default: 1, scales: { bones: ['feeler1', 'feeler2'] } },
      { key: 'shellSize', label: 'Shell', lo: 'Flat', hi: 'Domed', min: 0.85, max: 1.05, default: 1, scales: { shapes: ['shell'] } },
    ],
    clips: { idle, walk, attack, hurt, die },
  });
}

// ---- flyer: a body and two wings (after tests/fixtures/code-sprites/bat.js) -----------------------------------------------------------

function flyer() {
  const colours = [
    { id: 'fur', label: 'Body', default: '#4b3b63', material: 'skin' },
    { id: 'wing', label: 'Wings', default: '#8a4a7a', material: 'skin' },
    { id: 'eye', label: 'Eyes', default: '#f2d24b', detail: true },
    { id: 'fang', label: 'Teeth', default: '#f0ead8', detail: true },
  ];
  const bones = [
    { id: 'body', parent: null, at: [24, 30], angle: 180, length: 5, label: 'Body' },
    { id: 'head', parent: 'body', angle: 0, length: 5, min: -40, max: 40, label: 'Head' },
    { id: 'wingF1', parent: 'body', from: 1, angle: 70, length: 7, label: 'Far wing' },
    { id: 'wingF2', parent: 'wingF1', angle: 30, length: 8, label: 'Far wing tip' },
    { id: 'wingN1', parent: 'body', from: 1, angle: -70, length: 7, label: 'Near wing' },
    { id: 'wingN2', parent: 'wingN1', angle: -30, length: 8, label: 'Near wing tip' },
    { id: 'legs', parent: 'body', from: 0, angle: 180, length: 3, label: 'Feet' },
  ];
  // the near wing points picture-right: its left (positive v) is up, so the skin hangs at negative v; the far wing mirrors it
  const skin = (id, bone, pts, z, far) => ({ id, bone, kind: 'poly', points: pts, paint: 'wing', z, group: far ? 'wingF' : 'wingN', ...(far ? { far: true } : {}) });
  const flip = (pts) => pts.map(([u, v]) => [u, -v]);
  const arm = [[0, 1], [7, 1], [7, -4], [3.5, -3], [0, -5]], tip = [[0, 1], [8, 0.5], [6, -2.5], [4, -1.5], [2, -3.5], [0, -4]];
  const shapes = [
    skin('skinF1', 'wingF1', flip(arm), 2, true), skin('skinF2', 'wingF2', flip(tip), 2, true),
    skin('skinN1', 'wingN1', arm, 4, false), skin('skinN2', 'wingN2', tip, 4, false),
    { id: 'feet', bone: 'legs', kind: 'limb', width: 2, paint: 'fur', z: 5 },
    { id: 'torso', bone: 'body', kind: 'capsule', from: 0, to: 1, r: [3.5, 4.5], paint: 'fur', z: 10, group: 'body' },
    { id: 'skull', bone: 'head', kind: 'ellipse', at: [3, 0], r: [5, 5.5], paint: 'fur', z: 10, group: 'body' },
    { id: 'earF', bone: 'head', kind: 'poly', points: [[5, 1], [11, 5], [6, 5.5]], paint: 'fur', z: 10, group: 'body' },
    { id: 'earN', bone: 'head', kind: 'poly', points: [[5, -1.5], [11, -4.5], [6, -5.5]], paint: 'fur', z: 10, group: 'body' },
    { id: 'eye', bone: 'head', kind: 'dot', at: [3.5, -3], size: 2, paint: 'eye', z: 30 },
    { id: 'eye2', bone: 'head', kind: 'dot', at: [3.5, 1], size: 2, paint: 'eye', z: 30 },
    { id: 'eyeShut', bone: 'head', kind: 'dot', at: [2.5, -3], size: 1, paint: 'eye', z: 30, hidden: true },
    { id: 'eye2Shut', bone: 'head', kind: 'dot', at: [2.5, 1], size: 1, paint: 'eye', z: 30, hidden: true },
    { id: 'fang', bone: 'head', kind: 'dot', at: [0, -2], size: 1, paint: 'fang', z: 30 },
    { id: 'fang2', bone: 'head', kind: 'dot', at: [0, 0], size: 1, paint: 'fang', z: 30 },
  ];
  const points = [{ id: 'head', bone: 'head', at: [8, 0] }, { id: 'feet', bone: 'legs', at: [3, 0] }];
  const rig = rigOf('flyer', 'Flyer', 'side', [48, 48], colours, bones, shapes, [], points);
  const up = { wingN1: -40, wingN2: -40, wingF1: 40, wingF2: 40 };
  const mid = { wingN1: -80, wingN2: -20, wingF1: 80, wingF2: 20 };
  const downW = { wingN1: -125, wingN2: 10, wingF1: 125, wingF2: -10 };
  const idle = clip('idle', mergeKeys(blinkKeys(['eye', 'eye2'], ['eyeShut', 'eye2Shut']), [
    [0, { root: [0, 1], bones: { ...up, head: 0 } }],
    [2, { root: [0, 0], bones: { ...mid } }],
    [4, { root: [0, -1], bones: { wingN1: -105, wingN2: -15, wingF1: 105, wingF2: 15, head: 4 } }],
    [6, { root: [0, 0], bones: { ...mid } }],
  ]));
  // one wing beat: the body rises as the wings go down (style guide 4)
  const fly = clip('fly', [
    [0, { root: [0, 2], bones: { ...up } }],
    [2, { ease: 'in', root: [0, 1], bones: { ...mid } }],
    [4, { ease: 'out', root: [0, -2], bones: { ...downW } }],
    [6, { root: [0, -1], bones: { ...mid, wingN2: -60, wingF2: 60 } }],
  ], { sounds: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.35 }] });
  const attack = clip('attack', [
    [0, { root: [0, 1], bones: { ...up, body: 180, head: 0 } }],
    [2, { ease: 'in', root: [-3, -2], bones: { wingN1: -20, wingN2: -70, wingF1: 20, wingF2: 70, body: 195, head: 10 } }],
    [4, { ease: 'out', root: [4, 2], bones: { ...downW, body: 150, head: -25 } }],
    [5, { root: [4, 2], bones: { ...mid, body: 155, head: -20 } }],
    [7, { root: [0, 1], bones: { ...up, body: 180, head: 0 } }],
  ], { label: 'Bite', sounds: [{ sound: 'whoosh', frame: 3, preset: 'Heavy swing', volume: 0.6 }, { sound: 'punch', frame: 4, preset: 'Light jab', volume: 0.7 }] });
  const hurt = clip('hurt', [
    [0, { root: [-2, -1], bones: { ...up, body: 195, head: 15 } }],
    [3, { root: [0, 1], bones: { ...up, body: 180, head: 0 } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }] });
  // it folds its wings and drops to the bottom of the frame, where it lies on its back
  const folded = { wingN1: -15, wingN2: -150, wingF1: 15, wingF2: 150 };
  const die = clip('die', [
    [0, { root: [-2, -1], bones: { ...up, body: 195, head: 15 }, show: ['eye', 'eye2'], hide: ['eyeShut', 'eye2Shut'] }],
    [2, { ease: 'in', root: [-1, 2], bones: { ...up, body: 210, head: 20 }, show: ['eyeShut', 'eye2Shut'], hide: ['eye', 'eye2'] }],
    [5, { ease: 'out', root: [2, 9], bones: { ...folded, body: 270, head: 0 } }],
    [6, { root: [2, 8], bones: { ...folded, body: 268, head: 0 } }],
    [7, { root: [2, 9], bones: { ...folded, body: 270, head: 0 } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'enemy-squish', frame: 0, preset: 'Pop', volume: 1 }] });
  return sprite('flyer', {
    name: 'Flyer', blurb: 'A small winged creature that hangs in the air, beats its wings, swoops to bite and drops.',
    meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer'], view: 'side', words: ['bat', 'flyer', 'wings', 'flying', 'flap', 'swoop', 'cave'] },
    rig, pivot: [24, 24], grounded: false, preview: 'fly',
    controls: [{ key: 'wingSpan', label: 'Wings', lo: 'Small', hi: 'Wide', min: 0.75, max: 1.2, default: 1, scales: { bones: ['wingN1', 'wingN2', 'wingF1', 'wingF2'] } }],
    clips: { idle, fly, attack, hurt, die },
  });
}

// ---- blob: one body, no legs (after tests/fixtures/code-sprites/slime.js) --------------------------------------------------------------

function blob() {
  const colours = [
    { id: 'goo', label: 'Goo', default: '#5cbf60', material: 'water' },
    { id: 'eye', label: 'Eyes', default: INK, detail: true },
  ];
  const bones = [
    { id: 'base', parent: null, at: [24, 35], angle: 180, length: 8, label: 'Body' },
    { id: 'front', parent: 'base', from: 0, angle: -90, length: 3.5, label: 'Front' },
    { id: 'back', parent: 'base', from: 0, angle: 90, length: 3.5, label: 'Back' },
  ];
  // one goo body: a dome over two low lobes, so it squashes wide and stretches tall; on the up-pointing base, the front is negative v
  const shapes = [
    { id: 'dome', bone: 'base', kind: 'capsule', from: 0, to: 0.6, r: [7, 6], paint: 'goo', z: 10, group: 'goo', light: 1 },
    { id: 'lobeF', bone: 'front', kind: 'capsule', from: 0, to: 1, r: [4.5, 4.5], paint: 'goo', z: 10, group: 'goo', light: 1 },
    { id: 'lobeB', bone: 'back', kind: 'capsule', from: 0, to: 1, r: [4.5, 4.5], paint: 'goo', z: 10, group: 'goo', light: 1 },
    { id: 'eye', bone: 'base', kind: 'dot', at: [4, -0.5], size: 2, paint: 'eye', z: 30 },
    { id: 'eye2', bone: 'base', kind: 'dot', at: [4, -4.5], size: 2, paint: 'eye', z: 30 },
    { id: 'eyeShut', bone: 'base', kind: 'dot', at: [3.5, -0.5], size: 1, paint: 'eye', z: 30, hidden: true },
    { id: 'eye2Shut', bone: 'base', kind: 'dot', at: [3.5, -4.5], size: 1, paint: 'eye', z: 30, hidden: true },
    { id: 'mouth', bone: 'base', kind: 'dot', at: [1.5, -3], size: 2, paint: 'eye', z: 30, hidden: true },
  ];
  const points = [{ id: 'head', bone: 'base', at: [10, 0] }, { id: 'feet', ground: true }];
  const rig = rigOf('blob', 'Blob', 'side', [48, 48], colours, bones, shapes, [], points);
  // the body leans while its two lobes stay level on the ground
  const tilt = (a) => ({ base: a, front: 180 - a - 90, back: 180 - a + 90 });
  const flat = (k) => ({ base: r3(1 - 0.5 * (k - 1)), front: k, back: k });
  const idle = clip('idle', mergeKeys(blinkKeys(['eye', 'eye2'], ['eyeShut', 'eye2Shut']), [
    [0, { stretch: flat(1), bones: tilt(180) }],
    [4, { stretch: flat(1.12), bones: tilt(182) }],
  ]));
  // it oozes: flattened (on the ground) on 0 and 4, tall and leaning forward between
  const walk = clip('walk', [
    [0, { root: [0, 0], stretch: flat(1.2), bones: tilt(180) }],
    [2, { root: [1, 0], stretch: flat(0.85), bones: tilt(172) }],
    [4, { root: [0, 0], stretch: flat(1.2), bones: tilt(180) }],
    [6, { root: [1, 0], stretch: flat(0.85), bones: tilt(174) }],
  ], { sounds: steps('footstep-mud', 0.35) });
  const hop = clip('hop', [
    [0, { root: [0, 0], stretch: flat(1.3) }],
    [1, { root: [0, 0], stretch: flat(1.4), bones: tilt(180) }],
    [2, { ease: 'out', root: [0, -4], stretch: flat(0.75), bones: tilt(176) }],
    [4, { ease: 'in', root: [0, -9], stretch: flat(0.9), bones: tilt(180) }],
    [5, { root: [0, -5], stretch: flat(0.8) }],
    [6, { root: [0, 0], stretch: flat(1.4), bones: tilt(182) }],
    [7, { root: [0, 0], stretch: flat(1.1), bones: tilt(180) }],
  ], { sounds: [{ sound: 'jump', frame: 1, preset: 'Tiny hop', volume: 0.6 }, { sound: 'footstep-mud', frame: 6, volume: 0.4 }] });
  const attack = clip('attack', [
    [0, { root: [0, 0], stretch: flat(1), bones: tilt(180), hide: ['mouth'] }],
    [2, { ease: 'in', root: [-2, 0], stretch: flat(1.35), bones: tilt(196) }],
    [3, { root: [0, 0], stretch: flat(0.9), bones: tilt(170), show: ['mouth'] }],
    [4, { ease: 'out', root: [4, 0], stretch: flat(0.8), bones: tilt(150) }],
    [6, { root: [1, 0], stretch: flat(1.1), bones: tilt(175), hide: ['mouth'] }],
    [7, { root: [0, 0], stretch: flat(1), bones: tilt(180) }],
  ], { label: 'Lunge', sounds: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.5 }, { sound: 'enemy-squish', frame: 4, preset: 'Squish', volume: 0.6 }] });
  const hurt = clip('hurt', [
    [0, { root: [-2, 0], stretch: flat(1.35), bones: tilt(192) }],
    [3, { root: [0, 0], stretch: flat(1), bones: tilt(180) }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }] });
  // it melts into a puddle that stays
  const die = clip('die', [
    [0, { root: [-2, 0], stretch: flat(1.35), bones: tilt(192), show: ['eye', 'eye2'], hide: ['eyeShut', 'eye2Shut'] }],
    [2, { ease: 'in', root: [0, 0], stretch: { base: 0.8, front: 1.4, back: 1.4 }, bones: tilt(180), show: ['eyeShut', 'eye2Shut'], hide: ['eye', 'eye2'] }],
    [4, { ease: 'out', root: [0, 0], stretch: { base: 0.5, front: 1.5, back: 1.5 } }],
    [5, { root: [0, 0], stretch: { base: 0.5, front: 1.5, back: 1.5 } }],
    [7, { root: [0, 0], stretch: { base: 0.5, front: 1.5, back: 1.5 } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'enemy-squish', frame: 0, preset: 'Squish', volume: 1 }] });
  return sprite('blob', {
    name: 'Blob', blurb: 'A body with no legs that oozes along, hops, lunges and melts into a puddle.',
    meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer'], view: 'side', words: ['blob', 'slime', 'goo', 'ooze', 'jelly', 'hop', 'squish'] },
    rig, pivot: [24, 42], preview: 'walk',
    controls: [{ key: 'height', label: 'Height', lo: 'Flat', hi: 'Tall', min: 0.8, max: 1.3, default: 1, scales: { bones: ['base'] } }],
    clips: { idle, walk, hop, attack, hurt, die },
  });
}

// ---- blank: one bone, one shape and an eye ------------------------------------------------------------------------

function blank() {
  const colours = [
    { id: 'body', label: 'Body', default: '#e08a2c', material: 'skin' },
    { id: 'eye', label: 'Eyes', default: INK, detail: true },
  ];
  const bones = [{ id: 'body', parent: null, at: [24, 42], angle: 180, length: 14, label: 'Body' }];
  const shapes = [
    { id: 'body', bone: 'body', kind: 'ellipse', at: [7, 0], r: [7, 6], paint: 'body', z: 10 },
    { id: 'eye', bone: 'body', kind: 'dot', at: [9.5, -3], size: 1, paint: 'eye', z: 30 },
    { id: 'eyeShut', bone: 'body', kind: 'dot', at: [9.5, -3], size: 1, paint: 'body', z: 30, hidden: true },
  ];
  const rig = rigOf('blank', 'Blank', 'side', [48, 48], colours, bones, shapes, [], [{ id: 'head', bone: 'body', at: [14, 0] }, { id: 'feet', ground: true }]);
  const idle = clip('idle', mergeKeys(blinkKeys(['eye'], ['eyeShut']), [[0, { root: [0, 0], bones: { body: 180 } }], [4, { root: [0, 0], bones: { body: 187 } }]]));
  // a waddle: it rocks from side to side and lifts between the steps
  const walk = clip('walk', [
    [0, { root: [0, 0], bones: { body: 186 } }],
    [2, { root: [0, -2], bones: { body: 180 } }],
    [4, { root: [0, 0], bones: { body: 174 } }],
    [6, { root: [0, -2], bones: { body: 180 } }],
  ], { sounds: steps('footstep-gravel', 0.35, 'Sneaking') });
  const attack = clip('attack', [
    [0, { root: [0, 0], bones: { body: 180 } }],
    [2, { ease: 'in', root: [-2, 0], bones: { body: 200 } }],
    [4, { ease: 'out', root: [3, 0], bones: { body: 155 } }],
    [5, { root: [3, 0], bones: { body: 160 } }],
    [7, { root: [0, 0], bones: { body: 180 } }],
  ], { label: 'Bump', sounds: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.5 }, { sound: 'punch', frame: 4, preset: 'Light jab', volume: 0.6 }] });
  const hurt = clip('hurt', [[0, { root: [-2, 0], bones: { body: 196 } }], [3, { root: [0, 0], bones: { body: 180 } }]], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }] });
  const die = clip('die', [
    [0, { root: [-2, 0], bones: { body: 196 }, show: ['eye'], hide: ['eyeShut'] }],
    [3, { ease: 'in', root: [0, -3], bones: { body: 240 } }],
    [5, { ease: 'out', root: [6, -6], bones: { body: 270 }, show: ['eyeShut'], hide: ['eye'] }],
    [6, { root: [6, -6], bones: { body: 268 } }],
    [7, { root: [6, -6], bones: { body: 270 } }],
  ], { frameEdits: flash(), sounds: [{ sound: 'body-fall', frame: 5, volume: 0.6 }] });
  return sprite('blank', {
    name: 'Blank', blurb: 'One bone with one round shape and an eye: the least there is, to build your own body on.',
    meta: { type: 'creature', role: 'characters/npc', themes: ['neutral'], gameTypes: ['platformer'], view: 'side', words: ['blank', 'empty', 'start', 'egg', 'simple', 'creature'] },
    rig, pivot: [24, 42], preview: 'walk',
    clips: { idle, walk, attack, hurt, die },
  });
}

// ---- top-down bodies: one rig, a pose per direction (engine/data-sprite.js, `directions`) ---------------------------

/** Sets each named bone's rest angle (relative to its parent, as the rig holds it) from screen angles; returns the bones. */
function restAt(bones, abs) {
  const rel = angles({ bones }, { abs });
  for (const b of bones) if (b.id in rel) b.angle = rel[b.id];
  return bones;
}

/**
 * One direction's overlay for a top-down rig written as seen from the side (the form engine/data-sprite.js reads):
 * the bones' rest angles from screen angles (abs), their lengths, the root's place, and the shapes' changes as given.
 * Only what differs from the side view is written, so an edit to the rig reaches every direction that does not change it.
 */
function overlay(rig, { abs = {}, length = {}, at, shapes = {} }) {
  const rel = angles(rig, { abs });
  const bones = {};
  for (const b of rig.bones) {
    const x = {};
    if (b.id in rel && Math.abs(rel[b.id] - b.angle) > 1e-6) x.angle = rel[b.id];
    if (b.id in length && length[b.id] !== b.length) x.length = length[b.id];
    if (at && b.parent === null && (at[0] !== b.at[0] || at[1] !== b.at[1])) x.at = [...at];
    if (Object.keys(x).length) bones[b.id] = x;
  }
  return { bones, shapes: JSON.parse(JSON.stringify(shapes)) };
}

/** How much a straight leg of this length (px) stretches to keep its foot on the ground while the body rises 1 px. */
const plantFor = (legLength) => Math.round((1 + 1 / legLength) * 1e4) / 1e4;

/** How much a leg stretches to reach as low as it did hanging straight, when it swings `deg` degrees off the vertical. */
const reachFor = (deg) => Math.round(1e4 / Math.cos((deg * Math.PI) / 180)) / 1e4;

/**
 * The legs of a top-down walk facing down or up (Contract 2), as stretch per frame: every leg at full length on the
 * contact frames 0 and 4; between them one set lifts (its legs shorten: the foot comes up towards the body, 0.8, 0.6,
 * 0.8) while the other set stays planted, its legs lengthened by exactly the 1 px the body rises, so its feet keep
 * the ground row. pairA lifts on 1 to 3, pairB on 5 to 7. legLength is the legs' length in px (the planted stretch).
 * Returns [[frame, { root, stretch }] x 8].
 */
function frontWalk(pairA, pairB, legLength) {
  const plant = plantFor(legLength), lift = [1, 0.8, 0.6, 0.8];
  const out = [];
  for (let f = 0; f < 8; f++) {
    const i = f % 4, up = f < 4 ? pairA : pairB, down = f < 4 ? pairB : pairA;
    const stretch = {};
    for (const l of up) stretch[l] = i === 0 ? 1 : lift[i];
    for (const l of down) stretch[l] = i === 0 ? 1 : plant;
    out.push([f, { root: [0, i === 0 ? 0 : -1], stretch }]);
  }
  return out;
}

// ---- top-down person (after rigs/topdown.js and sprites/hero-walker.json) ---------------------------------------------

function topdownPerson() {
  const colours = [
    { id: 'skin', label: 'Skin', default: '#e8b088', material: 'skin' },
    { id: 'hair', label: 'Hair', default: '#5a3a22', material: 'cloth' },
    { id: 'shirt', label: 'Shirt', default: '#3f6fd1', material: 'cloth' },
    { id: 'trousers', label: 'Trousers', default: TROUSERS, material: 'cloth' },
    { id: 'boots', label: 'Boots', default: '#6e4428', material: 'earth' },
    { id: 'eye', label: 'Eyes', default: INK, detail: true },
  ];
  // the rig as written is the side view (facing picture-right): the spine points up the screen from the hips, the hips
  // and shoulders are short (seen edge on) and the limbs hang straight down; down and up are overlays below
  const bones = restAt([
    { id: 'spine', parent: null, at: [24, 33], angle: 0, length: 7, label: 'Body' },
    { id: 'head', parent: 'spine', angle: 0, length: 6, min: -30, max: 30, label: 'Head' },
    { id: 'hipL', parent: 'spine', from: 0, angle: 0, length: 1.25, label: 'Left hip' },
    { id: 'legL', parent: 'hipL', angle: 0, length: 6, label: 'Left leg' },
    { id: 'hipR', parent: 'spine', from: 0, angle: 0, length: 1.25, label: 'Right hip' },
    { id: 'legR', parent: 'hipR', angle: 0, length: 6, label: 'Right leg' },
    { id: 'shoulderL', parent: 'spine', from: 0.9, angle: 0, length: 2.25, label: 'Left shoulder' },
    { id: 'armL', parent: 'shoulderL', angle: 0, length: 6, label: 'Left arm' },
    { id: 'shoulderR', parent: 'spine', from: 0.9, angle: 0, length: 2.25, label: 'Right shoulder' },
    { id: 'armR', parent: 'shoulderR', angle: 0, length: 6, label: 'Right arm' },
  ], { spine: 180, hipL: 345, hipR: 15, legL: 0, legR: 0, shoulderL: 330, shoulderR: 30, armL: 0, armR: 0 });
  // on the up-pointing spine and head, positive v is picture-left: the face (side view) is at negative v
  const leg = (id, z, far) => [
    { id, bone: id, kind: 'limb', width: 3, paint: 'trousers', z, ...(far ? { far: true } : {}) },
    { id: `${id}Foot`, bone: id, kind: 'ellipse', at: [5.5, 0], r: [1.5, 1.8], paint: 'boots', z, ...(far ? { far: true } : {}) },
  ];
  const arm = (id, z, far) => [
    { id, bone: id, kind: 'limb', width: 3, paint: 'shirt', z, ...(far ? { far: true } : {}) },
    { id: `${id}Hand`, bone: id, kind: 'ellipse', at: [6, 0], r: [1.4, 1.4], paint: 'skin', z, ...(far ? { far: true } : {}) },
  ];
  const shapes = [
    ...leg('legL', 4, true), ...arm('armL', 5, true),
    { id: 'hips', bone: 'spine', kind: 'capsule', from: 0, to: 0.1, r: [3, 3], paint: 'trousers', z: 8 },
    { id: 'torso', bone: 'spine', kind: 'capsule', from: 0.2, to: 0.9, r: [3.5, 4], paint: 'shirt', z: 10 },
    ...leg('legR', 8),
    { id: 'skull', bone: 'head', kind: 'ellipse', at: [6, 0], r: [6.5, 6.5], paint: 'skin', z: 20 },
    // the hair: a cap, and two locks that are the back of the head from the side and the sides of the face from the front
    { id: 'hair', bone: 'head', kind: 'ellipse', at: [8.5, 1], r: [4.5, 5], paint: 'hair', z: 21, group: 'hair' },
    { id: 'hairL', bone: 'head', kind: 'ellipse', at: [5.5, 4.2], r: [5, 3], paint: 'hair', z: 21, group: 'hair' },
    { id: 'hairR', bone: 'head', kind: 'ellipse', at: [8, -5.2], r: [3, 1.6], paint: 'hair', z: 21, group: 'hair', hidden: true },
    { id: 'nape', bone: 'head', kind: 'ellipse', at: [1.5, 0], r: [1.5, 3], paint: 'skin', z: 22, hidden: true },
    // one eye in profile; facing down both show
    { id: 'eyeL', bone: 'head', kind: 'dot', at: [5.5, 2.5], size: 1, paint: 'eye', z: 30, hidden: true },
    { id: 'eyeR', bone: 'head', kind: 'dot', at: [5, -2.8], size: 1, paint: 'eye', z: 30 },
    { id: 'eyeLShut', bone: 'head', kind: 'dot', at: [5.5, 2.5], size: 1, paint: 'skin', z: 30, hidden: true },
    { id: 'eyeRShut', bone: 'head', kind: 'dot', at: [5, -2.8], size: 1, paint: 'skin', z: 30, hidden: true },
    ...arm('armR', 25),
  ];
  const points = [{ id: 'hand', bone: 'armR', at: [6, 0] }, { id: 'offhand', bone: 'armL', at: [6, 0] }, { id: 'head', bone: 'head', at: [12, 0] }, { id: 'feet', ground: true }];
  const rig = rigOf('topdown-person', 'Top-down person', 'top-down', [48, 48], colours, bones, shapes, [], points);
  // facing down or up the hips and shoulders open out to the sides and the limbs hang beside the body, all in one layer
  const front = { spine: 180, hipL: 270, hipR: 90, legL: 0, legR: 0, shoulderL: 270, shoulderR: 90, armL: 10, armR: -10 };
  const wide = { hipL: 2.5, hipR: 2.5, shoulderL: 4.5, shoulderR: 4.5 };
  const limbs = {
    legL: { z: 6, far: false }, legLFoot: { z: 6, far: false }, legR: { z: 6 }, legRFoot: { z: 6 },
    armL: { z: 12, far: false }, armLHand: { z: 12, far: false }, armR: { z: 12 }, armRHand: { z: 12 },
    hips: { r: [3.5, 3.5] }, torso: { r: [4.5, 4.5] },
  };
  rig.directions = {
    down: overlay(rig, { abs: front, length: wide, at: [24, 34], shapes: {
      ...limbs, hair: { at: [10.5, 0], r: [2.8, 6.8] }, hairL: { at: [8, 5.2], r: [3, 1.6] }, hairR: { hidden: false },
      eyeL: { hidden: false }, eyeR: { at: [5.5, -2.5] }, eyeRShut: { at: [5.5, -2.5] },
    } }),
    up: overlay(rig, { abs: front, length: wide, at: [24, 34], shapes: {
      ...limbs, hair: { at: [6, 0], r: [6.5, 6.5] }, hairL: { hidden: true }, nape: { hidden: false }, eyeR: { hidden: true },
    } }),
  };

  // a key's bone angles, as they are in that direction's rig: abs are screen angles, rel are from the parent
  const A = (dir, abs = {}, rel = {}) => angles(directionRig(rig, dir), { abs, rel });
  const clips = {};
  const eyes = { down: [['eyeL', 'eyeR'], ['eyeLShut', 'eyeRShut']], up: null, side: [['eyeR'], ['eyeRShut']] };
  for (const dir of DIRS) {
    const blink = eyes[dir] ? blinkKeys(eyes[dir][0], eyes[dir][1]) : [];
    // a breath: the body is 1 px shorter on 2 to 5 (held, so the head moves by a whole pixel and keeps its shape, and
    // away from the loop's seam); the arms sway smoothly all the way round; the feet never move
    const arms = (a) => ({ bones: dir === 'side' ? A('side', { armL: -a, armR: a }) : A(dir, { armL: 10 - a, armR: a - 10 }) });
    clips[`idle_${dir}`] = clip(`idle_${dir}`, mergeKeys(blink, [
      [2, { ease: 'hold', stretch: { spine: r3(1 - 1 / 7) } }],
      [6, { ease: 'hold', stretch: { spine: 1 } }],
    ], [
      [0, { root: [0, 0], stretch: { armL: 1, armR: 1 }, ...arms(0) }],
      [4, { root: [0, 0], stretch: { armL: 0.95, armR: 0.95 }, ...arms(9) }],
    ]));
  }
  // facing down or up: a foot steps by its leg shortening while the other stays planted; the arms swing the other way
  for (const dir of ['down', 'up']) {
    const fwd = dir === 'down' ? 1.15 : 0.8, back = dir === 'down' ? 0.8 : 1.15;
    const arms = { 0: [fwd, back], 2: [1, 1], 4: [back, fwd], 6: [1, 1] };
    clips[`walk_${dir}`] = clip(`walk_${dir}`, frontWalk(['legL'], ['legR'], 6).map(([f, k]) => [f, f in arms ? { ...k, stretch: { ...k.stretch, armL: arms[f][0], armR: arms[f][1] } } : k]),
      { sounds: steps('footstep-grass', 0.45, 'Grass') });
  }
  // from the side the legs swing; on 0 and 4 both feet are down (the legs lengthened to reach the ground at a slant)
  const plant = plantFor(6);
  const sideLimbs = (legL, legR, armL, armR) => A('side', { legL, legR, armL, armR });
  clips.walk_side = clip('walk_side', [
    [0, { root: [0, 0], stretch: { legL: 1.16, legR: 1.16, armL: 1, armR: 1 }, bones: sideLimbs(-28, 28, 30, -30) }],
    [2, { root: [0, -1], stretch: { legL: 0.75, legR: plant }, bones: sideLimbs(10, 0, 0, 0) }],
    [4, { root: [0, 0], stretch: { legL: 1.16, legR: 1.16 }, bones: sideLimbs(28, -28, -30, 30) }],
    [6, { root: [0, -1], stretch: { legL: plant, legR: 0.75 }, bones: sideLimbs(0, 10, 0, 0) }],
  ], { sounds: steps('footstep-grass', 0.45, 'Grass') });

  // attacks: the right hand strikes the way the body faces; wind-up on 1 to 2, the hit on 4
  const hit = [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.7 }, { sound: 'punch', frame: 4, preset: 'Light jab', volume: 0.7 }];
  const strike = (dir, { rest, wind, reach, root2 = [0, 0], root4 = [0, 0], extra = () => ({}), legs = () => ({}) }) => clip(`attack_${dir}`, [
    [0, { root: [0, 0], stretch: { armR: 1, ...legs(0) }, bones: A(dir, { armR: rest, ...extra(0) }) }],
    [2, { ease: 'in', root: root2, stretch: { armR: wind[1], ...legs(1) }, bones: A(dir, { armR: wind[0], ...extra(1) }) }],
    [4, { ease: 'out', root: root4, stretch: { armR: reach[1], ...legs(2) }, bones: A(dir, { armR: reach[0], ...extra(2) }) }],
    [5, { root: root4, stretch: { armR: r3(reach[1] - 0.1), ...legs(2) }, bones: A(dir, { armR: reach[0] - 5, ...extra(2) }) }],
    [7, { root: [0, 0], stretch: { armR: 1, ...legs(0) }, bones: A(dir, { armR: rest, ...extra(0) }) }],
  ], { sounds: hit });
  clips.attack_down = strike('down', { rest: -10, wind: [-80, 0.6], reach: [25, 1.45], root2: [0, -1], extra: (k) => ({ armL: [10, 20, -5][k] }) });
  clips.attack_up = strike('up', { rest: -10, wind: [20, 0.8], reach: [165, 1.3], root4: [0, -1] });
  clips.attack_side = strike('side', { rest: 0, wind: [-60, 0.8], reach: [95, 1.4], root2: [-1, 0], root4: [2, 0], extra: (k) => ({ legL: [0, -8, -14][k], legR: [0, 12, 18][k], armL: [0, 20, -25][k] }), legs: (k) => ({ legL: reachFor([0, 8, 14][k]), legR: reachFor([0, 12, 18][k]) }) });
  // hurt and die face down and serve every direction (style guide 5, rule 4)
  const flinch = A('down', { armL: 40, armR: -40 }, { head: 12 });
  clips.hurt = clip('hurt', [
    [0, { root: [0, -2], stretch: { armL: 0.8, armR: 0.8 }, bones: flinch }],
    [3, { root: [0, 0], stretch: { armL: 1, armR: 1 }, bones: A('down', { armL: 10, armR: -10 }, { head: 0 }) }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }] });
  // it topples to its side and lies there, eyes shut
  const lying = A('down', { spine: 270, hipL: 0, hipR: 180, legL: 90, legR: 90, shoulderL: 0, shoulderR: 180, armL: 70, armR: 110 }, { head: 0 });
  clips.die = clip('die', [
    [0, { root: [0, -2], stretch: { armL: 0.8, armR: 0.8 }, bones: flinch }],
    [2, { ease: 'in', root: [1, 0], stretch: { armL: 1, armR: 1 }, bones: A('down', { spine: 210, armL: 40, armR: -20 }) }],
    [4, { ease: 'out', root: [4, 0], bones: lying, show: ['eyeLShut', 'eyeRShut'], hide: ['eyeL', 'eyeR'] }],
    [5, { root: [4, -1], bones: lying }],
    [6, { root: [4, 0], bones: lying }],
    [7, { root: [4, 0], bones: lying }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow', volume: 0.9 }, { sound: 'body-fall', frame: 4, volume: 0.7 }] });

  return sprite('topdown-person', {
    name: 'Top-down person', blurb: 'A person seen from above at three quarters, facing down, up or to the side: walks, strikes, flinches and falls.',
    meta: { type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'roguelike-action'], view: 'top-down', words: ['person', 'human', 'hero', 'character', 'top-down', 'walk', 'adventurer'] },
    rig, pivot: [24, 42], preview: 'walk_down',
    controls: [{ key: 'headSize', label: 'Head', lo: 'Small', hi: 'Big', min: 0.85, max: 1.1, default: 1, scales: { bones: ['head'] } }],
    clips,
  });
}

// ---- top-down beast (after rigs/creature-topdown.js) -----------------------------------------------------------------

function topdownBeast() {
  const colours = [
    { id: 'fur', label: 'Fur', default: '#a8612a', material: 'skin' },
    { id: 'belly', label: 'Muzzle', default: '#e0d6c2', material: 'skin' },
    { id: 'eye', label: 'Eyes', default: INK, detail: true },
  ];
  // the rig as written is the side view: the spine runs picture-right from the rump, the legs hang straight down
  const LEG = 7.5;
  const bones = restAt([
    { id: 'spine', parent: null, at: [18, 29], angle: 0, length: 12, label: 'Body' },
    { id: 'head', parent: 'spine', angle: 0, length: 5, min: -40, max: 40, label: 'Head' },
    { id: 'tail', parent: 'spine', from: 0, angle: 0, length: 5, min: -60, max: 60, label: 'Tail' },
    { id: 'hipL', parent: 'spine', from: 0.1, angle: 0, length: 3.25, label: 'Left hip' },
    { id: 'legBL', parent: 'hipL', angle: 0, length: LEG, label: 'Left hind leg' },
    { id: 'hipR', parent: 'spine', from: 0.1, angle: 0, length: 3.25, label: 'Right hip' },
    { id: 'legBR', parent: 'hipR', angle: 0, length: LEG, label: 'Right hind leg' },
    { id: 'shoulderL', parent: 'spine', from: 0.9, angle: 0, length: 2, label: 'Left shoulder' },
    { id: 'legFL', parent: 'shoulderL', angle: 0, length: LEG, label: 'Left foreleg' },
    { id: 'shoulderR', parent: 'spine', from: 0.9, angle: 0, length: 2, label: 'Right shoulder' },
    { id: 'legFR', parent: 'shoulderR', angle: 0, length: LEG, label: 'Right foreleg' },
  ], { spine: 90, head: 100, tail: 240, hipL: 0, hipR: 0, shoulderL: 0, shoulderR: 0, legBL: 0, legBR: 0, legFL: 0, legFR: 0 });
  const leg = (id, z, far) => [
    { id, bone: id, kind: 'limb', width: 3, paint: 'fur', z, ...(far ? { far: true } : {}) },
    { id: `${id}Paw`, bone: id, kind: 'ellipse', at: [LEG, 0], r: [1.7, 1.8], paint: 'fur', z, ...(far ? { far: true } : {}) },
  ];
  // on the right-pointing spine and head, positive v is up
  const shapes = [
    ...leg('legBL', 4, true), ...leg('legFL', 4, true),
    { id: 'tail', bone: 'tail', kind: 'capsule', from: 0, to: 1, r: [2, 1.2], paint: 'fur', z: 9, group: 'body' },
    { id: 'body', bone: 'spine', kind: 'capsule', from: 0, to: 0.95, r: [4.5, 5], paint: 'fur', z: 9, group: 'body' },
    { id: 'skull', bone: 'head', kind: 'ellipse', at: [2, 1], r: [4, 3.5], paint: 'fur', z: 9, group: 'body' },
    // one ear in profile (a broad triangle on the crown); facing down or up both show
    { id: 'earL', bone: 'head', kind: 'poly', points: [[-2.5, 2.5], [-1.5, 7.5], [1, 8], [2.5, 3]], paint: 'fur', z: 9, group: 'body' },
    { id: 'earR', bone: 'head', kind: 'poly', points: [[-2, 2.5], [-5.5, 7], [-0.5, 5.5]], paint: 'fur', z: 9, group: 'body', hidden: true },
    { id: 'muzzle', bone: 'head', kind: 'ellipse', at: [4, -0.5], r: [2.6, 1.8], paint: 'belly', z: 10 },
    ...leg('legBR', 12), ...leg('legFR', 12),
    { id: 'eyeL', bone: 'head', kind: 'dot', at: [2.5, 2], size: 1, paint: 'eye', z: 30 },
    { id: 'eyeR', bone: 'head', kind: 'dot', at: [-0.5, 2.5], size: 1, paint: 'eye', z: 30, hidden: true },
    { id: 'eyeLShut', bone: 'head', kind: 'dot', at: [2.5, 2], size: 1, paint: 'fur', z: 30, hidden: true },
    { id: 'eyeRShut', bone: 'head', kind: 'dot', at: [-0.5, 2.5], size: 1, paint: 'fur', z: 30, hidden: true },
    { id: 'nose', bone: 'head', kind: 'dot', at: [6.5, 0], size: 1, paint: 'eye', z: 30 },
    { id: 'mouth', bone: 'head', kind: 'dot', at: [5, -2], size: 1, paint: 'eye', z: 31, hidden: true },
  ];
  const points = [{ id: 'head', bone: 'head', at: [5, 0] }, { id: 'back', bone: 'spine', at: [6, 0] }, { id: 'feet', ground: true }];
  const rig = rigOf('topdown-beast', 'Top-down beast', 'top-down', [48, 48], colours, bones, shapes, [], points);
  // facing down or up the body is seen end on (a short spine), the hips and shoulders open out to the sides
  const legsDown = { legBL: 0, legBR: 0, legFL: 0, legFR: 0 };
  const wide = { spine: 6.6, hipL: 6.5, hipR: 6.5, shoulderL: 4, shoulderR: 4 };
  const sides = { hipL: 90, hipR: 270, shoulderL: 90, shoulderR: 270 };
  rig.directions = {
    // facing down: the head is in front of a darker body, the hind legs behind, the forelegs in front
    down: overlay(rig, { abs: { spine: 0, head: 0, tail: 180, ...sides, ...legsDown }, length: wide, at: [24, 27], shapes: {
      legBL: { z: 4, far: false }, legBLPaw: { z: 4, far: false }, legBR: { z: 4 }, legBRPaw: { z: 4 },
      legFL: { far: false }, legFLPaw: { far: false }, tail: { z: 6 },
      body: { to: 0.8, r: [6, 5.5], z: 10, far: true },
      skull: { at: [0, 0], r: [4.5, 5], z: 20 },
      earL: { points: [[-2, -2.5], [-5.5, -7], [-0.5, -5.5]], z: 21, far: true }, earR: { hidden: false, z: 21, far: true },
      muzzle: { at: [2.5, 0], r: [2, 2.5], z: 21 }, nose: { at: [3, 0] }, mouth: { at: [4.5, 0], size: 2 },
      eyeL: { at: [-0.5, -2.5] }, eyeR: { hidden: false }, eyeLShut: { at: [-0.5, -2.5] },
    } }),
    // facing up: the rump and tail in front, the head (and its ears) behind the body; no face
    up: overlay(rig, { abs: { spine: 180, head: 180, tail: 0, ...sides, ...legsDown }, length: wide, at: [24, 33], shapes: {
      legFL: { z: 4, far: false }, legFLPaw: { z: 4, far: false }, legFR: { z: 4 }, legFRPaw: { z: 4 },
      legBL: { z: 12, far: false }, legBLPaw: { z: 12, far: false },
      skull: { at: [2, 0], r: [4.5, 5.5], z: 6, far: true },
      earL: { points: [[1, -2.5], [6.5, -6.5], [2.5, -6]], z: 6, far: true }, earR: { hidden: false, points: [[1, 2.5], [6.5, 6.5], [2.5, 6]], z: 6, far: true },
      body: { from: 0.1, to: 0.55, r: [6.5, 6], z: 10 }, tail: { z: 14 },
      muzzle: { hidden: true }, nose: { hidden: true }, eyeL: { hidden: true },
    } }),
  };
  const A = (dir, abs = {}, rel = {}) => angles(directionRig(rig, dir), { abs, rel });
  const restOf = (dir, id) => directionRig(rig, dir).bones.find((b) => b.id === id).angle;
  const LEGS = ['legBL', 'legBR', 'legFL', 'legFR'];
  const legs = (k) => Object.fromEntries(LEGS.map((l) => [l, k]));
  const tailBy = (dir, d) => ({ tail: r3(restOf(dir, 'tail') + d) });
  const clips = {};
  const eyes = { down: [['eyeL', 'eyeR'], ['eyeLShut', 'eyeRShut']], up: null, side: [['eyeL'], ['eyeLShut']] };
  // a breath: the body sinks 1 px on 2 to 5 while the legs shorten by that 1 px (held, away from the loop's seam), so
  // the paws never leave the ground row; the head and tail sway smoothly all the way round
  for (const dir of DIRS) {
    const blink = eyes[dir] ? blinkKeys(eyes[dir][0], eyes[dir][1]) : [];
    const sway = (k) => ({ bones: { ...tailBy(dir, 12 * k), head: r3(restOf(dir, 'head') + (dir === 'up' ? -6 : 6) * k) } });
    clips[`idle_${dir}`] = clip(`idle_${dir}`, mergeKeys(blink, [
      [2, { ease: 'hold', root: [0, 1], stretch: legs(r3(1 - 1 / LEG)) }],
      [6, { ease: 'hold', root: [0, 0], stretch: legs(1) }],
    ], [
      [0, sway(0)],
      [4, sway(1)],
    ]));
  }
  // facing down or up, the diagonal pairs lift in turn (a trot) while the other pair stays planted
  for (const dir of ['down', 'up']) {
    const tail = { 2: -10, 6: 10 };
    clips[`walk_${dir}`] = clip(`walk_${dir}`, frontWalk(['legFL', 'legBR'], ['legFR', 'legBL'], LEG).map(([f, k]) => [f, f in tail ? { ...k, bones: tailBy(dir, tail[f]) } : f % 4 === 0 ? { ...k, bones: tailBy(dir, 0) } : k]),
      { sounds: steps('footstep-gravel', 0.35, 'Sneaking') });
  }
  // from the side the diagonal pairs swing; all four paws are down on 0 and 4, the body lowest there
  const swing = (a, b) => ({ legBL: -a, legFR: -a, legBR: b, legFL: b });
  const plant = plantFor(LEG);
  clips.walk_side = clip('walk_side', [
    [0, { root: [0, 0], stretch: legs(1.1), bones: A('side', swing(25, 25), tailBy('side', 0)) }],
    [2, { root: [0, -1], stretch: { legFR: 0.7, legBL: 0.7, legFL: plant, legBR: plant }, bones: A('side', swing(0, 0), tailBy('side', -10)) }],
    [4, { root: [0, 0], stretch: legs(1.1), bones: A('side', swing(-25, -25), tailBy('side', 0)) }],
    [6, { root: [0, -1], stretch: { legFR: plant, legBL: plant, legFL: 0.7, legBR: 0.7 }, bones: A('side', swing(0, 0), tailBy('side', 10)) }],
  ], { sounds: steps('footstep-gravel', 0.35, 'Sneaking') });
  // a bite: back on 2, the mouth opens on 3 where there is a face to see, the snap on 4
  const hit = [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.6 }, { sound: 'punch', frame: 4, preset: 'Light jab', volume: 0.7 }];
  const lunge = (dir, back, forth, bones) => {
    const m = dir === 'up' ? null : ['mouth'];
    return clip(`attack_${dir}`, [
      [0, { root: [0, 0], stretch: legs(1), bones: bones(0), ...(m ? { hide: m } : {}) }],
      [2, { ease: 'in', root: back, bones: bones(1) }],
      [3, { root: [back[0] / 2 + forth[0] / 2, back[1] / 2 + forth[1] / 2], ...(m ? { show: m } : {}) }],
      [4, { ease: 'out', root: forth, bones: bones(2) }],
      [6, { root: [0, 0], bones: bones(0), ...(m ? { hide: m } : {}) }],
      [7, { root: [0, 0], bones: bones(0) }],
    ], { label: `Bite (${dir})`, sounds: hit });
  };
  clips.attack_down = lunge('down', [0, -2], [0, 0], (k) => A('down', {}, tailBy('down', [0, 20, -20][k])));
  clips.attack_up = lunge('up', [0, 0], [0, -3], (k) => A('up', {}, tailBy('up', [0, -20, 20][k])));
  clips.attack_side = lunge('side', [-2, 0], [4, 0], (k) => A('side', { legFL: [0, 15, -20][k], legFR: [0, -15, 20][k] }, { head: r3(restOf('side', 'head') + [0, 25, -20][k]), ...tailBy('side', [0, -15, 15][k]) }));
  clips.hurt = clip('hurt', [
    [0, { root: [0, -2], stretch: legs(1), bones: tailBy('down', 30) }],
    [3, { root: [0, 0], bones: tailBy('down', 0) }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }] });
  // the legs give way and it sinks flat on the ground, eyes shut
  const sprawl = A('down', { legBL: 45, legBR: -45, legFL: 30, legFR: -30 }, tailBy('down', -30));
  clips.die = clip('die', [
    [0, { root: [0, -2], stretch: legs(1), bones: tailBy('down', 30) }],
    [2, { ease: 'in', root: [0, 0], stretch: legs(0.9), bones: tailBy('down', 20) }],
    [4, { ease: 'out', root: [0, DIE_SINK], stretch: { spine: 0.9, ...legs(0.6) }, bones: sprawl, show: ['eyeLShut', 'eyeRShut'], hide: ['eyeL', 'eyeR'] }],
    [5, { root: [0, DIE_SINK], bones: { ...sprawl, ...tailBy('down', -25) } }],
    [7, { root: [0, DIE_SINK], bones: sprawl }],
  ], { frameEdits: flash(), sounds: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow', volume: 0.9 }, { sound: 'body-fall', frame: 4, volume: 0.7 }] });
  return sprite('topdown-beast', {
    name: 'Top-down beast', blurb: 'A four-legged beast seen from above at three quarters, facing down, up or to the side: trots, bites, flinches and falls.',
    meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'forest'], gameTypes: ['roguelike-action', 'turn-based-rpg'], view: 'top-down', words: ['beast', 'animal', 'dog', 'wolf', 'four legs', 'top-down', 'bite'] },
    rig, pivot: [24, 42], preview: 'walk_down',
    controls: [{ key: 'tailLength', label: 'Tail', lo: 'Short', hi: 'Long', min: 0.5, max: 1.4, default: 1, scales: { bones: ['tail'] } }],
    clips,
  });
}
const DIE_SINK = 4;

// ---- the list -----------------------------------------------------------------------------------------------------

const BUILT = { 'two-legs': twoLegs(), 'four-legs': fourLegs(), crawler: crawler(), flyer: flyer(), blob: blob(), blank: blank(), 'topdown-person': topdownPerson(), 'topdown-beast': topdownBeast() };
const FROZEN_JSON = Object.fromEntries(Object.entries(BUILT).map(([k, v]) => [k, JSON.stringify(v)]));

/** The ids of the studio's starting bodies, in the order the studio offers them (side-view bodies first, then top-down). */
export const STUDIO_TEMPLATE_IDS = Object.freeze(Object.keys(BUILT));

/** The starting bodies for the studio's picker: [{ id, label, blurb, view, size, clips }] (plain data; view is side or top-down). */
export function studioTemplates() {
  return STUDIO_TEMPLATE_IDS.map((id) => {
    const d = BUILT[id];
    return { id, label: d.name, blurb: d.blurb, view: d.meta.view, size: [...d.size], clips: Object.keys(d.clips) };
  });
}

/** A fresh copy of one starting body as a whole `loadout-sprite` definition (made.from "template:<id>"), or null for an unknown id. Arguments: id. */
export function studioTemplate(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(FROZEN_JSON, id)) return null;
  return JSON.parse(FROZEN_JSON[id]);
}
