// The Hero and other library bodies in the studio (docs/studio.md sections 3 and 5, journey b; item S10). A library
// body is a code rig with a data layer (Contract 14 rule 1): its figure (body.figure) holds the proportions and the way it
// moves, and every clip is key poses of the pose numbers rigs/humanoid-studio.js exposes (POSE_FIELDS). Here:
//   - the proportions and the way it moves, in everyday words, changed through refigure() so that every animation moves
//     with the body and what was posed by hand rides along (docs/studio.md 3, keysFor);
//   - handles on the picture (hips, hands, feet, head, upper body, the held thing) where the frame draws them, and what a
//     drag means: the pose numbers of that handle that put it where the pointer is (a hand turns the shoulder and the
//     elbow, so the arm follows), found by a few Newton steps on the frame as rigs/humanoid-studio.js draws it;
//   - "Start this clip over from" a pose of the body (bake);
//   - the attach points the body places itself.
// Every change is a pure function from a definition to a new one; the page validates the result before keeping it.
// Nothing here touches the page: it runs the same in the browser and in Node. Words returned are shown to people.
import { figureFor, frame as figureFrame, spriteSockets, refigure, bakeClips, POSE_FIELDS } from '../../rigs/humanoid-studio.js';
import { POSES } from '../../rigs/humanoid.js';
import { MOVES, STANCES as FIGURE_STANCES } from '../../rigs/humanoid-figure.js';
import { framePhase, frameOfPhase, clipPose } from '../../rigs/keypose.js';
import { FIGURE_SETTINGS, STUDIO_LIMITS } from '../../catalog/studio-schema.js';

const cp = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const clipOf = (def, clip) => (isObj(def?.clips) && typeof clip === 'string' && Object.hasOwn(def.clips, clip) && isObj(def.clips[clip]) ? def.clips[clip] : null);
const shapeOf = (c) => ({ frames: c.frames, loop: c.loop !== false });
const keyTol = (c) => Math.min(0.002, 0.25 / Math.max(1, c.loop === false ? c.frames - 1 : c.frames));

/** True for a definition whose body is a library body (the Hero): a code rig with a data layer, not a bone rig. */
export const isLibrary = (def) => isObj(def?.body) && def.body.library !== undefined && isObj(def.body.figure);

// ---- proportions and the way it moves -----------------------------------------------------------------------------

/** The figure's numbers people change on the Body tab, in everyday words: [{ id, label, lo, hi, path }] (path: where it is in body.figure). */
export const PROPORTIONS = Object.freeze([
  { id: 'height', label: 'Height', lo: 'Short', hi: 'Tall', path: ['body', 'height'] },
  { id: 'build', label: 'Build', lo: 'Slim', hi: 'Stocky', path: ['body', 'build'] },
  { id: 'head', label: 'Head', lo: 'Small', hi: 'Big', path: ['body', 'head'] },
  { id: 'bounce', label: 'Liveliness', lo: 'Calm', hi: 'Lively', path: ['motion', 'bounce'] },
  { id: 'stride', label: 'Stride', lo: 'Short steps', hi: 'Long steps', path: ['motion', 'stride'] },
].map((p) => Object.freeze({ ...p, path: Object.freeze(p.path) })));

/** How the body stands, in words: [{ value, label }] (the figure's stances). */
export const STANCES = Object.freeze(Object.keys(FIGURE_STANCES).map((value) => Object.freeze({ value, label: value[0].toUpperCase() + value.slice(1) })));

const rangeOf = (p) => { const s = FIGURE_SETTINGS[p.path.join('.')]; return s && s.kind === 'number' ? [s.min, s.max] : [0, 1]; };

/** The proportions of a library body as they are: [{ id, label, lo, hi, value, min, max }] ([] for a bone rig). */
export function proportionsOf(def) {
  if (!isLibrary(def)) return [];
  const fig = def.body.figure;
  return PROPORTIONS.map((p) => { const [min, max] = rangeOf(p); const v = fig[p.path[0]]?.[p.path[1]]; return { id: p.id, label: p.label, lo: p.lo, hi: p.hi, min, max, value: typeof v === 'number' && Number.isFinite(v) ? v : 0.5 }; });
}

/** How a library body stands ('upright' when its figure does not say). */
export const stanceOf = (def) => (isLibrary(def) && typeof def.body.figure.stance === 'string' ? def.body.figure.stance : 'upright');

/**
 * Change one proportion (or the liveliness or stride) of a library body: the stored figure changes and every keyed
 * animation moves with it, hand changes kept as offsets (rigs/humanoid-studio.js refigure). A slider people get that
 * sets the same field starts at the new value, so the bag draws what the studio shows. Arguments: def, id (PROPORTIONS), value.
 */
export function setProportion(def, id, value) {
  const p = PROPORTIONS.find((x) => x.id === id);
  if (!isLibrary(def) || !p || typeof value !== 'number' || !Number.isFinite(value)) return cp(def);
  const [min, max] = rangeOf(p);
  const v = r2(clamp(value, min, max));
  const fig = cp(def.body.figure);
  fig[p.path[0]] = { ...(isObj(fig[p.path[0]]) ? fig[p.path[0]] : {}), [p.path[1]]: v };
  const d = refigure(def, fig);
  for (const c of d.controls ?? []) {
    if (c && (c.sets === p.id || c.sets === p.path.join('.')) && typeof c.default === 'number') c.default = clamp(v, c.min ?? min, c.max ?? max);
  }
  return d;
}

// whether a figure's stance changes anything, worked out once per stored figure
const STANCE_MATTERS = new WeakMap();
const norm = (k) => JSON.stringify(Object.keys(k).sort().map((x) => [x, k[x]]));

/** Whether changing how the body stands changes any animation (the Hero is posed as sprites/knight.js poses him, with no stance: then it is not offered). */
export function stanceMatters(def) {
  if (!isLibrary(def)) return false;
  const fig = def.body.figure;
  if (STANCE_MATTERS.has(fig)) return STANCE_MATTERS.get(fig);
  const other = STANCES.find((s) => s.value !== stanceOf(def))?.value;
  let yes = false;
  try {
    const d = setStance(def, other);
    yes = Object.keys(def.clips).some((c) => (d.clips[c].keys ?? []).some((k, i) => norm(k) !== norm(def.clips[c].keys[i])));
  } catch { yes = false; }
  STANCE_MATTERS.set(fig, yes);
  return yes;
}

/** Change how a library body stands (one of STANCES); every keyed animation moves with it. */
export function setStance(def, stance) {
  if (!isLibrary(def) || !STANCES.some((s) => s.value === stance)) return cp(def);
  return refigure(def, { ...cp(def.body.figure), stance });
}

// ---- where a frame draws things -----------------------------------------------------------------------------------

/** The frame as rigs/humanoid-studio.js draws it (the stage draws at the sprite's defaults), and the frame's nudge. Null for a clip it has not. */
function drawnFrame(def, clip, frame) {
  const c = clipOf(def, clip);
  if (!c) return null;
  const f = clamp(Math.floor(Number(frame) || 0), 0, Math.max(0, c.frames - 1));
  const Fr = figureFrame(clip, framePhase(shapeOf(c), f), figureFor(def, {}));
  const n = c.frameEdits?.[String(f)]?.nudge;
  const [dx, dy] = Array.isArray(n) ? n.map((v) => Math.round(Number(v) || 0)) : [0, 0];
  return { Fr, dx, dy };
}

const heldName = (def) => {
  const k = def.body.figure.held?.kind;
  return typeof k === 'string' && k !== 'none' ? k[0].toUpperCase() + k.slice(1) : null;
};

// a handle: the pose numbers it moves (each a field of POSE_FIELDS; a point or an arm is two numbers), where it is and where it hangs from
const LIB_HANDLES = [
  { id: 'lib:hip', kind: 'root', label: () => 'Hips (whole body)', fields: [['rootX'], ['crouch']], at: (J) => J.hip },
  { id: 'lib:armF', kind: 'ik', label: () => 'Near hand', fields: [['armF', 'a'], ['armF', 'e']], at: (J) => J.armF.hand, from: (J) => J.armF.shoulder },
  { id: 'lib:armB', kind: 'ik', label: () => 'Far hand', fields: [['armB', 'a'], ['armB', 'e']], at: (J) => J.armB.hand, from: (J) => J.armB.shoulder },
  { id: 'lib:footF', kind: 'ik', label: () => 'Near foot', fields: [['footF', 'x'], ['footF', 'y']], at: (J) => J.legF.ankle, from: (J) => J.legF.hip },
  { id: 'lib:footB', kind: 'ik', label: () => 'Far foot', fields: [['footB', 'x'], ['footB', 'y']], at: (J) => J.legB.ankle, from: (J) => J.legB.hip },
  { id: 'lib:head', kind: 'turn', label: () => 'Head', fields: [['headTilt']], at: (J) => J.head, from: (J) => J.neck },
  { id: 'lib:lean', kind: 'turn', label: () => 'Upper body', fields: [['lean']], at: (J) => J.neck, from: (J) => J.hip },
  { id: 'lib:item', kind: 'turn', label: (def) => heldName(def) ?? 'What the hand holds', fields: [['item']], at: (J, Fr) => Fr.tips?.(Fr.t)?.[0] ?? J.armF.hand, from: (J) => J.armF.hand, when: (def, Fr) => !!Fr.held && !!heldName(def) },
];

/** The pose fields each library handle moves: { 'lib:armF': ['armF'], ... }. */
export const LIBRARY_HANDLE_FIELDS = Object.freeze(Object.fromEntries(LIB_HANDLES.map((h) => [h.id, Object.freeze([...new Set(h.fields.map((f) => f[0]))])])));

/**
 * The handles of a library body's frame, in frame pixels and in the order Tab moves through them:
 * [{ id ('lib:hip', 'lib:armF', ...), kind ('root' | 'ik' | 'turn'), label, at: [x, y], from?: [x, y] }]. [] for a bone rig or a clip it has not.
 * Arguments: def, clip, frame.
 */
export function libraryHandles(def, clip, frame) {
  if (!isLibrary(def)) return [];
  const got = drawnFrame(def, clip, frame);
  if (!got) return [];
  const { Fr, dx, dy } = got;
  const out = [];
  for (const h of LIB_HANDLES) {
    if (h.when && !h.when(def, Fr)) continue;
    const a = h.at(Fr.J, Fr);
    if (!a || !Number.isFinite(a[0]) || !Number.isFinite(a[1])) continue;
    const f = h.from?.(Fr.J);
    out.push({ id: h.id, kind: h.kind, label: h.label(def), at: [a[0] + dx, a[1] + dy], ...(f ? { from: [f[0] + dx, f[1] + dy] } : {}) });
  }
  return out;
}

/** The library handles the key on a frame moves (its fields are in the key): a list of handle ids. */
export function libraryChanged(def, clip, frame) {
  const c = clipOf(def, clip);
  if (!c || !isLibrary(def)) return [];
  const i = keyAt(c, frame);
  if (i < 0) return [];
  const k = c.keys[i];
  return Object.entries(LIBRARY_HANDLE_FIELDS).filter(([, fs]) => fs.some((f) => k[f] !== undefined)).map(([id]) => id);
}

// ---- dragging -----------------------------------------------------------------------------------------------------

function keyAt(c, frame) {
  const t = framePhase(shapeOf(c), frame);
  return (c.keys ?? []).findIndex((k) => Math.abs(k.t - t) <= keyTol(c));
}

/** A copy of def with the key on a frame (made when there is none) holding the given pose fields. */
function withKey(def, clip, frame, fields) {
  const d = cp(def);
  const c = d.clips[clip];
  c.keys = c.keys ?? [];
  let i = keyAt(c, frame);
  if (i < 0) {
    if (c.keys.length >= STUDIO_LIMITS.keysPerClip) return d;
    c.keys.push({ t: framePhase(shapeOf(c), frame) });
    c.keys.sort((a, b) => a.t - b.t);
    i = keyAt(c, frame);
  }
  Object.assign(c.keys[i], cp(fields));
  return d;
}

/** The value of one number of a handle (field, or field.part) in a pose. */
const numberIn = (pose, [f, part]) => { const v = pose[f]; const n = part ? (isObj(v) ? v[part] : undefined) : v; return typeof n === 'number' && Number.isFinite(n) ? n : 0; };

/** Pose fields holding the numbers vec for a handle, the rest of each field (a foot's `up`) as the pose has it, each within its range. */
function fieldsFor(h, pose, vec) {
  const out = {};
  h.fields.forEach(([f, part], i) => {
    const spec = POSE_FIELDS[f];
    const lo = spec?.min ?? -720, hi = spec?.max ?? 720;
    const v = r1(clamp(vec[i], lo, hi));
    if (part) out[f] = { ...(isObj(out[f]) ? out[f] : isObj(pose[f]) ? cp(pose[f]) : {}), [part]: v };
    else out[f] = v;
  });
  return out;
}

/** The handle's position for some numbers: the frame drawn with them in its key (only this clip is kept, which is all a frame needs). */
function placeOf(slim, clip, frame, h, pose, vec) {
  const d = withKey(slim, clip, frame, fieldsFor(h, pose, vec));
  return libraryHandles(d, clip, frame).find((x) => x.id === h.id)?.at ?? null;
}

const STEP = { angle: 1, arm: 1, px: 1, point: 1 };
const MOST = { angle: 40, arm: 40, px: 16, point: 16 };

/**
 * Drag a library handle to a point (frame pixels): the numbers of the frame's key that put the handle there (or as near
 * as the body reaches), found by a few damped Newton steps on the frame as drawn. A hand turns the shoulder and the
 * elbow (the arm follows); a foot is its target; the hips move the body across and crouch it; the head, the upper body
 * and the held thing turn. Returns the new definition (an unchanged copy for a point that is not a number).
 * Arguments: def, clip, frame, id (a handle id), point ([x, y]).
 */
export function dragLibrary(def, clip, frame, id, point) {
  const h = LIB_HANDLES.find((x) => x.id === id);
  const c = clipOf(def, clip);
  const [px, py] = Array.isArray(point) ? point : [];
  if (!h || !c || !isLibrary(def) || !Number.isFinite(px) || !Number.isFinite(py)) return cp(def);
  const slim = { ...def, clips: { [clip]: c } };
  const pose = clipPose({ frames: c.frames, loop: c.loop !== false, keys: c.keys ?? [] }, frame);
  const kind = POSE_FIELDS[h.fields[0][0]].kind;
  let vec = h.fields.map((f) => numberIn(pose, f));
  let at = placeOf(slim, clip, frame, h, pose, vec);
  if (!at) return cp(def);
  const err = (p) => Math.hypot(px - p[0], py - p[1]);
  let best = { vec, e: err(at) };
  for (let iter = 0; iter < 6 && best.e > 0.3; iter++) {
    const r = [px - at[0], py - at[1]];
    const cols = vec.map((v, i) => {
      const s = STEP[kind] ?? 1;
      const p = placeOf(slim, clip, frame, h, pose, vec.map((w, j) => (j === i ? w + s : w)));
      return p ? [(p[0] - at[0]) / s, (p[1] - at[1]) / s] : [0, 0];
    });
    let dv;
    const lam = 1e-3;
    if (cols.length === 1) {
      const g = cols[0], gg = g[0] * g[0] + g[1] * g[1];
      dv = [gg > 1e-9 ? (g[0] * r[0] + g[1] * r[1]) / (gg + lam) : 0];
    } else {
      // damped least squares: (JtJ + lam I) dv = Jt r
      const [a, b] = cols;
      const m00 = a[0] * a[0] + a[1] * a[1] + lam, m01 = a[0] * b[0] + a[1] * b[1], m11 = b[0] * b[0] + b[1] * b[1] + lam;
      const v0 = a[0] * r[0] + a[1] * r[1], v1 = b[0] * r[0] + b[1] * r[1];
      const det = m00 * m11 - m01 * m01;
      dv = Math.abs(det) > 1e-12 ? [(m11 * v0 - m01 * v1) / det, (m00 * v1 - m01 * v0) / det] : [0, 0];
    }
    const most = MOST[kind] ?? 16;
    const scale = Math.min(1, most / Math.max(1e-9, ...dv.map(Math.abs)));
    let next = vec.map((v, i) => v + dv[i] * scale);
    let p = placeOf(slim, clip, frame, h, pose, next);
    // a step that makes it worse is halved, twice at most
    for (let k = 0; k < 2 && p && err(p) > best.e; k++) { next = vec.map((v, i) => v + (next[i] - v) / 2); p = placeOf(slim, clip, frame, h, pose, next); }
    if (!p) break;
    vec = next; at = p;
    if (err(p) < best.e) best = { vec, e: err(p) };
  }
  return withKey(def, clip, frame, fieldsFor(h, pose, best.vec));
}

/**
 * Move a library handle by whole pixels (the arrow keys and the arrow buttons): a drag to where it is plus [dx, dy]; a
 * press that would not move it (a turn pushed along its own line) turns or moves its first number a little instead, so
 * a press always does something. Arguments: def, clip, frame, id, dx, dy.
 */
export function nudgeLibraryHandle(def, clip, frame, id, dx, dy) {
  const h = LIB_HANDLES.find((x) => x.id === id);
  const now = libraryHandles(def, clip, frame).find((x) => x.id === id);
  if (!h || !now) return cp(def);
  const moved = dragLibrary(def, clip, frame, id, [now.at[0] + dx, now.at[1] + dy]);
  const then = libraryHandles(moved, clip, frame).find((x) => x.id === id);
  if (then && Math.hypot(then.at[0] - now.at[0], then.at[1] - now.at[1]) >= 0.5) return moved;
  const c = clipOf(def, clip);
  const pose = clipPose({ frames: c.frames, loop: c.loop !== false, keys: c.keys ?? [] }, frame);
  const kind = POSE_FIELDS[h.fields[0][0]].kind;
  const vec = h.fields.map((f) => numberIn(pose, f));
  const sign = Math.sign(dx || -dy) || 1;
  if (kind === 'point' || kind === 'px' && h.fields.length === 2) { vec[0] += dx; if (vec.length > 1) vec[1] += dy; if (!dx && !dy) vec[0] += 1; }
  else vec[0] += sign * (kind === 'px' ? 1 : 2);
  return withKey(def, clip, frame, fieldsFor(h, pose, vec));
}

// ---- start a clip over from a pose of the body ---------------------------------------------------------------------

/** Every pose a library body has (rigs/humanoid.js POSES and the figure's moves), the names a clip's `from` may take. */
export const POSE_NAMES = Object.freeze([...POSES, ...MOVES]);

const POSE_WORDS = {
  idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', attack: 'Sword swing', punch: 'Punch', thrust: 'Thrust', shoot: 'Shoot',
  cast: 'Cast a spell', block: 'Block', hurt: 'Hurt', die: 'Die', victory: 'Cheer', talk: 'Talk', stab: 'Stab', throw: 'Throw', toss: 'Toss and catch', steal: 'Steal',
};
/** A pose of the body in everyday words: 'attack' -> 'Sword swing'. */
export const poseWords = (name) => POSE_WORDS[name] ?? (typeof name === 'string' && name ? name[0].toUpperCase() + name.slice(1) : '');

/** What "Start this clip over from" offers for a clip: { value (the clip's own pose, else Idle), options: [{ value, label }] }. */
export function startOverChoices(def, clip) {
  const c = clipOf(def, clip);
  const own = c && POSE_NAMES.includes(c.from) ? c.from : POSE_NAMES.includes(clip) ? clip : 'idle';
  return { value: own, options: POSE_NAMES.map((value) => ({ value, label: poseWords(value) })) };
}

/**
 * Start a clip over from a pose of a library body: its keys become the pose at every frame (and, for a swing, keys
 * between frames for its light), made for the figure as stored (bake); its frame count, speed, looping, sounds and
 * nudges stay; the white flash of a hit comes back as a frame edit. Returns { def, keys, light } (light: keys between
 * frames) or { def, error } in everyday words. Arguments: def, clip, from (a POSE_NAMES name).
 */
export function startOver(def, clip, from) {
  const c = clipOf(def, clip);
  if (!isLibrary(def)) return { def: cp(def), error: 'Only a body from the library can start an animation over from its own moves.' };
  if (!c) return { def: cp(def), error: 'That animation is not here.' };
  if (!POSE_NAMES.includes(from)) return { def: cp(def), error: `"${String(from).slice(0, 30)}" is not a way this body moves.` };
  let baked;
  try { baked = bakeClips(def.body.figure, { [clip]: { ...cp(c), from } })[clip]; } catch (e) {
    return { def: cp(def), error: `It could not start over: ${String(e?.message ?? e).slice(0, 160)}` };
  }
  const d = cp(def);
  d.clips[clip] = baked;
  const onFrames = new Set();
  for (let f = 0; f < c.frames; f++) onFrames.add(framePhase(shapeOf(c), f));
  const light = baked.keys.filter((k) => ![...onFrames].some((t) => Math.abs(k.t - t) <= keyTol(c))).length;
  return { def: d, keys: baked.keys.length, light };
}

// ---- attach points ------------------------------------------------------------------------------------------------

const SOCKET_WORDS = { hand: 'Hand', offhand: 'Other hand', head: 'Head', back: 'Back', feet: 'Feet', muzzle: 'Muzzle', tip: 'Tip' };

/** Where the body puts its attach points on a frame (the rest pose: Idle's first frame): [{ id, label, x, y }]. Arguments: def, clip, frame. */
export function librarySockets(def, clip, frame = 0) {
  if (!isLibrary(def)) return [];
  const name = clipOf(def, clip) ? clip : clipOf(def, 'idle') ? 'idle' : def.preview;
  let s;
  try { s = spriteSockets(def, { clip: name, frame }); } catch { s = null; }
  if (!s) return [];
  return Object.entries(s).map(([id, p]) => ({ id, label: SOCKET_WORDS[id] ?? id, x: p.x, y: p.y }));
}

/** The frame of a clip nearest a phase (for a key between frames): passed on from rigs/keypose.js for the page. */
export const frameNear = (c, t) => frameOfPhase(shapeOf(c), t);
