// Builds the catalogue object (docs/architecture.md, Contract 4) from the loaded assets.
// Hand-written facts come from each asset's meta; measurable facts (tech) are derived here.
import { defaultParams, clipFps } from '../../engine/sprite.js';
import { createVoice } from '../../sound/sfx-engine.js';

export const CATALOG_VERSION = 1;
export const thumbPath = (id) => `generated/thumbs/${id}.png`;
/**
 * Colour of a sound effect's waveform thumbnail, drawn on a transparent background.
 * It is dark, so the site must place it on a light tile (it vanishes on a dark page).
 * Sound rows carry it as `thumbInk`. Kept in step with INK in tools/lib/thumbs.mjs.
 */
export const WAVE_INK = '#231b33';
export const stripPath = (id) => `generated/strips/${id}.png`;

const KIND_ORDER = { sprite: 0, sound: 1, music: 2 };
const round2 = (x) => Math.round(x * 100) / 100;

function metaFields(meta = {}, isSprite) {
  return {
    type: meta.type ?? null,
    role: meta.role ?? null,
    themes: meta.themes ?? [],
    gameTypes: meta.gameTypes ?? [],
    view: isSprite ? meta.view ?? null : null,
    words: meta.words ?? [],
    license: meta.license ?? null,
  };
}

/** Measured facts about a sprite definition. */
export function spriteTech(def) {
  const p = defaultParams(def);
  const soundIds = new Set();
  for (const list of Object.values(def.sounds ?? {})) for (const c of list) soundIds.add(c.sound);
  return {
    frame: [def.size[0], def.size[1]],
    clips: Object.entries(def.clips).map(([name, c]) => ({ name, label: c.label, frames: c.frames, loop: c.loop, fps: clipFps(def, name, p) })),
    controls: Object.keys(def.params).length,
    parts: Object.keys(def.parts ?? {}),
    sounds: soundIds.size,   // distinct sound effects the sprite's animations play
  };
}

/** Measured facts about a sound or music patch. The length comes from the patch, without rendering it. */
export function audioTech(patch) {
  const bpm = (patch.params ?? []).find((x) => x.id === 'bpm');
  return {
    seconds: round2(createVoice(patch).duration),
    loop: !!patch.loop,
    stereo: Array.isArray(patch.out),
    bpm: bpm ? bpm.default : null,
    controls: (patch.params ?? []).length,
    styles: Object.keys(patch.presets ?? {}),
  };
}

/**
 * buildCatalog({ sprites, sounds, bundles }) — the shapes returned by tools/lib/assets.mjs.
 * Returns { version, assets, bundles }; assets are sprites, then sounds, then music, each sorted by id.
 */
export function buildCatalog({ sprites = [], sounds = [], bundles = [] }) {
  const inBundles = new Map();
  const cleanBundles = bundles.map(({ file, ...b }) => {
    for (const id of [...(b.sprites ?? []), ...(b.sounds ?? []), ...(b.music ?? [])]) {
      if (!inBundles.has(id)) inBundles.set(id, []);
      if (!inBundles.get(id).includes(b.id)) inBundles.get(id).push(b.id);
    }
    const out = { id: b.id, name: b.name, gameType: b.gameType };
    if (b.level !== undefined) out.level = b.level;
    Object.assign(out, { blurb: b.blurb, sprites: b.sprites ?? [], sounds: b.sounds ?? [], music: b.music ?? [], theme: b.theme ?? {} });
    return out;
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const assets = [];
  for (const { id, file, def } of sprites) {
    const tech = spriteTech(def);
    const preview = tech.clips.find((c) => c.name === def.preview) ?? tech.clips[0];
    assets.push({
      id, kind: 'sprite', name: def.name, description: def.blurb ?? '',
      ...metaFields(def.meta, true),
      bundles: [],
      src: file,
      tech,
      thumb: thumbPath(id),
      strip: stripPath(id),
      stripFrames: preview.frames,
      stripFps: preview.fps,
    });
  }
  for (const { id, file, patch, isMusic } of sounds) {
    assets.push({
      id, kind: isMusic ? 'music' : 'sound', name: patch.name, description: patch.description ?? '',
      ...metaFields(patch.meta, false),
      bundles: [],
      src: file,
      tech: audioTech(patch),
      thumb: isMusic ? null : thumbPath(id),
      ...(isMusic ? {} : { thumbInk: WAVE_INK }),
      strip: null,
    });
  }
  assets.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // bundle ids in sorted order, so the result does not depend on file order
  for (const a of assets) a.bundles = (inBundles.get(a.id) ?? []).slice().sort();
  return { version: CATALOG_VERSION, assets, bundles: cleanBundles };
}
