// Builds what people download: a sprite sheet with its sounds, one sound, a whole kit,
// or the bag as one game resource package (architecture.md, Contract 8).
import { renderSheet, defaultParams, cleanParams, cueInEffect } from '../engine/sprite.js';
import { defaultTheme, normalizeTheme, applyColour, themedParams } from '../engine/theme.js';
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { soundById, soundParams, rendered, renderAsync, wavBytes, isMusic } from './audio.js';

const enc = new TextEncoder();

async function sheetPng(sheet) {
  const cv = document.createElement('canvas');
  cv.width = sheet.w; cv.height = sheet.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(sheet.data.buffer), sheet.w, sheet.h), 0, 0);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * A sprite's sounds with every default filled in: { clip: [{ sound, frame, preset, params, volume, when? }] }.
 * `when` (Contract 3) is kept: the settings at which the sound plays.
 */
export function defaultCues(sprite) {
  const out = {};
  for (const clip of Object.keys(sprite.clips)) {
    out[clip] = (sprite.sounds[clip] ?? []).filter((c) => soundById[c.sound]).map((c) => {
      const cue = { sound: c.sound, frame: c.frame, preset: c.preset ?? null, params: null, volume: c.volume ?? 1 };
      if (c.when) cue.when = c.when;
      return cue;
    });
  }
  return out;
}

/** True when a bag item's kind matches its asset: a crafted link must not export a sound as music. */
export function kindMatches(kind, id, spriteById) {
  if (kind === 'sprite') return !!spriteById[id];
  const patch = soundById[id];
  return !!patch && (kind === 'music') === isMusic(patch);
}

/** A complete theme, or null when it changes nothing (so neutral exports stay byte for byte as before). */
export function activeTheme(theme) {
  if (!theme) return null;
  const t = normalizeTheme(theme);
  return JSON.stringify(t) === JSON.stringify(defaultTheme()) ? null : t;
}

/** One sound effect, rendered with its settings and the theme. */
function themedSound(patch, params, seed, t) {
  if (!t) return rendered(patch, params, seed);
  return applySound(rendered(patch, themedSoundParams(patch, params, t), seed), soundSettingsFor(patch, t));
}

/**
 * Files for one sprite: <id>.png, <id>.json, sounds/*.wav, how-to-use.txt.
 * cues: { clip: [{ sound, frame, preset, params, volume }] }
 * theme (optional, Contract 7): recolours the sheet and its sounds, and with `shapes` varies the sprite's own controls.
 */
export async function spriteFiles(sprite, p, cues, scale = 1, theme = null) {
  const t = activeTheme(theme);
  const drawn = t ? themedParams(sprite, cleanParams(sprite, p), t) : p;
  const sheet = renderSheet(sprite, drawn, { scale });
  if (t) applyColour(sheet.data, t.colour);
  const files = [], wavs = new Map();
  sheet.meta.sounds = {};
  for (const [clip, all] of Object.entries(cues)) {
    const anim = sheet.meta.animations[clip];
    // only the sounds that play at the settings drawn (a blade sound needs a blade)
    const list = (all ?? []).filter((c) => soundById[c.sound] && cueInEffect(sprite, c, drawn));
    if (!anim || !list.length) continue;
    sheet.meta.sounds[clip] = list.map((c) => {
      const patch = soundById[c.sound];
      const params = soundParams(patch, c.preset, c.params);
      const key = c.sound + JSON.stringify(params);
      if (!wavs.has(key)) {
        const taken = new Set([...wavs.values()].map((w) => w.name));
        let name = `${c.sound}.wav`;
        for (let i = 2; taken.has(name); i++) name = `${c.sound}-${i}.wav`;
        wavs.set(key, { name, data: wavBytes(themedSound(patch, params, 1, t)) });
      }
      return {
        sound: c.sound, file: `sounds/${wavs.get(key).name}`,
        loop: !!patch.loop,
        frame: patch.loop ? 0 : c.frame,
        timeMs: patch.loop ? 0 : Math.round((c.frame * 1000) / anim.fps),
        volume: c.volume ?? 1,
        settings: params,
      };
    });
  }
  files.push({ name: `${sprite.id}.png`, data: await sheetPng(sheet) });
  files.push({ name: `${sprite.id}.json`, data: enc.encode(JSON.stringify(sheet.meta, null, 2)) });
  for (const w of wavs.values()) files.push({ name: `sounds/${w.name}`, data: w.data });
  files.push({ name: 'how-to-use.txt', data: enc.encode(howTo(sprite, sheet.meta)) });
  return files;
}

/** Files for a kit: one folder per sprite, plus the kit's extra sounds. */
export async function kitFiles(kit, spriteById) {
  const files = [];
  for (const id of kit.sprites) {
    const sprite = spriteById[id];
    if (!sprite) continue;
    for (const f of await spriteFiles(sprite, defaultParams(sprite), defaultCues(sprite))) files.push({ name: `${id}/${f.name}`, data: f.data });
  }
  for (const id of kit.sounds) {
    const patch = soundById[id];
    if (!patch) continue;
    files.push({ name: `sounds/${id}.wav`, data: wavBytes(rendered(patch, soundParams(patch), 1)) });
    for (const preset of Object.keys(patch.presets ?? {})) {
      files.push({ name: `sounds/${id} (${preset.toLowerCase()}).wav`, data: wavBytes(rendered(patch, soundParams(patch, preset), 1)) });
    }
  }
  for (const id of kit.music ?? []) {
    const patch = soundById[id];
    if (patch) files.push({ name: `music/${id}.wav`, data: wavBytes(await renderAsync(patch, soundParams(patch), 1)) });
  }
  files.push({ name: 'read-me.txt', data: enc.encode(`${kit.name} — made with Loadout\n\n${kit.blurb}\n\nEach sprite has its own folder with a sprite sheet (PNG), an animation list (JSON), the sounds that go with its\nanimations, and a short guide. The sounds folder holds every sound in the kit, including each sound's other styles.${(kit.music ?? []).length ? ' The music folder holds one loop per track: set it to repeat in your game.' : ''}\n`) });
  return files;
}

function howTo(sprite, meta) {
  const rows = Object.entries(meta.animations).map(([name, a]) => `  row ${a.row + 1}: ${name} — ${a.frames} frames, ${a.fps} frames per second, ${a.loop ? 'loops' : 'plays once'}`).join('\n');
  const soundRows = Object.entries(meta.sounds).flatMap(([clip, list]) => list.map((c) => `  ${clip}: ${c.file} — ${c.loop ? 'loops for as long as the animation plays' : `starts on frame ${c.frame + 1} (${c.timeMs} ms in)`}${c.volume !== 1 ? `, volume ${Math.round(c.volume * 100)}%` : ''}`));
  const soundPart = soundRows.length ? `
Sounds
  Play each sound when its animation reaches the frame listed here. The same list is in ${sprite.id}.json under "sounds".
${soundRows.join('\n')}
  Unity: add an Animation Event on that frame that calls AudioSource.PlayOneShot with the clip.
  Godot: add a sound track to the AnimationPlayer, or call play() on an AudioStreamPlayer when the frame changes.
  Web: play the file when your animation code switches to that frame.
` : '';
  return `${sprite.name} — made with Loadout

What is in this folder
  ${sprite.id}.png   the sprite sheet: every animation frame in one picture
  ${sprite.id}.json  the same information as below, for tools that read it${soundRows.length ? '\n  sounds/        one WAV file per sound' : ''}

The sheet
  Each frame is ${meta.frameWidth} x ${meta.frameHeight} pixels. Each row is one animation, read left to right.
${rows}
  The sprite faces right. Flip it in your game to face left.
  The point that touches the ground is ${meta.pivot.x}, ${meta.pivot.y} inside each frame.
${soundPart}
Unity
  Drag the PNG into your project. In the Inspector set Sprite Mode: Multiple, Filter Mode: Point (no filter),
  Compression: None. Open the Sprite Editor, choose Slice > Grid By Cell Size > ${meta.frameWidth} x ${meta.frameHeight}.
  Select the frames of one row and drag them into the scene to create an animation.

Godot
  Add an AnimatedSprite2D, create SpriteFrames, choose "Add frames from sprite sheet", set the grid to
  ${Math.max(...Object.values(meta.animations).map((a) => a.frames))} columns and ${Object.keys(meta.animations).length} rows. Set the texture filter to Nearest.

Phaser and other web engines
  Load it as a sprite sheet with frameWidth ${meta.frameWidth} and frameHeight ${meta.frameHeight}.

Keep pixel art sharp: always turn smoothing or filtering off, and scale by whole numbers (2x, 3x, 4x).
`;
}

// ---- the bag as one package (Contract 8) -------------------------------------------

let catalogInfo = null;
/** Name, role and type of every catalogue asset, by id. Empty when the catalogue file is not there. */
function catalogue() {
  catalogInfo = catalogInfo ?? fetch('generated/catalog.json')
    .then((r) => (r.ok ? r.json() : { assets: [] }))
    .then((c) => Object.fromEntries((c.assets ?? []).map((a) => [a.id, a])))
    .catch(() => ({}));
  return catalogInfo;
}

const KIND_WORD = { sprite: 'sprite', sound: 'sound effect', music: 'music track' };

/** A name not yet in `taken`: base, base-2, base-3 ... */
function unique(taken, base, ext = '') {
  let name = base + ext;
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}${ext}`;
  taken.add(name);
  return name;
}

/**
 * Every file of the bag's package:
 *   sprites/<id>/   sheet (PNG), animation list (JSON), the sprite's sounds, how-to-use.txt
 *   sounds/<id>.wav    music/<id>.wav    manifest.json    read-me.txt
 * items: bag items { key, kind, id, settings }; theme: the bag's theme, applied to everything;
 * scale: pixel size for sprites whose settings do not choose one.
 * Optional: catalog ({ id: { name, role, type } }), spriteById, onProgress(text).
 * Returns [{ name, data: Uint8Array }] for zip().
 */
export async function packageFiles({ items, theme = null, scale = 1, catalog = null, spriteById = null, onProgress = () => {} }) {
  const t = activeTheme(theme);
  const info = catalog ?? await catalogue();
  const sprites = spriteById ?? (await import('../sprites/index.js')).byId;
  const files = [], assets = [], missing = [];
  const folders = new Set(), soundNames = new Set(), musicNames = new Set();
  let done = 0;
  for (const item of items) {
    onProgress(`Building ${++done} of ${items.length}…`);
    const s = item.settings ?? {};
    const about = info[item.id] ?? {};
    const entry = (name, meta) => ({ key: item.key, id: item.id, kind: item.kind, name: about.name ?? name, role: about.role ?? meta?.role ?? null, type: about.type ?? meta?.type ?? null, files: [], settings: s });
    if (!kindMatches(item.kind, item.id, sprites)) { missing.push(item.id); continue; }
    if (item.kind === 'sprite') {
      const sprite = sprites[item.id];
      const folder = unique(folders, item.id);
      const a = entry(sprite.name, sprite.meta);
      a.folder = `sprites/${folder}/`;
      const p = cleanParams(sprite, s.params ?? {});
      const cues = s.cues ?? defaultCues(sprite);
      for (const f of await spriteFiles(sprite, p, cues, s.scale ?? scale, t)) {
        const name = `sprites/${folder}/${f.name}`;
        files.push({ name, data: f.data });
        a.files.push(name);
      }
      a.sheet = `sprites/${folder}/${sprite.id}.png`;
      a.animations = `sprites/${folder}/${sprite.id}.json`;
      assets.push(a);
    } else {
      const patch = soundById[item.id];
      const music = item.kind === 'music';
      const a = entry(patch.name, patch.meta);
      const base = soundParams(patch, s.style, s.params);
      let r;
      if (music) {
        onProgress(`Building ${done} of ${items.length}: the music takes a few seconds…`);
        r = await renderAsync(patch, t ? themedSoundParams(patch, base, t) : base);
        if (t) r = applySound(r, soundSettingsFor(patch, t));
      } else r = themedSound(patch, base, s.seed ?? 1, t);
      const name = `${music ? 'music' : 'sounds'}/${unique(music ? musicNames : soundNames, item.id, '.wav')}`;
      files.push({ name, data: wavBytes(r) });
      a.files.push(name);
      a.seconds = Math.round(r.duration * 100) / 100;
      a.loop = !!(r.loop ?? patch.loop);
      assets.push(a);
    }
  }
  const manifest = { app: 'Loadout', format: 'loadout-package', version: 1, theme: normalizeTheme(t ?? {}), assets };
  if (missing.length) manifest.missing = missing;
  files.push({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) });
  files.push({ name: 'read-me.txt', data: enc.encode(packageGuide(manifest, !!t)) });
  return files;
}

function packageGuide(manifest, themed) {
  const list = manifest.assets.map((a) => `  ${a.name} (${KIND_WORD[a.kind]})${a.role ? `, for ${a.role.replace('/', ': ')}` : ''}\n    ${a.folder ?? a.files[0]}`).join('\n');
  const has = (k) => manifest.assets.some((a) => a.kind === k);
  return `Your Loadout package

This package holds ${manifest.assets.length} asset${manifest.assets.length === 1 ? '' : 's'}, each exactly as you set it up in your bag${themed ? ', with the bag\'s look applied to all of them so they match' : ''}.
${manifest.missing ? `\nNot included (no longer on the site): ${manifest.missing.join(', ')}\n` : ''}
What is in it
${list}

Folders
${has('sprite') ? '  sprites/    one folder per sprite: the sprite sheet (PNG), its animation list (JSON), the sounds that go\n              with its animations, and how-to-use.txt with the steps for Unity, Godot and web engines\n' : ''}${has('sound') ? '  sounds/     one WAV file per sound effect\n' : ''}${has('music') ? '  music/      one WAV file per music track. Each is one loop: set it to repeat in your game\n' : ''}  manifest.json   a list of every asset: its name, what it is for, its files and the settings it was made with.
                  Tools and scripts can read it to set the assets up for you

Using it in Unity
  Drag the whole folder into your project's Assets folder.
  Sprites: select each PNG, set Sprite Mode: Multiple, Filter Mode: Point (no filter), Compression: None,
  then slice it in the Sprite Editor by the frame size in its how-to-use.txt.
  Sounds and music: they import as Audio Clips. Tick Loop on the music and on any sound listed as a loop.

Keep pixel art sharp: turn smoothing or filtering off, and scale by whole numbers (2x, 3x, 4x).
Made with Loadout.
`;
}
