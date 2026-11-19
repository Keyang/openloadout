// What the studio's Move and Frames tabs add for every body (docs/studio.md sections 3 and 5; item S10):
//   - keys between frames (the Hero's swing light: bake() keys the phases the light looks back to), found, named and
//     removed; the timeline shows each as a thin tick between two frames, never in a frame's key list;
//   - Mirror legs where the body has two sides: the near and far (or left and right) legs swap on one frame;
//   - Sounds on this frame: the clip's cue list (`sounds`: { sound, frame, preset?, volume? }), chosen from the
//     library's sound effects by name.
// Every change is a pure function from a definition to a new one; the page validates the result before keeping it.
// Nothing here touches the page: it runs the same in the browser and in Node. Words returned are shown to people.

import { STUDIO_LIMITS, SPRITE_ID_PATTERN } from '../../catalog/studio-schema.js';
import { isRig, rigFor, keyedPose, setKeyValue, keyIndexAt, humanize } from './edit.js';

const cp = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clipOf = (def, clip) => (isObj(def?.clips) && typeof clip === 'string' && Object.hasOwn(def.clips, clip) && isObj(def.clips[clip]) ? def.clips[clip] : null);
const shapeOf = (c) => ({ frames: c.frames, loop: c.loop !== false });
const keyTol = (c) => Math.min(0.002, 0.25 / Math.max(1, c.loop === false ? c.frames - 1 : c.frames));

// ---- keys between frames ------------------------------------------------------------------------------------------

/**
 * The keys of a clip that sit on no frame: [{ index (in the clip's keys), t, after (the frame before it), before (the
 * frame after it: after + 1, which is the first frame again at the end of a loop) }], in time order.
 * Arguments: def, clip.
 */
export function lightKeys(def, clip) {
  const c = clipOf(def, clip);
  if (!c || !Array.isArray(c.keys)) return [];
  const s = shapeOf(c), span = s.loop ? c.frames : Math.max(1, c.frames - 1), out = [];
  c.keys.forEach((k, index) => {
    if (typeof k?.t !== 'number') return;
    if (Math.abs(k.t - Math.round(k.t * span) / span) <= keyTol(c)) return;      // on a frame (a loop's t = 1 is its first frame again)
    const after = Math.max(0, Math.min(span - 1, Math.floor(k.t * span)));
    out.push({ index, t: k.t, after, before: after + 1 });
  });
  return out;
}

const SWINGS = new Set(['attack', 'punch', 'thrust', 'stab', 'steal']);
/** What the keys between a clip's frames are for, in words: 'Swing light' for a swing, a punch or a stab (the light of the blow looks back between frames), else 'Keys between frames'. */
export function lightLabel(def, clip) {
  const c = clipOf(def, clip);
  return c && (SWINGS.has(c.from) || (!c.from && SWINGS.has(clip))) ? 'Swing light' : 'Keys between frames';
}

/** Take out every key of a clip that sits between frames; the frames' own keys stay. */
export function removeLightKeys(def, clip) {
  const d = cp(def);
  const gone = new Set(lightKeys(d, clip).map((k) => k.index));
  if (gone.size) d.clips[clip].keys = d.clips[clip].keys.filter((_, i) => !gone.has(i));
  return d;
}

// ---- Mirror legs --------------------------------------------------------------------------------------------------

const SIDES = { N: 'F', F: 'N', L: 'R', R: 'L' };
const LEG = /leg|thigh|shin|hip|foot|feet|knee|calf|paw|hind|fore/i;

/** The id on the other side of the body: the last N/F (near, far) or L/R (left, right) in the id swapped, when there is one. */
function partner(id, ids) {
  for (let i = id.length - 1; i >= 0; i--) {
    const o = SIDES[id[i]];
    if (!o) continue;
    const other = id.slice(0, i) + o + id.slice(i + 1);
    return ids.has(other) ? other : null;
  }
  return null;
}

/** Pairs of the same thing on both sides of a list of ids: [[a, b], ...], each pair once. */
function pairsOf(list) {
  const ids = new Set(list), seen = new Set(), out = [];
  for (const id of list) {
    if (seen.has(id)) continue;
    const p = partner(id, ids);
    if (p && !seen.has(p)) { out.push([id, p]); seen.add(id); seen.add(p); }
  }
  return out;
}

/**
 * The legs of a body that have a partner on the other side: { chains: [[a, b]] (a bone rig's foot chains), bones:
 * [[a, b]] (a bone rig's leg bones), fields: [[a, b]] (a library body's pose fields: the near and far foot) }.
 * Arguments: def, clip (a top-down rig's direction comes from it).
 */
export function legPairs(def, clip) {
  if (!isObj(def?.body)) return { chains: [], bones: [], fields: [] };
  if (!isRig(def)) return { chains: [], bones: [], fields: [['footF', 'footB']] };
  const rig = rigFor(def, clip);
  const chains = pairsOf(rig.ik.map((c) => c.id));
  const inChain = new Set(rig.ik.flatMap((c) => c.bones));
  const legs = rig.bones.filter((b) => inChain.has(b.id) || LEG.test(b.id) || LEG.test(b.label ?? ''));
  const chainIds = new Set(rig.ik.filter((c) => chains.some((p) => p.includes(c.id))).flatMap((c) => c.bones));
  return { chains, bones: pairsOf(legs.map((b) => b.id)).filter(([a, b]) => !(chainIds.has(a) && chainIds.has(b))), fields: [] };
}

/** Whether the body has two sides whose legs can swap (Mirror legs is offered then). */
export function canMirror(def, clip) {
  const p = legPairs(def, clip ?? Object.keys(def?.clips ?? {})[0]);
  return p.chains.length + p.bones.length + p.fields.length > 0;
}

/**
 * Mirror the legs on one frame: the pose of each leg swaps with its partner's (a library body's near and far foot; a
 * bone rig's paired foot targets, and how far its paired leg bones turn from their own rest). The frame's key holds
 * the result (made when there is none). Arguments: def, clip, frame.
 */
export function mirrorLegs(def, clip, frame) {
  if (!clipOf(def, clip) || !canMirror(def, clip)) return cp(def);
  const pose = keyedPose(def, clip, frame);
  const { chains, bones, fields } = legPairs(def, clip);
  let d = cp(def);
  for (const [a, b] of fields) {
    const va = pose[a], vb = pose[b];
    if (va === undefined && vb === undefined) continue;
    d = setKeyValue(d, clip, frame, [a], cp(vb ?? va));
    d = setKeyValue(d, clip, frame, [b], cp(va ?? vb));
  }
  if (isRig(def)) {
    const rig = rigFor(def, clip);
    for (const [a, b] of chains) {
      const va = pose.ik?.[a] ?? [0, 0], vb = pose.ik?.[b] ?? [0, 0];
      d = setKeyValue(d, clip, frame, ['ik', a], [...vb]);
      d = setKeyValue(d, clip, frame, ['ik', b], [...va]);
    }
    for (const [a, b] of bones) {
      const ra = Number(rig.bones.find((x) => x.id === a)?.angle) || 0, rb = Number(rig.bones.find((x) => x.id === b)?.angle) || 0;
      const pa = pose.bones?.[a], pb = pose.bones?.[b];
      if (pa !== undefined || pb !== undefined) {
        const da = (pa ?? ra) - ra, db = (pb ?? rb) - rb;
        d = setKeyValue(d, clip, frame, ['bones', a], clamp(ra + db, -720, 720));
        d = setKeyValue(d, clip, frame, ['bones', b], clamp(rb + da, -720, 720));
      }
      // a leg drawn shorter or longer (a top-down body's foreshortening) swaps too
      const sa = pose.stretch?.[a], sb = pose.stretch?.[b];
      if (sa !== undefined || sb !== undefined) {
        d = setKeyValue(d, clip, frame, ['stretch', a], sb ?? 1);
        d = setKeyValue(d, clip, frame, ['stretch', b], sa ?? 1);
      }
    }
  }
  if (keyIndexAt(d, clip, frame) < 0) return cp(def);
  return d;
}

// ---- Sounds on this frame -----------------------------------------------------------------------------------------

/** The sounds a frame plays: [{ index (in the clip's list), sound, frame, preset?, volume? }]. Arguments: def, clip, frame. */
export function cuesAt(def, clip, frame) {
  const c = clipOf(def, clip);
  if (!c || !Array.isArray(c.sounds)) return [];
  return c.sounds.map((s, index) => ({ ...cp(s), index })).filter((s) => s.frame === frame);
}

/**
 * Add a sound on a frame: { def } or { def, error } (not a sound's name, or the clip has as many as it may).
 * Arguments: def, clip, frame, sound (a sound id of the library), preset (how it sounds: one of the sound's styles, optional).
 */
export function addCue(def, clip, frame, sound, preset) {
  const d = cp(def);
  const c = clipOf(d, clip);
  if (!c) return { def: d, error: 'That animation is not here.' };
  if (typeof sound !== 'string' || !SPRITE_ID_PATTERN.test(sound)) return { def: d, error: 'That is not a sound from the library. Pick one from the list.' };
  if (!Number.isInteger(frame) || frame < 0 || frame >= c.frames) return { def: d, error: 'That frame is not in this animation.' };
  c.sounds = Array.isArray(c.sounds) ? c.sounds : [];
  if (c.sounds.length >= STUDIO_LIMITS.soundsPerClip) return { def: d, error: `An animation can play at most ${STUDIO_LIMITS.soundsPerClip} sounds. Take one out first.` };
  c.sounds.push({ sound, frame, ...(typeof preset === 'string' && preset ? { preset: preset.slice(0, 60) } : {}) });
  return { def: d };
}

/** Change one sound of a clip: preset (a style's name, or null for the sound as it is), volume (0..1). Arguments: def, clip, index, fields. */
export function setCue(def, clip, index, fields = {}) {
  const d = cp(def);
  const s = clipOf(d, clip)?.sounds?.[index];
  if (!isObj(s)) return d;
  if (Object.hasOwn(fields, 'preset')) { if (typeof fields.preset === 'string' && fields.preset) s.preset = fields.preset.slice(0, 60); else delete s.preset; }
  if (typeof fields.volume === 'number' && Number.isFinite(fields.volume)) s.volume = Math.round(clamp(fields.volume, 0, 1) * 100) / 100;
  return d;
}

/** Take one sound out of a clip. */
export function removeCue(def, clip, index) {
  const d = cp(def);
  const c = clipOf(d, clip);
  if (!c || !Array.isArray(c.sounds) || !c.sounds[index]) return d;
  c.sounds.splice(index, 1);
  if (!c.sounds.length) delete c.sounds;
  return d;
}

const GROUP_WORDS = { ui: 'Menu' };
/** The library's sound effects to pick from, by name, in groups: [{ label, sounds: [{ id, name }] }] (music left out). Arguments: patches (generated/sounds.json's patches, or app/audio.js sounds). */
export function soundChoices(patches) {
  const groups = new Map();
  for (const p of Array.isArray(patches) ? patches : []) {
    if (!isObj(p) || typeof p.id !== 'string' || p.category === 'music') continue;
    const cat = typeof p.category === 'string' && p.category ? p.category : 'other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push({ id: p.id, name: typeof p.name === 'string' && p.name ? p.name : humanize(p.id) });
  }
  return [...groups.entries()].map(([cat, sounds]) => ({ label: GROUP_WORDS[cat] ?? cat[0].toUpperCase() + cat.slice(1), sounds: sounds.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The styles a sound comes in (its presets' names, as the sound's page lists them). */
export const presetsOf = (patch) => (isObj(patch?.presets) ? Object.keys(patch.presets) : []);

/** A sound's name for people: the library's name for it, else its id in words. Arguments: id, patches. */
export function soundName(id, patches) {
  const p = (Array.isArray(patches) ? patches : []).find((x) => x?.id === id);
  return typeof p?.name === 'string' && p.name ? p.name : humanize(id);
}
