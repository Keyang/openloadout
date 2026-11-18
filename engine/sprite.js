// Sprite definition, parameters, and rendering frames / sprite sheets.
// Pure JavaScript: runs the same in the browser and in Node.

import { Surface } from './surface.js';
import { rng } from './motion.js';

// ---- parameter kinds -------------------------------------------------------
// Each parameter is one control a non-technical person sees. `label`, `lo` and
// `hi` are shown as written, so use plain words ("Short" / "Tall").

export const range = (label, def, o = {}) => ({ kind: 'range', label, def, min: o.min ?? 0, max: o.max ?? 1, step: o.step ?? 0.01, lo: o.lo ?? '', hi: o.hi ?? '', group: o.group ?? 'Look' });
export const choice = (label, def, options, o = {}) => ({ kind: 'choice', label, def, options: options.map((x) => (typeof x === 'string' ? { value: x, label: x[0].toUpperCase() + x.slice(1) } : x)), group: o.group ?? 'Look' });
export const color = (label, def, swatches, o = {}) => ({ kind: 'color', label, def, swatches, group: o.group ?? 'Colors' });
export const toggle = (label, def, o = {}) => ({ kind: 'toggle', label, def, group: o.group ?? 'Look' });

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
 *                                           // optional: sounds (ids from sounds/) that play on a frame of a clip
 *   meta: { type, role, themes, gameTypes, view, words, license },
 *                                           // catalogue metadata, kept as written; checked by catalog/schema.js
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
    }
  }
  def.kind = def.kind ?? 'Character';
  def.preview = def.preview ?? Object.keys(def.clips)[0];
  return def;
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
    else if (d.kind === 'choice') { if (d.options.some((o) => o.value === v)) p[k] = v; }
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

/** Render one frame of one clip to a new Surface. */
export function renderFrame(sprite, clip, frame, p) {
  const c = sprite.clips[clip];
  if (!c) throw new Error(`sprite ${sprite.id}: no clip "${clip}"`);
  const g = new Surface(sprite.size[0], sprite.size[1]);
  const t = c.loop ? frame / c.frames : c.frames > 1 ? frame / (c.frames - 1) : 0;
  sprite.render(g, { clip, t, frame, frames: c.frames, loop: c.loop, p });
  return g;
}

/**
 * Render the full sprite sheet: one row per clip, one column per frame.
 * Returns { w, h, data: Uint32Array (ABGR), meta } where meta is the JSON
 * that ships next to the PNG.
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
    animations: {},
    frames: [],
  };
  clips.forEach((name, row) => {
    const c = sprite.clips[name];
    const fps = clipFps(sprite, name, p);
    meta.animations[name] = { row, frames: c.frames, fps, loop: c.loop };
    for (let f = 0; f < c.frames; f++) {
      const g = renderFrame(sprite, name, f, p);
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const v = g.data[y * fw + x];
        if (!v) continue;
        const ox = (f * fw + x) * scale, oy = (row * fh + y) * scale;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) data[(oy + sy) * W + ox + sx] = v;
      }
      meta.frames.push({ name: `${name}_${f}`, animation: name, x: f * fw * scale, y: row * fh * scale, w: fw * scale, h: fh * scale, duration: Math.round(1000 / fps) });
    }
  });
  return { w: W, h: H, data, meta };
}
