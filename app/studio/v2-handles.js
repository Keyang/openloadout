// Handles on a version 2 sprite's picture (the studio's anchor and rig handles, back from the old editor; pure
// functions, nothing drawn here). What can be dragged, as the same rows the keyboard walks through:
//   pivot       the anchor (`pivot`), every body kind: a crosshair on the picture, "Snap to the feet" for a rig
//   root        a rig's first bone: Body moves where the body starts (its `at`), Clips moves the whole body on the frame's key
//   ik:<id>     the end of an IK chain (a foot, a hand): Clips sets the frame's ik target key
//   bone:<id>   the tip of a bone: Clips turns it on the frame's key (its angle); Body sets the bone's rest angle and
//               length (only for bones the sprite writes itself; a base's bones are the base's)
// A clip whose keys come from its base (`from`) is first taken into the sprite as keys of its own, as the framework
// draws them now, so the picture does not change until the key does. Every change is whole pixels and whole degrees,
// and a new definition (the old one is never changed). ctx: { mode: 'body' | 'clips', clip, frame, facing, resolved
// (engine/resolve.js resolveSprite's answer for def, worked out when not given), pieces (a piece store, for that), settings }.
import { resolveSprite } from '../../engine/resolve.js';
import { resolvedRigList } from '../../rigs/bones.js';
import { compileKeys, sampleKeys, framePhase } from '../../rigs/keypose.js';

const RAD = Math.PI / 180;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cp = (v) => JSON.parse(JSON.stringify(v));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const humanize = (id) => String(id).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
/** The smallest tip distance (frame px) a bone handle is shown for: a bone shorter than this is a joint, not a limb. */
export const MIN_BONE = 2;

/** The resolved sprite of def for the frame in ctx (ctx.resolved when given), or null when it does not resolve. */
export function resolvedOf(def, ctx = {}) {
  if (ctx.resolved) return ctx.resolved;
  try {
    const R = resolveSprite(def, ctx.settings ?? {}, { ...(ctx.pieces ? { pieces: ctx.pieces } : {}), ...(ctx.validated ? { validated: true } : {}) });
    return R?.ok ? R : null;
  } catch { return null; }
}

const rigOf = (R) => (R?.body?.kind === 'rig' && isObj(R.body.rig) ? R.body.rig : null);
const ownBones = (def) => (Array.isArray(def?.body?.rig?.bones) ? def.body.rig.bones : []);
const clipFlags = (R, clip) => {
  const c = isObj(R?.clips) && Object.hasOwn(R.clips, clip) ? R.clips[clip] : null;
  return c ? { frames: Math.max(1, Math.floor(c.frames) || 1), loop: c.loop !== false } : null;
};

/** The pose of a frame as the framework draws it: the clip's keys blended at the frame's phase, then the frame's nudge. */
function poseOf(R, clip, frame) {
  const c = isObj(R?.clips) && Object.hasOwn(R.clips, clip) ? R.clips[clip] : null;
  if (!c) return {};
  const f = clipFlags(R, clip);
  const pose = Array.isArray(c.keys) && c.keys.length ? sampleKeys(compileKeys(c.keys), framePhase(f, frame), { loop: f.loop }) : {};
  const e = isObj(c.frameEdits) && Object.hasOwn(c.frameEdits, String(frame)) ? c.frameEdits[String(frame)] : null;
  if (isObj(e) && Array.isArray(e.nudge)) pose.nudge = [e.nudge[0], e.nudge[1]];
  return pose;
}

/** Solve the rig of R for ctx's frame (or the rest pose in Body), with `more` laid over the pose: the solved bones J, or null. */
function solved(R, ctx, more = null) {
  const rig = rigOf(R);
  if (!rig) return null;
  const body = ctx.mode !== 'clips';
  let pose = body ? {} : poseOf(R, ctx.clip, ctx.frame ?? 0);
  if (more) pose = { ...pose, ...more };
  const f = body ? null : clipFlags(R, ctx.clip);
  const r = resolvedRigList(R, pose, { ...(body ? (ctx.facing ? { direction: ctx.facing } : {}) : { clip: ctx.clip, frame: ctx.frame ?? 0, frames: f?.frames, loop: f?.loop }) });
  return r?.J ? { J: r.J, pose, rig } : null;
}

/** The bones that matter to the eye: those a shape rides on, the bones of IK chains, and every bone above them (a base's helper bones, which carry nothing, are left out). */
function visibleBones(rig) {
  const byId = new Map(rig.bones.map((b) => [b.id, b]));
  const keep = new Set();
  const add = (id) => { for (let b = byId.get(id), n = 0; b && !keep.has(b.id) && n < 64; b = byId.get(b.parent), n++) keep.add(b.id); };
  for (const sh of rig.shapes ?? []) { const id = sh?.on ?? sh?.bone; if (typeof id === 'string') add(id); }
  for (const c of rig.ik ?? []) for (const id of c.bones ?? []) add(id);
  return keep;
}

/** The solved bones of a frame for drawing them over the picture: { J, rig, show (ids worth drawing) } or null. Arguments: def, ctx. */
export function skeleton(def, ctx) {
  const R = resolvedOf(def, ctx);
  if (!R) return null;
  if (ctx.mode === 'clips' && !clipFlags(R, ctx.clip)) return null;
  const s = solved(R, ctx);
  return s ? { J: s.J, rig: s.rig, show: visibleBones(s.rig) } : null;
}

/**
 * The handles of a frame in frame pixels, in the order Tab moves through them: [{ id, kind, label, at: [x, y], from?: [x, y] }].
 * The anchor first (every body); for a rig the body's start ('root'), each IK chain's end ('ik:<id>') and the tip of each bone
 * that is not part of a chain (in Body: only bones the sprite writes itself).
 */
export function handles(def, ctx) {
  if (!isObj(def) || !Array.isArray(def.pivot)) return [];
  const out = [{ id: 'pivot', kind: 'pivot', label: 'Anchor', at: [def.pivot[0], def.pivot[1]] }];
  if (def.body && !isObj(def.body.rig)) return out;
  const R = resolvedOf(def, ctx);
  const rig = rigOf(R);
  if (!rig) return out;
  const clips = ctx.mode === 'clips';
  if (clips && !clipFlags(R, ctx.clip)) return out;
  const s = solved(R, ctx);
  if (!s) return out;
  const own = new Set(ownBones(def).map((b) => b.id));
  const root = rig.bones.find((b) => b.parent == null);
  if (root && s.J.bones[root.id] && (clips || own.has(root.id))) out.push({ id: 'root', kind: 'root', label: clips ? 'Whole body' : 'Where the body starts', at: [...s.J.bones[root.id].start] });
  const inChain = new Set();
  const worth = visibleBones(rig);
  if (clips) {
    for (const c of rig.ik ?? []) {
      const B = s.J.bones[c.bones?.[1]];
      if (!B) continue;
      c.bones.forEach((b) => inChain.add(b));
      out.push({ id: `ik:${c.id}`, kind: 'ik', label: c.label || humanize(c.id), at: [...B.end], from: [...(s.J.bones[c.bones[0]]?.start ?? B.start)] });
    }
  }
  for (const b of rig.bones) {
    const B = s.J.bones[b.id];
    if (!B || inChain.has(b.id) || (!clips && !own.has(b.id)) || b.parent == null || !(worth.has(b.id) || own.has(b.id))) continue;
    if (Math.hypot(B.end[0] - B.start[0], B.end[1] - B.start[1]) < MIN_BONE) continue;
    out.push({ id: `bone:${b.id}`, kind: 'bone', label: b.label || humanize(b.id), at: [...B.end], from: [...B.start] });
  }
  return out;
}

/** Move the anchor (whole pixels, inside the frame). */
export function setPivot(def, [x, y]) {
  const d = cp(def);
  const [W, H] = d.size ?? [1, 1];
  if (!Number.isFinite(x) || !Number.isFinite(y)) return d;
  d.pivot = [clamp(Math.round(x), 0, W - 1), clamp(Math.round(y), 0, H - 1)];
  return d;
}

/** Where the feet are for a rig: under the body's start, on the ground row (what "Snap to the feet" gives); others keep their anchor. Arguments: def, ctx. */
export function feetPivot(def, ctx = {}) {
  const R = resolvedOf(def, ctx);
  const s = R && rigOf(R) ? solved(R, { ...ctx, mode: 'body' }) : null;
  if (!s) return [...def.pivot];
  const [W, H] = def.size;
  return [clamp(Math.round(s.J.feet[0]), 0, W - 1), clamp(Math.round(s.J.ground), 0, H - 1)];
}

// ---- keys ----

/** A clip taken from its base may swap stamps only the base has (a blink): the sprite's own rules refuse those, so they are left out. */
function dropForeign(d, c) {
  const stamps = new Set((d.body?.rig?.shapes ?? []).filter((x) => x?.kind === 'stamp').map((x) => x.id));
  const clean = (k) => {
    if (isObj(k.swap)) { for (const id of Object.keys(k.swap)) if (!stamps.has(id)) delete k.swap[id]; if (!Object.keys(k.swap).length) delete k.swap; }
  };
  for (const k of c.keys ?? []) clean(k);
  for (const e of Object.values(c.frameEdits ?? {})) if (isObj(e)) clean(e);
}

/** The clip's keys as the sprite writes them: taken from the framework's resolved clip when the sprite's own has none. */
function ownKeys(d, R, clip) {
  d.clips = isObj(d.clips) ? d.clips : {};
  const mine = Object.hasOwn(d.clips, clip) && isObj(d.clips[clip]) ? d.clips[clip] : null;
  if (mine && Array.isArray(mine.keys) && mine.from === undefined) return mine;
  const r = R?.clips?.[clip];
  if (!r) return null;
  const c = { ...(mine ?? {}) };
  delete c.from; delete c.travel;
  c.label ??= r.label;
  c.frames = r.frames;
  c.fps = typeof c.fps === 'number' ? c.fps : r.fpsBase ?? r.fps;
  c.loop = r.loop !== false;
  c.keys = cp(r.keys ?? []);
  if (!Array.isArray(c.sounds) && Array.isArray(r.sounds) && r.sounds.length) c.sounds = cp(r.sounds);
  if (isObj(r.frameEdits) && Object.keys(r.frameEdits).length && !isObj(c.frameEdits)) c.frameEdits = cp(r.frameEdits);
  dropForeign(d, c);
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  d.clips[clip] = c;
  return c;
}

/** Set one value of the key on a frame (the key made when there is none): path like ['bones', 'armF'], ['ik', 'legF'], ['root']. */
function setKeyValue(def, R, clip, frame, path, value) {
  const d = cp(def);
  const c = ownKeys(d, R, clip);
  if (!c) return d;
  const f = { frames: c.frames, loop: c.loop !== false };
  const t = framePhase(f, frame);
  const tol = Math.min(0.002, 0.25 / Math.max(1, f.loop ? f.frames : f.frames - 1));
  let k = c.keys.find((x) => Math.abs(x.t - t) <= tol);
  if (!k) { k = { t }; c.keys.push(k); c.keys.sort((a, b) => a.t - b.t); }
  let o = k;
  for (const p of path.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p]; }
  o[path.at(-1)] = value;
  return d;
}

/** Change an own bone's fields (angle, length, at) in the sprite's bones. A bone the sprite does not write is left alone. */
function setBone(def, id, fields) {
  const d = cp(def);
  const b = ownBones(d).find((x) => x.id === id);
  if (b) Object.assign(b, fields);
  return d;
}

/** Put a bone's angle in the frame's key, kept within its joint limits (measured from its rest angle). */
function poseBone(def, R, ctx, b, next) {
  const rest = Number(b.angle) || 0;
  let v = Math.round(next);
  if (Number.isFinite(b.min)) v = Math.max(v, rest + b.min);
  if (Number.isFinite(b.max)) v = Math.min(v, rest + b.max);
  return setKeyValue(def, R, ctx.clip, ctx.frame ?? 0, ['bones', b.id], clamp(v, -720, 720));
}

/**
 * Drag a handle to a point (frame pixels): the new definition. Clips: a bone's tip turns it on the frame's key (inside its
 * joint limits), an IK end becomes that frame's target, the whole body moves. Body: a bone's tip sets its rest angle and
 * length, the body's start moves. The anchor moves in either. Arguments: def, ctx, id (a handle id), point ([x, y]).
 */
export function dragHandle(def, ctx, id, point) {
  const [px, py] = point;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return cp(def);
  if (id === 'pivot') return setPivot(def, [px, py]);
  const R = resolvedOf(def, ctx);
  const rig = rigOf(R);
  const s = rig ? solved(R, ctx) : null;
  if (!s) return cp(def);
  const clips = ctx.mode === 'clips';
  if (clips && !clipFlags(R, ctx.clip)) return cp(def);
  const { J, pose } = s;
  const [W, H] = def.size;
  const root = rig.bones.find((b) => b.parent == null);
  if (id === 'root') {
    if (!root || !J.bones[root.id]) return cp(def);
    const S = J.bones[root.id].start;
    if (!clips) {
      const b = ownBones(def).find((x) => x.id === root.id);
      return b ? setBone(def, root.id, { at: [Math.round((b.at?.[0] ?? 0) + px - S[0]), Math.round((b.at?.[1] ?? 0) + py - S[1])] }) : cp(def);
    }
    const was = Array.isArray(pose.root) ? pose.root : [0, 0];
    return setKeyValue(def, R, ctx.clip, ctx.frame ?? 0, ['root'], [clamp(Math.round(was[0] + px - S[0]), -W, W), clamp(Math.round(was[1] + py - S[1]), -H, H)]);
  }
  if (id.startsWith('ik:')) {
    const cid = id.slice(3);
    const c = (rig.ik ?? []).find((x) => x.id === cid);
    if (!c || !clips) return cp(def);
    const s0 = solved(R, ctx, { ik: { ...(pose.ik ?? {}), [cid]: [0, 0] } });
    const e0 = s0?.J.bones[c.bones[1]]?.end;
    if (!e0) return cp(def);
    return setKeyValue(def, R, ctx.clip, ctx.frame ?? 0, ['ik', cid], [clamp(Math.round(px - e0[0]), -W, W), clamp(Math.round(py - e0[1]), -H, H)]);
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
    if (!clips) {
      if (!ownBones(def).some((x) => x.id === bid)) return cp(def);
      const cur = Number(b.angle) || 0;
      return setBone(def, bid, { angle: Math.round(cur + wrap180(rel - cur)), length: Math.max(1, Math.round(dist / (B.k || 1))) });
    }
    return poseBone(def, R, ctx, b, B.deg + wrap180(rel - B.deg));
  }
  return cp(def);
}

/** Turn a bone by some degrees: its rest angle in Body, its angle on the frame's key in Clips (inside its limits). */
export function turnBone(def, ctx, boneId, deg) {
  const R = resolvedOf(def, ctx);
  const rig = rigOf(R);
  const s = rig ? solved(R, ctx) : null;
  const b = rig?.bones.find((x) => x.id === boneId);
  if (!s || !b || !s.J.bones[boneId]) return cp(def);
  if (ctx.mode !== 'clips') return ownBones(def).some((x) => x.id === boneId) ? setBone(def, boneId, { angle: Math.round((Number(b.angle) || 0) + deg) }) : cp(def);
  return poseBone(def, R, ctx, b, s.J.bones[boneId].deg + deg);
}

/** Move a handle by whole pixels (the arrow keys): dragHandle to where it is plus [dx, dy]; a bone that a pixel would hardly turn is turned by at least 2 degrees. */
export function nudgeHandle(def, ctx, id, dx, dy) {
  if (id === 'pivot') return setPivot(def, [def.pivot[0] + dx, def.pivot[1] + dy]);
  const h = handles(def, ctx).find((x) => x.id === id);
  if (!h) return cp(def);
  if (h.kind === 'bone' && h.from) {
    const len = Math.hypot(h.at[0] - h.from[0], h.at[1] - h.from[1]) || 1;
    const moved = dragHandle(def, ctx, id, [h.at[0] + dx, h.at[1] + dy]);
    if (JSON.stringify(moved) !== JSON.stringify(def)) return moved;
    const turn = Math.max(2, Math.round(Math.hypot(dx, dy) / len / RAD));
    return turnBone(def, ctx, id.slice(5), Math.sign(dx || -dy) * turn);
  }
  return dragHandle(def, ctx, id, [h.at[0] + dx, h.at[1] + dy]);
}
