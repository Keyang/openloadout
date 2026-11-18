// Sprite definition, parameters, and rendering frames / sprite sheets.
// Pure JavaScript: runs the same in the browser and in Node.

import { Surface } from './surface.js';
import { rng } from './motion.js';

// ---- parameter kinds -------------------------------------------------------
// Each parameter is one control a non-technical person sees. `label`, `lo` and
// `hi` are shown as written, so use plain words ("Short" / "Tall").
// A control that only matters sometimes says so in its options: `when: { otherKey: [values] }`
// means "in effect only while otherKey is at one of these values" (every listed key must match).
// `when` may also be a list of such objects: any one of them is enough.
// A choice whose options were renamed lists the old names: `was: { false: 'none', true: 'plain' }`,
// so links made before the change still open with the right option.

const only = (o) => {
  const extra = {};
  if (o.when !== undefined) extra.when = o.when;
  if (o.was !== undefined) extra.was = o.was;
  return extra;
};

export const range = (label, def, o = {}) => ({ kind: 'range', label, def, min: o.min ?? 0, max: o.max ?? 1, step: o.step ?? 0.01, lo: o.lo ?? '', hi: o.hi ?? '', group: o.group ?? 'Look', ...only(o) });
export const choice = (label, def, options, o = {}) => ({ kind: 'choice', label, def, options: options.map((x) => (typeof x === 'string' ? { value: x, label: x[0].toUpperCase() + x.slice(1) } : x)), group: o.group ?? 'Look', ...only(o) });
export const color = (label, def, swatches, o = {}) => ({ kind: 'color', label, def, swatches, group: o.group ?? 'Colors', ...only(o) });
export const toggle = (label, def, o = {}) => ({ kind: 'toggle', label, def, group: o.group ?? 'Look', ...only(o) });

export const SKIN = ['#f6d3b0', '#e8b088', '#c98a5c', '#9a6240', '#6e4428', '#9bd18a', '#b9a7e0'];
export const HAIR = ['#2b2233', '#5a3a22', '#a8612a', '#e0b040', '#d8d8e0', '#c9423a', '#3f7fd1', '#e670b0'];
export const CLOTH = ['#c9423a', '#e08a2c', '#e6c545', '#4f9d57', '#2f8f9d', '#3f6fd1', '#7a4fc4', '#d65a9c', '#6b7280', '#3a3350', '#f0ead8'];
export const METAL = ['#c2c9d6', '#8f97a8', '#e6c545', '#c98a4a', '#5d6475'];

// ---- definition ------------------------------------------------------------

/**
 * defineSprite({
 *   id, name, kind: 'Character' | 'Creature' | 'Item' | 'Effect', blurb,
 *   size: [w, h], pivot: [x, y],           // pivot = where the sprite touches the ground
 *   params: { key: range(...) | choice(...) | color(...) | toggle(...) },
 *   clips: { idle: { frames, fps, loop }, ... },   // fps may be (p) => number
 *   preview: 'walk',                        // clip shown in the gallery
 *   sounds: { attack: [{ sound: 'sword-slash', frame: 3, preset: 'Heavy blade', volume: 1 }] },
 *                                           // optional: sounds (ids from sounds/) that play on a frame of a clip;
 *                                           // an entry may carry when: { otherKey: [values] } to play only at those settings
 *   meta: { type, role, themes, gameTypes, view, words, license },
 *                                           // catalogue metadata, kept as written; checked by catalog/schema.js
 *   parts: { weapon: { label: 'Weapon', params: ['weapon', 'weaponLength', 'weaponAngle'], none: 'none', socket: 'hand' } },
 *                                           // optional: what the sprite holds or wears, each with settings of its own.
 *                                           // params are keys of `params`; the first is the selector (a choice or a toggle);
 *                                           // none is the selector value that removes the part (a toggle part: false)
 *   sockets(clip, t, p) { return { hand: { x, y, angle } }; },
 *                                           // optional: named attach points for a frame, in frame pixels and rig angles
 *                                           // (0 = down, PI/2 = picture-right, PI = up); exported per frame so a game can attach parts
 *   render(g, { clip, t, frame, frames, p }) { ...draw on Surface g... },
 * })
 */
export function defineSprite(def) {
  const need = ['id', 'name', 'size', 'pivot', 'params', 'clips', 'render'];
  for (const k of need) if (def[k] === undefined) throw new Error(`sprite ${def.id ?? '?'}: missing "${k}"`);
  if (def.meta !== undefined && (def.meta === null || typeof def.meta !== 'object' || Array.isArray(def.meta))) throw new Error(`sprite ${def.id}: "meta" must be an object`);
  if (!/^[a-z][a-z0-9-]*$/.test(def.id)) throw new Error(`sprite id "${def.id}" must be lowercase letters, digits, dashes`);
  for (const [name, c] of Object.entries(def.clips)) {
    if (!(c.frames >= 1)) throw new Error(`sprite ${def.id}: clip ${name} needs frames >= 1`);
    if (c.fps === undefined) throw new Error(`sprite ${def.id}: clip ${name} needs fps`);
    c.loop = c.loop ?? true;
    c.label = c.label ?? name[0].toUpperCase() + name.slice(1);
  }
  def.sounds = def.sounds ?? {};
  for (const [name, list] of Object.entries(def.sounds)) {
    if (!def.clips[name]) throw new Error(`sprite ${def.id}: sounds lists clip "${name}", which does not exist`);
    for (const c of list) {
      if (typeof c.sound !== 'string') throw new Error(`sprite ${def.id}: a sound on clip ${name} has no "sound" id`);
      if (!(c.frame >= 0 && c.frame < def.clips[name].frames)) throw new Error(`sprite ${def.id}: sound ${c.sound} on clip ${name} uses frame ${c.frame}, outside 0..${def.clips[name].frames - 1}`);
      if (c.when !== undefined) c.when = cleanWhen(def, c.when, `sprite ${def.id}: sound ${c.sound} on clip ${name}`, null);
    }
  }
  def.kind = def.kind ?? 'Character';
  def.preview = def.preview ?? Object.keys(def.clips)[0];
  for (const [k, d] of Object.entries(def.params)) {
    if (!d) continue;
    if (d.when !== undefined) d.when = cleanWhen(def, d.when, `sprite ${def.id}: control "${k}"`, k);
    if (d.was !== undefined) {
      const where = `sprite ${def.id}: control "${k}"`;
      if (d.kind !== 'choice' || d.was === null || typeof d.was !== 'object' || Array.isArray(d.was)) throw new Error(`${where}: was must be an object on a choice: { oldValue: newValue }`);
      for (const [old, now] of Object.entries(d.was)) if (!d.options.some((o) => o.value === now)) throw new Error(`${where}: was maps "${old}" to "${now}", which is not one of its options`);
    }
  }
  defineParts(def);
  rejectLoops(def);
  return def;
}

// ---- `when`: a control or a sound that only applies at some settings ----------

/**
 * Checks a `when` and returns it with every value as a list: { otherKey: [values] },
 * or, when a list of alternatives was given, a list of those.
 */
function cleanWhen(def, when, where, self) {
  if (Array.isArray(when)) {
    if (!when.length) throw new Error(`${where}: when is an empty list; give at least one { otherKey: [values] }`);
    return when.map((alt) => cleanWhenOne(def, alt, where, self));
  }
  return cleanWhenOne(def, when, where, self);
}
function cleanWhenOne(def, when, where, self) {
  if (when === null || typeof when !== 'object' || Array.isArray(when)) throw new Error(`${where}: when must be an object: { otherKey: [values] }, or a list of them`);
  if (!Object.keys(when).length) throw new Error(`${where}: when names no controls`);
  const out = {};
  for (const [k, raw] of Object.entries(when)) {
    const d = def.params[k];
    if (k === self) throw new Error(`${where}: when cannot depend on itself`);
    if (!d) throw new Error(`${where}: when names "${k}", which is not one of the sprite's controls`);
    const values = Array.isArray(raw) ? raw : [raw];
    if (!values.length) throw new Error(`${where}: when lists "${k}" with no values; give at least one`);
    for (const v of values) {
      const ok = d.kind === 'choice' ? d.options.some((o) => o.value === v)
        : d.kind === 'toggle' ? typeof v === 'boolean'
          : d.kind === 'range' ? typeof v === 'number' && v >= d.min && v <= d.max
            : typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
      if (!ok) throw new Error(`${where}: when lists ${JSON.stringify(v)}, which "${k}" can never be`);
    }
    out[k] = values;
  }
  return out;
}

const alternatives = (when) => (when ? (Array.isArray(when) ? when : [when]) : []);
const whenKeys = (when) => [...new Set(alternatives(when).flatMap((alt) => Object.keys(alt)))];

/**
 * True when a `when` holds: one alternative has every listed control at one of its values, and each of those
 * controls is itself in effect (a control hidden by its own `when`, or by its part, cannot switch another on).
 */
function whenHolds(sprite, when, p, trail) {
  if (!when) return true;
  return alternatives(when).some((alt) => Object.entries(alt).every(([k, values]) => (Array.isArray(values) ? values : [values]).includes(p[k]) && effective(sprite, k, p, trail)));
}

/** What a control depends on: the controls its `when` names, and the selector of the part it belongs to. */
function dependsOn(def, key) {
  const deps = whenKeys(def.params[key] && def.params[key].when);
  for (const part of Object.values(def.parts ?? {})) if (part.params.includes(key) && part.params[0] !== key && !deps.includes(part.params[0])) deps.push(part.params[0]);
  return deps;
}

/** A control that needs itself, directly or through others, could never be worked out: refuse it when the sprite is defined. */
function rejectLoops(def) {
  const done = new Set();
  const walk = (key, trail) => {
    if (trail.includes(key)) {
      const loop = [...trail.slice(trail.indexOf(key)), key].map((k) => `"${k}"`).join(' needs ');
      throw new Error(`sprite ${def.id}: when makes a loop: ${loop}`);
    }
    if (done.has(key)) return;
    for (const dep of dependsOn(def, key)) if (def.params[dep]) walk(dep, [...trail, key]);
    done.add(key);
  };
  for (const key of Object.keys(def.params)) walk(key, []);
}

/** True when a sound of an animation plays at these settings: an entry of sprite.sounds, or a copy with the same `when`. */
export function cueInEffect(sprite, cue, p) {
  return whenHolds(sprite, cue && cue.when, p, []);
}

// ---- parts: what a sprite holds or wears (docs/architecture.md, Contract 3) ----

function defineParts(def) {
  if (def.sockets !== undefined && typeof def.sockets !== 'function') throw new Error(`sprite ${def.id}: "sockets" must be a function (clip, t, p) => ({ name: { x, y, angle } })`);
  if (def.parts !== undefined && (def.parts === null || typeof def.parts !== 'object' || Array.isArray(def.parts))) throw new Error(`sprite ${def.id}: "parts" must be an object`);
  def.parts = def.parts ?? {};
  const owner = new Map();
  let socketNames = null;
  for (const [name, part] of Object.entries(def.parts)) {
    const where = `sprite ${def.id}: part "${name}"`;
    if (!part || !Array.isArray(part.params) || !part.params.length) throw new Error(`${where}: params must list its controls, selector first`);
    for (const k of part.params) {
      if (!def.params[k]) throw new Error(`${where}: "${k}" is not one of the sprite's controls (a key of params)`);
      if (owner.has(k)) throw new Error(`${where}: "${k}" is already in part "${owner.get(k)}"`);
      owner.set(k, name);
    }
    const key = part.params[0], sel = def.params[key];
    if (sel.kind !== 'choice' && sel.kind !== 'toggle') throw new Error(`${where}: its first control "${key}" must be a choice or an on/off control (it picks which ${name}, or none)`);
    if (sel.kind === 'toggle') {
      // an on/off part is removed when it is off
      if (part.none !== undefined && part.none !== false) throw new Error(`${where}: none is ${JSON.stringify(part.none)}, but "${key}" is on or off: the part is removed when it is off (leave none out)`);
      part.none = false;
    } else if (part.none !== undefined) {
      const list = Array.isArray(part.none) ? part.none : [part.none];
      if (!list.length) throw new Error(`${where}: none is an empty list; name the values that remove the part, or leave none out`);
      for (const v of list) if (!sel.options.some((o) => o.value === v)) throw new Error(`${where}: none value "${v}" is not an option of "${key}"`);
    }
    part.label = part.label ?? name[0].toUpperCase() + name.slice(1);
    if (sel.kind === 'choice' && part.none === undefined && sel.options.some((o) => o.value === 'none') && typeof console !== 'undefined') {
      console.warn(`sprite ${def.id}: part "${name}": "${key}" has an option "none" but the part does not declare none: 'none', so its settings stay on screen when it is taken off`);
    }
    if (part.socket !== undefined) {
      if (typeof part.socket !== 'string') throw new Error(`${where}: socket must be a name`);
      // a socket name with no positions behind it would be exported as an attach point a game cannot find
      if (!def.sockets) throw new Error(`${where}: socket "${part.socket}" needs the sprite to provide sockets(clip, t, p), which returns where "${part.socket}" is in each frame`);
      socketNames = socketNames ?? Object.keys(def.sockets(Object.keys(def.clips)[0], 0, defaultParams(def)) ?? {});
      if (!socketNames.includes(part.socket)) throw new Error(`${where}: socket "${part.socket}" is not one the sprite provides (${socketNames.join(', ') || 'none'})`);
    }
  }
}

/** The sprite's parts in order: [{ name, label, selector, controls, params, none, socket }]. controls = params without the selector. */
export function partList(sprite) {
  return Object.entries(sprite.parts ?? {}).map(([name, part]) => ({
    name, label: part.label ?? name[0].toUpperCase() + name.slice(1),
    selector: part.params[0], controls: part.params.slice(1), params: [...part.params],
    none: part.none, socket: part.socket,
  }));
}

/** The part a control belongs to (same shape as partList's entries), or null for a control of the sprite itself. */
export function partOf(sprite, key) {
  return partList(sprite).find((part) => part.params.includes(key)) ?? null;
}

/** True when the part is taken off: its selector is at a none value (none may be one value or a list). */
export function partRemoved(sprite, name, p) {
  const part = sprite.parts?.[name];
  if (!part || part.none === undefined) return false;
  const v = p[part.params[0]];
  return Array.isArray(part.none) ? part.none.includes(v) : v === part.none;
}

/**
 * False for a control that does nothing right now, for either reason:
 *   - its own `when` does not hold for these values (a control named in a `when` must itself be in effect);
 *   - it is a part's setting and that part is taken off (or the part's selector is itself not in effect).
 * The site hides such a control and the checker accepts that it changes nothing.
 */
export function inEffect(sprite, key, p) {
  return effective(sprite, key, p, []);
}
// trail: the controls already being worked out, so a sprite that was never checked for loops cannot recurse forever
function effective(sprite, key, p, trail) {
  if (trail.includes(key)) return true;
  const d = sprite.params[key], next = [...trail, key];
  if (d && !whenHolds(sprite, d.when, p, next)) return false;
  const part = partOf(sprite, key);
  if (!part || key === part.selector) return true;
  return !partRemoved(sprite, part.name, p) && effective(sprite, part.selector, p, next);
}

/** Keys of the controls in effect for these values, in the order of sprite.params. */
export function activeParams(sprite, p) {
  return Object.keys(sprite.params).filter((k) => inEffect(sprite, k, p));
}

export function defaultParams(sprite) {
  const p = {};
  for (const [k, d] of Object.entries(sprite.params)) p[k] = d.def;
  return p;
}

/** Fill in missing keys and clamp out-of-range values. */
export function cleanParams(sprite, input = {}) {
  const p = defaultParams(sprite);
  for (const [k, d] of Object.entries(sprite.params)) {
    const v = input[k];
    if (v === undefined || v === null) continue;
    if (d.kind === 'range') { const n = Number(v); if (Number.isFinite(n)) p[k] = Math.min(d.max, Math.max(d.min, n)); }
    else if (d.kind === 'choice') {
      // a value from before the options were renamed (an old link) becomes its new name
      const now = d.options.some((o) => o.value === v) ? v : d.was && Object.hasOwn(d.was, String(v)) ? d.was[String(v)] : undefined;
      if (now !== undefined) p[k] = now;
    }
    else if (d.kind === 'toggle') p[k] = v === true || v === 'true' || v === 1 || v === '1';
    else if (d.kind === 'color') { if (/^#[0-9a-f]{6}$/i.test(v)) p[k] = v.toLowerCase(); }
  }
  return p;
}

/** A random but good-looking parameter set: colours come from the curated swatches. */
export function randomParams(sprite, seed = Date.now()) {
  const r = rng(seed);
  const p = {};
  for (const [k, d] of Object.entries(sprite.params)) {
    if (d.kind === 'range') p[k] = Math.round((d.min + (d.max - d.min) * r()) / d.step) * d.step;
    else if (d.kind === 'choice') p[k] = d.options[Math.floor(r() * d.options.length)].value;
    else if (d.kind === 'toggle') p[k] = r() < 0.5;
    else if (d.kind === 'color') p[k] = d.swatches[Math.floor(r() * d.swatches.length)];
  }
  return p;
}

export const clipFps = (sprite, clip, p) => {
  const f = sprite.clips[clip].fps;
  return Math.max(1, Math.round(typeof f === 'function' ? f(p) : f));
};

// ---- rendering -------------------------------------------------------------

/** Phase 0..1 of a frame: loops stop short of 1, one-shot clips end on it. */
const phase = (c, frame) => (c.loop ? frame / c.frames : c.frames > 1 ? frame / (c.frames - 1) : 0);

/** Render one frame of one clip to a new Surface. */
export function renderFrame(sprite, clip, frame, p) {
  const c = sprite.clips[clip];
  if (!c) throw new Error(`sprite ${sprite.id}: no clip "${clip}"`);
  const g = new Surface(sprite.size[0], sprite.size[1]);
  sprite.render(g, { clip, t: phase(c, frame), frame, frames: c.frames, loop: c.loop, p });
  return g;
}

/**
 * Attach points of one frame: { name: { x, y, angle } } in frame pixels, or null when the sprite declares none.
 * Angles use the rig convention: 0 = down, PI/2 = picture-right (the way a side-view sprite faces), PI = up. Mirror a frame with x' = 2 * pivotX - x, angle' = -angle.
 */
export function frameSockets(sprite, clip, frame, p) {
  const c = sprite.clips[clip];
  if (!c) throw new Error(`sprite ${sprite.id}: no clip "${clip}"`);
  if (typeof sprite.sockets !== 'function') return null;
  return sprite.sockets(clip, phase(c, frame), p) ?? null;
}

/**
 * What a game needs to stretch one clip of a sprite, from the sprite's optional `slice`
 * (docs/architecture.md, Contract 8), in frame pixels; null when the clip declares nothing.
 *
 *   slice: { box: { left: 8, top: 8, right: 8, bottom: 8 },                  // per clip
 *            tag: { rect: { x, y, w, h }, left: 7, top: 7, right: 7, bottom: 7 },
 *            fill: (p) => ({ left: 16, top: 8, right: 16, bottom: 8, opening: { x, y, w, h } }) }
 *   slice: (clip, p) => ({ ... }) | undefined                                // or one function
 *
 * Returns { border?, rect?, opening?, tile? }:
 *   border  { left, bottom, right, top } (Unity's order): how far the corners reach in from each
 *           side of `rect`, or of the frame when there is no rect. Between them the piece repeats.
 *   rect    { x, y, w, h }: where the piece sits in its frame, when it does not fill it.
 *   opening { x, y, w, h }: the trough of a bar housing, and where its fill strips lie.
 *   tile    { x, w }: for a piece whose middle is a repeating pattern (so it has no border):
 *           columns x .. x + w - 1 are one repeat; insert whole copies of them to lengthen it.
 */
export function clipStretch(sprite, clip, p) {
  const all = sprite.slice;
  if (all === undefined || all === null) return null;
  let s = typeof all === 'function' ? all(clip, p) : all[clip];
  if (typeof s === 'function') s = s(p);
  if (s === undefined || s === null) return null;
  const out = {};
  const box = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h });
  if (s.left !== undefined || s.top !== undefined || s.right !== undefined || s.bottom !== undefined) {
    const b = { left: s.left ?? 0, bottom: s.bottom ?? 0, right: s.right ?? 0, top: s.top ?? 0 };
    const w = s.rect ? s.rect.w : sprite.size[0], h = s.rect ? s.rect.h : sprite.size[1];
    if (b.left + b.right > w) throw new Error(`sprite ${sprite.id}: slice of clip "${clip}" leaves nothing: left + right (${b.left + b.right}) is more than its width (${w})`);
    if (b.top + b.bottom > h) throw new Error(`sprite ${sprite.id}: slice of clip "${clip}" leaves nothing: top + bottom (${b.top + b.bottom}) is more than its height (${h})`);
    out.border = b;
  }
  if (s.rect) out.rect = box(s.rect);
  if (s.opening) out.opening = box(s.opening);
  if (s.tile) out.tile = { x: s.tile.x, w: s.tile.w };
  return Object.keys(out).length ? out : null;
}

/**
 * Render the full sprite sheet: one row per clip, one column per frame.
 * Returns { w, h, data: Uint32Array (ABGR), meta } where meta is the JSON
 * that ships next to the PNG. meta.parts lists what the sprite holds or wears;
 * when the sprite has sockets(), every entry of meta.frames carries that frame's
 * attach points, so a game can attach or swap a part at run time. When the sprite
 * declares `slice`, the clips it names (and each of their frames) also carry
 * `border`, `rect`, `opening` and `tile` in sheet pixels: see clipStretch().
 * A sprite with no `slice` gets none of these keys.
 */
export function renderSheet(sprite, p, { scale = 1, clips = Object.keys(sprite.clips) } = {}) {
  const [fw, fh] = sprite.size;
  const cols = Math.max(...clips.map((c) => sprite.clips[c].frames));
  const W = cols * fw * scale, H = clips.length * fh * scale;
  const data = new Uint32Array(W * H);
  const meta = {
    app: 'Loadout', version: 1, sprite: sprite.id, name: sprite.name,
    image: `${sprite.id}.png`,
    frameWidth: fw * scale, frameHeight: fh * scale, scale,
    pivot: { x: sprite.pivot[0] * scale, y: sprite.pivot[1] * scale },
    facing: 'right',
    params: p,
    // what the sprite holds or wears: present = not taken off; settings = the controls that apply right now
    parts: Object.fromEntries(partList(sprite).map((part) => {
      const present = !partRemoved(sprite, part.name, p) && inEffect(sprite, part.selector, p);
      const out = { label: part.label };
      if (part.socket !== undefined) out.socket = part.socket;
      out.present = present;
      out.settings = Object.fromEntries(part.params.filter((k) => k === part.selector || (present && inEffect(sprite, k, p))).map((k) => [k, p[k]]));
      return [part.name, out];
    })),
    animations: {},
    frames: [],
  };
  const hasSockets = typeof sprite.sockets === 'function';
  if (hasSockets) meta.socketAngle = 'radians: 0 points down the image, PI/2 to the right of the image (the way a side-view sprite faces), PI up; to mirror a frame use x = 2*pivotX - x and angle = -angle';
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  if (sprite.slice && typeof sprite.slice === 'object') for (const k of Object.keys(sprite.slice)) if (!sprite.clips[k]) throw new Error(`sprite ${sprite.id}: slice names clip "${k}", which does not exist`);
  const scaled = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * scale]));
  clips.forEach((name, row) => {
    const c = sprite.clips[name];
    const fps = clipFps(sprite, name, p);
    meta.animations[name] = { row, frames: c.frames, fps, loop: c.loop };
    // stretch information (only for a clip the sprite's `slice` names), in sheet pixels
    const st = clipStretch(sprite, name, p);
    const stretch = st ? Object.fromEntries(Object.entries(st).map(([k, v]) => [k, scaled(v)])) : null;
    if (stretch) Object.assign(meta.animations[name], stretch);
    for (let f = 0; f < c.frames; f++) {
      const g = renderFrame(sprite, name, f, p);
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const v = g.data[y * fw + x];
        if (!v) continue;
        const ox = (f * fw + x) * scale, oy = (row * fh + y) * scale;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) data[(oy + sy) * W + ox + sx] = v;
      }
      const entry = { name: `${name}_${f}`, animation: name, x: f * fw * scale, y: row * fh * scale, w: fw * scale, h: fh * scale, duration: Math.round(1000 / fps) };
      if (stretch) for (const [k, v] of Object.entries(stretch)) entry[k] = { ...v };
      if (hasSockets) {
        // attach points, measured like the pivot: sheet pixels from the frame's top-left corner
        entry.sockets = Object.fromEntries(Object.entries(frameSockets(sprite, name, f, p) ?? {}).map(([k, s]) => [k, { x: r2(s.x * scale), y: r2(s.y * scale), angle: r3(s.angle ?? 0) }]));
      }
      meta.frames.push(entry);
    }
  });
  return { w: W, h: H, data, meta };
}
